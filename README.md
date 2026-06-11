# dck Panel

<p align="center">
  <img src="https://raw.githubusercontent.com/animesao/dck-client/main/public/logo.png" alt="dck Panel" width="120">
</p>

<p align="center">
  <b>Modern web management panel for <a href="https://github.com/anomalyco/dck">dck</a> container runtime</b><br>
  Full-featured Pterodactyl-like interface for managing containers, files, backups, and system resources.
</p>

## Features

- **Dashboard** — Real-time system stats (CPU, RAM, Disk, uptime) from `/proc`, container overview
- **Containers** — Create (with per-image environment presets), start, stop, restart, delete containers via `dck` CLI; includes stopped containers by default
- **Image Management** — List, pull, and remove container images
- **File Manager** — Browse, read, edit, upload, download, create, delete files directly in containers (via overlayfs at `~/.dck/overlay/<id>/merged/`)
- **Backups** — Create and restore full container backups (tar.gz archives)
- **Console** — Full WebSocket terminal with xterm.js, bridged to `dck` Unix socket (`~/.dck/consoles/<id>.sock`) with binary message support
- **Exec** — Run arbitrary commands inside containers
- **Blueprints** — Pre-configured templates for quick container deployment
- **Admin Panel** — Multi-user management with roles (admin/user)
- **JWT Auth** — Secure token-based authentication
- **Dark Theme** — Premium glassmorphism UI with gradient accents

## Architecture

```
                    ┌──────────────────────┐
                    │   Browser (React)     │
                    │   xterm.js console    │
                    └──────────┬───────────┘
                               │  HTTPS/WS
                    ┌──────────▼───────────┐
                    │   Go API Server       │
                    │   (dck-panel binary)  │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │ JWT Auth        │  │
                    │  │ Middleware      │  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │ System Stats    │  │
                    │  │ (/proc, cgroups)│  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │ File Manager    │  │
                    │  │ (overlayfs)     │  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │ Backups (tar)   │  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │ WebSocket       │  │
                    │  │ Console Bridge  │  │
                    │  └─────────────────┘  │
                    └──────────┬───────────┘
                               │  os/exec
                    ┌──────────▼───────────┐
                    │   dck CLI            │
                    │   (container runtime)│
                    └──────────────────────┘
```

### Data Storage

| Data | Location | Format |
|------|----------|--------|
| Users & Settings | `~/.dck-panel/data.json` | JSON |
| Container state | `~/.dck/containers/<id>.json` | JSON |
| Container filesystem | `~/.dck/overlay/<id>/merged/` | Overlayfs |
| Console socket | `~/.dck/consoles/<id>.sock` | Unix socket |
| Logs | `~/.dck/logs/<id>.log` | Text |
| Backups | `~/.dck/backups/<id>/<name>.tar.gz` | tar.gz |
| Images | `~/.dck/images/<name>.tar.gz` | tar.gz |

## Quick Start

### Option 1: Pre-built binary

```bash
# Download and run (requires dck installed)
sudo DCK_HOME=/root/.dck ./dck-panel --port 443

# Add -v for verbose/debug logging
sudo DCK_HOME=/root/.dck ./dck-panel --port 443 -v

# Login at https://your-server:443
# Default: admin / admin
```

### Option 2: Build from source

```bash
# Prerequisites: Go 1.22+, Node.js 20+
git clone https://github.com/animesao/dck-client.git
cd dck-client

# Build everything
chmod +x build.sh
./build.sh

# Run (add -v for verbose/debug logs)
sudo ./server/dck-panel --port 443

# If HOME is not set (e.g. systemd service), set DCK_HOME:
sudo DCK_HOME=/root/.dck ./server/dck-panel --port 443
```

> [!TIP]
> Некоторые хостинг-провайдеры блокируют порт 443 на внешнем firewall. Если панель не открывается на 443 — используй порт 8443:
> ```bash
> curl -sSL https://raw.githubusercontent.com/animesao/dck-client/main/install.sh | sudo bash -s 8443
> ```
> Панель будет доступна по адресу `https://ваш-сервер:8443`

### Option 3: Install script (Ubuntu/Debian)

```bash
# One-command install (downloads and runs latest script)
curl -sSL https://raw.githubusercontent.com/animesao/dck-client/main/install.sh | sudo bash

# Or with custom port (e.g. 8443 if hoster blocks 443)
curl -sSL https://raw.githubusercontent.com/animesao/dck-client/main/install.sh | sudo bash -s 8443

# Or download first, then run
curl -sSL https://raw.githubusercontent.com/animesao/dck-client/main/install.sh -o install.sh
chmod +x install.sh
sudo bash install.sh
```

<details>
<summary>Full install.sh contents (click to expand)</summary>

```bash
#!/usr/bin/env bash
set -euo pipefail

# dck Panel Installer
# Usage: curl -sSL https://raw.githubusercontent.com/animesao/dck-client/main/install.sh | sudo bash
#   or: curl -sSL https://raw.githubusercontent.com/animesao/dck-client/main/install.sh | sudo bash -s 8443

REPO="animesao/dck-client"
BRANCH="main"
PANEL_PORT="${1:-443}"
PANEL_DIR="/opt/dck-panel"
DCK_BIN="/usr/local/bin/dck"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

if [[ $EUID -ne 0 ]]; then err "Must run as root: sudo bash install.sh"; fi

# ---- OS detect ----
if [[ ! -f /etc/os-release ]]; then err "Unsupported OS"; fi
source /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then err "Unsupported OS: $ID"; fi
log "OS: $PRETTY_NAME"

ARCH="amd64"
if [[ "$(uname -m)" == "aarch64" ]]; then ARCH="arm64"; fi

# ---- Dependencies ----
log "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git tar gzip build-essential bc

# ---- Install dck if missing ----
if ! command -v dck &> /dev/null; then
  log "Installing dck container runtime..."
  DCK_VERSION=$(curl -sfL "https://api.github.com/repos/anomalyco/dck/releases/latest" | grep tag_name | cut -d'"' -f4 2>/dev/null || echo "v1.5.0")
  curl -fsSL "https://github.com/anomalyco/dck/releases/download/${DCK_VERSION}/dck-linux-${ARCH}" -o "$DCK_BIN"
  chmod +x "$DCK_BIN"
  log "dck ${DCK_VERSION} installed"
else
  log "dck already installed: $(dck version 2>/dev/null || echo 'ok')"
fi

# ---- Install Node.js ----
if ! command -v node &> /dev/null; then
  log "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  log "Node.js installed: $(node -v)"
else
  log "Node.js already installed: $(node -v)"
fi

# ---- Clone / pull panel ----
if [[ -d "$PANEL_DIR" ]]; then
  log "Updating existing installation at $PANEL_DIR..."
  cd "$PANEL_DIR"
  if [[ -d .git ]]; then
    git stash 2>/dev/null || true
    git pull origin "$BRANCH" 2>/dev/null || true
  fi
else
  log "Cloning panel from $REPO..."
  git clone --depth 1 -b "$BRANCH" "https://github.com/$REPO.git" "$PANEL_DIR"
  cd "$PANEL_DIR"
fi

# ---- Install Go (from go.mod) ----
INSTALL_GO=false
GO_VERSION=""
REQUIRED_GO=$(grep -oP '^go \K[0-9.]+' "$PANEL_DIR/server/go.mod" 2>/dev/null || echo "1.26")
if ! command -v go &> /dev/null; then
  INSTALL_GO=true
else
  CURRENT_GO=$(go version | grep -oP 'go\K[0-9]+\.[0-9]+')
  if [[ "$(echo "$CURRENT_GO < $REQUIRED_GO" | bc -l 2>/dev/null || echo 1)" == "1" ]]; then
    warn "Go $CURRENT_GO is too old (need $REQUIRED_GO+). Installing newer version..."
    INSTALL_GO=true
  fi
fi

if [[ "$INSTALL_GO" == true ]]; then
  GO_VERSION="1.26.4"
  log "Installing Go $GO_VERSION..."
  rm -rf /usr/local/go
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -o /tmp/go.tar.gz
  tar -C /usr/local -xzf /tmp/go.tar.gz
  export GOROOT=/usr/local/go
  export PATH=$GOROOT/bin:$PATH
  echo 'export GOROOT=/usr/local/go' > /etc/profile.d/go.sh
  echo 'export PATH=$GOROOT/bin:$PATH' >> /etc/profile.d/go.sh
  log "Go ${GO_VERSION} installed ($(/usr/local/go/bin/go version))"
else
  log "Go already installed: $(go version | awk '{print $3}')"
fi

# Ensure Go environment
export GOROOT=/usr/local/go
export PATH=$GOROOT/bin:$PATH

# ---- Build frontend ----
log "Building frontend..."
if [[ -f package.json ]]; then
  unset NODE_ENV CI
  rm -rf node_modules package-lock.json
  npm install
  npx --yes tsc -b && npx --yes vite build
  rm -rf server/dist
  cp -r dist server/dist
  log "Frontend built"
else
  err "package.json not found in $PANEL_DIR"
fi

# ---- Build Go backend ----
log "Building Go backend..."
systemctl stop dck-panel 2>/dev/null || true
cd server
echo "[DCK_GO] version: $(/usr/local/go/bin/go version 2>&1)"
echo "[DCK_GO] GOROOT: ${GOROOT:-unset}"
/usr/local/go/bin/go build -o dck-panel -ldflags="-s -w" .
cp dck-panel /usr/local/bin/dck-panel
cd "$PANEL_DIR"
log "Go binary built: $(/usr/local/bin/dck-panel --help 2>&1 | head -1 || echo 'ok')"

# ---- TLS certificate ----
CERT_DIR="$PANEL_DIR/tls"
if [[ ! -f "$CERT_DIR/cert.pem" || ! -f "$CERT_DIR/key.pem" ]]; then
  log "Generating self-signed TLS certificate..."
  mkdir -p "$CERT_DIR"
  IP=$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$CERT_DIR/key.pem" \
    -out "$CERT_DIR/cert.pem" \
    -subj "/CN=$IP" 2>/dev/null
  log "TLS certificate generated ($IP, 10 years)"
fi

# ---- Systemd service ----
log "Creating systemd service..."
cat > /etc/systemd/system/dck-panel.service << SERVICE
[Unit]
Description=dck Panel
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/dck-panel --port ${PANEL_PORT} --tls-cert ${CERT_DIR}/cert.pem --tls-key ${CERT_DIR}/key.pem --serve-dir ${PANEL_DIR}/server/dist
Restart=always
RestartSec=5
Environment=DCK_HOME=/root/.dck

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable dck-panel
systemctl restart dck-panel

# ---- Firewall ----
if command -v ufw &> /dev/null; then
  ufw allow "${PANEL_PORT}/tcp" 2>/dev/null || true
  log "UFW: port ${PANEL_PORT} allowed"
fi

# ---- Done ----
IP=$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
log ""
log "╔══════════════════════════════════════════════╗"
log "║       dck Panel installed successfully!     ║"
log "╠══════════════════════════════════════════════╣"
log "║  Panel:  https://${IP}:${PANEL_PORT}           "
log "║  Login:  admin / admin                      ║"
log "║                                              ║"
log "║  Manage: sudo systemctl status dck-panel     ║"
log "║  Logs:   sudo journalctl -u dck-panel -f     ║"
log "╚══════════════════════════════════════════════╝"
log ""
warn "CHANGE THE DEFAULT PASSWORD IMMEDIATELY!"
```

</details>

## Development

```bash
# Frontend dev server (with mock API)
npm run dev

# Mock API server (separate terminal)
node server.cjs

# Go backend (for real dck integration)
cd server
go run . --port 8080 --serve-dir ../dist
```

### Project Structure

```
dck-client/
├── build.sh                 # Build script (frontend + Go)
├── install.sh               # VPS installer (Ubuntu/Debian)
├── server.cjs               # Mock API server (dev only)
├── package.json             # Frontend dependencies
├── src/                     # React frontend
│   ├── api/                 # API client modules
│   ├── components/          # UI components
│   ├── layouts/             # Auth & Main layouts
│   ├── pages/               # Page components
│   │   ├── admin/           # Admin panel pages
│   │   ├── FileManager.tsx  # File browser
│   │   ├── Backups.tsx      # Backup management
│   │   └── ...
│   ├── store/               # Zustand state
│   ├── hooks/               # Custom hooks
│   └── types/               # TypeScript types
└── server/                  # Go backend
    ├── main.go              # Entry point
    ├── embed.go             # Embedded frontend
    ├── db/store.go          # JSON storage
    ├── dck/dck.go           # dck CLI wrapper
    └── api/                 # HTTP handlers
        ├── server.go        # Router
        ├── middleware.go    # Auth + CORS
        ├── auth.go          # Login/Register
        ├── system.go        # System stats
        ├── containers.go    # Container CRUD
        ├── images.go        # Image management
        ├── files.go         # File operations
        ├── backups.go       # Backup/restore
        ├── console.go       # WebSocket console
        ├── admin.go         # User management
        ├── disk_linux.go    # Disk stats (Linux)
        └── disk_other.go    # Disk stats (fallback)
```

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register |
| GET | `/api/auth/me` | Current user |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system` | System info |
| GET | `/api/dashboard/stats` | Dashboard stats |

### Containers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/containers` | List containers |
| POST | `/api/containers` | Create container |
| GET | `/api/containers/:id` | Get container |
| DELETE | `/api/containers/:id` | Remove container |
| POST | `/api/containers/:id/start` | Start container |
| POST | `/api/containers/:id/stop` | Stop container |
| POST | `/api/containers/:id/restart` | Restart container |
| GET | `/api/containers/:id/logs` | Get logs |
| POST | `/api/containers/:id/exec` | Execute command |
| GET | `/api/containers/:id/state` | Container state |
| GET | `/api/containers/:id/stats` | Resource stats |
| GET | `/api/containers/:id/console` | WebSocket console |

### File Manager
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/containers/:id/files` | List directory |
| GET | `/api/containers/:id/files/read` | Read file |
| POST | `/api/containers/:id/files/write` | Write file |
| POST | `/api/containers/:id/files/upload` | Upload file |
| DELETE | `/api/containers/:id/files` | Delete file |
| POST | `/api/containers/:id/files/mkdir` | Create directory |

### Backups
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/containers/:id/backups` | List backups |
| POST | `/api/containers/:id/backups` | Create backup |
| POST | `/api/containers/:id/backups/:name/restore` | Restore backup |
| DELETE | `/api/containers/:id/backups/:name` | Delete backup |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List users |
| POST | `/api/admin/users` | Create user |
| PUT | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/settings` | Get settings |
| PUT | `/api/admin/settings` | Update settings |

## Deployment

### System Requirements
- Linux server (Ubuntu 22.04+ / Debian 12+)
- `DCK_HOME` env var must be set (e.g. `DCK_HOME=/root/.dck`) if `HOME` is not available in the runtime environment
- [dck](https://github.com/anomalyco/dck) container runtime installed
- root/sudo access (for port <1024 and cgroup access)

### Manual Deployment

```bash
# 1. Install dck
curl -fsSL https://github.com/anomalyco/dck/releases/latest/download/dck-linux-amd64 -o /usr/local/bin/dck
chmod +x /usr/local/bin/dck

# 2. Build and install panel
git clone https://github.com/animesao/dck-client.git
cd dck-client
./build.sh
cp server/dck-panel /usr/local/bin/

# 3. Create systemd service
cat > /etc/systemd/system/dck-panel.service << 'EOF'
[Unit]
Description=dck Panel
After=network.target

[Service]
Type=simple
# Use --port 8443 if your hoster blocks port 443
ExecStart=/usr/local/bin/dck-panel --port 443
Environment=DCK_HOME=/root/.dck
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now dck-panel
```

### Reverse Proxy (Caddy)

```Caddyfile
your-domain.com {
    reverse_proxy localhost:443
}
```

### Firewall

```bash
# Open panel port (change 8443 if you use a different port)
ufw allow 443/tcp

# Show current rules
ufw status
```

## Security

- Change the default `admin/admin` password immediately after first login
- Use a reverse proxy with HTTPS termination (Caddy, Nginx, Traefik)
- The panel stores passwords as bcrypt hashes
- JWT tokens expire after 7 days
- Admin and user roles with RBAC

## License

[MIT](LICENSE)
