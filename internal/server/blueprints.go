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
			Name:        "Minecraft Server (Universal)",
			Description: "Full-featured Minecraft server. Любое ядро (Paper/Vanilla/Forge/Fabric/Spigot), любая версия (1.7.10+), любая Java (8-25).",
			Category:    "Game",
			Icon:        "gamepad-2",
			Image:       "itzg/minecraft-server",
			DefaultPort: "25565",
			Env: []models.BlueprintEnv{
				{Key: "EULA", Description: "Принять EULA Mojang (обязательно TRUE)", Default: "TRUE", Required: true},
				{Key: "TYPE", Description: "Ядро: PAPER, VANILLA, SPIGOT, FORGE, FABRIC, BUKKIT, PURPUR, AIRPLANE, MAGMA, MOHIST", Default: "PAPER"},
				{Key: "VERSION", Description: "Версия Minecraft: 1.7.10, 1.12.2, 1.16.5, 1.20.4, LATEST", Default: "LATEST"},
				{Key: "JAVA_VERSION", Description: "Версия Java: jdk8-jre, jdk11-jre, jdk16-jre, jdk17-jre, jdk21-jre, jdk22-jre, jdk23-jre, jdk24-jre, jdk25-jre", Default: "jdk21-jre"},
				{Key: "MEMORY", Description: "RAM (например 2G, 4G, 8G)", Default: "2G"},
				{Key: "INIT_MEMORY", Description: "Начальная RAM (если отличается от MEMORY)", Default: ""},
				{Key: "DIFFICULTY", Description: "Сложность: easy, normal, hard, peaceful", Default: "easy"},
				{Key: "MODE", Description: "Режим: survival, creative, adventure, spectator", Default: "survival"},
				{Key: "MAX_PLAYERS", Description: "Макс. игроков", Default: "20"},
				{Key: "ENABLE_RCON", Description: "RCON доступ (true/false)", Default: "true"},
				{Key: "SEED", Description: "Сид мира (оставь пусто для random)", Default: ""},
				{Key: "LEVEL_TYPE", Description: "Тип мира: DEFAULT, FLAT, LARGEBIOMES, AMPLIFIED, CUSTOMIZED", Default: "DEFAULT"},
				{Key: "SPAWN_PROTECTION", Description: "Радиус спавн-протекшн (0 = откл)", Default: "0"},
				{Key: "ONLINE_MODE", Description: "Проверка лицензии (true/false)", Default: "true"},
				{Key: "ALLOW_NETHER", Description: "Разрешить Незер", Default: "true"},
				{Key: "ALLOW_END", Description: "Разрешить Энд", Default: "true"},
				{Key: "PVP", Description: "PvP (true/false)", Default: "true"},
				{Key: "ENABLE_COMMAND_BLOCK", Description: "Командные блоки", Default: "false"},
				{Key: "WHITELIST", Description: "Вайтлист (true/false)", Default: "false"},
				{Key: "MAX_TICK_TIME", Description: "Макс. тик тайм (мс)", Default: "-1"},
			},
			EnvTips: "JAVA_VERSION по версии MC:\n• jdk8-jre → MC 1.7.10 — 1.12.2 (очень старые)\n• jdk11-jre → MC 1.13 — 1.16.1\n• jdk16-jre → MC 1.16.5 — 1.17.1\n• jdk17-jre → MC 1.18 — 1.20.1\n• jdk21-jre → MC 1.20.2+ (рекомендуется)\n• jdk22-jre, jdk23-jre, jdk24-jre, jdk25-jre → новейшие экспериментальные\n\nЯдра (TYPE):\n• VANILLA — чистый ванильный сервер Mojang\n• PAPER — оптимизированное, плагины (рекомендуется)\n• SPIGOT — плагины Bukkit/Spigot\n• FORGE — моды Forge\n• FABRIC — моды Fabric\n• BUKKIT — оригинальный Bukkit\n• PURPUR — оптимизированный Paper форк\n• AIRPLANE —高性能 Paper форк\n• MAGMA — Forge + Spigot гибрид\n• MOHIST — Forge + Bukkit гибрид\n\nПримеры:\n• Старый сервер 1.7.10: TYPE=VANILLA, VERSION=1.7.10, JAVA_VERSION=jdk8-jre\n• Оптимальный 1.16.5: TYPE=PAPER, VERSION=1.16.5, JAVA_VERSION=jdk16-jre, MEMORY=8G\n• Модный 1.20.1: TYPE=FORGE, VERSION=1.20.1, JAVA_VERSION=jdk17-jre, MEMORY=6G\n• Новейший: TYPE=PAPER, VERSION=LATEST, JAVA_VERSION=jdk21-jre",
			Volumes: []string{"mc_data:/data:мир, конфиги, плагины и моды"},
		},
		{
			Name:        "Minecraft Vanilla",
			Description: "Чистый ванильный Minecraft сервер. Любая версия, любая Java. Без плагинов.",
			Category:    "Game",
			Icon:        "gamepad-2",
			Image:       "itzg/minecraft-server",
			DefaultPort: "25565",
			Env: []models.BlueprintEnv{
				{Key: "EULA", Description: "Принять EULA", Default: "TRUE", Required: true},
				{Key: "TYPE", Description: "Ядро сервера", Default: "VANILLA"},
				{Key: "VERSION", Description: "Версия Minecraft (1.7.10 — LATEST)", Default: "LATEST"},
				{Key: "JAVA_VERSION", Description: "Java: jdk8 до jdk25", Default: "jdk21-jre"},
				{Key: "MEMORY", Description: "RAM", Default: "2G"},
				{Key: "DIFFICULTY", Description: "Сложность", Default: "easy"},
				{Key: "MODE", Description: "Режим игры", Default: "survival"},
				{Key: "MAX_PLAYERS", Description: "Макс. игроков", Default: "20"},
				{Key: "ONLINE_MODE", Description: "Проверка лицензии", Default: "true"},
				{Key: "ALLOW_NETHER", Description: "Незер", Default: "true"},
				{Key: "PVP", Description: "PvP", Default: "true"},
			},
			EnvTips: "Java по версии:\n• jdk8-jre → 1.7.10 — 1.12.2\n• jdk11-jre → 1.13 — 1.16.1\n• jdk16-jre → 1.16.5 — 1.17\n• jdk17-jre → 1.18 — 1.20.1\n• jdk21-jre → 1.20.2+ (по умолчанию)",
			Volumes: []string{"mc_vanilla:/data:мир и конфиги"},
		},
		{
			Name:        "Minecraft Modded (Forge/Fabric)",
			Description: "Модный Minecraft сервер. Forge или Fabric, любая версия, любая Java.",
			Category:    "Game",
			Icon:        "gamepad-2",
			Image:       "itzg/minecraft-server",
			DefaultPort: "25565",
			Env: []models.BlueprintEnv{
				{Key: "EULA", Description: "Принять EULA", Default: "TRUE", Required: true},
				{Key: "TYPE", Description: "Ядро: FORGE или FABRIC", Default: "FORGE"},
				{Key: "VERSION", Description: "Версия Minecraft", Default: "1.20.1"},
				{Key: "JAVA_VERSION", Description: "Java: jdk8-jre до jdk25-jre", Default: "jdk21-jre"},
				{Key: "MEMORY", Description: "RAM (модные требуют больше)", Default: "4G"},
				{Key: "FORGEVERSION", Description: "Версия Forge (пусто = latest)", Default: ""},
				{Key: "FABRIC_LOADER_VERSION", Description: "Версия Fabric Loader (пусто = latest)", Default: ""},
				{Key: "DIFFICULTY", Description: "Сложность", Default: "hard"},
				{Key: "MODE", Description: "Режим игры", Default: "survival"},
				{Key: "MAX_PLAYERS", Description: "Макс. игроков", Default: "20"},
				{Key: "ENABLE_RCON", Description: "RCON доступ", Default: "true"},
				{Key: "ONLINE_MODE", Description: "Проверка лицензии", Default: "true"},
			},
			EnvTips: "Модным серверам нужно больше RAM — минимум 4G, лучше 6-8G.\nКидай .jar модов в /data/mods на volume.\n\nJava:\n• jdk8-jre → старые версии (1.7.10 — 1.12.2)\n• jdk16-jre → 1.16.5 Forge\n• jdk17-jre → 1.17 — 1.20.1 Forge/Fabric\n• jdk21-jre → 1.20.2+ Forge/Fabric",
			Volumes: []string{"mc_forge:/data:мир, конфиги, моды"},
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
		{
			Name:        "MongoDB",
			Description: "Document-oriented NoSQL database with flexible schema design. Persistent storage via volume.",
			Category:    "Database",
			Icon:        "database",
			Image:       "mongo:7",
			DefaultPort: "27017",
			Env: []models.BlueprintEnv{
				{Key: "MONGO_INITDB_ROOT_USERNAME", Description: "Root username", Default: "admin"},
				{Key: "MONGO_INITDB_ROOT_PASSWORD", Description: "Root password", Required: true},
			},
			Volumes: []string{"mongo_data:/data/db:database files"},
		},
		{
			Name:        "MariaDB",
			Description: "Drop-in MySQL replacement with improved performance and storage engines.",
			Category:    "Database",
			Icon:        "database",
			Image:       "mariadb:11",
			DefaultPort: "3306",
			Env: []models.BlueprintEnv{
				{Key: "MARIADB_ROOT_PASSWORD", Description: "Root password", Required: true},
				{Key: "MARIADB_DATABASE", Description: "Database name", Default: "myapp"},
				{Key: "MARIADB_USER", Description: "Custom user", Default: "user"},
				{Key: "MARIADB_PASSWORD", Description: "User password", Required: true},
			},
			Volumes: []string{"mariadb_data:/var/lib/mysql:database files"},
		},
		{
			Name:        "PHP + Apache",
			Description: "PHP runtime with Apache web server. Drop your PHP files in the web root.",
			Category:    "Web Server",
			Icon:        "globe",
			Image:       "php:8.2-apache",
			DefaultPort: "80",
			Volumes:     []string{"/var/www/html:/var/www/html:PHP files"},
		},
		{
			Name:        "Go App",
			Description: "Run any Go application with automatic module download on start.",
			Category:    "Runtime",
			Icon:        "terminal",
			Image:       "golang:1.22-alpine",
			DefaultPort: "8080",
			DefaultCmd:  "sh -c 'go mod download && go run .'",
			Volumes:     []string{"/opt/go-app:/app:Go source code"},
		},
		{
			Name:        "Rust App",
			Description: "Run any Rust application with cargo. Compiles on container start.",
			Category:    "Runtime",
			Icon:        "terminal",
			Image:       "rust:1.78-slim",
			DefaultPort: "3000",
			DefaultCmd:  "sh -c 'cargo run'",
			Volumes:     []string{"/opt/rust-app:/app:Rust source code"},
		},
		{
			Name:        "n8n Workflow",
			Description: "Fair-code workflow automation tool. Connect apps and automate tasks visually.",
			Category:    "Tool",
			Icon:        "git-branch",
			Image:       "n8nio/n8n",
			DefaultPort: "5678",
			Env: []models.BlueprintEnv{
				{Key: "N8N_BASIC_AUTH_ACTIVE", Description: "Enable basic auth", Default: "true"},
				{Key: "N8N_BASIC_AUTH_USER", Description: "Basic auth username", Default: "admin"},
				{Key: "N8N_BASIC_AUTH_PASSWORD", Description: "Basic auth password", Required: true},
			},
			Volumes: []string{"n8n_data:/home/node/.n8n:workflow data"},
		},
		{
			Name:        "WordPress",
			Description: "Popular CMS with plugin ecosystem. Requires a separate MySQL/MariaDB database.",
			Category:    "CMS",
			Icon:        "edit",
			Image:       "wordpress:6",
			DefaultPort: "80",
			Env: []models.BlueprintEnv{
				{Key: "WORDPRESS_DB_HOST", Description: "Database host", Default: "db:3306"},
				{Key: "WORDPRESS_DB_USER", Description: "Database user", Default: "wordpress"},
				{Key: "WORDPRESS_DB_PASSWORD", Description: "Database password", Required: true},
				{Key: "WORDPRESS_DB_NAME", Description: "Database name", Default: "wordpress"},
			},
			Volumes: []string{"wp_data:/var/www/html:WordPress files"},
		},
		{
			Name:        "Ubuntu Dev Environment",
			Description: "Full Ubuntu development environment with persistent storage.",
			Category:    "Dev Environment",
			Icon:        "terminal",
			Image:       "ubuntu:24.04",
			DefaultCmd:  "sleep infinity",
			Volumes:     []string{"/opt/workspace:/workspace:workspace files"},
		},
		{
			Name:        "Alpine Tools",
			Description: "Minimal Alpine Linux with common tools. Perfect for testing and debugging.",
			Category:    "Tool",
			Icon:        "toolbox",
			Image:       "alpine:3.20",
			DefaultCmd:  "sleep infinity",
		},
		{
			Name:        "Node.js + MongoDB",
			Description: "Node.js app with MongoDB database. Full-stack JavaScript web stack.",
			Category:    "Multi-Container",
			Icon:        "layers",
			Image:       "node:22-alpine",
			IsMulti:     true,
			DefaultPort: "3000",
			DefaultCmd:  "sh -c 'cd /app && npm install && exec node index.js'",
			Env: []models.BlueprintEnv{
				{Key: "NODE_ENV", Description: "Node environment", Default: "production"},
				{Key: "MONGO_URL", Description: "MongoDB connection URL", Default: "mongodb://10.0.2.1:27017/myapp"},
				{Key: "DB_HOST", Description: "Database host", Default: "10.0.2.1"},
			},
			Volumes: []string{"/opt/node-mongo-app:/app:app code directory"},
		},
	}
}
