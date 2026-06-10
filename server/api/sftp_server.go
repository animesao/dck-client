package api

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"dck-panel/db"
	"dck-panel/dck"

	"github.com/pkg/sftp"
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
			user := s.store.CheckPassword(c.User(), string(pass))
			if user == nil {
				return nil, fmt.Errorf("invalid credentials")
			}
			return &ssh.Permissions{
				Extensions: map[string]string{
					"user-id": user.ID,
					"role":    user.Role,
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

	userID := sshConn.Permissions.Extensions["user-id"]
	role := sshConn.Permissions.Extensions["role"]

	log.Printf("[sftp] %s connected from %s", sshConn.User(), conn.RemoteAddr())

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
						serveSFTPForUser(channel, s.store, s.dck, userID, role)
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

func serveSFTPForUser(channel ssh.Channel, store *db.Store, dckClient *dck.Client, userID, role string) {
	rootFS := &containerFS{
		store:  store,
		dck:    dckClient,
		userID: userID,
		role:   role,
	}

	handlers := sftp.Handlers{
		FileGet:  rootFS,
		FilePut:  rootFS,
		FileCmd:  rootFS,
		FileList: rootFS,
	}

	server := sftp.NewRequestServer(channel, handlers)
	server.Serve()
}

// ─── Virtual container filesystem for SFTP ──────────────────────

type containerFS struct {
	store  *db.Store
	dck    *dck.Client
	userID string
	role   string
	mu     sync.Mutex
}

func (c *containerFS) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	_, absPath, err := c.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(absPath)
	if err != nil {
		return nil, err
	}
	return f, nil
}

func (c *containerFS) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	_, absPath, err := c.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}
	os.MkdirAll(filepath.Dir(absPath), 0755)
	f, err := os.Create(absPath)
	if err != nil {
		return nil, err
	}
	return f, nil
}

func (c *containerFS) Filecmd(r *sftp.Request) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	_, targetPath, err := c.resolve(r.Filepath)
	if err != nil {
		return err
	}

	switch r.Method {
	case "Setstat":
		return nil
	case "Rename":
		_, oldPath, err := c.resolve(r.Filepath)
		if err != nil {
			return err
		}
		_, newPath, err := c.resolve(r.Target)
		if err != nil {
			return err
		}
		return os.Rename(oldPath, newPath)
	case "Rmdir":
		return os.RemoveAll(targetPath)
	case "Remove":
		return os.RemoveAll(targetPath)
	case "Mkdir":
		return os.MkdirAll(targetPath, 0755)
	case "Symlink":
		return os.Symlink(r.Target, targetPath)
	}
	return nil
}

func (c *containerFS) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	containerID, absPath, err := c.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}

	// Root: list accessible containers as directories
	if containerID == "" {
		ids := c.containerIDs()
		entries := make([]os.FileInfo, 0, len(ids))
		for _, id := range ids {
			ct, _ := c.dck.GetContainer(id)
			name := id
			if ct != nil && ct.Name != "" {
				name = ct.Name + " (" + id[:12] + ")"
			}
			entries = append(entries, &virtualFileInfo{
				name:  name,
				isDir: true,
				mode:  0755 | os.ModeDir,
			})
		}
		return listerAt(entries), nil
	}

	ents, err := os.ReadDir(absPath)
	if err != nil {
		return listerAt([]os.FileInfo{}), nil
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

// ─── Helpers: virtual file info & listerAt ──────────────────────

type virtualFileInfo struct {
	name  string
	isDir bool
	size  int64
	mode  os.FileMode
	t     time.Time
}

func (f *virtualFileInfo) Name() string      { return f.name }
func (f *virtualFileInfo) Size() int64       { return f.size }
func (f *virtualFileInfo) Mode() fs.FileMode  { return f.mode }
func (f *virtualFileInfo) ModTime() time.Time { return f.t }
func (f *virtualFileInfo) IsDir() bool        { return f.isDir }
func (f *virtualFileInfo) Sys() interface{}   { return nil }

type listerAt []os.FileInfo

func (l listerAt) ListAt(ls []os.FileInfo, offset int64) (int, error) {
	n := copy(ls, l[offset:])
	if n < len(l)-int(offset) {
		return n, nil
	}
	return n, io.EOF
}

// ─── Container access resolution ────────────────────────────────

func (c *containerFS) containerIDs() []string {
	if c.role == "admin" {
		all, _ := c.dck.ListContainers(true)
		ids := make([]string, len(all))
		for i, ct := range all {
			ids[i] = ct.ID
		}
		return ids
	}
	return c.store.GetUserContainerIDs(c.userID)
}

func (c *containerFS) containerRoot(id string) (string, error) {
	root := c.dck.OverlayPath(id)
	info, err := os.Stat(root)
	if err == nil && info.IsDir() {
		dataDir := getContainerWorkDir(c.dck, id)
		dataPath := filepath.Join(root, dataDir)
		os.MkdirAll(dataPath, 0755)
		return dataPath, nil
	}
	diffPath := c.dck.OverlayDiffPath(id)
	info, err = os.Stat(diffPath)
	if err == nil && info.IsDir() {
		dataDir := getContainerWorkDir(c.dck, id)
		dataPath := filepath.Join(diffPath, dataDir)
		os.MkdirAll(dataPath, 0755)
		return dataPath, nil
	}
	return "", fmt.Errorf("filesystem not available")
}

func (c *containerFS) resolve(path string) (string, string, error) {
	path = filepath.Clean(path)
	parts := strings.SplitN(strings.TrimPrefix(path, "/"), "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		return "", "", nil
	}
	containerID := parts[0]
	hasAccess := false
	for _, id := range c.containerIDs() {
		if id == containerID {
			hasAccess = true
			break
		}
	}
	if !hasAccess {
		return "", "", fmt.Errorf("container not found")
	}
	subPath := "/"
	if len(parts) > 1 && parts[1] != "" {
		subPath = "/" + parts[1]
	}
	root, err := c.containerRoot(containerID)
	if err != nil {
		return "", "", err
	}
	return containerID, filepath.Join(root, subPath), nil
}

func getContainerWorkDir(dckClient *dck.Client, id string) string {
	c, err := dckClient.GetContainer(id)
	if err != nil {
		return "/home/container"
	}
	if c.WorkingDir != "" {
		return c.WorkingDir
	}
	return "/home/container"
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

func (s *Server) handleSFTPInfo(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	host := r.Host
	if idx := strings.LastIndex(host, ":"); idx > 0 {
		host = host[:idx]
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"host":     host,
		"port":     s.sftpPort,
		"username": claims.Username,
	})
}
