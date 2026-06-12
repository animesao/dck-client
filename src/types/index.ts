export interface User {
  id: string
  username: string
  role: string
  created_at: string
}

export interface Container {
  id: string
  name: string
  image: string
  status: string
  created: string
  ports: PortMap[]
  pid?: number
  ip?: string
  user_id?: string
  username?: string
  memory?: string
  cpus?: string
  disk?: number
  cmd?: string
  entrypoint?: string
  restart?: string
  startup_script?: string
  node_id?: string
}

export interface PortMap {
  host: string
  container: string
  protocol: string
}

export interface VolumeMount {
  host: string
  container: string
}

export interface CreateContainerRequest {
  image: string
  name: string
  command?: string
  startup_script?: string
  ports?: string[]
  volumes?: string[]
  env?: string[]
  restart?: string
  memory?: string
  cpus?: string
  network?: string
  cap_add?: string[]
  cap_drop?: string[]
  dns?: string[]
  workdir?: string
  hostname?: string
  entrypoint?: string
  user?: string
  labels?: Record<string, string>
  healthcheck_cmd?: string
  user_id?: string
  node_id?: string
  healthcheck_interval?: string
  healthcheck_retries?: number
  disk?: string
}

export interface Image {
  name: string
  tag: string
  id: string
  size: string
  created: string
}

export interface DashboardStats {
  system: SystemInfo
  containers: {
    total: number
    running: number
    stopped: number
  }
  images: number
  containers_list: Container[]
  cpu_percent: number
  memory_percent: number
  memory_used: number
  memory_total: number
  disk_used: number
  disk_total: number
  users: number
  user_stats: UserStats[]
  user_limits?: UserLimits
}

export interface UserLimits {
  container_count: number
  container_limit: number
  memory_used_mb: number
  memory_limit: number
  cpu_used: number
  cpu_limit: number
  disk_used: number
  disk_limit: number
  port_count: number
  port_limit: number
}

export interface NodeInfo {
  id: string
  name: string
  url: string
  created_at: string
  online: boolean
  version?: string
  hostname?: string
  cpu_model?: string
  cpu_cores?: number
  cpu_percent?: number
  mem_total?: number
  mem_used?: number
  mem_percent?: number
  disk_total?: number
  disk_used?: number
  disk_percent?: number
  uptime?: string
}

export interface UserStats {
  id: string
  username: string
  role: string
  created_at: string
  container_count: number
  last_login?: string
  container_limit: number
  memory_limit: number
  cpu_limit: number
  disk_limit: number
  port_limit: number
}

export interface SystemInfo {
  os: string
  arch: string
  kernel: string
  uptime: string
  cpu_model: string
  cpu_cores: number
}

export interface ContainerStats {
  cpu: number
  memory: number
  memory_used: number
  memory_limit: number
  cpu_limit?: number
  disk_used?: number
  disk_total?: number
  disk_percent?: number
}

export interface Blueprint {
  name: string
  description: string
  category: string
  image: string
  icon: string
  env: BlueprintEnv[]
  ports?: string[]
  volumes?: string[]
  command?: string
  memory?: string
  cpus?: string
}

export interface BlueprintEnv {
  key: string
  description: string
  default?: string
  required: boolean
  options?: string[]
  advanced?: boolean
  placeholder?: string
}

export interface ProjectConfig {
  version: string
  name: string
  category: string
  container: {
    image: string
    name: string
    ports: string[]
    volumes: string[]
    env: string[]
    memory: string
    cpus: string
    restart: string
    network: string
    command: string
  }
  deploy: {
    auto_deploy: boolean
    profile: string
  }
  meta: Record<string, string>
}

export interface ProjectInfo {
  path: string
  dir: string
  config: ProjectConfig | null
  container: Container | null
  status: string
}

export interface CategoryPreset {
  name: string
  icon: string
  description: string
  default_ram: string
  default_cpu: string
}

export interface ContainerTemplate {
  id: string
  name: string
  description: string
  image: string
  config: CreateContainerRequest
  created: string
}

export interface AppSettings {
  dck_bin: string
  dck_data: string
  registration: boolean
  allow_user_containers: boolean
  allow_user_ports: boolean
  allow_user_images: boolean
  allow_user_templates: boolean
  allow_user_projects: boolean
  port_range_start: number
  port_range_end: number
  disabled_features: string
  default_container_limit: number
  default_memory_limit: number
  default_cpu_limit: number
  default_disk_limit: number
  default_port_limit: number
}

export interface VersionInfo {
  version: string
  latest: string
  changelog: string
  update_available: boolean
  dck_version: string
  dck_latest: string
  dck_update_available: boolean
}

export interface DeployConfig {
  content: string
}

export interface Category {
  name: string
  icon: string
  description: string
  default_ram: string
  default_cpu: string
}

export interface ExecResult {
  output: string
  exit_code: number
}

export interface StatEvent {
  type: 'stats'
  data: DashboardStats
}

export interface ContainerEvent {
  type: 'containers'
  data: Container[]
}

export type SSEEvent = StatEvent | ContainerEvent

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export interface ContainerLogs {
  logs: string
}

export interface ContainerState {
  state: Record<string, unknown>
}

export interface AuthResponse {
  token: string
  user: User
  twofa_required?: boolean
  twofa_token?: string
}

export interface CatalogItem {
  name: string
  description: string
  category: string
}

export interface ContainerPermission {
  user_id: string
  username: string
  container_id: string
  permission: 'view' | 'edit' | 'admin'
  permissions: string
  created_at: string
}

export interface ActivityLog {
  id: number
  user_id: string
  username?: string
  container_id?: string
  action: string
  details: string
  created_at: string
}
