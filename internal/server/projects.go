package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"dck-client/internal/models"
)

type ProjectHandler struct {
	*Server
}

// Scan directory for dck.json files
func (h *ProjectHandler) Scan(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = "."
	}

	projects, err := scanProjects(dir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if projects == nil {
		projects = []*models.ProjectInfo{}
	}

	// Enrich with container status
	for _, p := range projects {
		if p.Config != nil && p.Config.Container.Name != "" {
			container, err := h.dck.GetContainer(p.Config.Container.Name)
			if err == nil && container != nil {
				p.Container = container
				p.Status = string(container.Status)
			} else {
				p.Status = "not_created"
			}
		} else {
			p.Status = "incomplete"
		}
	}

	writeJSON(w, http.StatusOK, projects)
}

func scanProjects(root string) ([]*models.ProjectInfo, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}

	var projects []*models.ProjectInfo

	err = filepath.WalkDir(absRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip inaccessible
		}
		if d.IsDir() {
			// Skip hidden dirs and common non-project dirs
			if strings.HasPrefix(d.Name(), ".") || d.Name() == "node_modules" || d.Name() == "vendor" {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Name() == "dck.json" {
			config, readErr := readProjectFile(path)
			if readErr == nil && config != nil {
				info := &models.ProjectInfo{
					Path:   path,
					Dir:    filepath.Dir(path),
					Config: config,
					Status: "not_created",
				}
				projects = append(projects, info)
			}
		}
		return nil
	})

	// Sort by name
	sort.Slice(projects, func(i, j int) bool {
		return projects[i].Config.Name < projects[j].Config.Name
	})

	return projects, err
}

func readProjectFile(path string) (*models.ProjectConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg models.ProjectConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// Read single project by path
func (h *ProjectHandler) Read(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = "."
	}

	cfgPath := filepath.Join(dir, "dck.json")
	config, err := readProjectFile(cfgPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSON(w, http.StatusOK, map[string]string{"status": "not_found", "path": cfgPath})
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	info := &models.ProjectInfo{
		Path:   cfgPath,
		Dir:    dir,
		Config: config,
	}
	if config.Container.Name != "" {
		container, err := h.dck.GetContainer(config.Container.Name)
		if err == nil && container != nil {
			info.Container = container
			info.Status = string(container.Status)
		} else {
			info.Status = "not_created"
		}
	}

	writeJSON(w, http.StatusOK, info)
}

// Save (create or update) a dck.json
func (h *ProjectHandler) Save(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Dir    string               `json:"dir"`
		Config *models.ProjectConfig `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Config == nil {
		writeError(w, http.StatusBadRequest, "config is required")
		return
	}

	// Fill defaults
	if req.Config.Version == "" {
		req.Config.Version = "1"
	}
	if req.Config.Name == "" && req.Config.Container.Name != "" {
		req.Config.Name = req.Config.Container.Name
	}

	// Auto-fill category defaults if category is set but resources are empty
	if req.Config.Category != "" {
		defRAM, defCPU := categoryDefaults(req.Config.Category)
		if req.Config.Container.Memory == "" && defRAM != "" {
			req.Config.Container.Memory = defRAM
		}
		if req.Config.Container.CPUs == 0 && defCPU > 0 {
			req.Config.Container.CPUs = defCPU
		}
	}

	projectDir := req.Dir
	if projectDir == "" {
		projectDir = "."
	}

	// Ensure directory exists
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	cfgPath := filepath.Join(projectDir, "dck.json")
	data, err := json.MarshalIndent(req.Config, "", "  ")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := os.WriteFile(cfgPath, data, 0644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "save_project", "Saved project: "+req.Config.Name+" -> "+cfgPath)

	writeJSON(w, http.StatusOK, map[string]string{"status": "saved", "path": cfgPath})
}

// Delete a dck.json (optionally also delete the container)
func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	removeContainer := r.URL.Query().Get("remove_container") == "true"

	if dir == "" {
		writeError(w, http.StatusBadRequest, "dir is required")
		return
	}

	cfgPath := filepath.Join(dir, "dck.json")
	config, err := readProjectFile(cfgPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}

	// Remove container if requested
	if removeContainer && config.Container.Name != "" {
		if err := h.dck.RemoveContainer(config.Container.Name, true); err != nil {
			// Log but continue — container might not exist
		}
	}

	// Delete dck.json
	if err := os.Remove(cfgPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "delete_project", "Deleted project: "+config.Name+" -> "+cfgPath)

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Deploy a project: create container from dck.json
func (h *ProjectHandler) Deploy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Dir     string `json:"dir"`
		Profile string `json:"profile,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	projectDir := req.Dir
	if projectDir == "" {
		projectDir = "."
	}

	cfgPath := filepath.Join(projectDir, "dck.json")
	config, err := readProjectFile(cfgPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "project not found: "+cfgPath)
		return
	}

	// Apply profile if specified
	if req.Profile != "" && config.Deploy != nil && config.Deploy.Profiles != nil {
		if profile, ok := config.Deploy.Profiles[req.Profile]; ok {
			if profile.Memory != "" {
				config.Container.Memory = profile.Memory
			}
			if profile.CPUs > 0 {
				config.Container.CPUs = profile.CPUs
			}
			if profile.Env != nil {
				if config.Container.Env == nil {
					config.Container.Env = make(map[string]string)
				}
				for k, v := range profile.Env {
					config.Container.Env[k] = v
				}
			}
		}
	}

	// Resolve relative volumes
	absDir, _ := filepath.Abs(projectDir)
	resolvedVols := resolveVolumes(absDir, config.Container.Volumes)

	// Build container request
	containerReq := buildContainerRequest(config, resolvedVols)

	// Pull image first
	if _, err := h.dck.PullImage(containerReq.Image); err != nil {
		writeError(w, http.StatusInternalServerError, "pull failed: "+err.Error())
		return
	}

	// Stop existing container if running
	if config.Container.Name != "" {
		if existing, err := h.dck.GetContainer(config.Container.Name); err == nil && existing != nil {
			if existing.Status == models.StatusRunning {
				h.dck.StopContainer(config.Container.Name)
			}
			h.dck.RemoveContainer(config.Container.Name, true)
		}
	}

	// Create container
	out, err := h.dck.CreateContainer(containerReq)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Save deployment metadata
	if config.Deploy != nil && config.Deploy.DataDir != "" {
		deployDir := resolvePath(absDir, config.Deploy.DataDir)
		os.MkdirAll(deployDir, 0755)
		dc := models.DeploymentConfig{
			Image:    containerReq.Image,
			Port:     strings.Join(containerReq.Ports, ","),
			Command:  containerReq.Command,
			Restart:  containerReq.Restart,
			Memory:   containerReq.Memory,
			CPUs:     containerReq.CPUs,
			WorkingDir: containerReq.WorkingDir,
			Env:      config.Container.Env,
			Volumes:  config.Container.Volumes,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if config.Blueprint != nil {
			dc.Blueprint = config.Blueprint.Name
		}
		deployPath := filepath.Join(deployDir, config.Container.Name+".json")
		if deployData, err := json.MarshalIndent(dc, "", "  "); err == nil {
			os.WriteFile(deployPath, deployData, 0644)
		}
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "deploy_project", "Deployed project: "+config.Name+" -> "+out)

	writeJSON(w, http.StatusOK, map[string]string{"status": "deployed", "output": out})
}

func resolveVolumes(baseDir string, vols []string) []string {
	var resolved []string
	for _, v := range vols {
		parts := strings.SplitN(v, ":", 2)
		if len(parts) == 2 {
			hostPath := parts[0]
			containerPath := parts[1]
			// Only resolve relative paths (not named volumes)
			if !strings.HasPrefix(hostPath, "/") && !strings.HasPrefix(hostPath, ".") && !strings.Contains(hostPath, ":") {
				// Named volume (e.g., "data:/var/lib/data")
				resolved = append(resolved, v)
			} else {
				absHost := resolvePath(baseDir, hostPath)
				resolved = append(resolved, absHost+":"+containerPath)
			}
		} else {
			resolved = append(resolved, v)
		}
	}
	return resolved
}

func resolvePath(baseDir, p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(baseDir, p)
}

func buildContainerRequest(config *models.ProjectConfig, volumes []string) *models.CreateContainerRequest {
	cc := config.Container

	// Convert env map to []string
	var envList []string
	for k, v := range cc.Env {
		envList = append(envList, k+"="+v)
	}

	req := &models.CreateContainerRequest{
		Image:       cc.Image,
		Name:        cc.Name,
		Command:     cc.Command,
		Detach:      true,
		Interactive: cc.Interactive,
		TTY:         cc.TTY,
		RemoveOnExit: cc.RemoveOnExit,
		Hostname:    cc.Hostname,
		Restart:     cc.Restart,
		Memory:      cc.Memory,
		CPUs:        cc.CPUs,
		WorkingDir:  cc.Workdir,
		Ports:       cc.Ports,
		Volumes:     volumes,
		Env:         envList,
		Entrypoint:     cc.Entrypoint,
		NetworkMode:    cc.NetworkMode,
		Labels:         cc.Labels,
		CapAdd:         cc.CapAdd,
		CapDrop:        cc.CapDrop,
		User:           cc.User,
		ReadonlyRootfs: cc.ReadonlyRootfs,
		NoNewPrivileges: cc.NoNewPrivileges,
		Sysctls:        cc.Sysctls,
		Ulimits:        cc.Ulimits,
		DNS:            cc.DNS,
	}

	if cc.Healthcheck != nil {
		req.Healthcheck = struct {
			Cmd      string `json:"cmd"`
			Interval int    `json:"interval"`
			Retries  int    `json:"retries"`
			Timeout  int    `json:"timeout"`
		}{
			Cmd:      cc.Healthcheck.Cmd,
			Interval: cc.Healthcheck.Interval,
			Retries:  cc.Healthcheck.Retries,
			Timeout:  cc.Healthcheck.Timeout,
		}
	}

	return req
}

// Create a new project from category + blueprint
func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Dir         string `json:"dir"`
		Category    string `json:"category"`
		Blueprint   string `json:"blueprint,omitempty"`
		ContainerName string `json:"container_name,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Category == "" {
		writeError(w, http.StatusBadRequest, "category is required")
		return
	}

	defRAM, defCPU := categoryDefaults(req.Category)

	cfg := &models.ProjectConfig{
		Version:  "1",
		Name:     req.ContainerName,
		Category: req.Category,
		Container: models.ContainerConfigV2{
			Name:   req.ContainerName,
			Memory: defRAM,
			CPUs:   defCPU,
		},
		Deploy: &models.DeploySettings{
			AutoStart: true,
		},
		Meta: &models.MetaInfo{
			Tags: []string{req.Category},
		},
	}

	// Apply blueprint if specified
	if req.Blueprint != "" {
		bp := getBlueprintByName(req.Blueprint)
		if bp != nil {
			cfg.Blueprint = &models.BlueprintRef{
				Name: bp.Name,
				Env:  make(map[string]string),
			}
			cfg.Container.Image = bp.Image
			cfg.Container.Command = bp.DefaultCmd
			cfg.Meta.Description = bp.Description
			if bp.Icon != "" {
				cfg.Meta.Icon = bp.Icon
			}
			if bp.DefaultPort != "" {
				cfg.Container.Ports = []string{bp.DefaultPort + ":" + bp.DefaultPort}
			}
			if bp.Volumes != nil {
				cfg.Container.Volumes = bp.Volumes
			}
			// Fill default env values from blueprint
			for _, ev := range bp.Env {
				if ev.Default != "" {
					cfg.Blueprint.Env[ev.Key] = ev.Default
				}
			}
		}
	}

	// Auto-name from project
	if cfg.Container.Name == "" {
		cfg.Container.Name = strings.ToLower(strings.ReplaceAll(cfg.Name, " ", "-"))
	}
	if cfg.Name == "" {
		cfg.Name = cfg.Container.Name
	}

	writeJSON(w, http.StatusOK, cfg)
}

// Auto-deploy: find dck.json in directory and deploy
func (h *ProjectHandler) AutoDeploy(w http.ResponseWriter, r *http.Request) {
	// Search for dck.json up from current dir
	dir, err := findProjectDir(".")
	if err != nil {
		writeError(w, http.StatusNotFound, "no dck.json found in current or parent directories")
		return
	}

	var req struct {
		Profile string `json:"profile,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	projectDir := dir
	cfgPath := filepath.Join(projectDir, "dck.json")
	config, err := readProjectFile(cfgPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "project not found: "+cfgPath)
		return
	}

	// Apply profile if specified
	if req.Profile != "" && config.Deploy != nil && config.Deploy.Profiles != nil {
		if profile, ok := config.Deploy.Profiles[req.Profile]; ok {
			if profile.Memory != "" {
				config.Container.Memory = profile.Memory
			}
			if profile.CPUs > 0 {
				config.Container.CPUs = profile.CPUs
			}
			if profile.Env != nil {
				if config.Container.Env == nil {
					config.Container.Env = make(map[string]string)
				}
				for k, v := range profile.Env {
					config.Container.Env[k] = v
				}
			}
		}
	}

	absDir, _ := filepath.Abs(projectDir)
	resolvedVols := resolveVolumes(absDir, config.Container.Volumes)
	containerReq := buildContainerRequest(config, resolvedVols)

	if _, err := h.dck.PullImage(containerReq.Image); err != nil {
		writeError(w, http.StatusInternalServerError, "pull failed: "+err.Error())
		return
	}

	// Stop + remove existing
	if config.Container.Name != "" {
		if existing, err := h.dck.GetContainer(config.Container.Name); err == nil && existing != nil {
			if existing.Status == models.StatusRunning {
				h.dck.StopContainer(config.Container.Name)
			}
			h.dck.RemoveContainer(config.Container.Name, true)
		}
	}

	out, err := h.dck.CreateContainer(containerReq)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "auto_deploy", "Auto-deployed: "+config.Name+" -> "+out)

	writeJSON(w, http.StatusOK, map[string]string{"status": "deployed", "output": out, "name": config.Container.Name})
}

func findProjectDir(start string) (string, error) {
	absStart, err := filepath.Abs(start)
	if err != nil {
		return "", err
	}

	dir := absStart
	for {
		cfgPath := filepath.Join(dir, "dck.json")
		if _, err := os.Stat(cfgPath); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("dck.json not found")
		}
		dir = parent
	}
}
