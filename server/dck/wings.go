package dck

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

func (c *Client) wingsURL() string {
	return strings.TrimRight(c.WingsURL, "/")
}

func (c *Client) wingsRequest(method, path string, body interface{}) ([]byte, error) {
	var r io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		r = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.wingsURL()+path, r)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.WingsAPIKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wings: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("wings %s %s: HTTP %d: %s", method, path, resp.StatusCode, strings.TrimSpace(string(data)))
	}
	return data, nil
}

func (c *Client) isWings() bool {
	return c.WingsURL != ""
}

// Override ListImages for wings
func (c *Client) wingsListImages() ([]string, error) {
	data, err := c.wingsRequest("GET", "/api/images", nil)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Images []string `json:"images"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Images, nil
}

func (c *Client) wingsPullImage(name string) error {
	_, err := c.wingsRequest("POST", "/api/images", map[string]string{"image": name})
	return err
}

func (c *Client) wingsRemoveImage(name string) error {
	_, err := c.wingsRequest("DELETE", "/api/images/"+name, nil)
	return err
}

func (c *Client) wingsListContainers(all bool) ([]Container, error) {
	path := "/api/containers"
	if all {
		path += "?all=1"
	}
	data, err := c.wingsRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Containers []struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Image  string `json:"image"`
			Status string `json:"status"`
		} `json:"containers"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	var containers []Container
	for _, ci := range resp.Containers {
		containers = append(containers, Container{
			ID:        ci.ID,
			Name:      ci.Name,
			ImageName: ci.Image,
			Status:    ci.Status,
		})
	}
	return containers, nil
}

func (c *Client) wingsGetContainer(id string) (*Container, error) {
	data, err := c.wingsRequest("GET", "/api/containers/"+id+"/state", nil)
	if err != nil {
		return nil, err
	}
	var state struct {
		ID            string `json:"id"`
		ImageName     string `json:"image_name"`
		ImageTag      string `json:"image_tag"`
		Status        string `json:"status"`
		Name          string `json:"name"`
		Cmd           []string `json:"cmd"`
		StartupScript string   `json:"startup_script"`
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	imgName := state.ImageName
	imgTag := state.ImageTag
	if imgName == "" {
		imgParts := strings.SplitN(state.ID, ":", 2)
		imgName = imgParts[0]
		imgTag = "latest"
		if len(imgParts) == 2 {
			imgTag = imgParts[1]
		}
	}
	return &Container{
		ID:            state.ID,
		Name:          state.Name,
		ImageName:     imgName,
		ImageTag:      imgTag,
		Status:        state.Status,
		Cmd:           state.Cmd,
		StartupScript: state.StartupScript,
	}, nil
}

func (c *Client) wingsCreateContainer(image, name, ports, volumes, env, restart, memory, cpus, network, cmd, startupScript, disk string) (string, error) {
	body := map[string]interface{}{
		"image":   image,
		"detach":  true,
		"restart": restart,
		"memory":  memory,
	}
	if name != "" {
		body["name"] = name
	}
	if cpus != "" {
		if v, err := strconv.ParseFloat(cpus, 64); err == nil {
			body["cpus"] = v
		} else {
			body["cpus"] = cpus
		}
	}
	if network != "" {
		body["network"] = network
	}
	if ports != "" {
		body["ports"] = strings.Fields(ports)
	}
	if volumes != "" {
		body["volumes"] = strings.Fields(volumes)
	}
	if env != "" {
		body["env"] = strings.Fields(env)
	}
	if cmd != "" {
		body["cmd"] = strings.Fields(cmd)
	}
	if startupScript != "" {
		body["startup_script"] = startupScript
	}

	data, err := c.wingsRequest("POST", "/api/containers", body)
	if err != nil {
		return "", err
	}
	var resp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	return resp.ID, nil
}

func (c *Client) wingsAction(id, action string) error {
	_, err := c.wingsRequest("POST", "/api/containers/"+id+"/"+action, nil)
	return err
}

func (c *Client) wingsExec(id, command string) (string, error) {
	body := map[string]interface{}{
		"cmd": strings.Fields(command),
	}
	data, err := c.wingsRequest("POST", "/api/containers/"+id+"/exec", body)
	if err != nil {
		return "", err
	}
	var resp struct {
		Output string `json:"output"`
		Error  string `json:"error"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	if resp.Error != "" {
		return resp.Output, fmt.Errorf(resp.Error)
	}
	return resp.Output, nil
}

func (c *Client) wingsLogs(id string) (string, error) {
	data, err := c.wingsRequest("GET", "/api/containers/"+id+"/logs", nil)
	if err != nil {
		return "", err
	}
	var resp struct {
		Logs string `json:"logs"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	return resp.Logs, nil
}

func (c *Client) wingsRemoveContainer(id string, force bool) error {
	path := "/api/containers/" + id + "/remove"
	if force {
		path += "?force=1"
	}
	_, err := c.wingsRequest("POST", path, nil)
	return err
}

// For wings mode, wrap existing methods to use wings API when available.

func (c *Client) ListContainers(all bool) ([]Container, error) {
	if c.isWings() {
		return c.wingsListContainers(all)
	}
	return c.localListContainers(all)
}

func (c *Client) GetContainer(id string) (*Container, error) {
	if c.isWings() {
		return c.wingsGetContainer(id)
	}
	return c.localGetContainer(id)
}

func (c *Client) CreateContainer(image, name, ports, volumes, env, restart, memory, cpus, network, cmd, startupScript, disk string) (string, error) {
	if c.isWings() {
		return c.wingsCreateContainer(image, name, ports, volumes, env, restart, memory, cpus, network, cmd, startupScript, disk)
	}
	return c.localCreateContainer(image, name, ports, volumes, env, restart, memory, cpus, network, cmd, startupScript, disk)
}

func (c *Client) StartContainer(id string) error {
	if c.isWings() {
		return c.wingsAction(id, "start")
	}
	return c.localStartContainer(id)
}

func (c *Client) StopContainer(id string) error {
	if c.isWings() {
		return c.wingsAction(id, "stop")
	}
	return c.localStopContainer(id)
}

func (c *Client) RestartContainer(id string) error {
	if c.isWings() {
		return c.wingsAction(id, "restart")
	}
	return c.localRestartContainer(id)
}

func (c *Client) RemoveContainer(id string, force bool) error {
	if c.isWings() {
		return c.wingsRemoveContainer(id, force)
	}
	return c.localRemoveContainer(id, force)
}

func (c *Client) Exec(id string, command string) (string, error) {
	if c.isWings() {
		return c.wingsExec(id, command)
	}
	return c.localExec(id, command)
}

func (c *Client) Logs(id string) (string, error) {
	if c.isWings() {
		return c.wingsLogs(id)
	}
	return c.localLogs(id)
}

func (c *Client) ListImages() ([]string, error) {
	if c.isWings() {
		return c.wingsListImages()
	}
	return c.localListImages()
}

func (c *Client) PullImage(name string) error {
	if c.isWings() {
		return c.wingsPullImage(name)
	}
	return c.localPullImage(name)
}

func (c *Client) RemoveImage(name string) error {
	if c.isWings() {
		return c.wingsRemoveImage(name)
	}
	return c.localRemoveImage(name)
}

func (c *Client) ConsoleWebSocketURL(id string) string {
	if !c.isWings() {
		return ""
	}
	wsURL := c.wingsURL()
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	return wsURL + "/api/containers/" + id + "/console"
}
