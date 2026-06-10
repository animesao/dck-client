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
	BinPath string
	DataDir string
}

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

func (c *Client) ListContainers(all bool) ([]Container, error) {
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

func (c *Client) GetContainer(id string) (*Container, error) {
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

func (c *Client) CreateContainer(image, name, ports, volumes, env, restart, memory, cpus, network, cmd string) (string, error) {
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
	if network != "" {
		args = append(args, "--network", network)
	}
	if ports != "" {
		args = append(args, "-p", strings.Join(strings.Fields(ports), ","))
	}
	if volumes != "" {
		args = append(args, "-v", strings.Join(strings.Fields(volumes), ","))
	}
	for _, e := range strings.Fields(env) {
		args = append(args, "-e", e)
	}
	args = append(args, image)
	if cmd != "" {
		args = append(args, strings.Fields(cmd)...)
	}
	out, err := c.run(args...)
	return strings.TrimSpace(out), err
}

func (c *Client) StartContainer(id string) error {
	_, err := c.run("start", id)
	return err
}

func (c *Client) StopContainer(id string) error {
	_, err := c.run("stop", id)
	return err
}

func (c *Client) RestartContainer(id string) error {
	_, err := c.run("restart", id)
	return err
}

func (c *Client) RemoveContainer(id string, force bool) error {
	args := []string{"rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, id)
	_, err := c.run(args...)
	return err
}

func (c *Client) Exec(id string, command string) (string, error) {
	args := []string{"exec", id}
	args = append(args, strings.Fields(command)...)
	out, err := c.run(args...)
	return out, err
}

func (c *Client) Logs(id string) (string, error) {
	out, err := c.run("logs", id)
	return out, err
}

func (c *Client) ListImages() ([]string, error) {
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

func (c *Client) PullImage(name string) error {
	_, err := c.run("pull", name)
	return err
}

func (c *Client) RemoveImage(name string) error {
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
