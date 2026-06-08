#!/usr/bin/env bash
set -e

[ "$EUID" -eq 0 ] || { echo "Please run as root"; exit 1; }

echo "Stopping and removing systemd service..."
systemctl stop dck-client 2>/dev/null || true
systemctl disable dck-client 2>/dev/null || true
rm -f /etc/systemd/system/dck-client.service
systemctl daemon-reload

echo "Removing binary..."
rm -f /usr/local/bin/dck-client

echo "Removing data directory..."
rm -rf /root/.dck-client

echo "dck-client has been uninstalled."
