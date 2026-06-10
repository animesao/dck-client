package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"dck-panel/dck"
)

var (
	cpuPrevMu sync.Mutex
	cpuPrev   = map[string]cpuSample{}
)

type cpuSample struct {
	usage uint64
	time  time.Time
}

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
		s.store.AddActivityLog(claims.Sub, id, "container_created", claims.Username+" created container "+req.Name)
		writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "created"})
		return
	}

	s.store.RecordContainer(claims.Sub, id, req.Name, req.Image)
	s.store.AddActivityLog(claims.Sub, id, "container_created", claims.Username+" created container "+req.Name)
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) handleRemoveContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	force := r.URL.Query().Get("force") == "true"
	if err := s.dck.RemoveContainer(id, force); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.store.AddActivityLog(claims.Sub, id, "container_removed", claims.Username+" removed container")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleStartContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if err := s.dck.StartContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.store.AddActivityLog(claims.Sub, id, "container_started", claims.Username+" started container")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleStopContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if err := s.dck.StopContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.store.AddActivityLog(claims.Sub, id, "container_stopped", claims.Username+" stopped container")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleRestartContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if err := s.dck.RestartContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.store.AddActivityLog(claims.Sub, id, "container_restarted", claims.Username+" restarted container")
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

func readProcMem(pid int) uint64 {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "VmRSS:") {
			var v uint64
			fmt.Sscanf(line, "VmRSS: %d", &v)
			return v * 1024 // kB → bytes
		}
	}
	return 0
}

func readProcCPU(pid int) uint64 {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return 0
	}
	// /proc/<pid>/stat: fields 14 (utime) and 15 (stime) in jiffies
	// Find the closing ')' of comm field, then skip fields
	paren := strings.LastIndex(string(b), ")")
	if paren < 0 {
		return 0
	}
	rest := strings.Fields(string(b)[paren+2:])
	if len(rest) < 12 {
		return 0
	}
	utime, _ := strconv.ParseUint(rest[11], 10, 64)
	stime, _ := strconv.ParseUint(rest[12], 10, 64)
	return (utime + stime) * 10000 // jiffies → μs (assuming 100Hz)
}

func (s *Server) handleContainerStats(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")

	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Container not found")
		return
	}

	memUsed := uint64(0)
	memLimit := uint64(0)
	cpuPct := 0.0

	// 1. Try cgroup (v2 path from container state or default)
	cgPrefix := c.CgroupPath
	if cgPrefix == "" {
		cgPrefix = fmt.Sprintf("/sys/fs/cgroup/dck/%s", id)
	}
	cgMemOK := false

	if b, err := os.ReadFile(filepath.Join(cgPrefix, "memory.current")); err == nil {
		var v uint64
		if _, err := fmt.Sscanf(string(b), "%d", &v); err == nil {
			memUsed = v
			cgMemOK = true
		}
	}

	if b, err := os.ReadFile(filepath.Join(cgPrefix, "memory.max")); err == nil {
		s := strings.TrimSpace(string(b))
		if s != "max" {
			var v uint64
			if _, err := fmt.Sscanf(s, "%d", &v); err == nil && v > 0 {
				memLimit = v
			}
		}
	}

	var cpuUsage uint64
	cgCPUOK := false
	if b, err := os.ReadFile(filepath.Join(cgPrefix, "cpu.stat")); err == nil {
		for _, line := range strings.Split(string(b), "\n") {
			if strings.HasPrefix(line, "usage_usec") {
				fmt.Sscanf(line, "usage_usec %d", &cpuUsage)
				cgCPUOK = true
				break
			}
		}
	}

	// 2. Fallback to /proc/<pid>/ when cgroup for that resource isn't accessible
	if c.PID > 0 {
		if !cgMemOK {
			memUsed = readProcMem(c.PID)
		}
		if !cgCPUOK {
			cpuUsage = readProcCPU(c.PID)
		}
	}

	// CPU delta calculation
	now := time.Now()
	cpuPrevMu.Lock()
	prev, ok := cpuPrev[id]
	cpuPrev[id] = cpuSample{usage: cpuUsage, time: now}
	cpuPrevMu.Unlock()

	if ok && prev.usage > 0 && cpuUsage > prev.usage {
		delta := float64(cpuUsage-prev.usage) / 1e6 // μs → seconds
		elapsed := now.Sub(prev.time).Seconds()
		if elapsed > 0 {
			cpuPct = (delta / elapsed) * 100
			if cpuPct < 0 {
				cpuPct = 0
			}
		}
	}

	// Allocated limits from container state as fallback
	if memLimit == 0 && c.MemoryLimit > 0 {
		memLimit = uint64(c.MemoryLimit)
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
		"cpu_limit":    c.CPUCount,
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
