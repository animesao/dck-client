# dck-client — Web UI for dck Container Runtime

A web-based management interface for [dck](https://github.com/animesao/dck) — the lightweight, daemonless container runtime.

## Quick Install on VDS

```bash
# 1. Install dck first (if not installed)
curl -sSL https://github.com/animesao/dck-client/raw/main/install.sh | sudo bash

# 2. Clone and install dck-client directly (systemd — full host access)
git clone https://github.com/animesao/dck-client.git
cd dck-client
sudo ./install.sh
```

Open `http://<your-vds-ip>:8080` and register the first admin account.

## Deploy as a dck Container (Dogfood)

```bash
# Build and deploy dck-client as a dck-managed container
sudo ./deploy.sh
```

This runs dck-client inside a dck container (`dck run -n dck-client`).
The container has the dck binary and `/root/.dck` mounted, so it can
manage dck containers directly.

Managment:
```bash
dck logs dck-client     # View logs
dck restart dck-client  # Restart
dck stop dck-client     # Stop
```

> **Note**: Containers created from the dck-client web UI when running
> in container mode will be nested (dck-in-dck). For full host-level
> container management, use `install.sh` (direct/systemd mode).

## Manual Setup

```bash
# Build
go build -ldflags="-s -w" -o /usr/local/bin/dck-client ./cmd/server

# Run (as root — dck needs root)
dck-client --port 8080 --data /root/.dck-client

# Or install as systemd service
cat > /etc/systemd/system/dck-client.service << 'UNIT'
[Unit]
Description=dck-client — Web UI for dck
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/dck-client --port 8080 --data /root/.dck-client
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now dck-client
```

## Architecture

```
Browser ──HTTP──> dck-client (port 8080)
                    │
                    ├── SQLite (/root/.dck-client/dck-client.db)
                    │     ├─ users
                    │     ├─ templates
                    │     └─ settings
                    │
                    └── dck binary (via os/exec)
                          └── /root/.dck/
                                ├─ containers/
                                ├─ images/
                                ├─ logs/
                                └─ overlay/
```

- Reads container states directly from `/root/.dck/containers/*.json`
- Executes dck commands for actions (start, stop, pull, etc.)
- No Docker daemon required

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Register first user |
| GET | /api/dashboard/stats | System stats |
| GET | /api/containers | List containers |
| GET | /api/containers/:id | Container details |
| POST | /api/containers | Create container |
| POST | /api/containers/:id/start | Start container |
| POST | /api/containers/:id/stop | Stop container |
| POST | /api/containers/:id/restart | Restart container |
| DELETE | /api/containers/:id | Remove container |
| GET | /api/containers/:id/logs | Container logs |
| GET | /api/containers/:id/state | Container state JSON |
| GET | /api/images | List images |
| POST | /api/images/pull | Pull image |
| DELETE | /api/images/:name/:tag | Remove image |
| GET | /api/config | Get dck.toml |
| POST | /api/config | Save dck.toml |
| POST | /api/config/deploy | dck up |
| POST | /api/config/down | dck down |
| GET | /api/templates | List templates |
| POST | /api/templates | Save template |
| DELETE | /api/templates/:id | Delete template |
| GET | /api/settings | Get settings |
| PUT | /api/settings | Update settings |

## Development

```bash
# Run locally on Windows (for frontend dev, uses stubs for system info)
go run ./cmd/server --port 8080 --data ./data

# Build for Linux
GOOS=linux GOARCH=amd64 go build -o dck-client-linux ./cmd/server
```

## Requirements

- Linux VDS with `unshare`, `nsenter`, `ip`, `iptables`, `mount`
- [dck](https://github.com/animesao/dck) installed
- Root access (dck requires root)
