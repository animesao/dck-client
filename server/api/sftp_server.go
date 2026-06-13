package api

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"dck-panel/dck"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/ssh"
)

func (s *Server) StartSFTPServer(port string, dataDir string) error {
	s.sftpPort = port
	hostKeyPath := filepath.Join(dataDir, "ssh_host_key")
	if err := ensureHostKey(hostKeyPath); err != nil {
		return fmt.Errorf("host key: %w", err)
	}

	hostKeyBytes, err := os.ReadFile(hostKeyPath)
	if err != nil {
		return err
	}

	signer, err := ssh.ParsePrivateKey(hostKeyBytes)
	if err != nil {
		return err
	}

	config := &ssh.ServerConfig{
		PasswordCallback: func(c ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			containerID, passwordHash, err := s.store.GetSFTPUserByUsername(c.User())
			if err != nil {
				return nil, fmt.Errorf("invalid credentials")
			}
			if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), pass); err != nil {
				return nil, fmt.Errorf("invalid credentials")
			}
			return &ssh.Permissions{
				Extensions: map[string]string{
					"container-id": containerID,
				},
			}, nil
		},
		AuthLogCallback: func(conn ssh.ConnMetadata, method string, err error) {
			if err != nil {
				log.Printf("[sftp] failed auth attempt for %s from %s", conn.User(), conn.RemoteAddr())
			}
		},
	}

	config.AddHostKey(signer)

	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return fmt.Errorf("sftp listen: %w", err)
	}

	log.Printf("SFTP server listening on :%s", port)

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				continue
			}
			go s.handleSFTPConn(conn, config)
		}
	}()

	return nil
}

func (s *Server) handleSFTPConn(conn net.Conn, config *ssh.ServerConfig) {
	defer conn.Close()

	sshConn, chans, reqs, err := ssh.NewServerConn(conn, config)
	if err != nil {
		return
	}
	defer sshConn.Close()

	containerID := sshConn.Permissions.Extensions["container-id"]

	log.Printf("[sftp] %s connected to container %s from %s", sshConn.User(), containerID[:12], conn.RemoteAddr())

	go ssh.DiscardRequests(reqs)

	for newChannel := range chans {
		if newChannel.ChannelType() != "session" {
			newChannel.Reject(ssh.UnknownChannelType, "unknown channel type")
			continue
		}

		channel, requests, err := newChannel.Accept()
		if err != nil {
			continue
		}

		go func() {
			defer channel.Close()
			for req := range requests {
				switch req.Type {
				case "subsystem":
					if len(req.Payload) >= 4 && string(req.Payload[4:]) == "sftp" {
						req.Reply(true, nil)
						serveSFTPForContainer(channel, s.dck, containerID)
					} else {
						req.Reply(false, nil)
					}
				default:
					if req.WantReply {
						req.Reply(false, nil)
					}
				}
			}
		}()
	}
}

func serveSFTPForContainer(channel ssh.Channel, dckClient dck.ClientInterface, containerID string) {
	root, err := containerDataRoot(dckClient, containerID)
	if err != nil {
		log.Printf("[sftp] container %s filesystem not available: %v", containerID[:12], err)
		channel.Write([]byte("Container filesystem not available\r\n"))
		channel.Close()
		return
	}

	fs := &scopedFS{root: root}

	handlers := sftp.Handlers{
		FileGet:  fs,
		FilePut:  fs,
		FileCmd:  fs,
		FileList: fs,
	}

	server := sftp.NewRequestServer(channel, handlers)
	server.Serve()
}

// ─── Scoped container filesystem (single container) ──────────────

type scopedFS struct {
	root string
	mu   sync.Mutex
}

func (f *scopedFS) resolve(path string) (string, error) {
	clean := filepath.Clean(path)
	if clean == "." || clean == "/" {
		return f.root, nil
	}
	clean = strings.TrimPrefix(clean, "/")
	full := filepath.Join(f.root, clean)
	abs, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	rootAbs, err := filepath.Abs(f.root)
	if err != nil {
		return "", err
	}
	rootPrefix := rootAbs
	if !strings.HasSuffix(rootPrefix, string(filepath.Separator)) {
		rootPrefix += string(filepath.Separator)
	}
	if !strings.HasPrefix(abs, rootPrefix) {
		return "", fmt.Errorf("path traversal denied")
	}
	return abs, nil
}

func (f *scopedFS) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	abs, err := f.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}
	return os.Open(abs)
}

func (f *scopedFS) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	abs, err := f.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}
	os.MkdirAll(filepath.Dir(abs), 0755)
	return os.Create(abs)
}

func (f *scopedFS) Filecmd(r *sftp.Request) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch r.Method {
	case "Setstat":
		return nil
	case "Rename":
		old, err := f.resolve(r.Filepath)
		if err != nil {
			return err
		}
		neu, err := f.resolve(r.Target)
		if err != nil {
			return err
		}
		return os.Rename(old, neu)
	case "Rmdir", "Remove":
		abs, err := f.resolve(r.Filepath)
		if err != nil {
			return err
		}
		return os.RemoveAll(abs)
	case "Mkdir":
		abs, err := f.resolve(r.Filepath)
		if err != nil {
			return err
		}
		return os.MkdirAll(abs, 0755)
	case "Symlink":
		abs, err := f.resolve(r.Filepath)
		if err != nil {
			return err
		}
		return os.Symlink(r.Target, abs)
	}
	return nil
}

func (f *scopedFS) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	abs, err := f.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}
	ents, err := os.ReadDir(abs)
	if err != nil {
		return listerAt{}, nil
	}
	entries := make([]os.FileInfo, 0, len(ents))
	for _, e := range ents {
		info, err := e.Info()
		if err != nil {
			continue
		}
		entries = append(entries, info)
	}
	return listerAt(entries), nil
}

// ─── Helpers ────────────────────────────────────────────────────

type listerAt []os.FileInfo

func (l listerAt) ListAt(ls []os.FileInfo, offset int64) (int, error) {
	n := copy(ls, l[offset:])
	if n < len(l)-int(offset) {
		return n, nil
	}
	return n, io.EOF
}

func containerDataRoot(dckClient dck.ClientInterface, containerID string) (string, error) {
	c, err := dckClient.GetContainer(containerID)
	if err != nil {
		return "", fmt.Errorf("container %s not found", containerID)
	}

	// If container has named volumes, use the host volume path directly
	for _, vol := range c.Volumes {
		if !strings.Contains(vol.Source, "/") && !strings.Contains(vol.Source, "\\") {
			volPath := filepath.Join(dckClient.VolumesDir(), vol.Source)
			if info, err := os.Stat(volPath); err == nil && info.IsDir() {
				abs, _ := filepath.Abs(volPath)
				if abs == "/" {
					return "", fmt.Errorf("container %s filesystem would resolve to host root", containerID)
				}
				return abs, nil
			}
		}
	}

	dataDir := c.WorkingDir
	if dataDir == "" {
		dataDir = dckClient.ReadImageWorkingDir(c.ImageName, c.ImageTag)
	}
	if dataDir == "" {
		dataDir = "/home/container"
	}

	// If container is running, use merged overlay (full filesystem view)
	if c.Status == "running" {
		root := dckClient.OverlayPath(containerID)
		info, err := os.Stat(root)
		if err == nil && info.IsDir() {
			dataPath := filepath.Join(root, dataDir)
			os.MkdirAll(dataPath, 0755)
			return dataPath, nil
		}
	}

	// Fall back to upper layer (persists when container is stopped)
	upperPath := dckClient.OverlayDiffPath(containerID)
	info, err := os.Stat(upperPath)
	if err == nil && info.IsDir() {
		dataPath := filepath.Join(upperPath, dataDir)
		os.MkdirAll(dataPath, 0755)
		return dataPath, nil
	}

	return "", fmt.Errorf("container %s filesystem not available", containerID)
}

// ─── Host key generation ────────────────────────────────────────

func ensureHostKey(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	key, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return pem.Encode(f, &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
}

func (s *Server) handleContainerSFTP(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	host := r.Host
	if idx := strings.LastIndex(host, ":"); idx > 0 {
		host = host[:idx]
	}

	sftpUser, password, err := s.store.GetOrCreateSFTPUser(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get SFTP credentials")
		return
	}

	resp := map[string]interface{}{
		"host":     host,
		"port":     s.sftpPort,
		"username": sftpUser.Username,
	}
	if password != "" {
		resp["password"] = password
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleRegenerateSFTPPassword(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")

	password, err := s.store.RegenerateSFTPPassword(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to regenerate SFTP password")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"password": password,
	})
}
