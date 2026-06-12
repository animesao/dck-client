package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"dck-panel/db"
)

type templateImportReq struct {
	Name        string `json:"name"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Image       string `json:"image"`
	Tag         string `json:"tag,omitempty"`
	Command     string `json:"command"`
	Env         string `json:"env"`
	Ports       string `json:"ports"`
	Memory      string `json:"memory,omitempty"`
	CPUs        string `json:"cpus,omitempty"`
	Restart     string `json:"restart,omitempty"`
	Network     string `json:"network,omitempty"`
	Volumes     string `json:"volumes,omitempty"`
}

func (s *Server) handleListTemplates(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	templates := s.store.ListTemplates()
	categories := s.store.ListTemplateCategories()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"templates":  templates,
		"categories": categories,
	})
}

func (s *Server) handleCreateTemplate(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	if !s.isAdminRole(claims.Role) {
		settings := s.store.GetSettings()
		if !settings.AllowUserTemplates {
			writeError(w, http.StatusForbidden, "Template management is disabled")
			return
		}
	}
	var req templateImportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Name == "" || req.Image == "" {
		writeError(w, http.StatusBadRequest, "Name and image are required")
		return
	}

	// Auto-create category if it doesn't exist
	s.store.CreateTemplateCategory(req.Category)

	t := db.Template{
		Name:        req.Name,
		Category:    req.Category,
		Description: req.Description,
		Image:       req.Image,
		Tag:         req.Tag,
		Command:     req.Command,
		Env:         req.Env,
		Ports:       req.Ports,
		Memory:      req.Memory,
		CPUs:        req.CPUs,
		Restart:     req.Restart,
		Network:     req.Network,
		Volumes:     req.Volumes,
		UserID:      claims.Sub,
	}
	if err := s.store.CreateTemplate(t); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteTemplate(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	if !s.isAdminRole(claims.Role) {
		settings := s.store.GetSettings()
		if !settings.AllowUserTemplates {
			writeError(w, http.StatusForbidden, "Template management is disabled")
			return
		}
	}
	id := r.PathValue("id")
	if err := s.store.DeleteTemplate(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleImportTemplate(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	if !s.isAdminRole(claims.Role) {
		settings := s.store.GetSettings()
		if !settings.AllowUserTemplates {
			writeError(w, http.StatusForbidden, "Template management is disabled")
			return
		}
	}
	var req templateImportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Name == "" || req.Image == "" {
		writeError(w, http.StatusBadRequest, "Name and image are required")
		return
	}
	s.store.CreateTemplateCategory(req.Category)
	t := db.Template{
		Name:        req.Name,
		Category:    req.Category,
		Description: req.Description,
		Image:       req.Image,
		Tag:         req.Tag,
		Command:     req.Command,
		Env:         req.Env,
		Ports:       req.Ports,
		Memory:      req.Memory,
		CPUs:        req.CPUs,
		Restart:     req.Restart,
		Network:     req.Network,
		Volumes:     req.Volumes,
		UserID:      claims.Sub,
	}
	if err := s.store.CreateTemplate(t); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleExportContainerTemplate(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Container not found")
		return
	}
	envJSON := "[]"
	if len(c.Env) > 0 {
		pairs := make([]map[string]string, 0, len(c.Env))
		for _, e := range c.Env {
			parts := strings.SplitN(e, "=", 2)
			if len(parts) == 2 {
				pairs = append(pairs, map[string]string{"key": parts[0], "value": parts[1]})
			}
		}
		b, _ := json.Marshal(pairs)
		envJSON = string(b)
	}
	portStr := ""
	for _, p := range c.Ports {
		portStr += fmt.Sprintf("%d:%d/%s,", p.HostPort, p.ContainerPort, p.Protocol)
	}
	portStr = strings.TrimSuffix(portStr, ",")

	volStr := ""
	for _, v := range c.Volumes {
		volStr += v.Source + ":" + v.Target + ","
	}
	volStr = strings.TrimSuffix(volStr, ",")

	imageName := c.ImageName
	tag := c.ImageTag
	memory := ""
	if c.MemoryLimit > 0 {
		memory = fmt.Sprintf("%d", c.MemoryLimit)
	}
	cpus := ""
	if c.CPUCount > 0 {
		cpus = fmt.Sprintf("%.1f", c.CPUCount)
	}
	t := map[string]interface{}{
		"name":        c.Name,
		"category":    "Custom",
		"description": fmt.Sprintf("Exported from container %s", id[:12]),
		"image":       imageName,
		"tag":         tag,
		"command":     strings.Join(c.Cmd, " "),
		"env":         envJSON,
		"ports":       portStr,
		"memory":      memory,
		"cpus":        cpus,
		"restart":     c.Restart,
		"network":     c.NetworkMode,
		"volumes":     volStr,
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"template-%s.json\"", id[:12]))
	json.NewEncoder(w).Encode(t)
}

func (s *Server) handleAddCategory(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	if !s.isAdminRole(claims.Role) {
		settings := s.store.GetSettings()
		if !settings.AllowUserTemplates {
			writeError(w, http.StatusForbidden, "Template management is disabled")
			return
		}
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "Name is required")
		return
	}
	if err := s.store.CreateTemplateCategory(req.Name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteCategory(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	if !s.isAdminRole(claims.Role) {
		settings := s.store.GetSettings()
		if !settings.AllowUserTemplates {
			writeError(w, http.StatusForbidden, "Template management is disabled")
			return
		}
	}
	name := r.PathValue("name")
	if err := s.store.DeleteTemplateCategory(name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
