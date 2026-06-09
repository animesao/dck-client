package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"dck-client/internal/models"

	"github.com/go-chi/chi"
)

type BlueprintHandler struct {
	*Server
}

func (h *BlueprintHandler) List(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, getBlueprints())
}

func (h *BlueprintHandler) ListByCategory(w http.ResponseWriter, r *http.Request) {
	category := chi.URLParam(r, "category")
	all := getBlueprints()
	filtered := filterBlueprintsByCategory(all, category)
	writeJSON(w, http.StatusOK, filtered)
}

func (h *BlueprintHandler) Launch(w http.ResponseWriter, r *http.Request) {
	name, err := url.PathUnescape(chi.URLParam(r, "name"))
	if err != nil {
		name = chi.URLParam(r, "name")
	}

	blueprints := getBlueprints()
	var bp *models.Blueprint
	for i := range blueprints {
		if blueprints[i].Name == name {
			bp = &blueprints[i]
			break
		}
	}
	if bp == nil {
		writeError(w, http.StatusNotFound, "blueprint not found")
		return
	}

	var req struct {
		Name      string            `json:"name"`
		Image     string            `json:"image"`
		Port      string            `json:"port"`
		Command   string            `json:"command"`
		Restart   string            `json:"restart"`
		Memory    string            `json:"memory"`
		CPUs      float64           `json:"cpus"`
		WorkingDir string           `json:"workdir"`
		Env       map[string]string `json:"env"`
		Volumes   []string          `json:"volumes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate required fields
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "container name is required")
		return
	}
	if req.Port == "" && bp.DefaultPort != "" {
		req.Port = bp.DefaultPort
	}

	// Validate required env vars
	for _, ev := range bp.Env {
		if ev.Required {
			if val, ok := req.Env[ev.Key]; !ok || val == "" {
				writeError(w, http.StatusBadRequest, ev.Key+" is required")
				return
			}
		}
	}

	// Ensure unique container name
	req.Name = h.ensureNameUnique(req.Name)

	// Save deployment config and mount it into the container
	deployDir := filepath.Join(h.db.DataDir(), "deployments")
	os.MkdirAll(deployDir, 0755)
	dc := models.DeploymentConfig{
		Blueprint:  bp.Name,
		Image:      req.Image,
		Port:       req.Port,
		Command:    req.Command,
		Restart:    req.Restart,
		Memory:     req.Memory,
		CPUs:       req.CPUs,
		WorkingDir: req.WorkingDir,
		Env:        req.Env,
		Volumes:    req.Volumes,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	if dc.Image == "" {
		dc.Image = bp.Image
	}
	configPath := filepath.Join(deployDir, req.Name+".json")
	if configData, err := json.MarshalIndent(dc, "", "  "); err == nil {
		os.WriteFile(configPath, configData, 0644)
	}

	var results []map[string]interface{}
	addResult := func(name, status, errStr string) {
		m := map[string]interface{}{"name": name, "success": errStr == ""}
		if errStr != "" {
			m["error"] = errStr
		}
		results = append(results, m)
	}

	// Strip meta-fields from env and use them for container config
	envVars := make([]string, 0, len(req.Env))
	for k, v := range req.Env {
		if v == "" {
			continue
		}
		switch k {
		case "CODE_PATH":
			// Used for volume building below, not passed as env var
		case "START_CMD":
			if req.Command == "" {
				req.Command = v
			}
		case "RAM":
			if req.Memory == "" {
				req.Memory = v
			}
		case "CPU":
			if req.CPUs == 0 {
				if c, err := strconv.ParseFloat(v, 64); err == nil {
					req.CPUs = c
				}
			}
		case "VERSION":
			// Used to modify image tag if present
			if req.Image == "" && v != "" {
				baseImg := bp.Image
				if idx := strings.LastIndexByte(baseImg, ':'); idx >= 0 {
					baseImg = baseImg[:idx]
				}
				req.Image = baseImg + ":" + v
			}
		default:
			envVars = append(envVars, k+"="+v)
		}
	}

	vols := make([]string, 0)
	for _, v := range req.Volumes {
		parts := strings.SplitN(v, ":", 2)
		if len(parts) == 2 {
			vols = append(vols, v)
		}
	}
	// Auto-build volumes if none provided by user
	if len(vols) == 0 {
		// Host code mount from CODE_PATH
		if codePath, ok := req.Env["CODE_PATH"]; ok && codePath != "" {
			mountPath := "/app"
			nameLower := strings.ToLower(bp.Name)
			if strings.Contains(nameLower, "discord") || strings.Contains(nameLower, "telegram") {
				mountPath = "/bot"
			} else if strings.Contains(nameLower, "php") || strings.Contains(nameLower, "apache") {
				mountPath = "/var/www/html"
			} else if strings.Contains(nameLower, "nginx") {
				mountPath = "/usr/share/nginx/html"
			} else if strings.Contains(nameLower, "ubuntu") || strings.Contains(nameLower, "dev") {
				mountPath = "/workspace"
			}
			vols = append(vols, codePath+":"+mountPath)
		}
		// Named data volumes for known images
		imageLower := strings.ToLower(req.Image)
		if imageLower == "" {
			imageLower = strings.ToLower(bp.Image)
		}
		switch {
		case strings.Contains(imageLower, "postgres"):
			vols = append(vols, req.Name+"_data:/var/lib/postgresql/data")
		case strings.Contains(imageLower, "mysql") || strings.Contains(imageLower, "mariadb"):
			vols = append(vols, req.Name+"_data:/var/lib/mysql")
		case strings.Contains(imageLower, "mongo"):
			vols = append(vols, req.Name+"_data:/data/db")
		case strings.Contains(imageLower, "redis"):
			vols = append(vols, req.Name+"_data:/data")
		case strings.Contains(imageLower, "minecraft") || strings.Contains(imageLower, "itzg"):
			vols = append(vols, req.Name+"_data:/data")
		case strings.Contains(imageLower, "n8n"):
			vols = append(vols, req.Name+"_data:/home/node/.n8n")
		case strings.Contains(imageLower, "wordpress"):
			vols = append(vols, req.Name+"_data:/var/www/html")
		}
	}
	// Auto-add /tmp volume for MySQL/MariaDB to prevent Permission denied
	imageLower := strings.ToLower(req.Image)
	if imageLower == "" {
		imageLower = strings.ToLower(bp.Image)
	}
	if strings.Contains(imageLower, "mysql") || strings.Contains(imageLower, "mariadb") {
		hasTmp := false
		for _, v := range vols {
			if strings.HasSuffix(v, ":/tmp") || strings.Contains(v, ":/tmp:") || strings.HasSuffix(v, ":/tmp:ro") {
				hasTmp = true
				break
			}
		}
		if !hasTmp {
			vols = append(vols, req.Name+"_tmp:/tmp")
		}
	}
	// Mount config file into container
	if _, err := os.Stat(configPath); err == nil {
		vols = append(vols, configPath+":/etc/dck-deploy.json:ro")
	}

	containerImage := req.Image
	if containerImage == "" {
		containerImage = bp.Image
	}

	if bp.IsMulti {
		appContainer := models.CreateContainerRequest{
			Image:   containerImage,
			Name:    req.Name,
			Command: req.Command,
			Detach:  true,
			Restart: req.Restart,
			Ports:   splitCSV(req.Port),
			Env:     envVars,
			Volumes: vols,
			Memory:  req.Memory,
			CPUs:    req.CPUs,
			WorkingDir: req.WorkingDir,
		}
		if _, err := h.dck.PullImage(containerImage); err != nil {
			addResult(req.Name, "error", "pull failed: "+err.Error())
			writeJSON(w, http.StatusOK, map[string]interface{}{"results": results})
			return
		}
		if _, err := h.dck.CreateContainer(&appContainer); err != nil {
			addResult(req.Name, "error", err.Error())
			writeJSON(w, http.StatusOK, map[string]interface{}{"results": results})
			return
		}
		addResult(req.Name, "created", "")

		dbName := req.Name + "-db"
		dbImage := "postgres:16-alpine"
		dbCmd := ""
		dbPorts := []string{"5432"}
		dbEnv := []string{
			"POSTGRES_PASSWORD=" + req.Env["DB_PASS"],
			"POSTGRES_USER=" + req.Env["DB_USER"],
			"POSTGRES_DB=" + req.Env["DB_NAME"],
		}
		if strings.Contains(strings.ToLower(bp.Name), "redis") {
			dbImage = "redis:7-alpine"
			dbCmd = "redis-server --appendonly yes"
			dbPorts = []string{"6379"}
			dbEnv = nil
		}
		if _, err := h.dck.PullImage(dbImage); err != nil {
			addResult(dbName, "error", "pull failed: "+err.Error())
		} else {
			dbVols := []string{dbName + "_data:/data"}
			dbContainer := models.CreateContainerRequest{
				Image:   dbImage,
				Name:    dbName,
				Command: dbCmd,
				Detach:  true,
				Restart: "always",
				Ports:   dbPorts,
				Env:     dbEnv,
				Volumes: dbVols,
			}
			if _, err := h.dck.CreateContainer(&dbContainer); err != nil {
				addResult(dbName, "error", err.Error())
			} else {
				addResult(dbName, "created", "")
			}
		}
	} else {
		if _, err := h.dck.PullImage(containerImage); err != nil {
			writeError(w, http.StatusInternalServerError, "pull failed: "+err.Error())
			return
		}
		containerReq := models.CreateContainerRequest{
			Image:   containerImage,
			Name:    req.Name,
			Command: req.Command,
			Detach:  true,
			Restart: req.Restart,
			Ports:   splitCSV(req.Port),
			Env:     envVars,
			Volumes: vols,
			Memory:  req.Memory,
			CPUs:    req.CPUs,
			WorkingDir: req.WorkingDir,
		}
		if _, err := h.dck.CreateContainer(&containerReq); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		addResult(req.Name, "created", "")
	}

	userID := r.Context().Value(userIDKey).(int64)
	h.db.LogAction(userID, "deploy_blueprint", "Deployed blueprint: "+bp.Name+" -> "+req.Name)

	writeJSON(w, http.StatusCreated, map[string]interface{}{"results": results})
}

func (h *BlueprintHandler) ensureNameUnique(base string) string {
	name := base
	for i := 0; i < 10; i++ {
		if _, err := h.dck.GetContainer(name); err != nil {
			return name
		}
		name = base + "-" + randString(4)
	}
	return base + "-" + randString(6)
}

func getBlueprints() []models.Blueprint {
	return []models.Blueprint{
		{
			Name:        "Nginx Web Server",
			Description: "High-performance web server and reverse proxy. Mount your static site and go.",
			Category:    "Web Server",
			Icon:        "globe",
			Image:       "nginx:alpine",
			DefaultPort: "80",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to website files on host", Default: "C:/sites/myapp", Required: true, Placeholder: "e.g. C:/sites/myapp"},
				{Key: "VERSION", Description: "Nginx image version", Default: "alpine", Options: []string{"alpine","latest","1.25","1.24","1.23"}, Advanced: true},
			},
		},
		{
			Name:        "Python Flask App",
			Description: "Run a Python Flask app. Mount your code, set a secret key, and deploy.",
			Category:    "Runtime",
			Icon:        "code",
			Image:       "python:3.12-slim",
			DefaultPort: "5000",
			DefaultCmd:  "sh -c 'pip install --dry-run -r /app/requirements.txt -q 2>/dev/null || pip install -r /app/requirements.txt; exec python /app/app.py'",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to Flask app on host", Required: true, Placeholder: "e.g. C:/projects/myflaskapp"},
				{Key: "SECRET_KEY", Description: "Flask secret key (generate a random string)", Required: true, Placeholder: "e.g. change-me-to-random-string"},
				{Key: "FLASK_ENV", Description: "Flask environment", Default: "production", Advanced: true, Options: []string{"production","development"}},
				{Key: "VERSION", Description: "Python image version", Default: "3.12-slim", Options: []string{"3.12-slim","3.11-slim","3.10-slim"}, Advanced: true},
			},
		},
		{
			Name:        "Node.js App",
			Description: "Run any Node.js application. Auto npm install on start.",
			Category:    "Runtime",
			Icon:        "terminal",
			Image:       "node:22-alpine",
			DefaultPort: "3000",
			DefaultCmd:  "sh -c 'cd /app && npm install && exec node index.js'",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to Node.js app on host", Required: true, Placeholder: "e.g. C:/projects/myapp"},
				{Key: "NODE_ENV", Description: "Node environment", Default: "production", Advanced: true, Options: []string{"production","development"}},
				{Key: "PORT", Description: "HTTP port your app listens on", Default: "3000", Advanced: true},
				{Key: "VERSION", Description: "Node.js image version", Default: "22-alpine", Options: []string{"22-alpine","20-alpine","18-alpine"}, Advanced: true},
			},
		},
		{
			Name:        "PostgreSQL",
			Description: "Relational database with persistent storage. Set a password and deploy.",
			Category:    "Database",
			Icon:        "database",
			Image:       "postgres:16-alpine",
			DefaultPort: "5432",
			Env: []models.BlueprintEnv{
				{Key: "POSTGRES_PASSWORD", Description: "Superuser password", Required: true, Placeholder: "e.g. my-secret-pw"},
				{Key: "POSTGRES_USER", Description: "Custom user name", Default: "postgres", Advanced: true},
				{Key: "POSTGRES_DB", Description: "Database name", Default: "myapp", Advanced: true},
				{Key: "VERSION", Description: "PostgreSQL version", Default: "16", Options: []string{"16","15","14","13","12"}, Advanced: true},
			},
		},
		{
			Name:        "MySQL",
			Description: "Popular open-source relational database. Root password and optional database/user.",
			Category:    "Database",
			Icon:        "database",
			Image:       "mysql:8.4",
			DefaultPort: "3306",
			Env: []models.BlueprintEnv{
				{Key: "MYSQL_ROOT_PASSWORD", Description: "Root password", Required: true, Placeholder: "e.g. my-secret-pw"},
				{Key: "MYSQL_DATABASE", Description: "Database name", Default: "myapp", Advanced: true},
				{Key: "MYSQL_USER", Description: "Custom user name", Default: "myapp", Advanced: true},
				{Key: "MYSQL_PASSWORD", Description: "User password", Default: "", Advanced: true},
				{Key: "VERSION", Description: "MySQL version", Default: "8.4", Options: []string{"8.4","8.0","5.7"}, Advanced: true},
			},
		},
		{
			Name:        "Redis",
			Description: "In-memory data store for caching and sessions. Blazing fast, zero config needed.",
			Category:    "Database",
			Icon:        "database",
			Image:       "redis:7-alpine",
			DefaultPort: "6379",
			DefaultCmd:  "redis-server --appendonly yes",
			Env: []models.BlueprintEnv{
				{Key: "REDIS_PASSWORD", Description: "Redis password (leave empty for no auth)", Default: "", Placeholder: "optional"},
				{Key: "VERSION", Description: "Redis image version", Default: "7-alpine", Options: []string{"7-alpine","7","6-alpine","6"}, Advanced: true},
			},
		},
		{
			Name:        "Discord Bot (Python)",
			Description: "Python Discord bot with discord.py. Enter your token, code path, and deploy.",
			Category:    "Bot",
			Icon:        "message-circle",
			Image:       "python:3.12-slim",
			DefaultCmd:  "sh -c 'pip install --dry-run -r /bot/requirements.txt -q 2>/dev/null || pip install -r /bot/requirements.txt; exec python /bot/bot.py'",
			Env: []models.BlueprintEnv{
				{Key: "TOKEN", Description: "Discord bot token", Required: true, Placeholder: "e.g. MTIzNDU2Nzg5MDEyMzQ1Njc4OQ"},
				{Key: "CODE_PATH", Description: "Path to bot code on host", Required: true, Placeholder: "e.g. C:/bots/discord-bot"},
				{Key: "START_CMD", Description: "Override start command", Advanced: true, Placeholder: "python /bot/bot.py"},
			},
		},
		{
			Name:        "Telegram Bot (Python)",
			Description: "Python Telegram bot using python-telegram-bot. Enter token and code path.",
			Category:    "Bot",
			Icon:        "message-circle",
			Image:       "python:3.12-slim",
			DefaultCmd:  "sh -c 'pip install --dry-run -r /bot/requirements.txt -q 2>/dev/null || pip install -r /bot/requirements.txt; exec python /bot/bot.py'",
			Env: []models.BlueprintEnv{
				{Key: "TOKEN", Description: "Telegram bot token", Required: true, Placeholder: "e.g. 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"},
				{Key: "CODE_PATH", Description: "Path to bot code on host", Required: true, Placeholder: "e.g. C:/bots/tg-bot"},
				{Key: "START_CMD", Description: "Override start command", Advanced: true, Placeholder: "python /bot/bot.py"},
			},
		},
		{
			Name:        "Minecraft Server (Universal)",
			Description: "Full-featured Minecraft server. Any core (Paper/Vanilla/Forge/Fabric), any version, any Java.",
			Category:    "Game",
			Icon:        "gamepad-2",
			Image:       "itzg/minecraft-server",
			DefaultPort: "25565",
			Env: []models.BlueprintEnv{
				{Key: "EULA", Description: "Accept Mojang EULA (must be TRUE)", Default: "TRUE", Required: true},
				{Key: "TYPE", Description: "Server core: PAPER, VANILLA, FORGE, FABRIC, SPIGOT, etc.", Default: "PAPER", Options: []string{"PAPER","VANILLA","SPIGOT","FORGE","FABRIC","BUKKIT","PURPUR","AIRPLANE","MAGMA","MOHIST"}},
				{Key: "VERSION", Description: "Minecraft version: LATEST, 1.20.4, 1.16.5, 1.12.2, etc.", Default: "LATEST", Options: []string{"LATEST","1.21","1.20.4","1.20.1","1.19.4","1.18.2","1.17.1","1.16.5","1.15.2","1.14.4","1.12.2","1.7.10"}},
				{Key: "JAVA_VERSION", Description: "Java version for your MC version", Default: "jdk21-jre", Options: []string{"jdk25-jre","jdk24-jre","jdk23-jre","jdk22-jre","jdk21-jre","jdk17-jre","jdk16-jre","jdk11-jre","jdk8-jre"}},
				{Key: "MEMORY", Description: "RAM allocation (e.g. 2G, 4G, 8G)", Default: "2G"},
				{Key: "DIFFICULTY", Description: "Difficulty", Default: "easy", Options: []string{"easy","normal","hard","peaceful"}, Advanced: true},
				{Key: "MODE", Description: "Game mode", Default: "survival", Options: []string{"survival","creative","adventure","spectator"}, Advanced: true},
				{Key: "MAX_PLAYERS", Description: "Max players", Default: "20", Advanced: true},
				{Key: "ENABLE_RCON", Description: "Enable RCON", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "SEED", Description: "World seed (empty = random)", Default: "", Advanced: true},
				{Key: "LEVEL_TYPE", Description: "World type", Default: "DEFAULT", Options: []string{"DEFAULT","FLAT","LARGEBIOMES","AMPLIFIED","CUSTOMIZED"}, Advanced: true},
				{Key: "ONLINE_MODE", Description: "Online mode (license check)", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "SPAWN_PROTECTION", Description: "Spawn protection radius (0=off)", Default: "0", Advanced: true},
				{Key: "PVP", Description: "PvP enabled", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "ALLOW_NETHER", Description: "Allow Nether", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "ALLOW_END", Description: "Allow End", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "ENABLE_COMMAND_BLOCK", Description: "Enable command blocks", Default: "false", Options: []string{"true","false"}, Advanced: true},
				{Key: "WHITELIST", Description: "Enable whitelist", Default: "false", Options: []string{"true","false"}, Advanced: true},
				{Key: "INIT_MEMORY", Description: "Initial RAM (if different from MEMORY)", Default: "", Advanced: true},
				{Key: "MAX_TICK_TIME", Description: "Max tick time (ms, -1=unlimited)", Default: "-1", Advanced: true},
			},
			EnvTips: "Java version by MC version:\n- jdk8-jre -> 1.7.10-1.12.2\n- jdk11-jre -> 1.13-1.16.1\n- jdk16-jre -> 1.16.5-1.17.1\n- jdk17-jre -> 1.18-1.20.1\n- jdk21-jre -> 1.20.2+ (recommended)",
		},
		{
			Name:        "Minecraft Vanilla",
			Description: "Clean vanilla Minecraft server. No plugins, pure Mojang experience.",
			Category:    "Game",
			Icon:        "gamepad-2",
			Image:       "itzg/minecraft-server",
			DefaultPort: "25565",
			Env: []models.BlueprintEnv{
				{Key: "EULA", Description: "Accept Mojang EULA (must be TRUE)", Default: "TRUE", Required: true},
				{Key: "VERSION", Description: "Minecraft version", Default: "LATEST", Options: []string{"LATEST","1.21","1.20.4","1.20.1","1.19.4","1.18.2","1.17.1","1.16.5","1.15.2","1.14.4","1.12.2","1.7.10"}},
				{Key: "JAVA_VERSION", Description: "Java version", Default: "jdk21-jre", Options: []string{"jdk25-jre","jdk24-jre","jdk23-jre","jdk22-jre","jdk21-jre","jdk17-jre","jdk16-jre","jdk11-jre","jdk8-jre"}},
				{Key: "MEMORY", Description: "RAM (e.g. 2G, 4G)", Default: "2G"},
				{Key: "DIFFICULTY", Description: "Difficulty", Default: "easy", Options: []string{"easy","normal","hard","peaceful"}, Advanced: true},
				{Key: "MODE", Description: "Game mode", Default: "survival", Options: []string{"survival","creative","adventure","spectator"}, Advanced: true},
				{Key: "MAX_PLAYERS", Description: "Max players", Default: "20", Advanced: true},
				{Key: "ONLINE_MODE", Description: "Online mode", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "PVP", Description: "PvP", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "ALLOW_NETHER", Description: "Allow Nether", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "SEED", Description: "World seed", Default: "", Advanced: true},
			},
			EnvTips: "Java by MC version:\n- jdk8-jre -> 1.7.10-1.12.2\n- jdk11-jre -> 1.13-1.16.1\n- jdk16-jre -> 1.16.5-1.17\n- jdk17-jre -> 1.18-1.20.1\n- jdk21-jre -> 1.20.2+ (default)",
		},
		{
			Name:        "Minecraft Modded (Forge/Fabric)",
			Description: "Modded Minecraft server. Forge or Fabric, any version. Drop mods in /data/mods.",
			Category:    "Game",
			Icon:        "gamepad-2",
			Image:       "itzg/minecraft-server",
			DefaultPort: "25565",
			Env: []models.BlueprintEnv{
				{Key: "EULA", Description: "Accept Mojang EULA (must be TRUE)", Default: "TRUE", Required: true},
				{Key: "TYPE", Description: "Core: FORGE or FABRIC", Default: "FORGE", Options: []string{"FORGE","FABRIC"}},
				{Key: "VERSION", Description: "Minecraft version", Default: "1.20.1", Options: []string{"LATEST","1.21","1.20.4","1.20.1","1.19.4","1.18.2","1.17.1","1.16.5","1.15.2","1.14.4","1.12.2","1.7.10"}},
				{Key: "JAVA_VERSION", Description: "Java version", Default: "jdk21-jre", Options: []string{"jdk25-jre","jdk24-jre","jdk23-jre","jdk22-jre","jdk21-jre","jdk17-jre","jdk16-jre","jdk11-jre","jdk8-jre"}},
				{Key: "MEMORY", Description: "RAM (modded needs 4G+)", Default: "4G"},
				{Key: "DIFFICULTY", Description: "Difficulty", Default: "hard", Options: []string{"easy","normal","hard","peaceful"}, Advanced: true},
				{Key: "MODE", Description: "Game mode", Default: "survival", Options: []string{"survival","creative","adventure","spectator"}, Advanced: true},
				{Key: "MAX_PLAYERS", Description: "Max players", Default: "20", Advanced: true},
				{Key: "ONLINE_MODE", Description: "Online mode", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "ALLOW_NETHER", Description: "Allow Nether", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "ENABLE_RCON", Description: "Enable RCON", Default: "true", Options: []string{"true","false"}, Advanced: true},
				{Key: "FORGEVERSION", Description: "Forge version (empty = latest)", Default: "", Advanced: true},
				{Key: "FABRIC_LOADER_VERSION", Description: "Fabric loader version (empty = latest)", Default: "", Advanced: true},
				{Key: "SEED", Description: "World seed", Default: "", Advanced: true},
			},
			EnvTips: "Modded servers need more RAM: 4G minimum, 6-8G recommended.\nDrop .jar mods into the /data/mods volume.\n\nJava:\n- jdk8-jre -> old versions (1.7.10-1.12.2)\n- jdk16-jre -> 1.16.5 Forge\n- jdk17-jre -> 1.17-1.20.1 Forge/Fabric\n- jdk21-jre -> 1.20.2+ Forge/Fabric",
		},
		{
			Name:        "Discord Bot + PostgreSQL",
			Description: "Discord bot with PostgreSQL database. Deploys bot and database together.",
			Category:    "Multi-Container",
			Icon:        "layers",
			Image:       "python:3.12-slim",
			IsMulti:     true,
			DefaultCmd:  "sh -c 'pip install --dry-run -r /bot/requirements.txt -q 2>/dev/null || pip install -r /bot/requirements.txt; exec python /bot/bot.py'",
			Env: []models.BlueprintEnv{
				{Key: "TOKEN", Description: "Discord bot token", Required: true, Placeholder: "e.g. MTIzNDU2Nzg5MDEyMzQ1Njc4OQ"},
				{Key: "CODE_PATH", Description: "Path to bot code on host", Required: true, Placeholder: "e.g. C:/bots/discord-bot"},
				{Key: "DB_PASS", Description: "Database password", Required: true, Placeholder: "e.g. my-db-password"},
				{Key: "DB_HOST", Description: "Database host", Default: "10.0.2.1", Advanced: true},
				{Key: "DB_USER", Description: "Database user", Default: "postgres", Advanced: true},
				{Key: "DB_NAME", Description: "Database name", Default: "botdb", Advanced: true},
				{Key: "VERSION", Description: "Python image version", Default: "3.12-slim", Options: []string{"3.12-slim","3.11-slim","3.10-slim"}, Advanced: true},
			},
		},
		{
			Name:        "Flask + PostgreSQL",
			Description: "Flask web app with PostgreSQL. Full-stack web service with database.",
			Category:    "Multi-Container",
			Icon:        "layers",
			Image:       "python:3.12-slim",
			IsMulti:     true,
			DefaultPort: "5000",
			DefaultCmd:  "sh -c 'pip install --dry-run -r /app/requirements.txt -q 2>/dev/null || pip install -r /app/requirements.txt; exec python /app/app.py'",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to Flask app on host", Required: true, Placeholder: "e.g. C:/projects/flask-app"},
				{Key: "SECRET_KEY", Description: "Flask secret key", Required: true, Placeholder: "e.g. change-me-to-random"},
				{Key: "DB_PASS", Description: "Database password", Required: true, Placeholder: "e.g. my-db-password"},
				{Key: "DB_HOST", Description: "Database host", Default: "10.0.2.1", Advanced: true},
				{Key: "DB_USER", Description: "Database user", Default: "postgres", Advanced: true},
				{Key: "DB_NAME", Description: "Database name", Default: "myapp", Advanced: true},
				{Key: "FLASK_ENV", Description: "Flask environment", Default: "production", Advanced: true, Options: []string{"production","development"}},
				{Key: "VERSION", Description: "Python image version", Default: "3.12-slim", Options: []string{"3.12-slim","3.11-slim","3.10-slim"}, Advanced: true},
			},
		},
		{
			Name:        "Node.js + Redis",
			Description: "Node.js app with Redis for caching and sessions. High-performance web stack.",
			Category:    "Multi-Container",
			Icon:        "layers",
			Image:       "node:22-alpine",
			IsMulti:     true,
			DefaultPort: "3000",
			DefaultCmd:  "sh -c 'cd /app && npm install && exec node index.js'",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to Node.js app on host", Required: true, Placeholder: "e.g. C:/projects/node-app"},
				{Key: "REDIS_URL", Description: "Redis connection URL", Default: "redis://10.0.2.1:6379"},
				{Key: "NODE_ENV", Description: "Node environment", Default: "production", Advanced: true, Options: []string{"production","development"}},
				{Key: "VERSION", Description: "Node.js image version", Default: "22-alpine", Options: []string{"22-alpine","20-alpine","18-alpine"}, Advanced: true},
			},
		},
		{
			Name:        "Node.js + MongoDB",
			Description: "Node.js app with MongoDB. Full-stack JavaScript with a document database.",
			Category:    "Multi-Container",
			Icon:        "layers",
			Image:       "node:22-alpine",
			IsMulti:     true,
			DefaultPort: "3000",
			DefaultCmd:  "sh -c 'cd /app && npm install && exec node index.js'",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to Node.js app on host", Required: true, Placeholder: "e.g. C:/projects/node-mongo"},
				{Key: "MONGO_URL", Description: "MongoDB connection URL", Default: "mongodb://10.0.2.1:27017/myapp"},
				{Key: "NODE_ENV", Description: "Node environment", Default: "production", Advanced: true, Options: []string{"production","development"}},
				{Key: "VERSION", Description: "Node.js image version", Default: "22-alpine", Options: []string{"22-alpine","20-alpine","18-alpine"}, Advanced: true},
			},
		},
		{
			Name:        "MongoDB",
			Description: "Document-oriented NoSQL database. Set root password and deploy.",
			Category:    "Database",
			Icon:        "database",
			Image:       "mongo:7",
			DefaultPort: "27017",
			Env: []models.BlueprintEnv{
				{Key: "MONGO_INITDB_ROOT_PASSWORD", Description: "Root password", Required: true, Placeholder: "e.g. my-secret-pw"},
				{Key: "MONGO_INITDB_ROOT_USERNAME", Description: "Root username", Default: "admin", Advanced: true},
				{Key: "VERSION", Description: "MongoDB version", Default: "7", Options: []string{"7","6","5","4.4"}, Advanced: true},
			},
		},
		{
			Name:        "MariaDB",
			Description: "Drop-in MySQL replacement. Set root password and deploy.",
			Category:    "Database",
			Icon:        "database",
			Image:       "mariadb:11",
			DefaultPort: "3306",
			Env: []models.BlueprintEnv{
				{Key: "MARIADB_ROOT_PASSWORD", Description: "Root password", Required: true, Placeholder: "e.g. my-secret-pw"},
				{Key: "MARIADB_DATABASE", Description: "Database name", Default: "myapp", Advanced: true},
				{Key: "MARIADB_USER", Description: "Custom user", Default: "user", Advanced: true},
				{Key: "MARIADB_PASSWORD", Description: "User password", Default: "", Advanced: true},
				{Key: "VERSION", Description: "MariaDB version", Default: "11", Options: []string{"11","10.11","10.6"}, Advanced: true},
			},
		},
		{
			Name:        "PHP + Apache",
			Description: "PHP runtime with Apache. Mount your PHP files and they just work.",
			Category:    "Web Server",
			Icon:        "globe",
			Image:       "php:8.2-apache",
			DefaultPort: "80",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to PHP files on host", Required: true, Placeholder: "e.g. C:/sites/php-app"},
				{Key: "VERSION", Description: "PHP image version", Default: "8.2-apache", Options: []string{"8.2-apache","8.1-apache","8.0-apache","7.4-apache"}, Advanced: true},
			},
		},
		{
			Name:        "Go App",
			Description: "Run any Go application. Auto-downloads modules and builds on start.",
			Category:    "Runtime",
			Icon:        "terminal",
			Image:       "golang:1.22-alpine",
			DefaultPort: "8080",
			DefaultCmd:  "sh -c 'go mod download && go run .'",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to Go source on host", Required: true, Placeholder: "e.g. C:/projects/go-app"},
				{Key: "VERSION", Description: "Go image version", Default: "1.22-alpine", Options: []string{"1.22-alpine","1.21-alpine","1.20-alpine"}, Advanced: true},
			},
		},
		{
			Name:        "Rust App",
			Description: "Run any Rust application. Compiles with cargo on start.",
			Category:    "Runtime",
			Icon:        "terminal",
			Image:       "rust:1.78-slim",
			DefaultPort: "3000",
			DefaultCmd:  "sh -c 'cargo run'",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path to Rust source on host", Required: true, Placeholder: "e.g. C:/projects/rust-app"},
				{Key: "VERSION", Description: "Rust image version", Default: "1.78-slim", Options: []string{"1.78-slim","1.77-slim","1.76-slim"}, Advanced: true},
			},
		},
		{
			Name:        "n8n Workflow",
			Description: "Fair-code workflow automation. Connect apps and automate tasks visually.",
			Category:    "Tool",
			Icon:        "git-branch",
			Image:       "n8nio/n8n",
			DefaultPort: "5678",
			Env: []models.BlueprintEnv{
				{Key: "N8N_BASIC_AUTH_PASSWORD", Description: "Basic auth password", Required: true, Placeholder: "e.g. my-admin-password"},
				{Key: "N8N_BASIC_AUTH_USER", Description: "Basic auth username", Default: "admin", Advanced: true},
				{Key: "N8N_BASIC_AUTH_ACTIVE", Description: "Enable basic auth", Default: "true", Advanced: true, Options: []string{"true","false"}},
				{Key: "VERSION", Description: "n8n image version", Default: "latest", Options: []string{"latest","1.0","0.238"}, Advanced: true},
			},
		},
		{
			Name:        "WordPress",
			Description: "Popular CMS. Requires a MySQL/MariaDB database. Mount your wp-content or use defaults.",
			Category:    "CMS",
			Icon:        "edit",
			Image:       "wordpress:6",
			DefaultPort: "80",
			Env: []models.BlueprintEnv{
				{Key: "WORDPRESS_DB_HOST", Description: "Database host:port", Default: "db:3306", Required: true},
				{Key: "WORDPRESS_DB_PASSWORD", Description: "Database password", Required: true, Placeholder: "e.g. my-db-password"},
				{Key: "WORDPRESS_DB_USER", Description: "Database user", Default: "wordpress", Advanced: true},
				{Key: "WORDPRESS_DB_NAME", Description: "Database name", Default: "wordpress", Advanced: true},
				{Key: "WORDPRESS_TABLE_PREFIX", Description: "Table prefix", Default: "wp_", Advanced: true},
				{Key: "VERSION", Description: "WordPress version", Default: "6", Options: []string{"6","5.9","5.8"}, Advanced: true},
			},
		},
		{
			Name:        "Ubuntu Dev Environment",
			Description: "Full Ubuntu development environment. Persistent workspace, root shell access.",
			Category:    "Dev Environment",
			Icon:        "terminal",
			Image:       "ubuntu:24.04",
			DefaultCmd:  "sleep infinity",
			Env: []models.BlueprintEnv{
				{Key: "CODE_PATH", Description: "Path for workspace files on host", Default: "C:/workspace", Placeholder: "optional host path"},
				{Key: "VERSION", Description: "Ubuntu version", Default: "24.04", Options: []string{"24.04","22.04","20.04"}, Advanced: true},
			},
		},
		{
			Name:        "Alpine Tools",
			Description: "Minimal Alpine Linux with common tools. Perfect for testing and debugging.",
			Category:    "Tool",
			Icon:        "toolbox",
			Image:       "alpine:3.20",
			DefaultCmd:  "sleep infinity",
			Env: []models.BlueprintEnv{
				{Key: "VERSION", Description: "Alpine version", Default: "3.20", Options: []string{"3.20","3.19","3.18"}, Advanced: true},
			},
		},
	}
}
