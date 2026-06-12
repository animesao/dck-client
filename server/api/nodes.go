package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"dck-panel/db"
)

func (s *Server) handleRegisterNode(w http.ResponseWriter, r *http.Request, _ *UserClaims) {
	var req struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if req.Name == "" || req.URL == "" {
		writeError(w, http.StatusBadRequest, "name and url are required")
		return
	}

	id := generateID()
	apiKey := generateAPIKey()

	if err := s.store.AddNode(id, req.Name, req.URL, apiKey); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":       id,
		"name":     req.Name,
		"url":      req.URL,
		"api_key":  apiKey,
	})
}

func (s *Server) handleListNodes(w http.ResponseWriter, r *http.Request, _ *UserClaims) {
	nodes, err := s.store.ListNodes()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type nodeResp struct {
		db.Node
		Online     bool    `json:"online"`
		Version    string  `json:"version,omitempty"`
		Hostname   string  `json:"hostname,omitempty"`
		CPUModel   string  `json:"cpu_model,omitempty"`
		CPUCores   int     `json:"cpu_cores,omitempty"`
		CPUPercent float64 `json:"cpu_percent,omitempty"`
		MemTotal   uint64  `json:"mem_total,omitempty"`
		MemUsed    uint64  `json:"mem_used,omitempty"`
		MemPct     float64 `json:"mem_percent,omitempty"`
		DiskTotal  uint64  `json:"disk_total,omitempty"`
		DiskUsed   uint64  `json:"disk_used,omitempty"`
		DiskPct    float64 `json:"disk_percent,omitempty"`
		Uptime     string  `json:"uptime,omitempty"`
	}

	result := make([]nodeResp, 0, len(nodes))
	for _, n := range nodes {
		resp := nodeResp{Node: n}
		stats, err := fetchNodeHealth(n.URL, n.APIKey)
		if err == nil {
			resp.Online = true
			resp.Version = stats.Version
			resp.Hostname = stats.Hostname
			resp.CPUModel = stats.CPUModel
			resp.CPUCores = stats.CPUCores
			resp.CPUPercent = stats.CPUPercent
			resp.MemTotal = stats.MemTotal
			resp.MemUsed = stats.MemUsed
			resp.MemPct = stats.MemPct
			resp.DiskTotal = stats.DiskTotal
			resp.DiskUsed = stats.DiskUsed
			resp.DiskPct = stats.DiskPct
			resp.Uptime = stats.Uptime
		}
		result = append(result, resp)
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRemoveNode(w http.ResponseWriter, r *http.Request, _ *UserClaims) {
	id := r.PathValue("id")
	if err := s.store.RemoveNode(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type nodeHealth struct {
	Version    string  `json:"version"`
	Hostname   string  `json:"hostname"`
	CPUModel   string  `json:"cpu_model"`
	CPUCores   int     `json:"cpu_cores"`
	CPUPercent float64 `json:"cpu_percent"`
	MemTotal   uint64  `json:"mem_total"`
	MemUsed    uint64  `json:"mem_used"`
	MemPct     float64 `json:"mem_percent"`
	DiskTotal  uint64  `json:"disk_total"`
	DiskUsed   uint64  `json:"disk_used"`
	DiskPct    float64 `json:"disk_percent"`
	Uptime     string  `json:"uptime"`
}

func fetchNodeHealth(url, apiKey string) (*nodeHealth, error) {
	req, err := http.NewRequest("GET", url+"/api/health", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("User-Agent", "dck-panel")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var h nodeHealth
	if err := json.NewDecoder(resp.Body).Decode(&h); err != nil {
		return nil, err
	}
	return &h, nil
}

func generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func generateAPIKey() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}
