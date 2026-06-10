package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"dck-panel/dck"
)

type ContainerResp struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	Image      string          `json:"image"`
	Status     string          `json:"status"`
	Created    string          `json:"created"`
	Ports      []PortMapResp   `json:"ports,omitempty"`
	IP         string          `json:"ip,omitempty"`
	Pid        int             `json:"pid,omitempty"`
	Memory     string          `json:"memory,omitempty"`
	CPUs       string          `json:"cpus,omitempty"`
	Network    string          `json:"network,omitempty"`
	Restart    string          `json:"restart,omitempty"`
	Cmd        string          `json:"cmd,omitempty"`
	Entrypoint string          `json:"entrypoint,omitempty"`
}

type PortMapResp struct {
	Host      string `json:"host"`
	Container string `json:"container"`
	Protocol  string `json:"protocol"`
}

func containerToResp(c *dck.Container) ContainerResp {
	image := c.ImageName
	if c.ImageTag != "" && c.ImageTag != "latest" {
		image += ":" + c.ImageTag
	} else if !strings.Contains(c.ImageName, "/") {
		image = c.ImageName + ":" + c.ImageTag
	}
	ports := make([]PortMapResp, 0, len(c.Ports))
	for _, p := range c.Ports {
		ports = append(ports, PortMapResp{
			Host:      strconv.Itoa(p.HostPort),
			Container: strconv.Itoa(p.ContainerPort),
			Protocol:  p.Protocol,
		})
	}
	memoryStr := ""
	if c.MemoryLimit > 0 {
		memoryStr = strconv.FormatInt(c.MemoryLimit, 10)
	}
	cpusStr := ""
	if c.CPUCount > 0 {
		cpusStr = strconv.FormatFloat(c.CPUCount, 'f', -1, 64)
	}
	return ContainerResp{
		ID:      c.ID,
		Name:    c.Name,
		Image:   image,
		Status:  c.Status,
		Created: c.CreatedAt,
		Ports:   ports,
		IP:      c.IP,
		Pid:     c.PID,
		Memory:  memoryStr,
		CPUs:    cpusStr,
		Network: c.NetworkMode,
		Restart: c.Restart,
		Cmd:     strings.Join(c.Cmd, " "),
		Entrypoint: c.Entrypoint,
	}
}

func containersToResp(containers []dck.Container) []ContainerResp {
	out := make([]ContainerResp, len(containers))
	for i, c := range containers {
		out[i] = containerToResp(&c)
	}
	return out
}

func (s *Server) handleListContainers(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	all := r.URL.Query().Get("all") == "true"
	containers, err := s.dck.ListContainers(all)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if containers == nil {
		containers = []dck.Container{}
	}

	// Filter by user access (admins see all)
	if claims.Role != "admin" {
		accessible := s.store.GetUserContainerIDs(claims.Sub)
		accessMap := make(map[string]bool, len(accessible))
		for _, id := range accessible {
			accessMap[id] = true
		}
		filtered := make([]dck.Container, 0, len(containers))
		for _, c := range containers {
			if accessMap[c.ID] {
				filtered = append(filtered, c)
			}
		}
		containers = filtered
	}

	writeJSON(w, http.StatusOK, containersToResp(containers))
}

func (s *Server) handleGetContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Container not found")
		return
	}
	writeJSON(w, http.StatusOK, containerToResp(c))
}

func (s *Server) handleCreateContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	var req struct {
		Image   string   `json:"image"`
		Name    string   `json:"name"`
		Ports   []string `json:"ports"`
		Volumes []string `json:"volumes"`
		Env     []string `json:"env"`
		Restart string   `json:"restart"`
		Memory  string   `json:"memory"`
		CPUs    string   `json:"cpus"`
		Network string   `json:"network"`
		Command string   `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	settings := s.store.GetSettings()

	// Permission check: only admins can create containers if disabled for users
	if claims.Role != "admin" && !settings.AllowUserContainers {
		writeError(w, http.StatusForbidden, "Container creation is restricted to admins")
		return
	}

	// Permission check: only admins can expose ports if disabled for users
	if claims.Role != "admin" && !settings.AllowUserPorts && len(req.Ports) > 0 {
		writeError(w, http.StatusForbidden, "Port mapping is restricted to admins")
		return
	}

	id, err := s.dck.CreateContainer(req.Image, req.Name, strings.Join(req.Ports, " "), strings.Join(req.Volumes, " "), strings.Join(req.Env, " "), req.Restart, req.Memory, req.CPUs, req.Network, req.Command)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "created"})
		return
	}

	s.store.RecordContainer(claims.Sub, id, req.Name, req.Image)
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) handleRemoveContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	force := r.URL.Query().Get("force") == "true"
	if err := s.dck.RemoveContainer(id, force); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleStartContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if err := s.dck.StartContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleStopContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if err := s.dck.StopContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleRestartContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if err := s.dck.RestartContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	logs, err := s.dck.Logs(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"logs": logs})
}

func (s *Server) handleExec(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	var req struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Command == "" {
		writeError(w, http.StatusBadRequest, "Command is required")
		return
	}

	output, err := s.dck.Exec(id, req.Command)
	exitCode := 0
	if err != nil {
		exitCode = 1
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"output":    output,
		"exit_code": exitCode,
	})
}

func (s *Server) handleContainerState(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	// Read state JSON directly
	path := s.dck.ContainerStatePath(id)
	b, err := os.ReadFile(path)
	if err != nil {
		writeError(w, http.StatusNotFound, "Container not found")
		return
	}
	var state interface{}
	if err := json.Unmarshal(b, &state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"state": state})
}

func (s *Server) handleContainerStats(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	// Basic container stats - memory from cgroup
	id := r.PathValue("id")
	cgroupPath := fmt.Sprintf("/sys/fs/cgroup/memory/dck/%s/memory.current", id)
	memUsed := uint64(0)
	if b, err := os.ReadFile(cgroupPath); err == nil {
		_, err := fmt.Sscanf(string(b), "%d", &memUsed)
		if err != nil {
			memUsed = 0
		}
	}

	memLimit := uint64(512 * 1024 * 1024) // Default 512MB
	limitPath := fmt.Sprintf("/sys/fs/cgroup/memory/dck/%s/memory.max", id)
	if b, err := os.ReadFile(limitPath); err == nil {
		var v uint64
		if _, err := fmt.Sscanf(string(b), "%d", &v); err == nil && v > 0 {
			memLimit = v
		}
	}

	cpuPct := 0.0
	// CPU usage from cgroup
	cpuPath := fmt.Sprintf("/sys/fs/cgroup/cpu/dck/%s/cpuacct.usage", id)
	if b, err := os.ReadFile(cpuPath); err == nil {
		var usage uint64
		_, err := fmt.Sscanf(string(b), "%d", &usage)
		if err == nil {
			cpuPct = float64(usage) / 1e9 * 100 // rough estimate
		}
	}

	memPct := 0.0
	if memLimit > 0 {
		memPct = float64(memUsed) / float64(memLimit) * 100
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"cpu":          cpuPct,
		"memory":       memPct,
		"memory_used":  memUsed,
		"memory_limit": memLimit,
	})
}

func (s *Server) handleContainerConfig(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Container not found")
		return
	}
	memoryStr := ""
	if c.MemoryLimit > 0 {
		memoryStr = strconv.FormatInt(c.MemoryLimit, 10)
	}
	cpusStr := ""
	if c.CPUCount > 0 {
		cpusStr = strconv.FormatFloat(c.CPUCount, 'f', -1, 64)
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"restart_policy": c.Restart,
		"memory":         memoryStr,
		"cpus":           cpusStr,
		"network":        c.NetworkMode,
	})
}

func (s *Server) handleUpdateContainerConfig(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")

	var req struct {
		Cmd *string `json:"cmd,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.Cmd != nil {
		if err := s.dck.UpdateContainerCmd(id, *req.Cmd); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
