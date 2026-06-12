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

	wsURL := s.dck.ConsoleWebSocketURL(id)
	if wsURL != "" {
		s.proxyConsoleViaWings(conn, wsURL)
		return
	}

	socketPath := s.dck.ConsoleSocketPath(id)
	if _, err := os.Stat(socketPath); os.IsNotExist(err) {
		conn.WriteMessage(websocket.TextMessage, []byte("Container console not available. Make sure the container is running with console support.\r\n"))
		conn.Close()
		return
	}

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

	errCh := make(chan error, 2)

	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}

			if len(msg) > 0 && msg[0] == '{' {
				var resize struct {
					Type   string `json:"type"`
					Rows   int    `json:"rows"`
					Cols   int    `json:"cols"`
					Width  int    `json:"width"`
					Height int    `json:"height"`
				}
				if err := json.Unmarshal(msg, &resize); err == nil && resize.Type == "resize" {
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

	<-errCh
}

func (s *Server) proxyConsoleViaWings(client *websocket.Conn, wsURL string) {
	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}
	ws, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		client.WriteMessage(websocket.TextMessage, []byte("Failed to connect to container console via wings.\r\n"))
		return
	}
	defer ws.Close()

	errCh := make(chan error, 2)

	go func() {
		for {
			_, msg, err := client.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				errCh <- err
				return
			}
		}
	}()

	go func() {
		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := client.WriteMessage(websocket.BinaryMessage, msg); err != nil {
				errCh <- err
				return
			}
		}
	}()

	<-errCh
}
