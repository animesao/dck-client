package api

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func (s *Server) handleConsole(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	socketPath := s.dck.ConsoleSocketPath(id)
	if _, err := os.Stat(socketPath); os.IsNotExist(err) {
		conn.WriteMessage(websocket.TextMessage, []byte("Container console not available. Make sure the container is running with console support.\r\n"))
		conn.Close()
		return
	}

	// Connect to dck console Unix socket
	var dconn net.Conn
	for i := 0; i < 10; i++ {
		dconn, err = net.DialTimeout("unix", socketPath, 2*time.Second)
		if err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Failed to connect to container console.\r\n"))
		return
	}
	defer dconn.Close()

	// Bidirectional bridge
	errCh := make(chan error, 2)

	// WebSocket -> Unix socket
	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}

			// Check for resize messages
			if len(msg) > 0 && msg[0] == '{' {
				var resize struct {
					Type   string `json:"type"`
					Rows   int    `json:"rows"`
					Cols   int    `json:"cols"`
					Width  int    `json:"width"`
					Height int    `json:"height"`
				}
				if err := json.Unmarshal(msg, &resize); err == nil && resize.Type == "resize" {
					// Send resize to Unix socket (PTY resize)
					// Format: <rows><cols><width><height> as 4 uint16 little-endian
					if resize.Rows > 0 && resize.Cols > 0 {
						buf := make([]byte, 8)
						buf[0] = byte(resize.Rows)
						buf[1] = byte(resize.Rows >> 8)
						buf[2] = byte(resize.Cols)
						buf[3] = byte(resize.Cols >> 8)
						buf[4] = byte(resize.Width)
						buf[5] = byte(resize.Width >> 8)
						buf[6] = byte(resize.Height)
						buf[7] = byte(resize.Height >> 8)
						dconn.Write(buf)
					}
					continue
				}
			}

			dconn.Write(msg)
		}
	}()

	// Unix socket -> WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := dconn.Read(buf)
			if err != nil {
				errCh <- err
				return
			}
			if n > 0 {
				err := conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				if err != nil {
					errCh <- err
					return
				}
			}
		}
	}()

	// Wait for either side to close
	<-errCh
}
