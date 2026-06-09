package api

import (
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"
)

type SystemInfo struct {
	OS          string  `json:"os"`
	Arch        string  `json:"arch"`
	Kernel      string  `json:"kernel"`
	Uptime      string  `json:"uptime"`
	Hostname    string  `json:"hostname"`
	CPUModel    string  `json:"cpu_model"`
	CPUCores    int     `json:"cpu_cores"`
	CPUCoresLog int     `json:"cpu_cores_log"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryTotal uint64  `json:"memory_total"`
	MemoryUsed  uint64  `json:"memory_used"`
	MemoryPct   float64 `json:"memory_percent"`
	DiskTotal   uint64  `json:"disk_total"`
	DiskUsed    uint64  `json:"disk_used"`
	DiskPct     float64 `json:"disk_percent"`
	Load1       float64 `json:"load_1"`
	Load5       float64 `json:"load_5"`
	Load15      float64 `json:"load_15"`
}

func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	info := getSystemInfo()
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleDashboardStats(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	info := getSystemInfo()
	containers, _ := s.dck.ListContainers(true)

	running := 0
	stopped := 0
	for _, c := range containers {
		if c.Status == "running" {
			running++
		} else {
			stopped++
		}
	}

	images, _ := s.dck.ListImages()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"system":          info,
		"containers":      map[string]int{"total": len(containers), "running": running, "stopped": stopped},
		"images":          len(images),
		"containers_list": containers,
		"cpu_percent":     info.CPUPercent,
		"memory_percent":  info.MemoryPct,
		"memory_used":     info.MemoryUsed,
		"memory_total":    info.MemoryTotal,
		"disk_used":       info.DiskUsed,
		"disk_total":      info.DiskTotal,
	})
}

func getSystemInfo() SystemInfo {
	info := SystemInfo{
		OS:       runtime.GOOS,
		Arch:     runtime.GOARCH,
		Hostname: getHostname(),
		CPUCores: runtime.NumCPU(),
	}

	info.Kernel = getKernelVersion()
	info.Uptime = getUptime()
	info.CPUModel = getCPUModel()
	info.MemoryTotal, info.MemoryUsed, info.MemoryPct = getMemoryInfo()
	info.DiskTotal, info.DiskUsed, info.DiskPct = getDiskInfo("/")
	info.CPUPercent = getCPUPercent()
	info.Load1, info.Load5, info.Load15 = getLoadAvg()

	return info
}

func getHostname() string {
	h, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return h
}

func getKernelVersion() string {
	b, err := os.ReadFile("/proc/version")
	if err != nil {
		return ""
	}
	parts := strings.Fields(string(b))
	if len(parts) >= 3 {
		return parts[2]
	}
	return ""
}

func getUptime() string {
	b, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return ""
	}
	var secs float64
	_, err = fmt.Sscanf(string(b), "%f", &secs)
	if err != nil {
		return ""
	}
	d := time.Duration(secs) * time.Second
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	mins := int(d.Minutes()) % 60
	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, mins)
	}
	return fmt.Sprintf("%dh %dm", hours, mins)
}

func getCPUModel() string {
	b, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "model name") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return ""
}

func getMemoryInfo() (total, used uint64, pct float64) {
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, 0, 0
	}
	var memTotal, memAvail uint64
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			_, err := fmt.Sscanf(line, "MemTotal: %d kB", &memTotal)
			if err == nil {
				memTotal *= 1024
			}
		}
		if strings.HasPrefix(line, "MemAvailable:") {
			_, err := fmt.Sscanf(line, "MemAvailable: %d kB", &memAvail)
			if err == nil {
				memAvail *= 1024
			}
		}
	}
	if memTotal > 0 {
		used = memTotal - memAvail
		pct = float64(used) / float64(memTotal) * 100
	}
	return memTotal, used, pct
}




func getCPUPercent() float64 {
	// Simple CPU usage from /proc/stat
	type cpuTimes struct {
		user, nice, system, idle uint64
	}

	readCPU := func() cpuTimes {
		b, err := os.ReadFile("/proc/stat")
		if err != nil {
			return cpuTimes{}
		}
		var ct cpuTimes
		_, err = fmt.Sscanf(string(b), "cpu %d %d %d %d", &ct.user, &ct.nice, &ct.system, &ct.idle)
		if err != nil {
			return cpuTimes{}
		}
		return ct
	}

	t1 := readCPU()
	if t1.user == 0 {
		return 0
	}
	time.Sleep(100 * time.Millisecond)
	t2 := readCPU()

	total1 := t1.user + t1.nice + t1.system + t1.idle
	total2 := t2.user + t2.nice + t2.system + t2.idle
	idle1 := t1.idle
	idle2 := t2.idle

	totalDelta := total2 - total1
	idleDelta := idle2 - idle1

	if totalDelta == 0 {
		return 0
	}
	return float64(totalDelta-idleDelta) / float64(totalDelta) * 100
}

func getLoadAvg() (load1, load5, load15 float64) {
	b, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, 0, 0
	}
	_, err = fmt.Sscanf(string(b), "%f %f %f", &load1, &load5, &load15)
	if err != nil {
		return 0, 0, 0
	}
	return load1, load5, load15
}
