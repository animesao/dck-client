package dck

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Client struct {
	BinPath string
	DataDir string
}

type Container struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Image  string `json:"image"`
	Status string `json:"status"`
	PID    int    `json:"pid"`
	Ports  []struct {
		Host      string `json:"host"`
		Container string `json:"container"`
		Protocol  string `json:"protocol"`
	} `json:"ports"`
	IP        string `json:"ip"`
	CreatedAt string `json:"created_at"`
	Memory    string `json:"memory"`
	CPUs      string `json:"cpus"`
	UserID    string `json:"user_id"`
	Network   string `json:"network"`
	Restart   string `json:"restart"`
}

func (c *Client) run(args ...string) (string, error) {
	cmd := exec.Command(c.BinPath, args...)
	cmd.Env = append(os.Environ(), "DCK_HOME="+c.DataDir)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func (c *Client) runWithStdin(args []string, stdin string) (string, error) {
	cmd := exec.Command(c.BinPath, args...)
	cmd.Env = append(os.Environ(), "DCK_HOME="+c.DataDir)
	cmd.Stdin = strings.NewReader(stdin)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func (c *Client) ListContainers(all bool) ([]Container, error) {
	args := []string{"ps"}
	if all {
		args = append(args, "-a")
	}
	args = append(args, "--format", "json")
	out, err := c.run(args...)
	if err != nil {
		if strings.Contains(out, "no containers") || out == "" {
			return []Container{}, nil
		}
		return nil, fmt.Errorf("dck ps: %s: %w", strings.TrimSpace(out), err)
	}
	return parseContainerList(out)
}

func parseContainerList(out string) ([]Container, error) {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	var containers []Container
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var c Container
		if err := json.Unmarshal([]byte(line), &c); err != nil {
			continue
		}
		containers = append(containers, c)
	}
	return containers, nil
}

func (c *Client) GetContainer(id string) (*Container, error) {
	// Read from state file directly
	statePath := filepath.Join(c.DataDir, "containers", id+".json")
	b, err := os.ReadFile(statePath)
	if err != nil {
		return nil, fmt.Errorf("container %s not found", id)
	}
	var ct Container
	if err := json.Unmarshal(b, &ct); err != nil {
		return nil, err
	}
	ct.ID = id
	return &ct, nil
}

func (c *Client) CreateContainer(image, name, ports, volumes, env, restart, memory, cpus, network, cmd string) (string, error) {
	args := []string{"run", "-d"}
	if name != "" {
		args = append(args, "--name", name)
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
	for _, p := range strings.Fields(ports) {
		args = append(args, "-p", p)
	}
	for _, v := range strings.Fields(volumes) {
		args = append(args, "-v", v)
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
	out, err := c.run("images")
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	var images []string
	for _, line := range lines {
		if line != "" {
			images = append(images, line)
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

func (c *Client) LogPath(id string) string {
	return filepath.Join(c.DataDir, "logs", id+".log")
}

func (c *Client) ConsoleSocketPath(id string) string {
	return filepath.Join(c.DataDir, "consoles", id+".sock")
}

func (c *Client) ContainerStatePath(id string) string {
	return filepath.Join(c.DataDir, "containers", id+".json")
}

func (c *Client) ContainersDir() string {
	return filepath.Join(c.DataDir, "containers")
}

func (c *Client) BackupDir() string {
	return filepath.Join(c.DataDir, "backups")
}
