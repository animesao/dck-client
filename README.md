# dck Panel

Modern web management panel for [dck](https://github.com/anomalyco/dck) container runtime. Full-featured Pterodactyl-like interface for managing containers, files, backups, and system resources.

![Dashboard](https://raw.githubusercontent.com/animesao/dck-client/main/screenshots/dashboard.png)

## Features

- **Dashboard** — Real-time system stats (CPU, RAM, Disk, uptime) from `/proc`, container overview
- **Containers** — Create, start, stop, restart, delete containers via `dck` CLI
- **Image Management** — List, pull, and remove container images
- **File Manager** — Browse, read, edit, upload, download, create, delete files directly in containers (via overlayfs at `~/.dck/overlay/<id>/merged/`)
- **Backups** — Create and restore full container backups (tar.gz archives)
- **Console** — Full WebSocket terminal with xterm.js, bridged to `dck` Unix socket (`~/.dck/consoles/<id>.sock`)
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
sudo ./dck-panel --port 443

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

# Run
sudo ./server/dck-panel --port 443
```

### Option 3: Install script (Ubuntu/Debian)

```bash
# One-command install
sudo bash install.sh

# Or with custom options
sudo bash install.sh 443 /usr/local/bin/dck
```

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
ExecStart=/usr/local/bin/dck-panel --port 443
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
ufw allow 443/tcp
```

## Security

- Change the default `admin/admin` password immediately after first login
- Use a reverse proxy with HTTPS termination (Caddy, Nginx, Traefik)
- The panel stores passwords as bcrypt hashes
- JWT tokens expire after 7 days
- Admin and user roles with RBAC

## License

MIT
