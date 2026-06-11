package api

import (
	"encoding/json"
	"net/http"
)

func (s *Server) handleListCollaborators(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	containerID := r.PathValue("id")
	if containerID == "" {
		writeError(w, http.StatusBadRequest, "Container ID required")
		return
	}
	perms := s.store.ListContainerPermissions(containerID)
	writeJSON(w, http.StatusOK, perms)
}

func (s *Server) handleAddCollaborator(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	containerID := r.PathValue("id")
	if containerID == "" {
		writeError(w, http.StatusBadRequest, "Container ID required")
		return
	}

	var req struct {
		Username    string `json:"username"`
		Permission  string `json:"permission"`
		Permissions string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Username == "" {
		writeError(w, http.StatusBadRequest, "Username required")
		return
	}
	if req.Permission == "" {
		req.Permission = "view"
	}

	// If sending explicit granular permissions, skip the preset validation
	if req.Permissions == "" {
		if req.Permission != "view" && req.Permission != "edit" && req.Permission != "admin" {
			writeError(w, http.StatusBadRequest, "Permission must be view, edit, or admin")
			return
		}
	}

	targetUser := s.store.GetUserByUsername(req.Username)
	if targetUser == nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	if err := s.store.SetContainerPermission(targetUser.ID, containerID, req.Permission, req.Permissions); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to add collaborator")
		return
	}

	s.store.AddActivityLog(claims.Sub, containerID, "collaborator_added",
		claims.Username+" added "+req.Username+" as "+req.Permission)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Collaborator added"})
}

func (s *Server) handleUpdateCollaborator(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	containerID := r.PathValue("id")
	userID := r.PathValue("user_id")
	if containerID == "" || userID == "" {
		writeError(w, http.StatusBadRequest, "Container ID and User ID required")
		return
	}

	var req struct {
		Permission  string `json:"permission"`
		Permissions string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Permission == "" {
		req.Permission = "view"
	}

	if err := s.store.SetContainerPermission(userID, containerID, req.Permission, req.Permissions); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update collaborator")
		return
	}

	s.store.AddActivityLog(claims.Sub, containerID, "collaborator_updated",
		claims.Username+" updated permissions for user "+userID)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Collaborator updated"})
}

func (s *Server) handleContainerActions(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	containerID := r.PathValue("id")
	if containerID == "" {
		writeError(w, http.StatusBadRequest, "Container ID required")
		return
	}

	allActions := allContainerActions()

	// Admins and owners get everything
	if claims.Role == "admin" || s.store.IsContainerOwner(claims.Sub, containerID) {
		result := make(map[string]bool)
		for _, a := range allActions {
			result[a] = true
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"actions": result,
			"all":     allActions,
		})
		return
	}

	perm, perms := s.store.GetUserContainerPermission(claims.Sub, containerID)
	actions := containerActions(perm, perms)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"actions": actions,
		"all":     allActions,
	})
}

func (s *Server) handleRemoveCollaborator(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	containerID := r.PathValue("id")
	userID := r.PathValue("user_id")
	if containerID == "" || userID == "" {
		writeError(w, http.StatusBadRequest, "Container ID and User ID required")
		return
	}

	if err := s.store.RemoveContainerPermission(userID, containerID); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to remove collaborator")
		return
	}

	s.store.AddActivityLog(claims.Sub, containerID, "collaborator_removed",
		claims.Username+" removed user "+userID)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Collaborator removed"})
}
