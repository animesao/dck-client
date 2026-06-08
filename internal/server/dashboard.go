package server

import (
	"net/http"
	"os"
	"runtime"
	"strings"

	"dck-client/internal/models"
)

type DashboardHandler struct {
	*Server
}

func (h *DashboardHandler) Stats(w http.ResponseWriter, r *http.Request) {
	containers, _ := h.dck.ListContainers(true)
	images, _ := h.dck.ListImages()

	var running, stopped int
	var containerStats []models.ContainerCPU
	for _, c := range containers {
		switch c.Status {
		case models.StatusRunning:
			running++
		default:
			stopped++
		}
		containerStats = append(containerStats, models.ContainerCPU{
			ID:   c.ID,
			Name: c.Name,
			CPU:  "-",
			Mem:  "-",
		})
	}

	hostname, _ := os.Hostname()
	dckVersion, _ := h.dck.Version()

	stats := &models.DashboardStats{
		TotalContainers: len(containers),
		RunningCount:    running,
		StoppedCount:    stopped,
		ImagesCount:     len(images),
		SystemInfo: models.SystemInfo{
			Hostname:   hostname,
			OS:         runtime.GOOS,
			Arch:       runtime.GOARCH,
			Uptime:     getUptime(),
			CPU:        getCPUInfo(),
			Memory:     getMemoryInfo(),
			Disk:       getDiskInfo(h.dck.DataDir),
			DckVersion: strings.TrimSpace(dckVersion),
		},
		ContainerStats: containerStats,
	}

	writeJSON(w, http.StatusOK, stats)
}
