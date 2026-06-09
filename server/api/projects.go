package api

import (
	"net/http"
)

type ProjectInfo struct {
	Dir    string `json:"dir"`
	Path   string `json:"path"`
	Config struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	} `json:"config"`
}

func (s *Server) handleScanProjects(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	writeJSON(w, http.StatusOK, []interface{}{})
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeployProject(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
