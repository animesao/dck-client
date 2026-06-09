package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"dck-client/internal/models"

	"github.com/go-chi/chi"
)

type BlueprintHandler struct {
	*Server
}

func (h *BlueprintHandler) List(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, getBlueprints())
}

func (h *BlueprintHandler) Launch(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

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

	// Ensure unique container name
	req.Name = h.ensureNameUnique(req.Name)

	var results []map[string]interface{}
	addResult := func(name, status, errStr string) {
		m := map[string]interface{}{"name": name, "success": errStr == ""}
		if errStr != "" {
			m["error"] = errStr
		}
		results = append(results, m)
	}

	envVars := make([]string, 0, len(req.Env))
	for k, v := range req.Env {
		if v != "" {
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

	if bp.IsMulti {
		appContainer := models.CreateContainerRequest{
			Image:   bp.Image,
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
		if _, err := h.dck.PullImage(bp.Image); err != nil {
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
		if _, err := h.dck.PullImage(bp.Image); err != nil {
			writeError(w, http.StatusInternalServerError, "pull failed: "+err.Error())
			return
		}
		containerReq := models.CreateContainerRequest{
			Image:   bp.Image,
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
			Description: "High-performance web server and reverse proxy. Serves static sites, proxies to apps, handles SSL termination.",
			Category:    "Web Server",
			Icon:        "globe",
			Image:       "nginx:alpine",
			DefaultPort: "80",
			Volumes:     []string{"/var/www:/usr/share/nginx/html:website files"},
		},
		{
			Name:        "Python Flask App",
			Description: "Run a Python Flask web application with auto pip install on start. Mount your code and go.",
			Category:    "Runtime",
			Icon:        "code",
			Image:       "python:3.12-slim",
			DefaultPort: "5000",
			DefaultCmd:  "sh -c 'pip install --dry-run -r /app/requirements.txt -q 2>/dev/null || pip install -r /app/requirements.txt; exec python /app/app.py'",
			Env: []models.BlueprintEnv{
				{Key: "FLASK_ENV", Description: "Flask environment", Default: "production"},
				{Key: "SECRET_KEY", Description: "Flask secret key", Required: true},
			},
			Volumes: []string{"/opt/myapp:/app:app code directory"},
		},
		{
			Name:        "Node.js App",
			Description: "Run any Node.js application. Auto npm install, supports Express, Discord.js, and more.",
			Category:    "Runtime",
			Icon:        "terminal",
			Image:       "node:22-alpine",
			DefaultPort: "3000",
			DefaultCmd:  "sh -c 'cd /app && npm install && exec node index.js'",
			Env: []models.BlueprintEnv{
				{Key: "NODE_ENV", Description: "Node environment", Default: "production"},
				{Key: "PORT", Description: "HTTP port", Default: "3000"},
			},
			Volumes: []string{"/opt/node-app:/app:app code directory"},
		},
		{
			Name:        "PostgreSQL",
			Description: "Relational database with ACID compliance. Persistent storage via volume.",
			Category:    "Database",
			Icon:        "database",
			Image:       "postgres:16-alpine",
			DefaultPort: "5432",
			Env: []models.BlueprintEnv{
				{Key: "POSTGRES_PASSWORD", Description: "Superuser password", Required: true},
				{Key: "POSTGRES_USER", Description: "Custom user", Default: "postgres"},
				{Key: "POSTGRES_DB", Description: "Database name", Default: "myapp"},
			},
			Volumes: []string{"pg_data:/var/lib/postgresql/data:database files"},
		},
		{
			Name:        "MySQL",
			Description: "Popular open-source relational database. Persistent storage, root and user accounts.",
			Category:    "Database",
			Icon:        "database",
			Image:       "mysql:8.4",
			DefaultPort: "3306",
			Env: []models.BlueprintEnv{
				{Key: "MYSQL_ROOT_PASSWORD", Description: "Root password", Required: true},
				{Key: "MYSQL_DATABASE", Description: "Database name", Default: "myapp"},
				{Key: "MYSQL_USER", Description: "Custom user", Default: "myapp"},
				{Key: "MYSQL_PASSWORD", Description: "User password", Required: true},
			},
			Volumes: []string{"mysql_data:/var/lib/mysql:database files"},
		},
		{
			Name:        "Redis",
			Description: "In-memory data store for caching, sessions, and real-time data. Blazing fast.",
			Category:    "Database",
			Icon:        "database",
			Image:       "redis:7-alpine",
			DefaultPort: "6379",
			DefaultCmd:  "redis-server --appendonly yes",
			Volumes:     []string{"redis_data:/data:persistent data"},
		},
		{
			Name:        "Discord Bot (Python)",
			Description: "Python Discord bot with discord.py. Configurable token, auto pip install on start.",
			Category:    "Bot",
			Icon:        "message-circle",
			Image:       "python:3.12-slim",
			DefaultCmd:  "sh -c 'pip install --dry-run -r /bot/requirements.txt -q 2>/dev/null || pip install -r /bot/requirements.txt; exec python /bot/bot.py'",
			Env: []models.BlueprintEnv{
				{Key: "BOT_TOKEN", Description: "Discord bot token", Required: true},
			},
			Volumes: []string{"/opt/discord-bot:/bot:bot code directory"},
		},
		{
			Name:        "Telegram Bot (Python)",
			Description: "Python Telegram bot using python-telegram-bot. Webhook or polling mode.",
			Category:    "Bot",
			Icon:        "message-circle",
			Image:       "python:3.12-slim",
			DefaultCmd:  "sh -c 'pip install --dry-run -r /bot/requirements.txt -q 2>/dev/null || pip install -r /bot/requirements.txt; exec python /bot/bot.py'",
			Env: []models.BlueprintEnv{
				{Key: "TELEGRAM_TOKEN", Description: "Telegram bot token", Required: true},
			},
			Volumes: []string{"/opt/tg-bot:/bot:bot code directory"},
		},
		{
			Name:        "Minecraft Server",
			Description: "Java Edition Minecraft server with PaperMC. Customizable version, memory, and game mode.",
			Category:    "Game",
			Icon:        "gamepad-2",
			Image:       "itzg/minecraft-server",
			DefaultPort: "25565",
			Env: []models.BlueprintEnv{
				{Key: "EULA", Description: "Accept Mojang EULA", Default: "TRUE", Required: true},
				{Key: "TYPE", Description: "Server type (PAPER, VANILLA, FORGE)", Default: "PAPER"},
				{Key: "VERSION", Description: "Minecraft version", Default: "1.20.4"},
				{Key: "MEMORY", Description: "RAM allocation", Default: "2G"},
				{Key: "DIFFICULTY", Description: "Game difficulty", Default: "easy"},
				{Key: "MODE", Description: "Game mode", Default: "survival"},
			},
			Volumes: []string{"mc_data:/data:world and config files"},
		},
		{
			Name:        "Discord Bot + PostgreSQL",
			Description: "Full-stack Discord bot with PostgreSQL database. Includes aiomysql/asyncpg setup.",
			Category:    "Multi-Container",
			Icon:        "layers",
			Image:       "python:3.12-slim",
			IsMulti:     true,
			DefaultCmd:  "sh -c 'pip install --dry-run -r /bot/requirements.txt -q 2>/dev/null || pip install -r /bot/requirements.txt; exec python /bot/bot.py'",
			Env: []models.BlueprintEnv{
				{Key: "BOT_TOKEN", Description: "Discord bot token", Required: true},
				{Key: "DB_HOST", Description: "Database host", Default: "10.0.2.1"},
				{Key: "DB_USER", Description: "Database user", Default: "postgres"},
				{Key: "DB_PASS", Description: "Database password", Required: true},
				{Key: "DB_NAME", Description: "Database name", Default: "botdb"},
			},
			Volumes: []string{"/opt/discord-pg-bot:/bot:bot code directory"},
		},
		{
			Name:        "Flask + PostgreSQL",
			Description: "Flask web app backed by PostgreSQL. Perfect for production web services with a database.",
			Category:    "Multi-Container",
			Icon:        "layers",
			Image:       "python:3.12-slim",
			IsMulti:     true,
			DefaultPort: "5000",
			DefaultCmd:  "sh -c 'pip install --dry-run -r /app/requirements.txt -q 2>/dev/null || pip install -r /app/requirements.txt; exec python /app/app.py'",
			Env: []models.BlueprintEnv{
				{Key: "FLASK_ENV", Description: "Flask environment", Default: "production"},
				{Key: "SECRET_KEY", Description: "Flask secret key", Required: true},
				{Key: "DB_HOST", Description: "Database host", Default: "10.0.2.1"},
				{Key: "DB_USER", Description: "Database user", Default: "postgres"},
				{Key: "DB_PASS", Description: "Database password", Required: true},
				{Key: "DB_NAME", Description: "Database name", Default: "myapp"},
			},
			Volumes: []string{"/opt/flask-app:/app:app code directory"},
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
				{Key: "NODE_ENV", Description: "Node environment", Default: "production"},
				{Key: "REDIS_URL", Description: "Redis connection URL", Default: "redis://10.0.2.1:6379"},
			},
			Volumes: []string{"/opt/node-app:/app:app code directory"},
		},
	}
}
