package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"dck-client/internal/models"
)

type ConfigHandler struct {
	*Server
}

func (h *ConfigHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfgPath := h.resolveConfigPath()
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSON(w, http.StatusOK, map[string]string{
				"content": "# dck.toml - Multi-container configuration\n# See: https://gitlab.com/animesao/dck\n\n",
				"path":    cfgPath,
			})
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"content": string(data),
		"path":    cfgPath,
	})
}

func (h *ConfigHandler) SaveConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cfgPath := h.resolveConfigPath()
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := os.WriteFile(cfgPath, []byte(req.Content), 0644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "save_config", "Saved config to: "+cfgPath)

	writeJSON(w, http.StatusOK, map[string]string{"status": "saved", "path": cfgPath})
}

func (h *ConfigHandler) Deploy(w http.ResponseWriter, r *http.Request) {
	var req models.DeployConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cfgPath := h.resolveConfigPath()

	if req.Config != "" {
		if err := os.MkdirAll(filepath.Dir(cfgPath), 0755); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := os.WriteFile(cfgPath, []byte(req.Config), 0644); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	out, err := h.dck.DeployConfig(cfgPath, req.Filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "deploy", "Deployed config: "+cfgPath)

	writeJSON(w, http.StatusOK, map[string]string{"output": out})
}

func (h *ConfigHandler) Down(w http.ResponseWriter, r *http.Request) {
	all := r.URL.Query().Get("all") == "true"
	cfgPath := h.resolveConfigPath()

	out, err := h.dck.DownConfig(cfgPath, all)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "down", "Brought down containers")

	writeJSON(w, http.StatusOK, map[string]string{"output": out})
}

func (h *ConfigHandler) resolveConfigPath() string {
	settings, err := h.db.GetSettings()
	if err != nil {
		return "dck.toml"
	}
	// Check current directory first, then data dir
	candidates := []string{
		"dck.toml",
		filepath.Join(settings.DckDataDir, "dck.toml"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	abs, _ := filepath.Abs("dck.toml")
	return abs
}
