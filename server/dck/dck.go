package dck

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Client struct {
	BinPath      string
	DataDir      string
	WingsURL     string
	WingsAPIKey  string
}

var _ ClientInterface = (*Client)(nil)

type PortMap struct {
	HostPort      int    `json:"host_port"`
	ContainerPort int    `json:"container_port"`
	Protocol      string `json:"protocol"`
}

type VolumeMount struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

type HealthcheckConfig struct {
	Cmd      string `json:"cmd"`
	Interval int    `json:"interval,omitempty"`
	Retries  int    `json:"retries,omitempty"`
	Timeout  int    `json:"timeout,omitempty"`
}

type Ulimit struct {
	Name string `json:"name"`
	Soft uint64 `json:"soft"`
	Hard uint64 `json:"hard"`
}

type Container struct {
	ID              string             `json:"id"`
	Name            string             `json:"name"`
	ImageName       string             `json:"image_name"`
	ImageTag        string             `json:"image_tag"`
	PID             int                `json:"pid"`
	Status          string             `json:"status"`
	Cmd             []string           `json:"cmd"`
	StartupScript   string             `json:"startup_script,omitempty"`
	CreatedAt       string             `json:"created_at"`
	Ports           []PortMap          `json:"ports,omitempty"`
	Volumes         []VolumeMount      `json:"volumes,omitempty"`
	Env             []string           `json:"env,omitempty"`
	Hostname        string             `json:"hostname,omitempty"`
	Restart         string             `json:"restart,omitempty"`
	IP              string             `json:"ip,omitempty"`
	Detach          bool               `json:"detach,omitempty"`
	Interactive     bool               `json:"interactive,omitempty"`
	TTY             bool               `json:"tty,omitempty"`
	RemoveOnExit    bool               `json:"remove_on_exit,omitempty"`
	StoppedByUser   bool               `json:"stopped_by_user,omitempty"`
	MemoryLimit     int64              `json:"memory_limit,omitempty"`
	CPUCount        float64            `json:"cpu_count,omitempty"`
	DiskLimit       int64              `json:"disk_limit,omitempty"`
	CgroupPath      string             `json:"cgroup_path,omitempty"`
	WorkingDir      string             `json:"working_dir,omitempty"`
	Healthcheck     *HealthcheckConfig `json:"healthcheck,omitempty"`
	Labels          map[string]string  `json:"labels,omitempty"`
	CapAdd          []string           `json:"cap_add,omitempty"`
	CapDrop         []string           `json:"cap_drop,omitempty"`
	User            string             `json:"user,omitempty"`
	ReadonlyRootfs  bool               `json:"readonly_rootfs,omitempty"`
	NoNewPrivileges bool               `json:"no_new_privileges,omitempty"`
	Sysctls         map[string]string  `json:"sysctls,omitempty"`
	DNS             []string           `json:"dns,omitempty"`
	NetworkMode     string             `json:"network_mode,omitempty"`
	Entrypoint      string             `json:"entrypoint,omitempty"`
	Ulimits         []Ulimit           `json:"ulimits,omitempty"`
}

func (c *Client) run(args ...string) (string, error) {
	cmd := exec.Command(c.BinPath, args...)
	cmd.Env = append(os.Environ(), "DCK_HOME="+c.DataDir)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("dck %s: %s", strings.Join(args, " "), strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func (c *Client) containersDir() string {
	return filepath.Join(c.DataDir, "containers")
}

func (c *Client) imagesDir() string {
	return filepath.Join(c.DataDir, "images")
}

func (c *Client) localListContainers(all bool) ([]Container, error) {
	cd := c.containersDir()
	log.Printf("DEBUG ListContainers: dir=%s all=%v", cd, all)
	entries, err := os.ReadDir(cd)
	if err != nil {
		log.Printf("DEBUG ListContainers: ReadDir error: %v", err)
		if os.IsNotExist(err) {
			return []Container{}, nil
		}
		return nil, err
	}

	log.Printf("DEBUG ListContainers: found %d entries", len(entries))
	var containers []Container
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			log.Printf("DEBUG ListContainers: skip non-json: %s", e.Name())
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		ct, err := c.GetContainer(id)
		if err != nil {
			log.Printf("DEBUG ListContainers: GetContainer(%s) error: %v", id, err)
			continue
		}
		log.Printf("DEBUG ListContainers: found container id=%s name=%s status=%s", ct.ID, ct.Name, ct.Status)
		if !all && ct.Status != "running" {
			continue
		}
		containers = append(containers, *ct)
	}
	log.Printf("DEBUG ListContainers: returning %d containers", len(containers))
	return containers, nil
}

func (c *Client) localGetContainer(id string) (*Container, error) {
	statePath := filepath.Join(c.containersDir(), id+".json")
	b, err := os.ReadFile(statePath)
	if err != nil {
		return nil, fmt.Errorf("container %s not found", id)
	}
	var ct Container
	if err := json.Unmarshal(b, &ct); err != nil {
		return nil, err
	}
	ct.ID = id
	if ct.Status == "running" {
		if _, err := os.Stat(filepath.Join("/proc", fmt.Sprintf("%d", ct.PID))); os.IsNotExist(err) {
			ct.Status = "stopped"
		}
	}
	return &ct, nil
}

func (c *Client) UpdateContainerStartupScript(id, script string) error {
	statePath := filepath.Join(c.containersDir(), id+".json")
	b, err := os.ReadFile(statePath)
	if err != nil {
		return fmt.Errorf("container %s not found", id)
	}
	var ct Container
	if err := json.Unmarshal(b, &ct); err != nil {
		return err
	}
	ct.StartupScript = script
	b, err = json.MarshalIndent(ct, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(statePath, b, 0644)
}

func (c *Client) UpdateContainerRestart(id, restart string) error {
	statePath := filepath.Join(c.containersDir(), id+".json")
	b, err := os.ReadFile(statePath)
	if err != nil {
		return fmt.Errorf("container %s not found", id)
	}
	var ct Container
	if err := json.Unmarshal(b, &ct); err != nil {
		return err
	}
	ct.Restart = restart
	b, err = json.MarshalIndent(ct, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(statePath, b, 0644)
}

func (c *Client) ReinstallContainer(id, image string) error {
	// Stop container
	if err := c.StopContainer(id); err != nil {
		// Ignore if already stopped
	}
	// Update image in config
	if err := c.UpdateContainerImage(id, image); err != nil {
		return err
	}
	// Read container to check disk limit
	statePath := filepath.Join(c.containersDir(), id+".json")
	b, _ := os.ReadFile(statePath)
	var ct Container
	json.Unmarshal(b, &ct)
	// Wipe overlay data
	overlayDir := filepath.Join(c.DataDir, "overlay", id)
	if ct.DiskLimit > 0 {
		exec.Command("umount", filepath.Join(overlayDir, "data")).Run()
	}
	os.RemoveAll(overlayDir)
	return nil
}

func (c *Client) UpdateContainerDisk(id string, limit int64) error {
	statePath := filepath.Join(c.containersDir(), id+".json")
	b, err := os.ReadFile(statePath)
	if err != nil {
		return fmt.Errorf("container %s not found", id)
	}
	var ct Container
	if err := json.Unmarshal(b, &ct); err != nil {
		return err
	}
	ct.DiskLimit = limit
	b, err = json.MarshalIndent(ct, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(statePath, b, 0644)
}

func (c *Client) UpdateContainerImage(id, image string) error {
	statePath := filepath.Join(c.containersDir(), id+".json")
	b, err := os.ReadFile(statePath)
	if err != nil {
		return fmt.Errorf("container %s not found", id)
	}
	var ct Container
	if err := json.Unmarshal(b, &ct); err != nil {
		return err
	}
	parts := strings.SplitN(image, ":", 2)
	ct.ImageName = parts[0]
	if len(parts) == 2 && parts[1] != "" {
		ct.ImageTag = parts[1]
	} else {
		ct.ImageTag = "latest"
	}
	b, err = json.MarshalIndent(ct, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(statePath, b, 0644)
}

func (c *Client) UpdateContainerCmd(id, cmd string) error {
	statePath := filepath.Join(c.containersDir(), id+".json")
	b, err := os.ReadFile(statePath)
	if err != nil {
		return fmt.Errorf("container %s not found", id)
	}
	var ct Container
	if err := json.Unmarshal(b, &ct); err != nil {
		return err
	}
	if cmd == "" {
		ct.Cmd = nil
	} else {
		ct.Cmd = strings.Fields(cmd)
	}
	b, err = json.MarshalIndent(ct, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(statePath, b, 0644); err != nil {
		return err
	}
	return nil
}

func (c *Client) localCreateContainer(image, name, ports, volumes, env, restart, memory, cpus, network, cmd, startupScript, disk string) (string, error) {
	args := []string{"run", "-d"}
	if name != "" {
		args = append(args, "-n", name)
	}
	if restart != "" {
		args = append(args, "--restart", restart)
	}
	if memory != "" {
		args = append(args, "--memory", memory)
	}
	if cpus != "" {
		args = append(args, "--cpus", cpus)
	}
	if disk != "" {
		args = append(args, "--disk", disk)
	}
	if network != "" {
		args = append(args, "--network", network)
	}
	if ports != "" {
		args = append(args, "-p", strings.Join(strings.Fields(ports), ","))
	}
	// Always mount /home/container and /data to the same named volume
	volName := name
	if volName == "" {
		volName = strings.ReplaceAll(image, "/", "_")
		volName = strings.ReplaceAll(volName, ":", "_")
	}
	hasHomeVolume := false
	for _, v := range strings.Fields(volumes) {
		parts := strings.SplitN(v, ":", 2)
		if len(parts) == 2 && parts[1] == "/home/container" {
			hasHomeVolume = true
		}
	}
	if volumes != "" {
		args = append(args, "-v", strings.Join(strings.Fields(volumes), ","))
	}
	if !hasHomeVolume {
		args = append(args, "-v", "data_"+volName+":/home/container")
		args = append(args, "-v", "data_"+volName+":/data")
	}
	args = append(args, "--workdir", "/home/container")
	args = append(args, "-e", "DATA_DIR=/home/container")
	args = append(args, "-e", "DATA_PATH=/home/container")
	for _, e := range strings.Fields(env) {
		args = append(args, "-e", e)
	}
	if startupScript != "" {
		args = append(args, "--startup", startupScript)
	}
	args = append(args, image)
	if cmd != "" {
		args = append(args, strings.Fields(cmd)...)
	}
	out, err := c.run(args...)
	if err != nil {
		return "", err
	}
	// dck run -d outputs a short ID; find the full ID on disk
	lines := strings.Fields(strings.TrimSpace(out))
	if len(lines) == 0 {
		return "", fmt.Errorf("empty output from dck run")
	}
	shortID := lines[len(lines)-1]
	fullID, err := c.resolveFullID(shortID)
	if err != nil {
		return "", err
	}
	return fullID, nil
}

func (c *Client) resolveFullID(shortID string) (string, error) {
	cd := c.containersDir()
	entries, err := os.ReadDir(cd)
	if err != nil {
		return shortID, nil // fallback to short ID
	}
	// Try exact match first
	for _, e := range entries {
		if e.Name() == shortID+".json" {
			return shortID, nil
		}
	}
	// Prefix match: find the file starting with the short ID
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), shortID) && strings.HasSuffix(e.Name(), ".json") {
			return strings.TrimSuffix(e.Name(), ".json"), nil
		}
	}
	return shortID, nil // fallback
}

func (c *Client) localStartContainer(id string) error {
	_, err := c.run("start", id)
	return err
}

func (c *Client) localStopContainer(id string) error {
	_, err := c.run("stop", id)
	return err
}

func (c *Client) localRestartContainer(id string) error {
	_, err := c.run("restart", id)
	return err
}

func (c *Client) localRemoveContainer(id string, force bool) error {
	args := []string{"rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, id)
	_, err := c.run(args...)
	return err
}

func (c *Client) SaveContainer(ct *Container) error {
	statePath := filepath.Join(c.containersDir(), ct.ID+".json")
	b, err := json.MarshalIndent(ct, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(statePath, b, 0644)
}

func (c *Client) localExec(id string, command string) (string, error) {
	args := []string{"exec", id}
	args = append(args, strings.Fields(command)...)
	out, err := c.run(args...)
	return out, err
}

func (c *Client) localLogs(id string) (string, error) {
	out, err := c.run("logs", id)
	return out, err
}

func (c *Client) localListImages() ([]string, error) {
	var images []string
	root := c.imagesDir()
	namespaces, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return images, nil
		}
		return nil, err
	}
	for _, ns := range namespaces {
		if !ns.IsDir() {
			continue
		}
		nsPath := filepath.Join(root, ns.Name())
		imgDirs, err := os.ReadDir(nsPath)
		if err != nil {
			continue
		}
		for _, img := range imgDirs {
			if !img.IsDir() {
				continue
			}
			imgPath := filepath.Join(nsPath, img.Name())
			tags, err := os.ReadDir(imgPath)
			if err != nil {
				continue
			}
			for _, tag := range tags {
				if tag.IsDir() {
					if ns.Name() == "library" {
						images = append(images, img.Name()+":"+tag.Name())
					} else {
						images = append(images, ns.Name()+"/"+img.Name()+":"+tag.Name())
					}
				}
			}
		}
	}
	return images, nil
}

func (c *Client) localPullImage(name string) error {
	_, err := c.run("pull", name)
	return err
}

func (c *Client) localRemoveImage(name string) error {
	_, err := c.run("rmi", name)
	return err
}

func (c *Client) OverlayPath(id string) string {
	return filepath.Join(c.DataDir, "overlay", id, "merged")
}

func (c *Client) OverlayDiffPath(id string) string {
	return filepath.Join(c.DataDir, "overlay", id, "upper")
}

func (c *Client) LogPath(id string) string {
	return filepath.Join(c.DataDir, "logs", id+".log")
}

func (c *Client) ConsoleSocketPath(id string) string {
	return filepath.Join(c.DataDir, "consoles", id+".sock")
}

func (c *Client) ContainerStatePath(id string) string {
	return filepath.Join(c.containersDir(), id+".json")
}

func (c *Client) ContainersDir() string {
	return c.containersDir()
}

func (c *Client) BackupDir() string {
	return filepath.Join(c.DataDir, "backups")
}

type ImageConfig struct {
	Config struct {
		WorkingDir string `json:"WorkingDir"`
	} `json:"config"`
}

func (c *Client) ReadImageWorkingDir(imageName, imageTag string) string {
	cfgPath := filepath.Join(c.imagesDir(), imageName, imageTag, "config.json")
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		return ""
	}
	var cfg ImageConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return ""
	}
	return cfg.Config.WorkingDir
}
