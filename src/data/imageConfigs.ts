export interface ImageConfig {
  id: string
  name: string
  category: string
  description: string
  image: string
  command: string
  env: EnvDef[]
  ports: string[]
  memory?: string
  cpus?: string
}

export interface EnvDef {
  key: string
  label: string
  defaultValue: string
  description: string
  options?: string[]
}

export const imageConfigs: ImageConfig[] = [
  {
    id: 'minecraft-vanilla',
    name: 'Minecraft (Vanilla)',
    category: 'Games',
    description: 'Official Minecraft Server from Mojang',
    image: 'itzg/minecraft-server',
    command: '',
    env: [
      { key: 'EULA', label: 'EULA', defaultValue: 'TRUE', description: 'Must be TRUE to accept Mojang EULA', options: ['TRUE'] },
      { key: 'TYPE', label: 'Server Type', defaultValue: 'VANILLA', description: 'Server software type', options: ['VANILLA', 'FORGE', 'FABRIC', 'PAPER', 'SPIGOT', 'BUKKIT', 'SPONGEVANILLA', 'PURPUR'] },
      { key: 'VERSION', label: 'Minecraft Version', defaultValue: 'LATEST', description: 'Minecraft version (e.g. 1.20.4, LATEST)' },
      { key: 'MEMORY', label: 'Memory', defaultValue: '2G', description: 'RAM allocation for Java' },
      { key: 'DIFFICULTY', label: 'Difficulty', defaultValue: 'easy', description: 'Game difficulty', options: ['peaceful', 'easy', 'normal', 'hard'] },
      { key: 'MODE', label: 'Game Mode', defaultValue: 'survival', description: '', options: ['survival', 'creative', 'adventure', 'spectator'] },
      { key: 'MAX_PLAYERS', label: 'Max Players', defaultValue: '20', description: 'Maximum player count' },
      { key: 'MOTD', label: 'MOTD', defaultValue: 'A Minecraft Server', description: 'Message of the Day' },
    ],
    ports: ['25565:25565'],
    memory: '1G',
  },
  {
    id: 'minecraft-forge',
    name: 'Minecraft (Forge)',
    category: 'Games',
    description: 'Minecraft Forge modded server',
    image: 'itzg/minecraft-server',
    command: '',
    env: [
      { key: 'EULA', label: 'EULA', defaultValue: 'TRUE', description: 'Must be TRUE' },
      { key: 'TYPE', label: 'Server Type', defaultValue: 'FORGE', description: '', options: ['FORGE', 'FABRIC', 'PAPER'] },
      { key: 'VERSION', label: 'Minecraft Version', defaultValue: 'LATEST', description: '' },
      { key: 'MEMORY', label: 'Memory', defaultValue: '4G', description: 'RAM allocation' },
      { key: 'FORGEVERSION', label: 'Forge Version', defaultValue: 'RECOMMENDED', description: 'Forge build (RECOMMENDED or specific version)' },
    ],
    ports: ['25565:25565'],
    memory: '4G',
  },
  {
    id: 'minecraft-paper',
    name: 'Minecraft (Paper)',
    category: 'Games',
    description: 'High-performance PaperMC server',
    image: 'itzg/minecraft-server',
    command: '',
    env: [
      { key: 'EULA', label: 'EULA', defaultValue: 'TRUE', description: '' },
      { key: 'TYPE', label: 'Server Type', defaultValue: 'PAPER', description: '', options: ['PAPER', 'PURPUR'] },
      { key: 'VERSION', label: 'Minecraft Version', defaultValue: 'LATEST', description: '' },
      { key: 'MEMORY', label: 'Memory', defaultValue: '2G', description: '' },
      { key: 'PAPER_USE_MODERN_DISPATCHER', label: 'Modern Dispatcher', defaultValue: 'true', description: '', options: ['true', 'false'] },
    ],
    ports: ['25565:25565'],
    memory: '2G',
  },
  {
    id: 'node',
    name: 'Node.js',
    category: 'Development',
    description: 'Node.js runtime for JavaScript applications',
    image: 'node',
    command: 'node index.js',
    env: [
      { key: 'NODE_ENV', label: 'Node Environment', defaultValue: 'production', description: '', options: ['development', 'production', 'test'] },
    ],
    ports: ['3000:3000'],
  },
  {
    id: 'python',
    name: 'Python',
    category: 'Development',
    description: 'Python runtime',
    image: 'python',
    command: 'python main.py',
    env: [
      { key: 'PYTHONUNBUFFERED', label: 'Unbuffered Output', defaultValue: '1', description: '', options: ['0', '1'] },
    ],
    ports: ['8000:8000'],
  },
  {
    id: 'rust',
    name: 'Rust',
    category: 'Development',
    description: 'Rust programming language',
    image: 'rust',
    command: 'cargo run --release',
    env: [],
    ports: ['8080:8080'],
  },
  {
    id: 'go',
    name: 'Go',
    category: 'Development',
    description: 'Go programming language',
    image: 'golang',
    command: 'go run main.go',
    env: [],
    ports: ['8080:8080'],
  },
  {
    id: 'ubuntu',
    name: 'Ubuntu',
    category: 'Operating Systems',
    description: 'Base Ubuntu system',
    image: 'ubuntu',
    command: 'bash',
    env: [],
    ports: [],
  },
  {
    id: 'alpine',
    name: 'Alpine',
    category: 'Operating Systems',
    description: 'Lightweight Alpine Linux',
    image: 'alpine',
    command: 'sh',
    env: [],
    ports: [],
  },
  {
    id: 'nginx',
    name: 'Nginx',
    category: 'Web Servers',
    description: 'High-performance web server',
    image: 'nginx',
    command: 'nginx -g "daemon off;"',
    env: [],
    ports: ['80:80', '443:443'],
  },
  {
    id: 'apache',
    name: 'Apache HTTP',
    category: 'Web Servers',
    description: 'Apache HTTP Server',
    image: 'httpd',
    command: 'httpd-foreground',
    env: [],
    ports: ['80:80'],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    category: 'Databases',
    description: 'MySQL database server',
    image: 'mysql',
    command: 'mysqld',
    env: [
      { key: 'MYSQL_ROOT_PASSWORD', label: 'Root Password', defaultValue: 'rootpass', description: '' },
      { key: 'MYSQL_DATABASE', label: 'Database', defaultValue: 'app', description: '' },
      { key: 'MYSQL_USER', label: 'User', defaultValue: 'user', description: '' },
      { key: 'MYSQL_PASSWORD', label: 'User Password', defaultValue: 'pass', description: '' },
    ],
    ports: ['3306:3306'],
    memory: '512m',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'Databases',
    description: 'PostgreSQL database server',
    image: 'postgres',
    command: 'postgres -D /var/lib/postgresql/data',
    env: [
      { key: 'POSTGRES_PASSWORD', label: 'Password', defaultValue: 'postgres', description: '' },
      { key: 'POSTGRES_DB', label: 'Database', defaultValue: 'app', description: '' },
      { key: 'POSTGRES_USER', label: 'User', defaultValue: 'user', description: '' },
    ],
    ports: ['5432:5432'],
    memory: '512m',
  },
  {
    id: 'mongo',
    name: 'MongoDB',
    category: 'Databases',
    description: 'MongoDB database server',
    image: 'mongo',
    command: 'mongod',
    env: [
      { key: 'MONGO_INITDB_ROOT_USERNAME', label: 'Root Username', defaultValue: 'admin', description: '' },
      { key: 'MONGO_INITDB_ROOT_PASSWORD', label: 'Root Password', defaultValue: 'adminpass', description: '' },
    ],
    ports: ['27017:27017'],
    memory: '512m',
  },
  {
    id: 'redis',
    name: 'Redis',
    category: 'Databases',
    description: 'In-memory data store',
    image: 'redis',
    command: 'redis-server',
    env: [
      { key: 'REDIS_PASSWORD', label: 'Password', defaultValue: '', description: 'Leave empty for no auth' },
    ],
    ports: ['6379:6379'],
    memory: '256m',
  },
  {
    id: 'maria',
    name: 'MariaDB',
    category: 'Databases',
    description: 'MariaDB database server',
    image: 'mariadb',
    command: 'mariadbd',
    env: [
      { key: 'MARIADB_ROOT_PASSWORD', label: 'Root Password', defaultValue: 'rootpass', description: '' },
      { key: 'MARIADB_DATABASE', label: 'Database', defaultValue: 'app', description: '' },
      { key: 'MARIADB_USER', label: 'User', defaultValue: 'user', description: '' },
      { key: 'MARIADB_PASSWORD', label: 'User Password', defaultValue: 'pass', description: '' },
    ],
    ports: ['3306:3306'],
    memory: '512m',
  },
  {
    id: 'discord-py',
    name: 'Discord Bot (Python)',
    category: 'Bots',
    description: 'Discord bot using discord.py library',
    image: 'python',
    command: 'python bot.py',
    env: [
      { key: 'DISCORD_TOKEN', label: 'Bot Token', defaultValue: '', description: 'Discord bot token (required)' },
    ],
    ports: [],
    memory: '256m',
  },
  {
    id: 'discord-js',
    name: 'Discord Bot (JavaScript)',
    category: 'Bots',
    description: 'Discord bot using discord.js',
    image: 'node',
    command: 'node index.js',
    env: [
      { key: 'DISCORD_TOKEN', label: 'Bot Token', defaultValue: '', description: '' },
    ],
    ports: [],
    memory: '256m',
  },
]

export const imageCategories = [...new Set(imageConfigs.map(c => c.category))]
