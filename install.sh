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

# ---- Ask domain / IP ----
DOMAIN=""
AUTO_IP=$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
echo ""
echo -e "${YELLOW}┌─────────────────────────────────────────────┐${NC}"
echo -e "${YELLOW}│         dck Panel Configuration              │${NC}"
echo -e "${YELLOW}└─────────────────────────────────────────────┘${NC}"
echo -e "${GREEN}Your server IP: ${AUTO_IP:-detecting...}${NC}"
echo -e "Enter your domain name to use HTTPS with Let's Encrypt."
echo -e "Leave empty to use self-signed certificate with IP address."
echo ""
read -p "Domain (e.g. panel.example.com) or press Enter for IP: " -r DOMAIN </dev/tty || true
echo ""

# ---- TLS certificate ----
CERT_DIR="$PANEL_DIR/tls"
TLS_CERT=""
TLS_KEY=""

if [[ -n "$DOMAIN" ]]; then
  log "Using domain: $DOMAIN"
  INSTALL_LE=""
  read -p "Install Let's Encrypt certificate for $DOMAIN? (Y/n): " -r INSTALL_LE </dev/tty || true
  echo ""
  if [[ ! "$INSTALL_LE" =~ ^[Nn] ]]; then
    if ! command -v certbot &> /dev/null; then
      apt-get install -y -qq certbot 2>/dev/null || true
    fi
    if command -v certbot &> /dev/null; then
      log "Obtaining Let's Encrypt certificate for $DOMAIN..."
      ufw allow 80/tcp 2>/dev/null || true
      certbot certonly --standalone --non-interactive --agree-tos --register-unsafely-without-email -d "$DOMAIN" 2>/dev/null || {
        warn "Non-interactive certbot failed, trying interactive..."
        certbot certonly --standalone -d "$DOMAIN" </dev/tty || true
      }
      if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
        TLS_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
        TLS_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
        log "Let's Encrypt certificate obtained!"
      fi
    fi
  fi
fi

if [[ -z "$TLS_CERT" ]]; then
  mkdir -p "$CERT_DIR"
  CN="${DOMAIN:-$AUTO_IP}"
  CN="${CN:-localhost}"
  if [[ ! -f "$CERT_DIR/cert.pem" || ! -f "$CERT_DIR/key.pem" ]]; then
    log "Generating self-signed TLS certificate for $CN..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$CERT_DIR/key.pem" \
      -out "$CERT_DIR/cert.pem" \
      -subj "/CN=$CN" 2>/dev/null
    log "Self-signed certificate generated (10 years)"
  fi
  TLS_CERT="$CERT_DIR/cert.pem"
  TLS_KEY="$CERT_DIR/key.pem"
fi

# ---- Admin credentials ----
ADMIN_USER=""
ADMIN_PASS=""
ADMIN_EMAIL=""
if [[ ! -f "$PANEL_DIR/.env" ]]; then
  echo ""
  echo -e "${YELLOW}┌─────────────────────────────────────────────┐${NC}"
  echo -e "${YELLOW}│         Admin Account Setup                   │${NC}"
  echo -e "${YELLOW}└─────────────────────────────────────────────┘${NC}"
  echo -e "Create your admin account for the panel."
  echo ""
  while [[ -z "$ADMIN_USER" ]]; do
    read -p "Admin username: " -r ADMIN_USER </dev/tty || true
  done
  while [[ -z "$ADMIN_PASS" ]]; do
    read -s -p "Admin password: " -r ADMIN_PASS </dev/tty || true
    echo ""
    if [[ ${#ADMIN_PASS} -lt 4 ]]; then
      echo -e "${RED}Password must be at least 4 characters${NC}"
      ADMIN_PASS=""
    fi
  done
  read -p "Admin email (optional): " -r ADMIN_EMAIL </dev/tty || true
  echo ""
  cat > "$PANEL_DIR/.env" << ENV
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASS
ADMIN_EMAIL=$ADMIN_EMAIL
ENV
  chmod 600 "$PANEL_DIR/.env"
  log "Admin credentials saved"
else
  source "$PANEL_DIR/.env"
  ADMIN_USER="${ADMIN_USERNAME:-admin}"
  log "Using existing admin credentials from .env"
fi

# ---- Systemd service ----
log "Creating systemd service..."
cat > /etc/systemd/system/dck-panel.service << SERVICE
[Unit]
Description=dck Panel
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/dck-panel --port ${PANEL_PORT} --sftp-port 2222 --tls-cert ${TLS_CERT} --tls-key ${TLS_KEY} --serve-dir ${PANEL_DIR}/server/dist
Restart=always
RestartSec=5
Environment=DCK_HOME=/root/.dck
EnvironmentFile=${PANEL_DIR}/.env

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
ACCESS="${DOMAIN:-$AUTO_IP}"
ACCESS="${ACCESS:-localhost}"
log ""
log "╔══════════════════════════════════════════════╗"
log "║       dck Panel installed successfully!     ║"
log "╠══════════════════════════════════════════════╣"
log "║  Panel:  https://${ACCESS}:${PANEL_PORT}           "
log "║  Login:  ${ADMIN_USER} / (your password)         "
log "║                                              ║"
log "║  Manage: sudo systemctl status dck-panel     ║"
log "║  Logs:   sudo journalctl -u dck-panel -f     ║"
log "╚══════════════════════════════════════════════╝"
log ""
