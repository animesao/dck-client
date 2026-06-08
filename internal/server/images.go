package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"dck-client/internal/models"

	"github.com/go-chi/chi"
)

type ImageHandler struct {
	*Server
}

func (h *ImageHandler) List(w http.ResponseWriter, r *http.Request) {
	images, err := h.dck.ListImages()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if images == nil {
		images = []*models.Image{}
	}
	writeJSON(w, http.StatusOK, images)
}

func (h *ImageHandler) Pull(w http.ResponseWriter, r *http.Request) {
	var req models.PullImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Reference == "" {
		writeError(w, http.StatusBadRequest, "image reference is required")
		return
	}

	out, err := h.dck.PullImage(req.Reference)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "pull_image", "Pulled image: "+req.Reference)

	writeJSON(w, http.StatusOK, map[string]string{"output": out})
}

func (h *ImageHandler) Remove(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	tag := chi.URLParam(r, "tag")
	if tag == "" {
		tag = "latest"
	}
	name = strings.TrimPrefix(name, "library/")

	if err := h.dck.RemoveImage(name, tag); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "remove_image", "Removed image: "+name+":"+tag)

	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}
