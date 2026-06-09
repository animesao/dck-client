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

if [[ $EUID -ne 0 ]]; then err "Must run as root: sudo bash uninstall.sh"; fi

warn "This will remove dck Panel completely."
warn "Containers managed by dck will NOT be affected."
warn "Go installed by the panel will also be removed."
read -rp "Continue? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  log "Cancelled."
  exit 0
fi

# Stop, kill and disable service
log "Stopping dck-panel service..."
systemctl kill dck-panel 2>/dev/null || true
systemctl stop dck-panel 2>/dev/null || true
pkill -f dck-panel 2>/dev/null || true
systemctl disable dck-panel 2>/dev/null || true

# Remove service file
if [[ -f /etc/systemd/system/dck-panel.service ]]; then
  rm -f /etc/systemd/system/dck-panel.service
  systemctl daemon-reload
  systemctl reset-failed dck-panel 2>/dev/null || true
  log "Service file removed"
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

# Remove panel data (users, settings)
PANEL_DATA="$HOME/.dck-panel"
if [[ -d "$PANEL_DATA" ]]; then
  rm -rf "$PANEL_DATA"
  log "Panel data removed: $PANEL_DATA"
fi

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

# Remove TLS certificates
CERT_DIR="$PANEL_DIR/tls"
if [[ -d "$CERT_DIR" ]]; then
  rm -rf "$CERT_DIR"
  log "TLS certificates removed: $CERT_DIR"
fi

log ""
log "╔══════════════════════════════════════════════╗"
log "║     dck Panel has been uninstalled.         ║"
log "╠══════════════════════════════════════════════╣"
log "║  dck runtime and containers are untouched.   ║"
log "║  Go installation has been removed.           ║"
log "║  To remove dck: sudo dck purge              ║"
log "╚══════════════════════════════════════════════╝"
log ""
