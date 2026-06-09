package api

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
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
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".zip") {
			info, _ := e.Info()
			backups = append(backups, Backup{
				Name:      strings.TrimSuffix(e.Name(), ".zip"),
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
	if _, err := os.Stat(overlayPath); err != nil {
		writeError(w, http.StatusNotFound, "Container overlay not found")
		return
	}

	backupDir := filepath.Join(s.dck.BackupDir(), id)
	os.MkdirAll(backupDir, 0755)

	backupName := fmt.Sprintf("backup-%s-%s", id[:12], time.Now().Format("20060102-150405"))
	backupFile := filepath.Join(backupDir, backupName+".zip")

	if err := zipDir(overlayPath, backupFile); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Backup failed: %s", err))
		return
	}

	fi, _ := os.Stat(backupFile)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"name":       backupName,
		"size":       fi.Size(),
		"created_at": fi.ModTime().Format("2006-01-02 15:04:05"),
	})
}

func zipDir(src, dest string) error {
	out, err := os.Create(dest)
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	defer out.Close()

	w := zip.NewWriter(out)
	defer w.Close()

	skipDirs := map[string]bool{"proc": true, "sys": true, "dev": true}

	return filepath.Walk(src, func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		if rel == "." {
			return nil
		}
		// Skip system directories
		if fi.IsDir() && skipDirs[rel] {
			return filepath.SkipDir
		}
		header, err := zip.FileInfoHeader(fi)
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(rel)
		if fi.IsDir() {
			header.Name += "/"
		} else {
			header.Method = zip.Deflate
		}
		writer, err := w.CreateHeader(header)
		if err != nil {
			return err
		}
		if !fi.IsDir() {
			f, err := os.Open(path)
			if err != nil {
				return err
			}
			defer f.Close()
			_, err = io.Copy(writer, f)
			return err
		}
		return nil
	})
}

func (s *Server) handleRestoreBackup(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	backupName := r.PathValue("backup")

	backupFile := filepath.Join(s.dck.BackupDir(), id, backupName+".zip")
	if _, err := os.Stat(backupFile); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "Backup not found")
		return
	}

	overlayPath := s.dck.OverlayPath(id)
	if _, err := os.Stat(overlayPath); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "Container overlay not found")
		return
	}

	entries, _ := os.ReadDir(overlayPath)
	for _, e := range entries {
		os.RemoveAll(filepath.Join(overlayPath, e.Name()))
	}

	if err := unzipFile(backupFile, overlayPath); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Restore failed: %s", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func unzipFile(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return fmt.Errorf("open: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		fpath := filepath.Join(dest, f.Name)

		// ZipSlip protection
		if !strings.HasPrefix(filepath.Clean(fpath), filepath.Clean(dest)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal file path: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, f.Mode())
			continue
		}

		os.MkdirAll(filepath.Dir(fpath), 0755)

		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("open entry %s: %w", f.Name, err)
		}

		out, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return fmt.Errorf("create %s: %w", f.Name, err)
		}

		_, err = io.Copy(out, rc)
		out.Close()
		rc.Close()
		if err != nil {
			return fmt.Errorf("write %s: %w", f.Name, err)
		}
	}
	return nil
}

func (s *Server) handleDownloadBackup(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	backupName := r.PathValue("backup")

	backupFile := filepath.Join(s.dck.BackupDir(), id, backupName+".zip")
	if _, err := os.Stat(backupFile); os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "Backup not found")
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, backupName))
	http.ServeFile(w, r, backupFile)
}

func (s *Server) handleDeleteBackup(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	backupName := r.PathValue("backup")

	backupFile := filepath.Join(s.dck.BackupDir(), id, backupName+".zip")
	if err := os.Remove(backupFile); err != nil {
		writeError(w, http.StatusNotFound, "Backup not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
