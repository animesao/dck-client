#!/usr/bin/env bash
set -e

REPO="https://github.com/animesao/dck-client"
BINDIR="/usr/local/bin"
SYSTEMD="/etc/systemd/system"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC} $1"; exit 1; }
section()  { echo -e "${CYAN}━━━ $1 ━━━${NC}"; }

# ── Check root ──
[ "$EUID" -eq 0 ] || err "Please run as root"

# ── Args ──
MODE="${1:-auto}"  # auto, direct, container

# ── Check dck ──
if ! command -v dck >/dev/null 2>&1; then
    warn "dck is not installed. Install it first:"
    warn "  curl -sSL https://github.com/animesao/dck/raw/main/install.sh | sudo bash"
    echo ""
    read -rp "Continue without dck? [y/N] " yn
    [[ "$yn" =~ ^[yY] ]] || exit 1
fi

# ── Download source ──
section "Downloading dck-client"
SRC=$(mktemp -d)
ARCHIVE="$SRC/archive.tar.gz"

if command -v curl >/dev/null 2>&1; then
    curl -sSL "$REPO/-/archive/main/dck-client-main.tar.gz" -o "$ARCHIVE"
elif command -v wget >/dev/null 2>&1; then
    wget -q "$REPO/-/archive/main/dck-client-main.tar.gz" -O "$ARCHIVE"
else
    err "curl or wget required"
fi

tar xzf "$ARCHIVE" -C "$SRC"
SRCDIR=$(find "$SRC" -maxdepth 1 -type d -name "dck-client*" | /usr/bin/head -1)
[ -n "$SRCDIR" ] && cd "$SRCDIR" || err "Failed to extract source archive"

# ── Ensure Go 1.22+ ──
install_go22() {
    info "Installing Go 1.22..."
    OS="linux"; ARCH="amd64"
    case "$(uname -m)" in aarch64|arm64) ARCH="arm64"; ;; esac
    curl -sSL "https://go.dev/dl/go1.22.5.$OS-$ARCH.tar.gz" -o /tmp/go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tar.gz
    ln -sf /usr/local/go/bin/go /usr/local/bin/go
    rm -f /tmp/go.tar.gz
    info "Go $(go version | grep -oP 'go\S+') installed"
}

# ── Build binary ──
section "Building dck-client"
install_go22
VERSION="${VERSION:-$(date +%Y%m%d)}"
go build -ldflags="-s -w -X main.Version=$VERSION" -o "$SRC/dck-client" ./cmd/server
chmod 755 "$SRC/dck-client"

# Verify binary exists and works
if ! "$SRC/dck-client" --help >/dev/null 2>&1; then
    err "Binary built but failed to run. Check Go version and dependencies."
fi
info "Binary built successfully"

# ── Mode selection ──
if [ "$MODE" = "auto" ]; then
    section "Select installation mode"
    echo "  1) Direct (systemd service) — full host access"
    echo "  2) Container (dck run) — dogfood, managed via dck"
    echo ""
    read -rp "Choice [1/2]: " mode_choice
    case "$mode_choice" in
        2) MODE="container" ;;
        *) MODE="direct" ;;
    esac
fi

# ── Direct mode: systemd ──
if [ "$MODE" = "direct" ]; then
    section "Installing as systemd service"

    cp "$SRC/dck-client" "$BINDIR/dck-client"
    chmod 755 "$BINDIR/dck-client"

    cat > "$SYSTEMD/dck-client.service" << 'UNIT'
[Unit]
Description=dck-client — Web UI for dck container runtime
After=network.target
Wants=dck-bootstrap.service

[Service]
Type=simple
ProtectHome=no
ProtectSystem=no
ExecStartPre=/bin/mkdir -p /root/.dck-client
ExecStart=/usr/local/bin/dck-client --port 443 --http-port 8080 --data /root/.dck-client --dck-bin /usr/local/bin/dck --dck-data /root/.dck
Restart=always
RestartSec=5
KillMode=process

[Install]
WantedBy=multi-user.target
UNIT

    echo "--- unit file ---"
    cat "$SYSTEMD/dck-client.service"
    echo "--- end unit ---"

    systemctl daemon-reload
    systemctl enable dck-client
    systemctl restart dck-client

    sleep 2

    # Quick sanity: check if NAMESPACE error persists
    if journalctl -u dck-client -n 5 --no-pager 2>/dev/null | grep -q NAMESPACE; then
        err "NAMESPACE error persists despite unit fix. Please report this output."
    fi

    IP=$(hostname -I | awk '{print $1}')

    # Open firewall
    if command -v ufw >/dev/null 2>&1; then
        ufw allow 443/tcp 2>/dev/null && info "ufw: port 443 opened" || true
        ufw allow 8080/tcp 2>/dev/null || true
    elif command -v firewall-cmd >/dev/null 2>&1; then
        firewall-cmd --add-port=443/tcp --permanent 2>/dev/null || true
        firewall-cmd --add-port=8080/tcp --permanent 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
    else
        iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
    fi

    sleep 1

    # Check service status
    if systemctl is-active --quiet dck-client; then
        info "dck-client service is running!"
    else
        warn "Service not active. Checking logs..."
        journalctl -u dck-client -n 20 --no-pager || true
    fi

    info "dck-client installed as systemd service!"
    echo ""
    echo "  URL:  https://$IP:443"
    echo "  Logs: journalctl -u dck-client -f"
    echo "  Stop: systemctl stop dck-client"
    echo ""
    echo "  Troubleshooting:"
    echo "    systemctl status dck-client"
    echo "    journalctl -u dck-client -n 50 --no-pager"
    echo ""

# ── Container mode: deploy as dck container ──
elif [ "$MODE" = "container" ]; then
    section "Deploying as dck container"

    # Stop + remove existing
    dck stop dck-client 2>/dev/null || true
    dck rm dck-client 2>/dev/null || true

    DCK_BIN=$(command -v dck)
    DCK_DATA="/root/.dck"

    dck run -d \
        -n dck-client \
        -p 443:443 \
        -p 8080:8080 \
        -v "$SRC/dck-client:/usr/local/bin/dck-client" \
        -v "$DCK_BIN:/usr/local/bin/dck" \
        -v "$DCK_DATA:/root/.dck" \
        --restart always \
        alpine:3.20 \
        sh -c "apk add --no-cache ca-certificates tzdata >/dev/null 2>&1 && exec dck-client --port 443 --http-port 8080 --data /root/.dck-client"

    sleep 3

    IP=$(hostname -I | awk '{print $1}')

    # Open firewall
    if command -v ufw >/dev/null 2>&1; then
        ufw allow 443/tcp 2>/dev/null || true
        ufw allow 8080/tcp 2>/dev/null || true
    fi

    # Check container status
    if dck ps | grep -q dck-client; then
        info "dck-client container is running!"
    else
        warn "Container not running. Check logs: dck logs dck-client"
    fi

    info "dck-client deployed as dck container!"
    echo ""
    echo "  URL:  https://$IP:443"
    echo "  Logs: dck logs dck-client"
    echo "  Stop: dck stop dck-client && dck rm dck-client"
    echo ""
fi

# ── Done ──
section "First-time setup"
IP="${IP:-$(hostname -I | awk '{print $1}')}"
echo "  1. Open https://$IP:443 in your browser"
echo "     (self-signed cert — click \"Advanced\" then \"Proceed\")"
echo "  2. Register the first admin account"
echo "  3. Start managing containers!"
echo ""
echo "  HTTP→HTTPS redirect on port 8080"

# ── Cleanup ──
rm -rf "$SRC"

