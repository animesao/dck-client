package dck

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"dck-client/internal/models"
)

type cpuSample struct {
	ticks  uint64
	time   time.Time
}

type Executor struct {
	BinaryPath string
	DataDir    string
	mu         sync.Mutex
	cpuCache   map[int]cpuSample
}

func New(binaryPath, dataDir string) *Executor {
	return &Executor{
		BinaryPath: binaryPath,
		DataDir:    dataDir,
		cpuCache:   make(map[int]cpuSample),
	}
}



func (e *Executor) runCommand(args ...string) (string, error) {
	cmd := exec.Command(e.BinaryPath, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s: %s", err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

func (e *Executor) ListContainers(all bool) ([]*models.Container, error) {
	containersDir := filepath.Join(e.DataDir, "containers")
	entries, err := os.ReadDir(containersDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var containers []*models.Container
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		data, err := os.ReadFile(filepath.Join(containersDir, entry.Name()))
		if err != nil {
			continue
		}
		c := &models.Container{}
		if err := json.Unmarshal(data, c); err != nil {
			continue
		}
		c.ID = id
		if c.PID > 0 {
			if _, err := os.Stat(fmt.Sprintf("/proc/%d", c.PID)); err != nil {
				c.Status = models.StatusStopped
			}
		}
		if !all && c.Status != models.StatusRunning {
			continue
		}
		containers = append(containers, c)
	}
	return containers, nil
}

func (e *Executor) GetContainer(id string) (*models.Container, error) {
	containerPath := filepath.Join(e.DataDir, "containers", id+".json")
	data, err := os.ReadFile(containerPath)
	if err != nil {
		if !strings.HasSuffix(id, ".json") {
			entries, _ := os.ReadDir(filepath.Join(e.DataDir, "containers"))
			for _, entry := range entries {
				if strings.HasPrefix(entry.Name(), id) || strings.TrimSuffix(entry.Name(), ".json") == id {
					data, err = os.ReadFile(filepath.Join(e.DataDir, "containers", entry.Name()))
					if err == nil {
						goto found
					}
				}
			}
			return nil, fmt.Errorf("container %s not found", id)
		}
		return nil, err
	}
found:
	c := &models.Container{}
	if err := json.Unmarshal(data, c); err != nil {
		return nil, err
	}
	if c.PID > 0 {
		if _, err := os.Stat(fmt.Sprintf("/proc/%d", c.PID)); err != nil {
			c.Status = models.StatusStopped
		}
	}
	return c, nil
}

func (e *Executor) CreateContainer(req *models.CreateContainerRequest) (string, error) {
	args := []string{"run"}
	if req.Detach {
		args = append(args, "-d")
	}
	if req.Name != "" {
		args = append(args, "-n", req.Name)
	}
	if req.Interactive {
		args = append(args, "-i")
	}
	if req.TTY {
		args = append(args, "-t")
	}
	if req.RemoveOnExit {
		args = append(args, "--rm")
	}
	if req.Hostname != "" {
		args = append(args, "-h", req.Hostname)
	}
	if req.Restart != "" {
		args = append(args, "--restart", req.Restart)
	}
	if req.Memory != "" {
		args = append(args, "--memory", req.Memory)
	}
	if req.CPUs > 0 {
		args = append(args, "--cpus", strconv.FormatFloat(req.CPUs, 'f', -1, 64))
	}
	if req.WorkingDir != "" {
		args = append(args, "--workdir", req.WorkingDir)
	}
	for _, p := range req.Ports {
		args = append(args, "-p", p)
	}
	for _, v := range req.Volumes {
		args = append(args, "-v", v)
	}
	for _, e := range req.Env {
		args = append(args, "-e", e)
	}
	if req.Entrypoint != "" {
		args = append(args, "--entrypoint", req.Entrypoint)
	}
	if req.NetworkMode != "" {
		args = append(args, "--network", req.NetworkMode)
	}
	if req.User != "" {
		args = append(args, "--user", req.User)
	}
	if req.ReadonlyRootfs {
		args = append(args, "--readonly")
	}
	if req.NoNewPrivileges {
		args = append(args, "--no-new-privs")
	}
	for k, v := range req.Labels {
		args = append(args, "-l", k+"="+v)
	}
	for _, cap := range req.CapAdd {
		args = append(args, "--cap-add", cap)
	}
	for _, cap := range req.CapDrop {
		args = append(args, "--cap-drop", cap)
	}
	for k, v := range req.Sysctls {
		args = append(args, "--sysctl", k+"="+v)
	}
	for k, v := range req.Ulimits {
		args = append(args, "--ulimit", k+"="+v)
	}
	for _, d := range req.DNS {
		args = append(args, "--dns", d)
	}
	args = append(args, req.Image)
	if req.Command != "" {
		args = append(args, strings.Fields(req.Command)...)
	}
	out, err := e.runCommand(args...)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (e *Executor) StartContainer(id string) error {
	_, err := e.runCommand("start", id)
	return err
}

func (e *Executor) StopContainer(id string) error {
	_, err := e.runCommand("stop", id)
	return err
}

func (e *Executor) RestartContainer(id string) error {
	_, err := e.runCommand("restart", id)
	return err
}

func (e *Executor) RemoveContainer(id string, force bool) error {
	args := []string{"rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, id)
	_, err := e.runCommand(args...)
	return err
}

func (e *Executor) GetContainerLogs(id string) (string, error) {
	logPath := filepath.Join(e.DataDir, "logs", id+".log")
	data, err := os.ReadFile(logPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

func (e *Executor) ListImages() ([]*models.Image, error) {
	imagesDir := filepath.Join(e.DataDir, "images")
	entries, err := os.ReadDir(imagesDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var images []*models.Image
	for _, ns := range entries {
		if !ns.IsDir() {
			continue
		}
		nsPath := filepath.Join(imagesDir, ns.Name())
		imgDirs, _ := os.ReadDir(nsPath)
		for _, img := range imgDirs {
			if !img.IsDir() {
				continue
			}
			imgPath := filepath.Join(nsPath, img.Name())
			tagDirs, _ := os.ReadDir(imgPath)
			for _, tag := range tagDirs {
				if !tag.IsDir() {
					continue
				}
				name := img.Name()
				if ns.Name() != "library" {
					name = ns.Name() + "/" + img.Name()
				}
				manifestPath := filepath.Join(imgPath, tag.Name(), "manifest.json")
				var size int64
				if mData, err := os.ReadFile(manifestPath); err == nil {
					var manifest struct {
						Layers []struct {
							Size int64 `json:"size"`
						} `json:"layers"`
					}
					if json.Unmarshal(mData, &manifest) == nil {
						for _, l := range manifest.Layers {
							size += l.Size
						}
					}
				}
				images = append(images, &models.Image{
					Name: name,
					Tag:  tag.Name(),
					Size: size,
				})
			}
		}
	}
	return images, nil
}

func (e *Executor) PullImage(ref string) (string, error) {
	return e.runCommand("pull", ref)
}

func (e *Executor) RemoveImage(name, tag string) error {
	ref := name
	if tag != "" {
		ref = name + ":" + tag
	}
	_, err := e.runCommand("rmi", ref)
	return err
}

func (e *Executor) DeployConfig(path string, filter string) (string, error) {
	args := []string{"up", "-f", path}
	if filter != "" {
		args = append(args, filter)
	}
	return e.runCommand(args...)
}

func (e *Executor) DownConfig(path string, all bool) (string, error) {
	args := []string{"down", "-f", path}
	if all {
		args = append(args, "-a")
	}
	return e.runCommand(args...)
}

func (e *Executor) ExecContainer(id, command string) (string, error) {
	container, err := e.GetContainer(id)
	if err != nil {
		return "", fmt.Errorf("container not found: %w", err)
	}
	if container.PID <= 0 {
		return "", fmt.Errorf("container not running")
	}
	cmd := exec.Command("nsenter", "-t", strconv.Itoa(container.PID), "-a", "--", "sh", "-c", command)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s: %s", err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

func (e *Executor) Bootstrap() (string, error) {
	return e.runCommand("bootstrap")
}

func (e *Executor) Version() (string, error) {
	out, err := e.runCommand("--version")
	if err != nil {
		out, err = e.runCommand("version")
		if err != nil {
			return "unknown", nil
		}
	}
	return out, nil
}

func (e *Executor) GetContainerStateJSON(id string) (string, error) {
	path := filepath.Join(e.DataDir, "containers", id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		if !strings.HasSuffix(id, ".json") {
			entries, _ := os.ReadDir(filepath.Join(e.DataDir, "containers"))
			for _, entry := range entries {
				if strings.HasPrefix(entry.Name(), id) {
					data, err = os.ReadFile(filepath.Join(e.DataDir, "containers", entry.Name()))
					if err == nil {
						return string(data), nil
					}
				}
			}
		}
		return "", err
	}
	return string(data), nil
}

func (e *Executor) GetContainerStats(pid int) (*models.ContainerCPU, error) {
	statPath := fmt.Sprintf("/proc/%d/stat", pid)
	statusPath := fmt.Sprintf("/proc/%d/status", pid)

	var memUsage, memLimit int64

	// Read memory from /proc/<pid>/status
	if f, err := os.Open(statusPath); err == nil {
		defer f.Close()
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "VmRSS:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					memUsage, _ = strconv.ParseInt(fields[1], 10, 64)
				}
			}
			if strings.HasPrefix(line, "VmSize:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					memLimit, _ = strconv.ParseInt(fields[1], 10, 64)
				}
			}
		}
	}

	// Read CPU ticks from /proc/<pid>/stat
	cpuPercent := 0.0
	if f, err := os.Open(statPath); err == nil {
		defer f.Close()
		scanner := bufio.NewScanner(f)
		if scanner.Scan() {
			line := scanner.Text()
			fields := strings.Fields(line)
			if len(fields) >= 15 {
				utime, _ := strconv.ParseUint(fields[13], 10, 64)
				stime, _ := strconv.ParseUint(fields[14], 10, 64)
				total := utime + stime

				e.mu.Lock()
				prev, ok := e.cpuCache[pid]
				e.cpuCache[pid] = cpuSample{ticks: total, time: time.Now()}
				e.mu.Unlock()

				if ok {
					dt := time.Since(prev.time).Seconds()
					if dt > 0 {
						clkTck := float64(100) // USER_HZ on typical Linux
						delta := float64(total - prev.ticks)
						cpuPercent = delta / clkTck / dt * 100
						if cpuPercent > 100 {
							cpuPercent = 100
						}
					}
				}
			}
		}
	}

	memPercent := 0.0
	if memLimit > 0 {
		memPercent = float64(memUsage) / float64(memLimit) * 100
	}

	return &models.ContainerCPU{
		CPU:        fmt.Sprintf("%.1f", cpuPercent),
		Mem:        fmt.Sprintf("%.1f MB", float64(memUsage)/1024),
		MemUsage:   memUsage * 1024,
		MemLimit:   memLimit * 1024,
		CPUPercent: cpuPercent,
		MemPercent: memPercent,
	}, nil
}
