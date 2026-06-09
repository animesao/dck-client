#!/usr/bin/env bash
set -euo pipefail

# dck Panel Uninstaller
# Usage: curl -sSL https://raw.githubusercontent.com/animesao/dck-client/main/uninstall.sh | sudo bash

PANEL_DIR="/opt/dck-panel"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

if [[ $EUID -ne 0 ]]; then err "Must run as root: sudo bash uninstall.sh"; fi

warn "This will remove dck Panel completely."
warn "Containers managed by dck will NOT be affected."
read -rp "Continue? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  log "Cancelled."
  exit 0
fi

# Stop and disable service
if systemctl is-active --quiet dck-panel 2>/dev/null; then
  log "Stopping dck-panel service..."
  systemctl stop dck-panel
fi

if systemctl is-enabled --quiet dck-panel 2>/dev/null; then
  log "Disabling dck-panel service..."
  systemctl disable dck-panel
fi

# Remove service file
if [[ -f /etc/systemd/system/dck-panel.service ]]; then
  rm -f /etc/systemd/system/dck-panel.service
  systemctl daemon-reload
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

# Remove firewall rule (port 443)
if command -v ufw &> /dev/null; then
  ufw delete allow 443/tcp 2>/dev/null || true
  log "UFW rule removed (443/tcp)"
fi

log ""
log "╔══════════════════════════════════════════════╗"
log "║     dck Panel has been uninstalled.         ║"
log "╠══════════════════════════════════════════════╣"
log "║  dck runtime and containers are untouched.   ║"
log "║  To remove dck: sudo dck purge              ║"
log "╚══════════════════════════════════════════════╝"
log ""
