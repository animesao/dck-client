package api

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func (s *Server) handleListBackups(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	backupDir := filepath.Join(s.dck.BackupDir(), id)
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		writeJSON(w, http.StatusOK, []interface{}{})
		return
	}

	type Backup struct {
		Name      string `json:"name"`
		Size      int64  `json:"size"`
		CreatedAt string `json:"created_at"`
	}

	backups := make([]Backup, 0)
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".tar.gz") {
			info, _ := e.Info()
			backups = append(backups, Backup{
				Name:      strings.TrimSuffix(e.Name(), ".tar.gz"),
				Size:      info.Size(),
				CreatedAt: info.ModTime().Format("2006-01-02 15:04:05"),
			})
		}
	}

	writeJSON(w, http.StatusOK, backups)
}

func (s *Server) handleCreateBackup(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")

	overlayPath := s.dck.OverlayPath(id)
	if _, err := os.Stat(overlayPath); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "Container overlay not found")
		return
	}

	backupDir := filepath.Join(s.dck.BackupDir(), id)
	os.MkdirAll(backupDir, 0755)

	backupName := fmt.Sprintf("%s-%s", id[:12], time.Now().Format("20060102-150405"))
	backupFile := filepath.Join(backupDir, backupName+".tar.gz")

	cmd := exec.Command("tar", "czf", backupFile, "-C", overlayPath, ".")
	out, err := cmd.CombinedOutput()
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Backup failed: %s", string(out)))
		return
	}

	info, _ := os.Stat(backupFile)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"name":       backupName,
		"size":       info.Size(),
		"created_at": info.ModTime().Format("2006-01-02 15:04:05"),
	})
}

func (s *Server) handleRestoreBackup(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	backupName := r.PathValue("backup")

	backupFile := filepath.Join(s.dck.BackupDir(), id, backupName+".tar.gz")
	if _, err := os.Stat(backupFile); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "Backup not found")
		return
	}

	overlayPath := s.dck.OverlayPath(id)
	if _, err := os.Stat(overlayPath); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "Container overlay not found")
		return
	}

	// Clear existing files first
	entries, _ := os.ReadDir(overlayPath)
	for _, e := range entries {
		os.RemoveAll(filepath.Join(overlayPath, e.Name()))
	}

	cmd := exec.Command("tar", "xzf", backupFile, "-C", overlayPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Restore failed: %s", string(out)))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDownloadBackup(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	backupName := r.PathValue("backup")

	backupFile := filepath.Join(s.dck.BackupDir(), id, backupName+".tar.gz")
	if _, err := os.Stat(backupFile); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "Backup not found")
		return
	}

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.tar.gz"`, backupName))
	http.ServeFile(w, r, backupFile)
}

func (s *Server) handleDeleteBackup(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	backupName := r.PathValue("backup")

	backupFile := filepath.Join(s.dck.BackupDir(), id, backupName+".tar.gz")
	if err := os.Remove(backupFile); err != nil {
		writeError(w, http.StatusNotFound, "Backup not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
