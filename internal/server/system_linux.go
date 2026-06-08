package server

import (
	"bufio"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"syscall"
)

func getUptime() string {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return "N/A"
	}
	parts := strings.Fields(string(data))
	if len(parts) == 0 {
		return "N/A"
	}
	seconds, _ := strconv.ParseFloat(parts[0], 64)
	days := int(seconds) / 86400
	hours := (int(seconds) % 86400) / 3600
	mins := (int(seconds) % 3600) / 60
	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, mins)
	}
	return fmt.Sprintf("%dh %dm", hours, mins)
}

func getCPUInfo() string {
	f, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return "N/A"
	}
	defer f.Close()

	var cpus int
	var model string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "processor") {
			cpus++
		}
		if strings.HasPrefix(line, "model name") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				model = strings.TrimSpace(parts[1])
			}
		}
	}
	if cpus == 0 {
		return "N/A"
	}
	if model != "" {
		// Truncate long model names
		short := model
		if len(short) > 40 {
			short = short[:40]
		}
		return fmt.Sprintf("%s (%d cores)", short, cpus)
	}
	return fmt.Sprintf("%d cores", cpus)
}

func getMemoryInfo() string {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return "N/A"
	}
	defer f.Close()

	var total, available uint64
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "MemTotal:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				total, _ = strconv.ParseUint(parts[1], 10, 64)
			}
		}
		if strings.HasPrefix(line, "MemAvailable:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				available, _ = strconv.ParseUint(parts[1], 10, 64)
			}
		}
	}

	if total == 0 {
		return "N/A"
	}
	used := total - available
	totalGB := float64(total) / 1024 / 1024
	usedGB := float64(used) / 1024 / 1024
	return fmt.Sprintf("%.1fG / %.1fG", usedGB, totalGB)
}

func getDiskInfo(path string) string {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return "N/A"
	}
	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bavail * uint64(stat.Bsize)
	used := total - free

	totalGB := float64(total) / math.Pow(1024, 3)
	usedGB := float64(used) / math.Pow(1024, 3)
	percent := float64(0)
	if total > 0 {
		percent = float64(used) / float64(total) * 100
	}
	return fmt.Sprintf("%.1fG / %.1fG (%.0f%%)", usedGB, totalGB, percent)
}
