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

# ---- Install Go (need 1.22+ for routing syntax) ----
GO_VERSION="1.22.5"
INSTALL_GO=false
if ! command -v go &> /dev/null; then
  INSTALL_GO=true
else
  CURRENT_GO=$(go version | grep -oP 'go\K[0-9]+\.[0-9]+')
  if [[ "$(echo "$CURRENT_GO < 1.22" | bc -l 2>/dev/null || echo 1)" == "1" ]]; then
    warn "Go $CURRENT_GO is too old (need 1.22+). Installing newer version..."
    INSTALL_GO=true
  fi
fi

if [[ "$INSTALL_GO" == true ]]; then
  log "Installing Go $GO_VERSION..."
  GO_VERSION="1.22.5"
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -o /tmp/go.tar.gz
  tar -C /usr/local -xzf /tmp/go.tar.gz
  export PATH=$PATH:/usr/local/go/bin
  echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
  log "Go ${GO_VERSION} installed"
else
  log "Go already installed: $(go version | awk '{print $3}')"
fi

# Ensure /usr/local/go/bin is in PATH
export PATH=$PATH:/usr/local/go/bin

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
cd server
go build -o dck-panel -ldflags="-s -w" .
cp dck-panel /usr/local/bin/dck-panel
cd "$PANEL_DIR"
log "Go binary built: $(/usr/local/bin/dck-panel --help 2>&1 | head -1 || echo 'ok')"

# ---- Systemd service ----
log "Creating systemd service..."
cat > /etc/systemd/system/dck-panel.service << SERVICE
[Unit]
Description=dck Panel
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/dck-panel --port ${PANEL_PORT}
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
warn "Use a reverse proxy (Caddy/Nginx) for HTTPS termination."
