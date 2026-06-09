package server

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"dck-client/internal/models"

	"github.com/go-chi/chi"
)

type ContainerHandler struct {
	*Server
}

func (h *ContainerHandler) List(w http.ResponseWriter, r *http.Request) {
	all := r.URL.Query().Get("all") == "true"
	containers, err := h.dck.ListContainers(all)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if containers == nil {
		containers = []*models.Container{}
	}
	writeJSON(w, http.StatusOK, containers)
}

func (h *ContainerHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := 	chi.URLParam(r, "id")
	container, err := h.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "container not found")
		return
	}
	writeJSON(w, http.StatusOK, container)
}

func (h *ContainerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateContainerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Image == "" {
		writeError(w, http.StatusBadRequest, "image is required")
		return
	}
	if req.Name == "" {
		req.Name = strings.NewReplacer("/", "-", ":", "-", "@", "-").Replace(req.Image) + "-" + randString(4)
	}

	out, err := h.dck.CreateContainer(&req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "create_container", "Created container: "+req.Name+" ("+req.Image+")")

	writeJSON(w, http.StatusCreated, map[string]string{"output": out, "id": out})
}

func (h *ContainerHandler) Start(w http.ResponseWriter, r *http.Request) {
	id := 	chi.URLParam(r, "id")
	if err := h.dck.StartContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "start_container", "Started container: "+id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

func (h *ContainerHandler) Stop(w http.ResponseWriter, r *http.Request) {
	id := 	chi.URLParam(r, "id")
	if err := h.dck.StopContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "stop_container", "Stopped container: "+id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

func (h *ContainerHandler) Restart(w http.ResponseWriter, r *http.Request) {
	id := 	chi.URLParam(r, "id")
	if err := h.dck.RestartContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "restart_container", "Restarted container: "+id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "restarted"})
}

func (h *ContainerHandler) Remove(w http.ResponseWriter, r *http.Request) {
	id := 	chi.URLParam(r, "id")
	force := r.URL.Query().Get("force") == "true"
	if err := h.dck.RemoveContainer(id, force); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "remove_container", "Removed container: "+id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func (h *ContainerHandler) Logs(w http.ResponseWriter, r *http.Request) {
	id := 	chi.URLParam(r, "id")
	logs, err := h.dck.GetContainerLogs(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "logs not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"logs": logs})
}

func (h *ContainerHandler) State(w http.ResponseWriter, r *http.Request) {
	id := 	chi.URLParam(r, "id")
	stateJSON, err := h.dck.GetContainerStateJSON(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "container state not found")
		return
	}
	var prettyData interface{}
	json.Unmarshal([]byte(stateJSON), &prettyData)
	pretty, _ := json.MarshalIndent(prettyData, "", "  ")
	w.Header().Set("Content-Type", "application/json")
	w.Write(pretty)
}

func (h *ContainerHandler) Stats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	container, err := h.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "container not found")
		return
	}
	if container.PID <= 0 {
		writeJSON(w, http.StatusOK, map[string]string{"error": "container not running"})
		return
	}
	stats, err := h.dck.GetContainerStats(container.PID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	stats.ID = container.ID
	stats.Name = container.Name
	writeJSON(w, http.StatusOK, stats)
}

func (h *ContainerHandler) Templates(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		templates, err := h.db.ListTemplates()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if templates == nil {
			templates = []*models.ContainerTemplate{}
		}
		writeJSON(w, http.StatusOK, templates)

	case http.MethodPost:
		var t models.ContainerTemplate
		if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := h.db.SaveTemplate(&t); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, t)

	case http.MethodDelete:
		idStr := 	chi.URLParam(r, "templateID")
		id, _ := strconv.ParseInt(idStr, 10, 64)
		if err := h.db.DeleteTemplate(id); err != nil {
			writeError(w, http.StatusNotFound, "template not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	}
}

func (h *ContainerHandler) LaunchTemplate(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "templateID")
	id, _ := strconv.ParseInt(idStr, 10, 64)

	templates, _ := h.db.ListTemplates()
	var tmpl *models.ContainerTemplate
	for _, t := range templates {
		if t.ID == id {
			tmpl = t
			break
		}
	}
	if tmpl == nil {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}

	var overrides struct {
		Name string `json:"name"`
	}
	json.NewDecoder(r.Body).Decode(&overrides)

	name := overrides.Name
	if name == "" {
		name = strings.ToLower(strings.ReplaceAll(tmpl.Name, " ", "-")) + "-" + randString(6)
	}

	req := models.CreateContainerRequest{
		Image:    tmpl.Image,
		Name:     name,
		Command:  tmpl.Command,
		Detach:   true,
		Restart:  tmpl.Restart,
		Hostname: tmpl.Hostname,
		Ports:    splitCSV(tmpl.Ports),
		Volumes:  splitCSV(tmpl.Volumes),
		Env:      splitCSV(tmpl.Env),
	}

	out, err := h.dck.CreateContainer(&req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "launch_template", "Launched template: "+tmpl.Name+" -> "+name)

	writeJSON(w, http.StatusCreated, map[string]string{"id": out, "name": name})
}

// Config returns the deployment config for a container
func (h *ContainerHandler) Config(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Look up container to get its name
	container, err := h.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "container not found")
		return
	}

	configPath := filepath.Join(h.db.DataDir(), "deployments", container.Name+".json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "no deployment config found for this container")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// UpdateConfig updates the deployment config for a container
func (h *ContainerHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	container, err := h.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "container not found")
		return
	}

	var cfg models.DeploymentConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cfg.UpdatedAt = time.Now()

	configPath := filepath.Join(h.db.DataDir(), "deployments", container.Name+".json")
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "config updated"})
}

// Exec runs a command inside a running container
func (h *ContainerHandler) Exec(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Command == "" {
		writeError(w, http.StatusBadRequest, "command is required")
		return
	}

	out, err := h.dck.ExecContainer(id, req.Command)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"output": out})
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	res := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			res = append(res, p)
		}
	}
	return res
}

func randString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}
