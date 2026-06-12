package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"dck-panel/dck"
	"dck-panel/db"
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
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Image         string          `json:"image"`
	Status        string          `json:"status"`
	Created       string          `json:"created"`
	Ports         []PortMapResp   `json:"ports,omitempty"`
	IP            string          `json:"ip,omitempty"`
	Pid           int             `json:"pid,omitempty"`
	Memory        string          `json:"memory,omitempty"`
	CPUs          string          `json:"cpus,omitempty"`
	Disk          int64           `json:"disk,omitempty"`
	Network       string          `json:"network,omitempty"`
	Restart       string          `json:"restart,omitempty"`
	Cmd           string          `json:"cmd,omitempty"`
	Entrypoint    string          `json:"entrypoint,omitempty"`
	StartupScript string          `json:"startup_script,omitempty"`
	UserID        string          `json:"user_id,omitempty"`
	Username      string          `json:"username,omitempty"`
	NodeID        string          `json:"node_id,omitempty"`
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
		Disk:    c.DiskLimit,
		Network: c.NetworkMode,
		Restart: c.Restart,
		Cmd:     strings.Join(c.Cmd, " "),
		Entrypoint: c.Entrypoint,
		StartupScript: c.StartupScript,
	}
}

func (s *Server) containersToResp(containers []dck.Container) []ContainerResp {
	out := make([]ContainerResp, len(containers))
	for i, c := range containers {
		resp := containerToResp(&c)
		resp.NodeID = s.store.GetContainerNodeID(c.ID)
		out[i] = resp
	}
	return out
}

func (s *Server) handleListContainers(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	all := r.URL.Query().Get("all") == "true"

	// Collect from local dck
	containers, err := s.dck.ListContainers(all)
	if err != nil {
		containers = []dck.Container{}
	}
	if containers == nil {
		containers = []dck.Container{}
	}

	seen := make(map[string]bool, len(containers))
	for _, c := range containers {
		seen[c.ID] = true
	}

	// Collect from all nodes
	nodes, _ := s.store.ListNodes()
	for _, n := range nodes {
		nodeContainers, err := s.nodeListContainers(&n, all)
		if err != nil {
			continue
		}
		for _, nc := range nodeContainers {
			id, _ := nc["id"].(string)
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			containers = append(containers, dck.Container{
				ID:        id,
				Name:      getStringField(nc, "name"),
				ImageName: getStringField(nc, "image"),
				Status:    getStringField(nc, "status"),
			})
		}
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

	resp := s.containersToResp(containers)
	if claims.Role == "admin" {
		for i := range resp {
			s.enrichContainerOwner(&resp[i])
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if node := s.getContainerNode(id); node != nil {
		state, err := s.nodeGetContainerState(node, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "Container not found")
			return
		}
		resp := ContainerResp{
			ID:     id,
			Name:   getStringField(state, "name"),
			Image:  getStringField(state, "image_name"),
			Status: getStringField(state, "status"),
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}
	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Container not found")
		return
	}
	resp := containerToResp(c)
	if claims.Role == "admin" {
		s.enrichContainerOwner(&resp)
	}
	writeJSON(w, http.StatusOK, resp)
}

func getStringField(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}

func (s *Server) handleCreateContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	var req struct {
		Image         string   `json:"image"`
		Name          string   `json:"name"`
		Ports         []string `json:"ports"`
		Volumes       []string `json:"volumes"`
		Env           []string `json:"env"`
		Restart       string   `json:"restart"`
		Memory        string   `json:"memory"`
		CPUs          string   `json:"cpus"`
		Network       string   `json:"network"`
		Command       string   `json:"command"`
		StartupScript string   `json:"startup_script"`
		Disk          string   `json:"disk"`
		UserID        string   `json:"user_id"`
		NodeID        string   `json:"node_id"`
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

	// Resource limit checks for non-admin users
	if claims.Role != "admin" {
		if user := s.store.GetUser(claims.Sub); user != nil {
			if user.ContainerLimit >= 0 {
				count, _, _ := s.store.GetUserResourceUsage(claims.Sub)
				if count >= user.ContainerLimit {
					writeError(w, http.StatusForbidden, fmt.Sprintf("Container limit reached (%d/%d)", count, user.ContainerLimit))
					return
				}
			}
			if user.MemoryLimit >= 0 && req.Memory != "" {
				reqMemMB := parseMemoryToMB(req.Memory)
				if reqMemMB > user.MemoryLimit {
					writeError(w, http.StatusForbidden, fmt.Sprintf("Memory limit exceeded (%dMB > %dMB)", reqMemMB, user.MemoryLimit))
					return
				}
			}
			if user.CPULimit >= 0 && req.CPUs != "" {
				reqCPU, err := strconv.ParseFloat(req.CPUs, 64)
				if err == nil && reqCPU > user.CPULimit {
					writeError(w, http.StatusForbidden, fmt.Sprintf("CPU limit exceeded (%.1f > %.1f)", reqCPU, user.CPULimit))
					return
				}
			}
			if user.PortLimit >= 0 && len(req.Ports) > user.PortLimit {
				writeError(w, http.StatusForbidden, fmt.Sprintf("Port limit exceeded (%d > %d)", len(req.Ports), user.PortLimit))
				return
			}
			if user.DiskLimit >= 0 && req.Disk != "" {
				if d, err := strconv.ParseInt(req.Disk, 10, 64); err == nil && d > user.DiskLimit {
					writeError(w, http.StatusForbidden, fmt.Sprintf("Disk limit exceeded (%d bytes > %d bytes)", d, user.DiskLimit))
					return
				}
			}
		}
	}

	// Auto-assign 1 port if none specified and user has port limit
	if len(req.Ports) == 0 && claims.Role != "admin" {
		if user := s.store.GetUser(claims.Sub); user != nil && user.PortLimit > 0 {
			req.Ports = []string{""} // signal allocatePorts to pick one
		}
	}

	// Determine target node
	var targetNode *db.Node
	if claims.Role == "admin" && req.NodeID != "" {
		targetNode = s.getNode(req.NodeID)
		if targetNode == nil {
			writeError(w, http.StatusBadRequest, "Node not found")
			return
		}
	}
	if targetNode == nil {
		var reqMem int64
		if req.Memory != "" {
			reqMem = parseMemoryToMB(req.Memory)
		}
		var reqDisk int64
		if d, err := strconv.ParseInt(req.Disk, 10, 64); err == nil {
			reqDisk = d
		}
		targetNode = s.pickBestNode(reqMem, reqDisk)
	}

	if targetNode != nil {
		// Forward to node
		ports := strings.Join(req.Ports, " ")
		volumes := strings.Join(req.Volumes, " ")
		env := strings.Join(req.Env, " ")

		id, err := s.nodeCreateContainer(targetNode, req.Image, req.Name, ports, volumes, env, req.Restart, req.Memory, req.CPUs, req.Network, req.Command, req.StartupScript, req.Disk)
		if err != nil {
			log.Printf("ERROR nodeCreateContainer: %v", err)
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		ownerID := claims.Sub
		if claims.Role == "admin" && req.UserID != "" {
			ownerID = req.UserID
		}
		s.store.RecordContainer(ownerID, id, req.Name, req.Image, targetNode.ID)
		s.store.AddActivityLog(claims.Sub, id, "container_created", claims.Username+" created container "+req.Name+" on node "+targetNode.Name)

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"id":      id,
			"name":    req.Name,
			"node_id": targetNode.ID,
			"node":    targetNode.Name,
		})
	} else {
		// Fallback to local creation
		ports, err := allocatePorts(s.dck, s.store, settings, req.Ports)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		id, err := s.dck.CreateContainer(req.Image, req.Name, strings.Join(ports, " "), strings.Join(req.Volumes, " "), strings.Join(req.Env, " "), req.Restart, req.Memory, req.CPUs, req.Network, req.Command, req.StartupScript, req.Disk)
		if err != nil {
			log.Printf("ERROR handleCreateContainer: %v", err)
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		ownerID := claims.Sub
		if claims.Role == "admin" && req.UserID != "" {
			ownerID = req.UserID
		}
		s.store.RecordContainer(ownerID, id, req.Name, req.Image, "")
		s.store.AddActivityLog(claims.Sub, id, "container_created", claims.Username+" created container "+req.Name)

		c, err := s.dck.GetContainer(id)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "created"})
			return
		}

		writeJSON(w, http.StatusCreated, c)
	}
}

func collectUsedPorts(dckClient dck.ClientInterface) map[int]bool {
	used := map[int]bool{}
	containers, err := dckClient.ListContainers(true)
	if err != nil {
		return used
	}
	for _, c := range containers {
		if c.Status != "running" {
			continue
		}
		for _, p := range c.Ports {
			used[p.HostPort] = true
		}
	}
	return used
}

func portIsAvailable(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return false
	}
	ln.Close()
	return true
}

func allocatePorts(dckClient dck.ClientInterface, store *db.Store, settings db.Settings, portSpecs []string) ([]string, error) {
	if len(portSpecs) == 0 || settings.PortRangeStart <= 0 || settings.PortRangeEnd <= 0 {
		return portSpecs, nil
	}

	used := collectUsedPorts(dckClient)
	result := make([]string, 0, len(portSpecs))

	for _, spec := range portSpecs {
		spec = strings.TrimSpace(spec)
		if spec == "" {
			continue
		}

		if strings.Contains(spec, ":") {
			// User specified a host port, respect it
			parts := strings.SplitN(spec, ":", 2)
			hostPort, err := strconv.Atoi(parts[0])
			if err == nil && hostPort > 0 {
				used[hostPort] = true
			}
			result = append(result, spec)
		} else {
			// No host port, auto-assign from range
			assigned := false
			// Strip protocol suffix for parsing
			clean := spec
			proto := ""
			if idx := strings.Index(spec, "/"); idx >= 0 {
				clean = spec[:idx]
				proto = spec[idx:]
			}
			contPort, err := strconv.Atoi(clean)
			if err != nil || contPort <= 0 {
				result = append(result, spec)
				continue
			}

			for port := settings.PortRangeStart; port <= settings.PortRangeEnd; port++ {
				if used[port] {
					continue
				}
				if portIsAvailable(port) {
					used[port] = true
					newSpec := fmt.Sprintf("%d:%d%s", port, contPort, proto)
					result = append(result, newSpec)
					assigned = true
					log.Printf("Allocated port %d -> container port %s for %s", port, clean, spec)
					break
				}
			}
			if !assigned {
				return nil, fmt.Errorf("no free ports available in range %d-%d for container port %s", settings.PortRangeStart, settings.PortRangeEnd, clean)
			}
		}
	}

	return result, nil
}

func (s *Server) handleRemoveContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	force := r.URL.Query().Get("force") == "true"
	if node := s.getContainerNode(id); node != nil {
		if err := s.nodeRemoveContainer(node, id, force); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		if err := s.dck.RemoveContainer(id, force); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	s.store.RemoveUserContainer(id)
	s.store.AddActivityLog(claims.Sub, id, "container_removed", claims.Username+" removed container")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleStartContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if node := s.getContainerNode(id); node != nil {
		if err := s.nodeContainerAction(node, id, "start"); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else if err := s.dck.StartContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.store.AddActivityLog(claims.Sub, id, "container_started", claims.Username+" started container")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleStopContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if node := s.getContainerNode(id); node != nil {
		if err := s.nodeContainerAction(node, id, "stop"); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else if err := s.dck.StopContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.store.AddActivityLog(claims.Sub, id, "container_stopped", claims.Username+" stopped container")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleRestartContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if node := s.getContainerNode(id); node != nil {
		if err := s.nodeContainerAction(node, id, "restart"); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else if err := s.dck.RestartContainer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.store.AddActivityLog(claims.Sub, id, "container_restarted", claims.Username+" restarted container")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	if node := s.getContainerNode(id); node != nil {
		logs, err := s.nodeLogs(node, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"logs": logs})
		return
	}
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

	if node := s.getContainerNode(id); node != nil {
		output, err := s.nodeExec(node, id, req.Command)
		exitCode := 0
		if err != nil {
			exitCode = 1
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"output":    output,
			"exit_code": exitCode,
		})
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
	if node := s.getContainerNode(id); node != nil {
		state, err := s.nodeGetContainerState(node, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "Container not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"state": state})
		return
	}
	// Read state JSON directly (local)
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

	if node := s.getContainerNode(id); node != nil {
		stats, err := s.nodeGetContainerStats(node, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "Container not found")
			return
		}
		writeJSON(w, http.StatusOK, stats)
		return
	}

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

	// Disk stats
	diskTotal := uint64(0)
	diskUsed := uint64(0)
	diskPct := 0.0
	overlayBase := filepath.Dir(s.dck.OverlayPath(id))
	if c.DiskLimit > 0 {
		dataPath := filepath.Join(overlayBase, "data")
		if info, err := os.Stat(dataPath); err == nil && info.IsDir() {
			diskTotal, diskUsed, diskPct = getDiskInfo(dataPath)
		}
	} else {
		// Use du for actual per-container disk usage of the writable layer
		upperPath := s.dck.OverlayDiffPath(id)
		if info, err := os.Stat(upperPath); err == nil && info.IsDir() {
			out, err := exec.Command("du", "-sb", upperPath).Output()
			if err == nil {
				fmt.Sscanf(string(out), "%d", &diskUsed)
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"cpu":          cpuPct,
		"memory":       memPct,
		"memory_used":  memUsed,
		"memory_limit": memLimit,
		"cpu_limit":    c.CPUCount,
		"disk_used":    diskUsed,
		"disk_total":   diskTotal,
		"disk_percent": diskPct,
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

func (s *Server) handleAddContainerPort(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")

	var req struct {
		HostPort      int    `json:"host_port"`
		ContainerPort int    `json:"container_port"`
		Protocol      string `json:"protocol"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.ContainerPort <= 0 {
		writeError(w, http.StatusBadRequest, "Container port is required")
		return
	}
	if req.Protocol == "" {
		req.Protocol = "tcp"
	}

	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Container not found")
		return
	}

	settings := s.store.GetSettings()

	// Port limit only applies to the container owner, not collaborators
	if s.store.IsContainerOwner(claims.Sub, id) {
		if user := s.store.GetUser(claims.Sub); user != nil && user.PortLimit >= 0 {
			if len(c.Ports) >= user.PortLimit {
				writeError(w, http.StatusForbidden, fmt.Sprintf("Port limit reached (%d/%d)", len(c.Ports), user.PortLimit))
				return
			}
		}
	}

	if req.HostPort <= 0 {
		used := collectUsedPorts(s.dck)
		for _, p := range c.Ports {
			used[p.HostPort] = true
		}
		hostPort, err := allocateOnePort(settings, used)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		req.HostPort = hostPort
	}

	for _, p := range c.Ports {
		if p.HostPort == req.HostPort {
			writeError(w, http.StatusConflict, fmt.Sprintf("Host port %d is already mapped", req.HostPort))
			return
		}
	}

	c.Ports = append(c.Ports, dck.PortMap{
		HostPort:      req.HostPort,
		ContainerPort: req.ContainerPort,
		Protocol:      req.Protocol,
	})

	if err := s.dck.SaveContainer(c); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save container state")
		return
	}

	if c.Status == "running" {
		if err := s.dck.RestartContainer(id); err != nil {
			log.Printf("Warning: restart after adding port: %v", err)
		}
	}

	s.store.AddActivityLog(claims.Sub, id, "port_added", fmt.Sprintf("%s added port %d:%d/%s", claims.Username, req.HostPort, req.ContainerPort, req.Protocol))
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) handleRemoveContainerPort(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	hostPortStr := r.PathValue("host_port")
	hostPort, err := strconv.Atoi(hostPortStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid host port")
		return
	}

	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Container not found")
		return
	}

	found := false
	for i, p := range c.Ports {
		if p.HostPort == hostPort {
			c.Ports = append(c.Ports[:i], c.Ports[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		writeError(w, http.StatusNotFound, "Port not found")
		return
	}

	if err := s.dck.SaveContainer(c); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save container state")
		return
	}

	if c.Status == "running" {
		if err := s.dck.RestartContainer(id); err != nil {
			log.Printf("Warning: restart after removing port: %v", err)
		}
	}

	s.store.AddActivityLog(claims.Sub, id, "port_removed", fmt.Sprintf("%s removed port %d", claims.Username, hostPort))
	writeJSON(w, http.StatusOK, c)
}

func allocateOnePort(settings db.Settings, used map[int]bool) (int, error) {
	if settings.PortRangeStart <= 0 || settings.PortRangeEnd <= 0 {
		return 0, fmt.Errorf("port range not configured")
	}
	for port := settings.PortRangeStart; port <= settings.PortRangeEnd; port++ {
		if used[port] {
			continue
		}
		if portIsAvailable(port) {
			return port, nil
		}
	}
	return 0, fmt.Errorf("no free ports available in range %d-%d", settings.PortRangeStart, settings.PortRangeEnd)
}

func (s *Server) handleUpdateContainerConfig(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")

	var req struct {
		Cmd           *string `json:"cmd,omitempty"`
		StartupScript *string `json:"startup_script,omitempty"`
		Restart       *string `json:"restart,omitempty"`
		Image         *string `json:"image,omitempty"`
		Disk          *int64  `json:"disk,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.Cmd != nil {
		if err := s.dck.UpdateContainerCmd(id, *req.Cmd); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if req.StartupScript != nil {
		if err := s.dck.UpdateContainerStartupScript(id, *req.StartupScript); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if req.Restart != nil {
		if err := s.dck.UpdateContainerRestart(id, *req.Restart); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if req.Image != nil {
		if err := s.dck.UpdateContainerImage(id, *req.Image); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if req.Disk != nil {
		if err := s.dck.UpdateContainerDisk(id, *req.Disk); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleReinstallContainer(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	var req struct {
		Image string `json:"image"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Image == "" {
		writeError(w, http.StatusBadRequest, "image is required")
		return
	}
	if err := s.dck.ReinstallContainer(id, req.Image); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "Container reinstalled"})
}

func (s *Server) handleUpdateContainerOwner(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	id := r.PathValue("id")
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id is required")
		return
	}

	// Verify target user exists
	if user := s.store.GetUser(req.UserID); user == nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	// Get current owner for the activity log
	currentOwnerID, _ := s.store.GetContainerUserID(id)

	if err := s.store.UpdateContainerOwner(id, req.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update container owner")
		return
	}

	targetUser := s.store.GetUser(req.UserID)
	targetName := req.UserID
	if targetUser != nil {
		targetName = targetUser.Username
	}

	logMsg := claims.Username + " changed container owner to " + targetName
	if currentOwnerID != "" {
		if oldUser := s.store.GetUser(currentOwnerID); oldUser != nil {
			logMsg = claims.Username + " changed container owner from " + oldUser.Username + " to " + targetName
		}
	}
	s.store.AddActivityLog(claims.Sub, id, "container_owner_changed", logMsg)

	c, err := s.dck.GetContainer(id)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
		return
	}
	resp := containerToResp(c)
	s.enrichContainerOwner(&resp)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) enrichContainerOwner(resp *ContainerResp) {
	userID, err := s.store.GetContainerUserID(resp.ID)
	if err != nil {
		return
	}
	resp.UserID = userID
	if user := s.store.GetUser(userID); user != nil {
		resp.Username = user.Username
	}
}

func parseMemoryToMB(s string) int64 {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return 0
	}
	if strings.HasSuffix(s, "g") || strings.HasSuffix(s, "gb") {
		s = strings.TrimSuffix(strings.TrimSuffix(s, "gb"), "g")
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return 0
		}
		return n * 1024
	}
	if strings.HasSuffix(s, "m") || strings.HasSuffix(s, "mb") {
		s = strings.TrimSuffix(strings.TrimSuffix(s, "mb"), "m")
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return 0
		}
		return n
	}
	if strings.HasSuffix(s, "k") || strings.HasSuffix(s, "kb") {
		return 0
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0
	}
	return n
}
