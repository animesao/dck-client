package server

import (
	"bufio"
	"net/http"
	"os/exec"

	"github.com/go-chi/chi"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

type ConsoleHandler struct {
	*Server
}

func (h *ConsoleHandler) Connect(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Resolve name → container ID (dck attach needs the ID, not name)
	allContainers, err := h.dck.ListContainers(true)
	if err == nil {
		for _, c := range allContainers {
			if c.Name == id {
				id = c.ID
				break
			}
		}
	}

	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return h.jwtSecret, nil
	})
	if err != nil || !token.Valid {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "websocket upgrade: "+err.Error())
		return
	}
	defer conn.Close()

	binPath := h.dck.BinaryPath

	// Use dck attach by container name
	cmd := exec.Command(binPath, "attach", id)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: "+err.Error()))
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: "+err.Error()))
		return
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Console failed: "+err.Error()))
		return
	}

	done := make(chan struct{})

	go func() {
		reader := bufio.NewReader(stdout)
		buf := make([]byte, 4096)
		for {
			n, err := reader.Read(buf)
			if err != nil {
				break
			}
			if n > 0 {
				conn.WriteMessage(websocket.BinaryMessage, buf[:n])
			}
		}
		close(done)
	}()

	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				stdin.Close()
				return
			}
			stdin.Write(msg)
		}
	}()

	conn.WriteMessage(websocket.TextMessage, []byte("\r\n\u001b[1;32mConnected to "+id+"\u001b[0m\r\n"))

	<-done
	cmd.Wait()
}
