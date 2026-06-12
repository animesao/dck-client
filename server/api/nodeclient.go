package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"dck-panel/db"
)

func (s *Server) getContainerNode(containerID string) *db.Node {
	nodeID := s.store.GetContainerNodeID(containerID)
	if nodeID == "" {
		return nil
	}
	return s.getNode(nodeID)
}

func (s *Server) getNode(nodeID string) *db.Node {
	if nodeID == "" {
		return nil
	}
	nodes, err := s.store.ListNodes()
	if err != nil {
		return nil
	}
	for _, n := range nodes {
		if n.ID == nodeID {
			return &n
		}
	}
	return nil
}

func (s *Server) forwardToNode(method, nodeURL, apiKey, path string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequest(method, nodeURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "dck-panel")

	client := &http.Client{Timeout: 30 * time.Second}
	return client.Do(req)
}

func (s *Server) nodeCreateContainer(node *db.Node, image, name, ports, volumes, env, restart, memory, cpus, network, cmd, startupScript, disk string) (string, error) {
	var cmdArr []string
	if cmd != "" {
		cmdArr = strings.Fields(cmd)
	}
	var portArr []string
	if ports != "" {
		portArr = strings.Fields(ports)
	}
	var volArr []string
	if volumes != "" {
		volArr = strings.Fields(volumes)
	}
	var envArr []string
	if env != "" {
		envArr = strings.Fields(env)
	}

	cpusFloat, _ := strconv.ParseFloat(cpus, 64)

	body := map[string]interface{}{
		"image":          image,
		"name":           name,
		"cmd":            cmdArr,
		"ports":          portArr,
		"volumes":        volArr,
		"env":            envArr,
		"detach":         true,
		"memory":         memory,
		"cpus":           cpusFloat,
		"network":        network,
		"restart":        restart,
		"startup_script": startupScript,
		"disk":           disk,
	}

	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(body); err != nil {
		return "", err
	}

	resp, err := s.forwardToNode("POST", node.URL, node.APIKey, "/api/containers", &buf)
	if err != nil {
		return "", fmt.Errorf("node %s unreachable: %w", node.Name, err)
	}
	defer resp.Body.Close()

	var result map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("node %s: invalid response", node.Name)
	}

	if errMsg, ok := result["error"]; ok {
		return "", fmt.Errorf("node %s: %s", node.Name, errMsg)
	}

	return result["id"], nil
}

func (s *Server) nodeContainerAction(node *db.Node, id, action string) error {
	resp, err := s.forwardToNode("POST", node.URL, node.APIKey, fmt.Sprintf("/api/containers/%s/%s", id, action), nil)
	if err != nil {
		return fmt.Errorf("node %s unreachable: %w", node.Name, err)
	}
	defer resp.Body.Close()
	return nil
}

func (s *Server) nodeRemoveContainer(node *db.Node, id string, force bool) error {
	path := fmt.Sprintf("/api/containers/%s", id)
	if force {
		path += "?force=1"
	}
	resp, err := s.forwardToNode("DELETE", node.URL, node.APIKey, path, nil)
	if err != nil {
		return fmt.Errorf("node %s unreachable: %w", node.Name, err)
	}
	defer resp.Body.Close()
	return nil
}

func (s *Server) nodeGetContainerState(node *db.Node, id string) (map[string]interface{}, error) {
	resp, err := s.forwardToNode("GET", node.URL, node.APIKey, fmt.Sprintf("/api/containers/%s/state", id), nil)
	if err != nil {
		return nil, fmt.Errorf("node %s unreachable: %w", node.Name, err)
	}
	defer resp.Body.Close()

	var state map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil {
		return nil, err
	}
	return state, nil
}

func (s *Server) nodeGetContainerStats(node *db.Node, id string) (map[string]interface{}, error) {
	resp, err := s.forwardToNode("GET", node.URL, node.APIKey, fmt.Sprintf("/api/containers/%s/stats", id), nil)
	if err != nil {
		return nil, fmt.Errorf("node %s unreachable: %w", node.Name, err)
	}
	defer resp.Body.Close()

	var stats map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil, err
	}
	return stats, nil
}

func (s *Server) nodeLogs(node *db.Node, id string) (string, error) {
	resp, err := s.forwardToNode("GET", node.URL, node.APIKey, fmt.Sprintf("/api/containers/%s/logs", id), nil)
	if err != nil {
		return "", fmt.Errorf("node %s unreachable: %w", node.Name, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func (s *Server) nodeExec(node *db.Node, id, command string) (string, error) {
	body := map[string]string{"command": command}
	var buf bytes.Buffer
	json.NewEncoder(&buf).Encode(body)

	resp, err := s.forwardToNode("POST", node.URL, node.APIKey, fmt.Sprintf("/api/containers/%s/exec", id), &buf)
	if err != nil {
		return "", fmt.Errorf("node %s unreachable: %w", node.Name, err)
	}
	defer resp.Body.Close()

	out, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func (s *Server) nodeListContainers(node *db.Node, all bool) ([]map[string]interface{}, error) {
	path := "/api/containers"
	if all {
		path += "?all=1"
	}
	resp, err := s.forwardToNode("GET", node.URL, node.APIKey, path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	containers, _ := result["containers"].([]interface{})
	out := make([]map[string]interface{}, 0, len(containers))
	for _, c := range containers {
		if m, ok := c.(map[string]interface{}); ok {
			out = append(out, m)
		}
	}
	return out, nil
}

// pickBestNode selects the node with most available resources (least utilized)
func (s *Server) pickBestNode(requiredMemMB int64, requiredDiskBytes int64) *db.Node {
	nodes, err := s.store.ListNodes()
	if err != nil || len(nodes) == 0 {
		return nil
	}

	var best *db.Node
	var bestScore float64 = -1

	for _, n := range nodes {
		h, err := fetchNodeHealth(n.URL, n.APIKey)
		if err != nil {
			continue
		}

		// Skip nodes that don't have enough resources
		if requiredDiskBytes > 0 && h.DiskTotal > 0 {
			availDisk := int64(h.DiskTotal) - int64(h.DiskUsed)
			if availDisk < requiredDiskBytes {
				continue
			}
		}

		// Calculate utilization score (lower is better)
		cpuScore := h.CPUPercent
		memScore := h.MemPct
		diskScore := h.DiskPct
		score := cpuScore*0.3 + memScore*0.3 + diskScore*0.4

		if best == nil || score < bestScore {
			best = &n
			bestScore = score
		}
	}

	return best
}
