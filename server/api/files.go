package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func (s *Server) getContainerRoot(id string) (string, error) {
	root := s.dck.OverlayPath(id)
	info, err := os.Stat(root)
	if err != nil {
		return "", fmt.Errorf("container %s not found or not running", id)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("container %s overlay not available", id)
	}
	return root, nil
}

func safePath(root, requested string) (string, error) {
	clean := filepath.Clean(requested)
	if clean == "." || clean == "/" {
		return root, nil
	}
	clean = strings.TrimPrefix(clean, "/")
	full := filepath.Join(root, clean)
	abs, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	// Ensure the path is still within the container root
	if !strings.HasPrefix(abs, filepath.Clean(root)) {
		return "", fmt.Errorf("path traversal denied")
	}
	return abs, nil
}

type FileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"is_dir"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"mod_time"`
}

func (s *Server) handleListFiles(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	root, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		dirPath = "/"
	}

	fullPath, err := safePath(root, dirPath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "Directory not found")
		return
	}

	files := make([]FileEntry, 0)
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		relPath := filepath.Join(dirPath, e.Name())
		files = append(files, FileEntry{
			Name:    e.Name(),
			Path:    relPath,
			IsDir:   e.IsDir(),
			Size:    info.Size(),
			Mode:    info.Mode().String(),
			ModTime: info.ModTime().Format("2006-01-02 15:04:05"),
		})
	}

	writeJSON(w, http.StatusOK, files)
}

func (s *Server) handleReadFile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	root, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		writeError(w, http.StatusBadRequest, "path query parameter required")
		return
	}

	fullPath, err := safePath(root, filePath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	b, err := os.ReadFile(fullPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "File not found")
		return
	}

	contentType := "text/plain"
	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".json":
		contentType = "application/json"
	case ".html", ".htm":
		contentType = "text/html"
	case ".css":
		contentType = "text/css"
	case ".js":
		contentType = "application/javascript"
	case ".png":
		contentType = "image/png"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".svg":
		contentType = "image/svg+xml"
	case ".yaml", ".yml":
		contentType = "text/yaml"
	case ".toml":
		contentType = "text/toml"
	case ".sh":
		contentType = "text/x-shellscript"
	}

	w.Header().Set("Content-Type", contentType)
	w.Write(b)
}

func (s *Server) handleWriteFile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	root, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	fullPath, err := safePath(root, req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Create parent directories
	os.MkdirAll(filepath.Dir(fullPath), 0755)

	if err := os.WriteFile(fullPath, []byte(req.Content), 0644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	root, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	// 10MB max upload
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "File too large or invalid multipart form")
		return
	}

	destDir := r.FormValue("path")
	if destDir == "" {
		destDir = "/"
	}

	dirPath, err := safePath(root, destDir)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	destPath := filepath.Join(dirPath, header.Filename)
	out, err := os.Create(destPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "path": filepath.Join(destDir, header.Filename)})
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	root, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		writeError(w, http.StatusBadRequest, "path query parameter required")
		return
	}

	fullPath, err := safePath(root, filePath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := os.RemoveAll(fullPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMkdir(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	root, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	fullPath, err := safePath(root, req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := os.MkdirAll(fullPath, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
