#!/usr/bin/env bash
set -euo pipefail

# dck Panel Uninstaller
# Usage: curl -sSL https://raw.githubusercontent.com/animesao/dck-client/main/uninstall.sh | sudo bash
#   or: curl -sSL ... | sudo bash -s 8443

PANEL_DIR="/opt/dck-panel"
PANEL_PORT="${1:-443}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

FORCE=false
for arg in "$@"; do
  [[ "$arg" == "-f" || "$arg" == "--force" ]] && FORCE=true
done

if [[ $EUID -ne 0 ]]; then err "Must run as root: sudo bash uninstall.sh"; fi

warn "This will remove dck Panel completely."
warn "Containers managed by dck will NOT be affected."
warn "Go installed by the panel will also be removed."

if [[ "$FORCE" != "true" ]]; then
  if read -rp "Continue? [y/N] " confirm </dev/tty; then
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      log "Cancelled."
      exit 0
    fi
  else
    log "Cannot read from terminal. Proceeding in 3s... Ctrl+C to abort."
    sleep 3
  fi
fi

# Stop, kill and disable service
log "Stopping dck-panel service..."
systemctl kill dck-panel 2>/dev/null || true
systemctl stop dck-panel 2>/dev/null || true
systemctl disable dck-panel 2>/dev/null || true

# Kill any lingering panel process
pkill -x dck-panel 2>/dev/null || true
pkill -f "dck-panel --port" 2>/dev/null || true

# Remove service file
if [[ -f /etc/systemd/system/dck-panel.service ]]; then
  rm -f /etc/systemd/system/dck-panel.service
  systemctl daemon-reload
  systemctl reset-failed dck-panel 2>/dev/null || true
  log "Service file removed"
fi

# Remove TLS certificates (before panel dir)
if [[ -d "$PANEL_DIR/tls" ]]; then
  rm -rf "$PANEL_DIR/tls"
  log "TLS certificates removed"
fi

# Remove frontend build (dist)
if [[ -d "$PANEL_DIR/server/dist" ]]; then
  rm -rf "$PANEL_DIR/server/dist"
  log "Frontend dist removed"
fi

# Remove Go build artifacts
if [[ -d "$PANEL_DIR/server" ]]; then
  rm -rf "$PANEL_DIR/server"
  log "Server sources removed"
fi

# Remove node_modules
if [[ -d "$PANEL_DIR/node_modules" ]]; then
  rm -rf "$PANEL_DIR/node_modules"
  log "Node modules removed"
fi

# Remove binary
if [[ -f /usr/local/bin/dck-panel ]]; then
  rm -f /usr/local/bin/dck-panel
  log "Binary removed: /usr/local/bin/dck-panel"
fi

# Remove panel directory
if [[ -d "$PANEL_DIR" ]]; then
  rm -rf "$PANEL_DIR"
  log "Panel directory removed: $PANEL_DIR"
fi

# Remove panel data (users, settings, SQLite db)
for d in "/root/.dck-panel" "$HOME/.dck-panel"; do
  if [[ -d "$d" ]]; then
    rm -rf "$d"
    log "Panel data removed: $d"
  fi
done

# Remove dck data directory (containers metadata, images layers, etc.)
for d in "/root/.dck" "$HOME/.dck"; do
  if [[ -d "$d" ]]; then
    warn "Removing dck data directory: $d"
    rm -rf "$d"
  fi
done

# Remove firewall rule
if command -v ufw &> /dev/null; then
  ufw delete allow "${PANEL_PORT}/tcp" 2>/dev/null || true
  log "UFW rule removed (${PANEL_PORT}/tcp)"
fi

# Remove Go installation (installed by panel)
if [[ -d /usr/local/go ]]; then
  rm -rf /usr/local/go
  log "Go installation removed: /usr/local/go"
fi

# Remove Go profile
if [[ -f /etc/profile.d/go.sh ]]; then
  rm -f /etc/profile.d/go.sh
  log "Go profile removed: /etc/profile.d/go.sh"
fi

log ""
log "╔══════════════════════════════════════════════╗"
log "║     dck Panel has been uninstalled.         ║"
log "╠══════════════════════════════════════════════╣"
log "║  dck runtime and containers are untouched.   ║"
log "║  Go installation has been removed.           ║"
log "║  To remove dck itself: sudo dck purge       ║"
log "╚══════════════════════════════════════════════╝"
log ""
