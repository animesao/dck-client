package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type ImageInfo struct {
	Name    string `json:"name"`
	Tag     string `json:"tag"`
	ID      string `json:"id"`
	Size    string `json:"size"`
	Created string `json:"created"`
}

func (s *Server) handleListImages(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	images, err := s.dck.ListImages()
	if err != nil {
		// Fall back to scanning image files
		images = s.scanImageFiles()
		if images == nil {
			images = []string{}
		}
	}

	out := make([]ImageInfo, 0)
	for _, img := range images {
		parts := strings.Fields(img)
		if len(parts) >= 2 {
			nameTag := strings.Split(parts[0], ":")
			name := nameTag[0]
			tag := "latest"
			if len(nameTag) > 1 {
				tag = nameTag[1]
			}
			info := ImageInfo{
				Name: name,
				Tag:  tag,
			}
			if len(parts) >= 3 {
				info.ID = parts[2]
			}
			if len(parts) >= 4 {
				info.Created = parts[3]
			}
			out = append(out, info)
		}
	}
	if out == nil {
		out = []ImageInfo{}
	}

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) scanImageFiles() []string {
	dir := filepath.Join(s.dckHome, "images")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var images []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".tar.gz") {
			name := strings.TrimSuffix(e.Name(), ".tar.gz")
			images = append(images, name)
		}
	}
	return images
}

func (s *Server) handlePullImage(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := s.dck.PullImage(req.Name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "pulled"})
}

func (s *Server) handleRemoveImage(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	name := r.PathValue("name")
	tag := r.PathValue("tag")
	if tag == "" {
		tag = "latest"
	}
	if err := s.dck.RemoveImage(name + ":" + tag); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
