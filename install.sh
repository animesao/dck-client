#!/usr/bin/env bash
set -euo pipefail

# dck Panel Installer for Ubuntu/Debian VPS
# Usage: curl -fsSL https://raw.githubusercontent.com/your/repo/main/install.sh | bash
# Or: bash install.sh [--port 8080] [--dck-bin /usr/local/bin/dck]

PORT="${1:-443}"
DCK_BIN="${2:-dck}"
DCK_PANEL_DIR="/opt/dck-panel"
DCK_DATA_DIR="${DCK_HOME:-$HOME/.dck}"
PANEL_USER="dck-panel"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

# Check root
if [[ $EUID -ne 0 ]]; then
  warn "It is recommended to run this script as root (sudo)."
  warn "Continuing as non-root user..."
fi

# Detect OS
if [[ ! -f /etc/os-release ]]; then
  err "Unsupported OS (cannot detect)"
fi
source /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
  err "Unsupported OS: $ID. This script supports Ubuntu and Debian."
fi
log "Detected OS: $PRETTY_NAME"

# Install dependencies
log "Installing dependencies..."
apt-get update -qq
apt-get install -y -qq curl git tar gzip build-essential

# Install Go if not present
if ! command -v go &> /dev/null; then
  log "Installing Go..."
  GO_VERSION="1.22.5"
  ARCH="amd64"
  if [[ "$(uname -m)" == "aarch64" ]]; then ARCH="arm64"; fi
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -o /tmp/go.tar.gz
  tar -C /usr/local -xzf /tmp/go.tar.gz
  export PATH=$PATH:/usr/local/go/bin
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile.d/go.sh
fi

# Install Node.js (for frontend build)
if ! command -v node &> /dev/null; then
  log "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

# Check dck
if ! command -v "$DCK_BIN" &> /dev/null; then
  warn "dck binary not found at '$DCK_BIN'."
  warn "Make sure dck is installed and available."
  warn "Continuing anyway (the panel will try to use it)."
fi

# Create panel user
if ! id -u "$PANEL_USER" &> /dev/null; then
  log "Creating system user: $PANEL_USER"
  useradd -r -s /bin/false -d "$DCK_PANEL_DIR" "$PANEL_USER"
fi

# Clone or update panel
if [[ -d "$DCK_PANEL_DIR" ]]; then
  log "Updating existing installation..."
  cd "$DCK_PANEL_DIR"
  # If installed via git, pull
  if [[ -d .git ]]; then
    git pull
  fi
else
  log "Cloning panel to $DCK_PANEL_DIR..."
  # Replace with actual repo URL
  git clone https://github.com/anomalyco/dck-panel.git "$DCK_PANEL_DIR" 2>/dev/null || {
    warn "Git clone failed. Copying from current directory..."
    cp -r "$(dirname "$0")" "$DCK_PANEL_DIR"
  }
  cd "$DCK_PANEL_DIR"
fi

# Build frontend
log "Building frontend..."
cd "$DCK_PANEL_DIR/dck-client-new" 2>/dev/null || cd "$DCK_PANEL_DIR"
if [[ -f package.json ]]; then
  npm ci
  npm run build
  # Copy dist to server
  mkdir -p server/dist
  cp -r dist/* server/dist/
fi

# Build Go backend
log "Building Go backend..."
cd server
go build -o dck-panel -ldflags="-s -w" .
cp dck-panel /usr/local/bin/dck-panel
cd ..

# Create systemd service
log "Creating systemd service..."
cat > /etc/systemd/system/dck-panel.service << 'SERVICE'
[Unit]
Description=dck Panel
After=network.target
Requires=dck.service

[Service]
Type=simple
User=dck-panel
Group=dck-panel
ExecStart=/usr/local/bin/dck-panel --port ${DCK_PANEL_PORT}
Restart=always
RestartSec=5
Environment=DCK_HOME=/root/.dck

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable dck-panel
systemctl start dck-panel

log "dck Panel installed successfully!"
log ""
  log "  Access the panel at: https://$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
log "  Login with: admin / admin (change immediately!)"
log ""
log "  Management commands:"
log "    sudo systemctl status dck-panel"
log "    sudo systemctl restart dck-panel"
log "    sudo systemctl stop dck-panel"
log "    sudo journalctl -u dck-panel -f"
log ""

# Setup firewall
if command -v ufw &> /dev/null; then
  log "Configuring UFW firewall..."
  ufw allow "$PORT/tcp" 2>/dev/null || true
fi
