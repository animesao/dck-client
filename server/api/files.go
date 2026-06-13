package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"dck-panel/dck"
)

type containerRoot struct {
	path      string // absolute path on host filesystem
	hasVolume bool   // true when path is a named volume (data dir IS the root)
}

func (s *Server) getContainerRoot(id string) (*containerRoot, error) {
	c, err := s.dck.GetContainer(id)
	if err != nil {
		return nil, fmt.Errorf("container %s not found", id)
	}

	// If container has named volumes, read from the host volume path directly.
	// This works like Pterodactyl: files are visible even when container is stopped,
	// and shows actual volume content (not overlay) when running.
	for _, vol := range c.Volumes {
		if !strings.Contains(vol.Source, "/") && !strings.Contains(vol.Source, "\\") {
			volPath := filepath.Join(s.dck.VolumesDir(), vol.Source)
			if info, err := os.Stat(volPath); err == nil && info.IsDir() {
				abs, _ := filepath.Abs(volPath)
				if abs == "/" {
					return nil, fmt.Errorf("container %s filesystem would resolve to host root", id)
				}
				return &containerRoot{path: abs, hasVolume: true}, nil
			}
		}
	}

	targetDir := s.getContainerDataDir(c)
	overlayBase := filepath.Dir(s.dck.OverlayPath(id))

	// When disk limit is set, the writable layer lives inside the data mount
	upperDir := filepath.Join(overlayBase, "upper")
	if c.DiskLimit > 0 {
		dataDir := filepath.Join(overlayBase, "data")
		if info, err := os.Stat(dataDir); err == nil && info.IsDir() {
			upperDir = filepath.Join(dataDir, "upper")
		}
	}

	// If container is running, use merged overlay (full filesystem view)
	if c.Status == "running" {
		root := s.dck.OverlayPath(id)
		info, err := os.Stat(root)
		if err == nil && info.IsDir() {
			abs, _ := filepath.Abs(root)
			if abs == "/" {
				return nil, fmt.Errorf("container %s filesystem would resolve to host root", id)
			}
			targetPath := filepath.Join(abs, targetDir)
			os.MkdirAll(targetPath, 0755)
			return &containerRoot{path: targetPath}, nil
		}
	}

	// Fall back to writable layer (persists when container is stopped)
	info, err := os.Stat(upperDir)
	if err == nil && info.IsDir() {
		abs, _ := filepath.Abs(upperDir)
		if abs == "/" {
			return nil, fmt.Errorf("container %s filesystem would resolve to host root", id)
		}
		targetPath := filepath.Join(abs, targetDir)
		os.MkdirAll(targetPath, 0755)
		return &containerRoot{path: targetPath}, nil
	}

	return nil, fmt.Errorf("container %s filesystem not available", id)
}

func (s *Server) getContainerDataDir(c *dck.Container) string {
	if c.WorkingDir != "" {
		return c.WorkingDir
	}
	wd := s.dck.ReadImageWorkingDir(c.ImageName, c.ImageTag)
	if wd != "" {
		return wd
	}
	return "/home/container"
}

func safePath(cr *containerRoot, requested string) (string, error) {
	clean := filepath.Clean(requested)
	if clean == "." || clean == "/" {
		return cr.path, nil
	}
	clean = strings.TrimPrefix(clean, "/")

	// When using a volume, the volume root IS the container's data dir.
	// The frontend sends paths like /home/container which don't exist
	// relative to the volume root — strip the leading component.
	if cr.hasVolume {
		parts := strings.SplitN(clean, "/", 2)
		if len(parts) == 2 {
			clean = parts[1]
		} else {
			clean = ""
		}
		if clean == "" {
			return cr.path, nil
		}
	}

	full := filepath.Join(cr.path, clean)
	abs, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	rootAbs, err := filepath.Abs(cr.path)
	if err != nil {
		return "", err
	}
	// Ensure the path is still within the container root (with trailing separator)
	rootPrefix := rootAbs
	if !strings.HasSuffix(rootPrefix, string(filepath.Separator)) {
		rootPrefix += string(filepath.Separator)
	}
	if !strings.HasPrefix(abs, rootPrefix) {
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
	cr, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		dirPath = "/"
	}

	fullPath, err := safePath(cr, dirPath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		// Data directory may not exist yet; return empty list
		writeJSON(w, http.StatusOK, []FileEntry{})
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
	cr, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		writeError(w, http.StatusBadRequest, "path query parameter required")
		return
	}

	fullPath, err := safePath(cr, filePath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	b, err := os.ReadFile(fullPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "File not found")
		return
	}

	// Binary files: return as base64
	if ext := strings.ToLower(filepath.Ext(filePath)); ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".gif" || ext == ".ico" || ext == ".webp" {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"content":  string(b),
			"encoding": "binary",
			"path":     filePath,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"content":  string(b),
		"encoding": "utf-8",
		"path":     filePath,
	})
}

func (s *Server) handleWriteFile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	cr, err := s.getContainerRoot(id)
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

	fullPath, err := safePath(cr, req.Path)
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

	s.store.AddActivityLog(claims.Sub, id, "file_written", claims.Username+" saved "+req.Path)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	cr, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	// 250MB max upload
	r.Body = http.MaxBytesReader(w, r.Body, 250<<20)

	if err := r.ParseMultipartForm(250 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "File too large or invalid multipart form")
		return
	}

	destDir := r.FormValue("path")
	if destDir == "" {
		destDir = "/"
	}

	dirPath, err := safePath(cr, destDir)
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

	s.store.AddActivityLog(claims.Sub, id, "file_uploaded", claims.Username+" uploaded "+header.Filename)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "path": filepath.Join(destDir, header.Filename)})
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	cr, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		writeError(w, http.StatusBadRequest, "path query parameter required")
		return
	}

	fullPath, err := safePath(cr, filePath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := os.RemoveAll(fullPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.store.AddActivityLog(claims.Sub, id, "file_deleted", claims.Username+" deleted "+filePath)

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMkdir(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	cr, err := s.getContainerRoot(id)
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

	fullPath, err := safePath(cr, req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := os.MkdirAll(fullPath, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.store.AddActivityLog(claims.Sub, id, "file_created", claims.Username+" created directory "+req.Path)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleRenameFile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	cr, err := s.getContainerRoot(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var req struct {
		OldPath string `json:"old_path"`
		NewPath string `json:"new_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	oldFull, err := safePath(cr, req.OldPath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	newFull, err := safePath(cr, req.NewPath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	os.MkdirAll(filepath.Dir(newFull), 0755)

	if err := os.Rename(oldFull, newFull); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.store.AddActivityLog(claims.Sub, id, "file_renamed", claims.Username+" renamed "+req.OldPath+" to "+req.NewPath)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
