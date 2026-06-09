package server

import (
	"net/http"

	"dck-client/internal/models"
)

var categoryPresets = []models.CategoryPreset{
	{Name: "bot", Icon: "message-circle", Description: "Discord/Telegram bots, automation", DefaultRAM: "256m", DefaultCPU: 0.25},
	{Name: "web", Icon: "globe", Description: "Web servers, reverse proxies, APIs", DefaultRAM: "512m", DefaultCPU: 0.5},
	{Name: "database", Icon: "database", Description: "PostgreSQL, MySQL, Redis, MongoDB", DefaultRAM: "2g", DefaultCPU: 1.0},
	{Name: "game", Icon: "gamepad-2", Description: "Minecraft, Terraria, game servers", DefaultRAM: "4g", DefaultCPU: 2.0},
	{Name: "tool", Icon: "toolbox", Description: "CLI tools, utilities, certbot", DefaultRAM: "128m", DefaultCPU: 0.25},
	{Name: "runtime", Icon: "terminal", Description: "Python, Node, Go — свой код", DefaultRAM: "1g", DefaultCPU: 1.0},
	{Name: "cms", Icon: "edit", Description: "WordPress, Joomla, site builders", DefaultRAM: "512m", DefaultCPU: 0.5},
	{Name: "dev", Icon: "code", Description: "Dev environments, workspaces", DefaultRAM: "2g", DefaultCPU: 2.0},
	{Name: "multi", Icon: "layers", Description: "Multi-container stacks", DefaultRAM: "2g", DefaultCPU: 1.0},
}

type CategoriesHandler struct {
	*Server
}

func (h *CategoriesHandler) List(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, categoryPresets)
}

// Auto-fill CPU/RAM from category name
func categoryDefaults(cat string) (string, float64) {
	for _, p := range categoryPresets {
		if p.Name == cat {
			return p.DefaultRAM, p.DefaultCPU
		}
	}
	return "", 0
}

// Filter blueprints by category
func filterBlueprintsByCategory(blueprints []models.Blueprint, cat string) []models.Blueprint {
	if cat == "" || cat == "all" {
		return blueprints
	}
	var result []models.Blueprint
	for _, bp := range blueprints {
		if bp.Category == cat {
			result = append(result, bp)
		}
	}
	return result
}

func getBlueprintByName(name string) *models.Blueprint {
	for _, bp := range getBlueprints() {
		if bp.Name == name {
			return &bp
		}
	}
	return nil
}
