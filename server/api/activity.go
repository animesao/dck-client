package api

import (
	"net/http"
	"strconv"
)

func (s *Server) handleContainerActivity(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	containerID := r.PathValue("id")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	logs := s.store.ListContainerActivity(containerID, limit)
	writeJSON(w, http.StatusOK, logs)
}

func (s *Server) handleUserActivity(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	logs := s.store.ListUserActivity(claims.Sub, limit)
	writeJSON(w, http.StatusOK, logs)
}
