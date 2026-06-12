package api

import (
	"encoding/json"
	"net/http"
)

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	settings := s.store.GetSettings()
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if !settings.AllowEmailChange && claims.Role != "admin" {
		writeError(w, http.StatusForbidden, "Email change is disabled by administrator")
		return
	}

	s.store.UpdateUser(claims.Sub, map[string]string{"email": req.Email})
	writeJSON(w, http.StatusOK, map[string]string{"message": "Profile updated"})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.OldPassword == "" || req.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "Old and new password required")
		return
	}
	if len(req.NewPassword) < 4 {
		writeError(w, http.StatusBadRequest, "New password must be at least 4 characters")
		return
	}

	if err := s.store.ChangePassword(claims.Sub, req.OldPassword, req.NewPassword); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.store.AddActivityLog(claims.Sub, "", "password_changed", claims.Username+" changed password")

	writeJSON(w, http.StatusOK, map[string]string{"message": "Password changed"})
}
