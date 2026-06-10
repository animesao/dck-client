const express = require('express')
const cors = require('cors')
const crypto = require('crypto')

const app = express()
app.use(cors())
app.use(express.json())

// In-memory store
const users = [
  {
    id: crypto.randomUUID(),
    username: 'admin',
    password: '$2b$10$placeholder', // Will be checked against plaintext for mock
    role: 'admin',
    created_at: new Date().toISOString(),
  },
]
const tokens = new Map()
const containers = []
const images = [
  { name: 'nginx', tag: 'latest', id: 'sha256:abc123', size: '187MB', created: new Date().toISOString() },
  { name: 'redis', tag: 'latest', id: 'sha256:def456', size: '117MB', created: new Date().toISOString() },
  { name: 'postgres', tag: '16', id: 'sha256:ghi789', size: '412MB', created: new Date().toISOString() },
  { name: 'node', tag: '22', id: 'sha256:jkl012', size: '365MB', created: new Date().toISOString() },
  { name: 'python', tag: '3.12', id: 'sha256:mno345', size: '335MB', created: new Date().toISOString() },
]
let containerIdCounter = 0
let settings = {
  dck_bin: '/usr/local/bin/dck',
  dck_data: '/root/.dck',
  registration: true,
}

function generateToken(user) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    iat: Math.floor(Date.now() / 1000),
  }))
  const signature = crypto.createHmac('sha256', 'dck-mock-secret').update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const token = auth.slice(7)
    const payload = JSON.parse(atob(token.split('.')[1]))
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

// Auth
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  const user = users.find(u => u.username === username && u.password === password)
  if (!user) {
    // First run: auto-create admin/admin
    if (username === 'admin' && password === 'admin') {
      const newUser = {
        id: crypto.randomUUID(),
        username: 'admin',
        password: 'admin',
        role: 'admin',
        created_at: new Date().toISOString(),
      }
      users.push(newUser)
      const token = generateToken(newUser)
      return res.json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, created_at: newUser.created_at } })
    }
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const token = generateToken(user)
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, created_at: user.created_at } })
})

app.post('/api/auth/register', (req, res) => {
  if (!settings.registration) {
    return res.status(403).json({ error: 'Registration is closed' })
  }
  const { username, password } = req.body
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' })
  }
  const role = users.length === 0 ? 'admin' : 'user'
  const newUser = {
    id: crypto.randomUUID(),
    username,
    password,
    role,
    created_at: new Date().toISOString(),
  }
  users.push(newUser)
  const token = generateToken(newUser)
  res.json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, created_at: newUser.created_at } })
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = users.find(u => u.id === req.user.sub)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ id: user.id, username: user.username, role: user.role, created_at: user.created_at })
})

// Dashboard
app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  res.json({
    system: {
      os: 'Linux',
      arch: 'x86_64',
      kernel: '6.8.0',
      uptime: '3d 12h 45m',
      cpu_model: 'AMD Ryzen 9 7950X',
      cpu_cores: 16,
    },
    containers: {
      total: containers.length,
      running: containers.filter(c => c.status === 'running').length,
      stopped: containers.filter(c => c.status !== 'running').length,
    },
    images: images.length,
    containers_list: containers,
    cpu_percent: 23.5,
    memory_percent: 45.2,
    memory_used: 8240000000,
    memory_total: 17179869184,
    disk_used: 256000000000,
    disk_total: 1000000000000,
  })
})

// Containers
app.get('/api/containers', authMiddleware, (req, res) => {
  const all = req.query.all === 'true'
  let result = containers
  if (!all) result = result.filter(c => c.status === 'running')
  res.json(result)
})

app.get('/api/containers/:id', authMiddleware, (req, res) => {
  const c = containers.find(ct => ct.id === req.params.id)
  if (!c) return res.status(404).json({ error: 'Container not found' })
  res.json(c)
})

app.post('/api/containers', authMiddleware, (req, res) => {
  const { image, name, ports, volumes, env, restart, memory, cpus, network, command } = req.body
  containerIdCounter++
  const id = crypto.randomBytes(16).toString('hex')
  const container = {
    id,
    name: name || `container-${containerIdCounter}`,
    image: image || 'nginx:latest',
    status: 'running',
    created: new Date().toISOString(),
    ports: (ports || []).map(p => {
      const [host, containerPort] = p.split(':')
      return { host, container: containerPort, protocol: 'tcp' }
    }),
    pid: Math.floor(Math.random() * 50000) + 1000,
    ip: `10.0.2.${containerIdCounter + 1}`,
    user_id: req.user.sub,
    memory: memory || '',
    cpus: cpus || '',
    cmd: command || '',
  }
  containers.push(container)
  res.status(201).json(container)
})

app.post('/api/containers/:id/start', authMiddleware, (req, res) => {
  const c = containers.find(ct => ct.id === req.params.id)
  if (!c) return res.status(404).json({ error: 'Container not found' })
  c.status = 'running'
  res.json({ status: 'ok' })
})

app.post('/api/containers/:id/stop', authMiddleware, (req, res) => {
  const c = containers.find(ct => ct.id === req.params.id)
  if (!c) return res.status(404).json({ error: 'Container not found' })
  c.status = 'stopped'
  res.json({ status: 'ok' })
})

app.post('/api/containers/:id/restart', authMiddleware, (req, res) => {
  const c = containers.find(ct => ct.id === req.params.id)
  if (!c) return res.status(404).json({ error: 'Container not found' })
  c.status = 'running'
  res.json({ status: 'ok' })
})

app.delete('/api/containers/:id', authMiddleware, (req, res) => {
  const idx = containers.findIndex(ct => ct.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Container not found' })
  containers.splice(idx, 1)
  res.status(204).send()
})

app.get('/api/containers/:id/logs', authMiddleware, (req, res) => {
  res.json({
    logs: `[${new Date().toISOString()}] Starting container ${req.params.id.slice(0, 12)}
[${new Date().toISOString()}] Container initialized
[${new Date().toISOString()}] Server started on port 80
[${new Date().toISOString()}] Ready to accept connections`,
  })
})

app.get('/api/containers/:id/state', authMiddleware, (req, res) => {
  res.json({
    state: {
      Status: 'running',
      Running: true,
      Paused: false,
      Restarting: false,
      OOMKilled: false,
      Dead: false,
      Pid: 1234,
      ExitCode: 0,
      StartedAt: new Date(Date.now() - 3600000).toISOString(),
      FinishedAt: '0001-01-01T00:00:00Z',
    },
  })
})

app.get('/api/containers/:id/stats', authMiddleware, (req, res) => {
  res.json({
    cpu: Math.random() * 30 + 1,
    memory: Math.random() * 40 + 5,
    memory_used: Math.floor(Math.random() * 200000000) + 50000000,
    memory_limit: 536870912,
  })
})

app.get('/api/containers/:id/config', authMiddleware, (req, res) => {
  res.json({
    restart_policy: 'no',
    memory: '512m',
    cpus: '1',
    network: 'bridge',
  })
})

// In-memory container files (simulates overlay)
const containerFiles = new Map()

function getFilesForContainer(id) {
  if (!containerFiles.has(id)) {
    containerFiles.set(id, [{ name: 'data', path: '/data', is_dir: true, size: 0, mode: 'drwxr-xr-x', mod_time: new Date().toISOString() }])
  }
  return containerFiles.get(id)
}

function mockFileRoot(id) {
  if (!containerFiles.has(id)) {
    containerFiles.set(id, [{ name: 'data', path: '/data', is_dir: true, size: 0, mode: 'drwxr-xr-x', mod_time: new Date().toISOString() }])
  }
  return containerFiles.get(id)
}

app.get('/api/containers/:id/files', authMiddleware, (req, res) => {
  const path = req.query.path || '/'
  const id = req.params.id
  if (!containers.find(c => c.id === id)) {
    return res.status(404).json({ error: 'Container not found' })
  }
  const files = mockFileRoot(id)
  // If at root, show all files; otherwise filter by prefix
  if (path === '/') {
    return res.json(files)
  }
  const filtered = files.filter(f => f.path.startsWith(path + '/') || f.path === path)
  res.json(filtered)
})

app.get('/api/containers/:id/files/read', authMiddleware, (req, res) => {
  const filePath = req.query.path
  if (!filePath) return res.status(400).json({ error: 'path required' })
  res.json({ content: `// Mock content of ${filePath}\nconsole.log('hello');\n`, encoding: 'utf-8' })
})

app.post('/api/containers/:id/files/write', authMiddleware, (req, res) => {
  const { path, content } = req.body
  const id = req.params.id
  const files = mockFileRoot(id)
  const exists = files.find(f => f.path === path)
  if (exists) {
    exists.size = (content || '').length
    exists.mod_time = new Date().toISOString()
  } else {
    const name = path.split('/').pop()
    files.push({ name, path, is_dir: false, size: (content || '').length, mode: '-rw-r--r--', mod_time: new Date().toISOString() })
  }
  res.json({ status: 'ok' })
})

app.post('/api/containers/:id/files/mkdir', authMiddleware, (req, res) => {
  const { path } = req.body
  if (!path) return res.status(400).json({ error: 'path required' })
  const id = req.params.id
  const files = mockFileRoot(id)
  const name = path.split('/').pop()
  files.push({ name, path, is_dir: true, size: 0, mode: 'drwxr-xr-x', mod_time: new Date().toISOString() })
  res.json({ status: 'ok' })
})

app.delete('/api/containers/:id/files', authMiddleware, (req, res) => {
  const filePath = req.query.path
  const id = req.params.id
  if (!filePath) return res.status(400).json({ error: 'path required' })
  const files = mockFileRoot(id)
  const idx = files.findIndex(f => f.path === filePath)
  if (idx !== -1) files.splice(idx, 1)
  res.status(204).send()
})

app.put('/api/containers/:id/files/rename', authMiddleware, (req, res) => {
  const { old_path, new_path } = req.body
  const id = req.params.id
  if (!old_path || !new_path) return res.status(400).json({ error: 'old_path and new_path required' })
  const files = mockFileRoot(id)
  const idx = files.findIndex(f => f.path === old_path)
  if (idx !== -1) {
    const newName = new_path.split('/').pop()
    files[idx].name = newName
    files[idx].path = new_path
    files[idx].mod_time = new Date().toISOString()
  }
  res.json({ status: 'ok' })
})

// Backups
const backups = new Map()

app.get('/api/containers/:id/backups', authMiddleware, (req, res) => {
  res.json(backups.get(req.params.id) || [])
})

app.post('/api/containers/:id/backups', authMiddleware, (req, res) => {
  const id = req.params.id
  if (!backups.has(id)) backups.set(id, [])
  const name = `backup-${id.slice(0, 12)}-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const entry = { name, size: Math.floor(Math.random() * 100000) + 1000, created_at: new Date().toISOString() }
  backups.get(id).push(entry)
  res.status(201).json(entry)
})

app.post('/api/containers/:id/backups/:backup/restore', authMiddleware, (req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/containers/:id/backups/:backup/download', authMiddleware, (req, res) => {
  res.json({ status: 'ok' })
})

app.delete('/api/containers/:id/backups/:backup', authMiddleware, (req, res) => {
  const id = req.params.id
  const name = req.params.backup
  if (backups.has(id)) {
    backups.set(id, backups.get(id).filter(b => b.name !== name))
  }
  res.status(204).send()
})

app.put('/api/containers/:id/config', authMiddleware, (req, res) => {
  const c = containers.find(ct => ct.id === req.params.id)
  if (c && req.body.cmd !== undefined) {
    c.cmd = req.body.cmd
  }
  res.json({ status: 'ok' })
})

app.post('/api/containers/:id/exec', authMiddleware, (req, res) => {
  const { command } = req.body
  res.json({
    output: `$ ${command}\nTotal 24\n-rw-r--r-- 1 root root   1234 Jan 1 00:00 file1.txt\ndrwxr-xr-x 2 root root   4096 Jan 1 00:00 data\ndrwxr-xr-x 2 root root   4096 Jan 1 00:00 config\n\nExit code: 0`,
    exit_code: 0,
  })
})

// Images
app.get('/api/images', authMiddleware, (req, res) => res.json(images))

app.post('/api/images/pull', authMiddleware, (req, res) => {
  const { name } = req.body
  const [imgName, tag = 'latest'] = name.split(':')
  if (!images.find(i => i.name === imgName && i.tag === tag)) {
    images.push({
      name: imgName,
      tag,
      id: `sha256:${crypto.randomBytes(8).toString('hex')}`,
      size: `${Math.floor(Math.random() * 500) + 50}MB`,
      created: new Date().toISOString(),
    })
  }
  res.json({ status: 'pulled' })
})

app.delete('/api/images/:name/:tag', authMiddleware, (req, res) => {
  const idx = images.findIndex(i => i.name === req.params.name && i.tag === req.params.tag)
  if (idx > -1) images.splice(idx, 1)
  res.status(204).send()
})

// Blueprints
const blueprints = [
  { name: 'Nginx Web Server', description: 'Lightweight web server for static content', category: 'web', image: 'nginx:latest', icon: 'web', command: 'nginx -g daemon off;', env: [{ key: 'PORT', description: 'Port to expose', default: '80', required: false, placeholder: '80' }] },
  { name: 'Redis Cache', description: 'In-memory data store for caching', category: 'database', image: 'redis:latest', icon: 'database', command: 'redis-server', env: [{ key: 'REDIS_PASSWORD', description: 'Redis password', default: '', required: false, advanced: true, placeholder: 'optional' }] },
  { name: 'PostgreSQL', description: 'Relational database', category: 'database', image: 'postgres:16', icon: 'database', command: 'postgres -D /var/lib/postgresql/data', env: [{ key: 'POSTGRES_PASSWORD', description: 'Database password', default: 'changeme', required: true, placeholder: 'Enter password' }, { key: 'POSTGRES_DB', description: 'Database name', default: 'mydb', required: false, placeholder: 'mydb' }] },
  { name: 'MySQL', description: 'Popular relational database', category: 'database', image: 'mysql:latest', icon: 'database', command: 'mysqld', env: [{ key: 'MYSQL_ROOT_PASSWORD', description: 'Root password', default: 'changeme', required: true, placeholder: 'Enter password' }, { key: 'MYSQL_DATABASE', description: 'Database name', default: 'mydb', required: false, placeholder: 'mydb' }] },
  { name: 'MongoDB', description: 'NoSQL document database', category: 'database', image: 'mongo:latest', icon: 'database', command: 'mongod', env: [{ key: 'MONGO_INITDB_ROOT_USERNAME', description: 'Root username', required: false, placeholder: 'admin' }, { key: 'MONGO_INITDB_ROOT_PASSWORD', description: 'Root password', required: true, placeholder: 'Enter password' }] },
  { name: 'Node.js App', description: 'Node.js application runtime', category: 'runtime', image: 'node:22', icon: 'runtime', command: 'node index.js', env: [{ key: 'NODE_ENV', description: 'Environment', default: 'production', options: ['development', 'production', 'test'], required: false }, { key: 'PORT', description: 'App port', default: '3000', required: false, placeholder: '3000' }] },
  { name: 'Python App', description: 'Python application runtime', category: 'runtime', image: 'python:3.12', icon: 'runtime', command: 'python app.py', env: [{ key: 'PYTHONUNBUFFERED', description: 'Python unbuffered output', default: '1', required: false, placeholder: '1' }] },
  { name: 'Discord Bot (Python)', description: 'Discord bot template with discord.py', category: 'bot', image: 'python:3.12', icon: 'bot', command: 'python bot.py', env: [{ key: 'DISCORD_TOKEN', description: 'Discord bot token', default: '', required: true, placeholder: 'Enter your bot token' }, { key: 'PREFIX', description: 'Command prefix', default: '!', required: false, placeholder: '!' }] },
  { name: 'Discord Bot (Node.js)', description: 'Discord bot template with discord.js', category: 'bot', image: 'node:22', icon: 'bot', command: 'node bot.js', env: [{ key: 'DISCORD_TOKEN', description: 'Discord bot token', default: '', required: true, placeholder: 'Enter your bot token' }, { key: 'CLIENT_ID', description: 'Discord client ID', required: false, placeholder: 'Enter client ID' }] },
  { name: 'Minecraft Server', description: 'Minecraft Java Edition server', category: 'game', image: 'itzg/minecraft-server:latest', icon: 'game', command: 'java -Xmx$MEMORY -Xms$MEMORY -jar server.jar --nogui', env: [{ key: 'EULA', description: 'Accept EULA', default: 'TRUE', options: ['TRUE'], required: true }, { key: 'VERSION', description: 'Minecraft version', default: 'LATEST', required: false, placeholder: '1.20.4' }, { key: 'MEMORY', description: 'Memory allocation', default: '2g', required: false, placeholder: '2g' }] },
  { name: 'Alpine Linux', description: 'Minimal Linux distribution for testing', category: 'tool', image: 'alpine:latest', icon: 'tool', command: '/bin/sh', env: [] },
  { name: 'Ubuntu', description: 'Full Linux distribution', category: 'tool', image: 'ubuntu:latest', icon: 'tool', command: '/bin/bash', env: [] },
]

app.get('/api/blueprints', (req, res) => res.json(blueprints))
app.get('/api/blueprints/category/:category', (req, res) => {
  res.json(blueprints.filter(b => b.category === req.params.category))
})

app.post('/api/blueprints/:name/launch', authMiddleware, (req, res) => {
  const bp = blueprints.find(b => b.name === req.params.name)
  if (!bp) return res.status(404).json({ error: 'Blueprint not found' })
  containerIdCounter++
  const id = crypto.randomBytes(16).toString('hex')
  const container = {
    id,
    name: bp.name.toLowerCase().replace(/\s+/g, '-') + '-' + containerIdCounter,
    image: bp.image,
    status: 'running',
    created: new Date().toISOString(),
    ports: [{ host: '8080', container: '80', protocol: 'tcp' }],
    pid: Math.floor(Math.random() * 50000) + 1000,
    ip: `10.0.2.${containerIdCounter + 1}`,
    user_id: req.user.sub,
    memory: '',
    cpus: '',
    cmd: bp.command || '',
  }
  containers.push(container)
  res.status(201).json(container)
})

// Categories
const categories = [
  { name: 'bot', icon: 'bot', description: 'Bots and automation', default_ram: '256m', default_cpu: '0.5' },
  { name: 'web', icon: 'web', description: 'Web servers', default_ram: '256m', default_cpu: '0.5' },
  { name: 'database', icon: 'database', description: 'Databases', default_ram: '512m', default_cpu: '1' },
  { name: 'game', icon: 'game', description: 'Game servers', default_ram: '2g', default_cpu: '2' },
  { name: 'tool', icon: 'tool', description: 'Utility tools', default_ram: '128m', default_cpu: '0.5' },
  { name: 'runtime', icon: 'runtime', description: 'Language runtimes', default_ram: '256m', default_cpu: '0.5' },
]
app.get('/api/categories', (req, res) => res.json(categories))

// Catalog
app.get('/api/catalog', (req, res) => {
  res.json([
    { name: 'Nginx', description: 'Web server', category: 'web' },
    { name: 'Redis', description: 'In-memory cache', category: 'database' },
    { name: 'PostgreSQL', description: 'Relational DB', category: 'database' },
    { name: 'Node.js', description: 'JavaScript runtime', category: 'runtime' },
    { name: 'Python', description: 'Python runtime', category: 'runtime' },
  ])
})

// Config
let dckToml = `# dck.toml
[web]
image = "nginx:latest"
ports = ["80:80"]
restart = "always"

[db]
image = "postgres:16"
env = ["POSTGRES_PASSWORD=secret"]
memory = "512m"`

app.get('/api/config', authMiddleware, (req, res) => res.json({ content: dckToml }))
app.post('/api/config', authMiddleware, (req, res) => {
  dckToml = req.body.content
  res.json({ status: 'ok' })
})
app.post('/api/config/deploy', authMiddleware, (req, res) => res.json({ status: 'deployed' }))
app.post('/api/config/down', authMiddleware, (req, res) => res.json({ status: 'down' }))

// Projects
app.get('/api/projects/scan', authMiddleware, (req, res) => {
  res.json([
    {
      path: '/home/user/projects/myapp/dck.json',
      dir: 'myapp',
      config: {
        version: '1.0',
        name: 'My App',
        category: 'web',
        container: { image: 'nginx:latest', name: 'myapp', ports: ['80:80'], volumes: [], env: [], memory: '256m', cpus: '0.5', restart: 'no', network: 'bridge', command: '' },
        deploy: { auto_deploy: false, profile: '' },
        meta: {},
      },
      container: null,
      status: 'created',
    },
  ])
})

// Settings
app.get('/api/settings', authMiddleware, (req, res) => res.json(settings))
app.put('/api/settings', authMiddleware, (req, res) => {
  Object.assign(settings, req.body)
  res.json(settings)
})

// Version
app.get('/api/version', authMiddleware, (req, res) => {
  res.json({
    version: '2.0.0',
    latest: '2.0.0',
    changelog: '',
    update_available: false,
    dck_version: '1.5.0',
    dck_latest: '1.5.0',
    dck_update_available: false,
  })
})

// Templates
app.get('/api/templates', authMiddleware, (req, res) => res.json([]))
app.post('/api/templates', authMiddleware, (req, res) => res.json({ id: crypto.randomUUID(), ...req.body }))

// Admin: Users
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  res.json(users.map(u => ({ id: u.id, username: u.username, role: u.role, created_at: u.created_at })))
})

app.post('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const { username, password, role } = req.body
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' })
  }
  const newUser = { id: crypto.randomUUID(), username, password, role: role || 'user', created_at: new Date().toISOString() }
  users.push(newUser)
  res.json({ id: newUser.id, username: newUser.username, role: newUser.role, created_at: newUser.created_at })
})

app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const user = users.find(u => u.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  Object.assign(user, req.body)
  res.json({ id: user.id, username: user.username, role: user.role, created_at: user.created_at })
})

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'User not found' })
  users.splice(idx, 1)
  res.status(204).send()
})

// SSE endpoint for real-time updates
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const sendEvent = () => {
    const data = JSON.stringify({
      system: {
        os: 'Linux', arch: 'x86_64', kernel: '6.8.0', uptime: '3d 12h 45m',
        cpu_model: 'AMD Ryzen 9 7950X', cpu_cores: 16,
      },
      containers: {
        total: containers.length,
        running: containers.filter(c => c.status === 'running').length,
        stopped: containers.filter(c => c.status !== 'running').length,
      },
      images: images.length,
      containers_list: containers,
      cpu_percent: Math.random() * 30 + 10,
      memory_percent: Math.random() * 20 + 35,
      memory_used: 8240000000,
      memory_total: 17179869184,
    })
    res.write(`data: ${data}\n\n`)
  }

  sendEvent()
  const interval = setInterval(sendEvent, 5000)
  req.on('close', () => clearInterval(interval))
})

// WebSocket console (mock)
const WebSocket = require('ws')
const wss = new WebSocket.Server({ noServer: true })

app.server = app.listen(8080, () => {
  console.log('🚀 dck Mock API Server running on http://localhost:8080')
  console.log('   Login with admin / admin')
})

app.server.on('upgrade', (request, socket, head) => {
  const pathname = request.url.split('?')[0]
  if (pathname.startsWith('/api/console/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.on('message', (data) => {
        const msg = data.toString()
        if (msg.startsWith('{')) {
          try { const d = JSON.parse(msg); if (d.type === 'resize') return } catch {}
        }
        // Echo back for shell simulation
        ws.send(`\x1b[32m$\x1b[0m `)
      })
      ws.send('\x1b[32mWelcome to dck console (mock)\x1b[0m\r\n\x1b[32m$\x1b[0m ')
    })
  }
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  app.server.close()
  process.exit(0)
})
