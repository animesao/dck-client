package server

import (
	"encoding/json"
	"net/http"
)

type SettingsHandler struct {
	*Server
}

func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	settings, err := h.db.GetSettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var s struct {
		DckBinaryPath    string `json:"dck_binary_path"`
		DckDataDir       string `json:"dck_data_dir"`
		ListenAddr       string `json:"listen_addr"`
		RegistrationOpen *bool  `json:"registration_open"`
	}
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	settings, err := h.db.GetSettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if s.DckBinaryPath != "" {
		settings.DckBinaryPath = s.DckBinaryPath
	}
	if s.DckDataDir != "" {
		settings.DckDataDir = s.DckDataDir
	}
	if s.ListenAddr != "" {
		settings.ListenAddr = s.ListenAddr
	}
	if s.RegistrationOpen != nil {
		settings.RegistrationOpen = *s.RegistrationOpen
	}

	if err := h.db.UpdateSettings(settings); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "update_settings", "Updated settings")

	writeJSON(w, http.StatusOK, settings)
}
