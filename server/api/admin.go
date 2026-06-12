package api

import (
	"encoding/json"
	"net/http"
)

func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	users := s.store.ListUsers()
	type safeUser struct {
		ID             string `json:"id"`
		Username       string `json:"username"`
		Email          string `json:"email"`
		Role           string `json:"role"`
		CreatedAt      string `json:"created_at"`
		LastLogin      string `json:"last_login"`
		ContainerLimit int    `json:"container_limit"`
		MemoryLimit    int64  `json:"memory_limit"`
		CPULimit       float64 `json:"cpu_limit"`
		DiskLimit      int64  `json:"disk_limit"`
		PortLimit      int    `json:"port_limit"`
	}
	out := make([]safeUser, 0)
	for _, u := range users {
		lastLogin := ""
		if u.LastLogin != nil {
			lastLogin = u.LastLogin.Format("2006-01-02T15:04:05Z")
		}
		out = append(out, safeUser{
			ID:             u.ID,
			Username:       u.Username,
			Email:          u.Email,
			Role:           u.Role,
			CreatedAt:      u.CreatedAt.Format("2006-01-02T15:04:05Z"),
			LastLogin:      lastLogin,
			ContainerLimit: u.ContainerLimit,
			MemoryLimit:    u.MemoryLimit,
			CPULimit:       u.CPULimit,
			DiskLimit:      u.DiskLimit,
			PortLimit:      u.PortLimit,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleAdminCreateUser(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
		Email    string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Role == "" {
		req.Role = "user"
	}
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "Username and password required")
		return
	}

	user, err := s.store.CreateUser(req.Username, req.Password, req.Role, req.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleAdminUpdateUser(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	user := s.store.UpdateUser(id, req)
	if user == nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if id == claims.Sub {
		writeError(w, http.StatusBadRequest, "Cannot delete yourself")
		return
	}
	if !s.store.DeleteUser(id) {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminGetSettings(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	settings := s.store.GetSettings()
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handleAdminUpdateSettings(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	settings := s.store.UpdateSettings(req)
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handlePublicSettings(w http.ResponseWriter, r *http.Request, _ *UserClaims) {
	settings := s.store.GetSettings()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"registration":           settings.Registration,
		"allow_user_containers":  settings.AllowUserContainers,
		"allow_user_ports":       settings.AllowUserPorts,
		"allow_user_images":      settings.AllowUserImages,
		"allow_user_templates":   settings.AllowUserTemplates,
		"allow_user_projects":    settings.AllowUserProjects,
		"disabled_features":      settings.DisabledFeatures,
	})
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	settings := s.store.GetSettings()
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	settings := s.store.UpdateSettings(req)
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"version":             "2.3.0",
		"latest":              "2.3.0",
		"changelog":           "",
		"update_available":    false,
	})
}

func (s *Server) handleAdminUserStats(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	total, users := s.store.GetUserStats()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"total_users": total,
		"users":       users,
	})
}

func (s *Server) handleAdminUpdateUserLimits(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	var req struct {
		ContainerLimit int     `json:"container_limit"`
		MemoryLimit    int64   `json:"memory_limit"`
		CPULimit       float64 `json:"cpu_limit"`
		DiskLimit      int64   `json:"disk_limit"`
		PortLimit      int     `json:"port_limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	user := s.store.UpdateUserLimits(id, req.ContainerLimit, req.MemoryLimit, req.CPULimit, req.DiskLimit, req.PortLimit)
	if user == nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}
