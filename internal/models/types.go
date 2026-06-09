package models

import "time"

type Status string

const (
	StatusCreated Status = "created"
	StatusRunning Status = "running"
	StatusStopped Status = "stopped"
)

type PortMap struct {
	HostPort      int    `json:"host_port"`
	ContainerPort int    `json:"container_port"`
	Protocol      string `json:"protocol"`
}

type VolumeMount struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

type HealthcheckConfig struct {
	Cmd      string `json:"cmd"`
	Interval int    `json:"interval,omitempty"`
	Retries  int    `json:"retries,omitempty"`
	Timeout  int    `json:"timeout,omitempty"`
}

type Container struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	ImageName    string             `json:"image_name"`
	ImageTag     string             `json:"image_tag"`
	PID          int                `json:"pid"`
	Status       Status             `json:"status"`
	Cmd          []string           `json:"cmd"`
	CreatedAt    time.Time          `json:"created_at"`
	Ports        []PortMap          `json:"ports,omitempty"`
	Volumes      []VolumeMount      `json:"volumes,omitempty"`
	Env          []string           `json:"env,omitempty"`
	Hostname     string             `json:"hostname,omitempty"`
	Restart      string             `json:"restart,omitempty"`
	IP           string             `json:"ip,omitempty"`
	Detach       bool               `json:"detach,omitempty"`
	Interactive  bool               `json:"interactive,omitempty"`
	TTY          bool               `json:"tty,omitempty"`
	RemoveOnExit bool               `json:"remove_on_exit,omitempty"`
	StoppedByUser bool              `json:"stopped_by_user,omitempty"`
	MemoryLimit   int64             `json:"memory_limit,omitempty"`
	CPUCount      float64           `json:"cpu_count,omitempty"`
	CgroupPath    string            `json:"cgroup_path,omitempty"`
	WorkingDir    string            `json:"working_dir,omitempty"`
	Healthcheck  *HealthcheckConfig `json:"healthcheck,omitempty"`
}

type Image struct {
	Name   string `json:"name"`
	Tag    string `json:"tag"`
	Digest string `json:"digest,omitempty"`
	Size   int64  `json:"size,omitempty"`
}

type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
}

type ContainerTemplate struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Image       string    `json:"image"`
	Command     string    `json:"command,omitempty"`
	Ports       string    `json:"ports,omitempty"`
	Volumes     string    `json:"volumes,omitempty"`
	Env         string    `json:"env,omitempty"`
	Restart     string    `json:"restart,omitempty"`
	Hostname    string    `json:"hostname,omitempty"`
	Healthcheck string    `json:"healthcheck,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type ConfigFile struct {
	Container map[string]ContainerConfig `toml:"container"`
}

type ContainerConfig struct {
	Image       string            `toml:"image"`
	Command     string            `toml:"command,omitempty"`
	Ports       []string          `toml:"ports,omitempty"`
	Volumes     []string          `toml:"volumes,omitempty"`
	Env         map[string]string `toml:"env,omitempty"`
	Restart     string            `toml:"restart,omitempty"`
	Hostname    string            `toml:"hostname,omitempty"`
	Memory      int64             `toml:"memory,omitempty"`
	CPUs        float64           `toml:"cpus,omitempty"`
	WorkDir     string            `toml:"workdir,omitempty"`
	Healthcheck *HealthcheckConfig `toml:"healthcheck,omitempty"`
}

type DashboardStats struct {
	TotalContainers  int            `json:"total_containers"`
	RunningCount     int            `json:"running_count"`
	StoppedCount     int            `json:"stopped_count"`
	ImagesCount      int            `json:"images_count"`
	SystemInfo       SystemInfo     `json:"system_info"`
	ContainerStats   []ContainerCPU `json:"container_stats,omitempty"`
}

type SystemInfo struct {
	Hostname    string `json:"hostname"`
	OS          string `json:"os"`
	Arch        string `json:"arch"`
	Uptime      string `json:"uptime"`
	CPU         string `json:"cpu"`
	Memory      string `json:"memory"`
	Disk        string `json:"disk"`
	DckVersion  string `json:"dck_version"`
}

type ContainerCPU struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	CPU        string `json:"cpu"`
	Mem        string `json:"mem"`
	MemUsage   int64  `json:"mem_usage"`
	MemLimit   int64  `json:"mem_limit"`
	CPUPercent float64 `json:"cpu_percent"`
	MemPercent float64 `json:"mem_percent"`
}

type CreateContainerRequest struct {
	Image          string            `json:"image"`
	Name           string            `json:"name"`
	Command        string            `json:"command"`
	Detach         bool              `json:"detach"`
	Interactive    bool              `json:"interactive"`
	TTY            bool              `json:"tty"`
	RemoveOnExit   bool              `json:"remove_on_exit"`
	Hostname       string            `json:"hostname"`
	Restart        string            `json:"restart"`
	Memory         string            `json:"memory,omitempty"`
	CPUs           float64           `json:"cpus,omitempty"`
	WorkingDir     string            `json:"workdir,omitempty"`
	Ports          []string          `json:"ports"`
	Volumes        []string          `json:"volumes"`
	Env            []string          `json:"env"`
	Entrypoint     string            `json:"entrypoint,omitempty"`
	NetworkMode    string            `json:"network_mode,omitempty"`
	Labels         map[string]string `json:"labels,omitempty"`
	CapAdd         []string          `json:"cap_add,omitempty"`
	CapDrop        []string          `json:"cap_drop,omitempty"`
	User           string            `json:"user,omitempty"`
	ReadonlyRootfs bool              `json:"readonly_rootfs,omitempty"`
	NoNewPrivileges bool             `json:"no_new_privileges,omitempty"`
	Sysctls        map[string]string `json:"sysctls,omitempty"`
	Ulimits        map[string]string `json:"ulimits,omitempty"`
	DNS            []string          `json:"dns,omitempty"`
	Healthcheck struct {
		Cmd      string `json:"cmd"`
		Interval int    `json:"interval"`
		Retries  int    `json:"retries"`
		Timeout  int    `json:"timeout"`
	} `json:"healthcheck"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type TokenResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

type PullImageRequest struct {
	Reference string `json:"reference"`
}

type DeployConfigRequest struct {
	Config string `json:"config"`
	Filter string `json:"filter,omitempty"`
}

type Settings struct {
	ID              int64  `json:"id"`
	DckBinaryPath   string `json:"dck_binary_path"`
	DckDataDir      string `json:"dck_data_dir"`
	ListenAddr      string `json:"listen_addr"`
	RegistrationOpen bool  `json:"registration_open"`
}

type CatalogItem struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Image       string `json:"image"`
	DefaultPort string `json:"default_port"`
	DefaultCmd  string `json:"default_cmd,omitempty"`
	EnvTips     string `json:"env_tips,omitempty"`
}

type BlueprintEnv struct {
	Key         string   `json:"key"`
	Description string   `json:"description"`
	Default     string   `json:"default,omitempty"`
	Required    bool     `json:"required"`
	Options     []string `json:"options,omitempty"`
	Advanced    bool     `json:"advanced,omitempty"`
	Placeholder string   `json:"placeholder,omitempty"`
}

type DeploymentConfig struct {
	Blueprint   string            `json:"blueprint,omitempty"`
	Image       string            `json:"image"`
	Port        string            `json:"port,omitempty"`
	Command     string            `json:"command,omitempty"`
	Restart     string            `json:"restart,omitempty"`
	Memory      string            `json:"memory,omitempty"`
	CPUs        float64           `json:"cpus,omitempty"`
	WorkingDir  string            `json:"workdir,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	Volumes     []string          `json:"volumes,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

type Blueprint struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Category    string         `json:"category"`
	Icon        string         `json:"icon"`
	Image       string         `json:"image"`
	DefaultPort string         `json:"default_port,omitempty"`
	DefaultCmd  string         `json:"default_cmd,omitempty"`
	Env         []BlueprintEnv `json:"env,omitempty"`
	EnvTips     string         `json:"env_tips,omitempty"`
	Volumes     []string       `json:"volumes,omitempty"`
	IsMulti     bool           `json:"is_multi"`
}

type CategoryPreset struct {
	Name        string  `json:"name"`
	Icon        string  `json:"icon"`
	Description string  `json:"description"`
	DefaultRAM  string  `json:"default_ram"`
	DefaultCPU  float64 `json:"default_cpu"`
}

type Healthcheck struct {
	Cmd      string `json:"cmd,omitempty"`
	Interval int    `json:"interval,omitempty"`
	Retries  int    `json:"retries,omitempty"`
	Timeout  int    `json:"timeout,omitempty"`
}

type ContainerConfigV2 struct {
	Image          string            `json:"image"`
	Name           string            `json:"name,omitempty"`
	Command        string            `json:"command,omitempty"`
	Entrypoint     string            `json:"entrypoint,omitempty"`
	Workdir        string            `json:"workdir,omitempty"`
	Restart        string            `json:"restart,omitempty"`
	Hostname       string            `json:"hostname,omitempty"`
	Interactive    bool              `json:"interactive,omitempty"`
	TTY            bool              `json:"tty,omitempty"`
	RemoveOnExit   bool              `json:"remove_on_exit,omitempty"`
	Ports          []string          `json:"ports,omitempty"`
	Env            map[string]string `json:"env,omitempty"`
	Volumes        []string          `json:"volumes,omitempty"`
	Memory         string            `json:"memory,omitempty"`
	CPUs           float64           `json:"cpus,omitempty"`
	Healthcheck    *Healthcheck      `json:"healthcheck,omitempty"`
	NetworkMode    string            `json:"network_mode,omitempty"`
	Labels         map[string]string `json:"labels,omitempty"`
	CapAdd         []string          `json:"cap_add,omitempty"`
	CapDrop        []string          `json:"cap_drop,omitempty"`
	User           string            `json:"user,omitempty"`
	ReadonlyRootfs bool              `json:"readonly_rootfs,omitempty"`
	NoNewPrivileges bool             `json:"no_new_privileges,omitempty"`
	Sysctls        map[string]string `json:"sysctls,omitempty"`
	Ulimits        map[string]string `json:"ulimits,omitempty"`
	DNS            []string          `json:"dns,omitempty"`
}

type DeploySettings struct {
	DataDir    string              `json:"data_dir,omitempty"`
	AutoStart  bool                `json:"auto_start,omitempty"`
	PreHook    string              `json:"pre_hook,omitempty"`
	PostHook   string              `json:"post_hook,omitempty"`
	Profiles   map[string]*Profile `json:"profiles,omitempty"`
}

type Profile struct {
	Memory string  `json:"memory,omitempty"`
	CPUs   float64 `json:"cpus,omitempty"`
	Env    map[string]string `json:"env,omitempty"`
}

type MetaInfo struct {
	Description string   `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Icon        string   `json:"icon,omitempty"`
}

type BlueprintRef struct {
	Name string            `json:"name"`
	Env  map[string]string `json:"env,omitempty"`
}

type ProjectConfig struct {
	Version   string            `json:"version"`
	Name      string            `json:"name"`
	Category  string            `json:"category,omitempty"`
	Container ContainerConfigV2 `json:"container"`
	Blueprint *BlueprintRef     `json:"blueprint,omitempty"`
	Deploy    *DeploySettings   `json:"deploy,omitempty"`
	Meta      *MetaInfo         `json:"meta,omitempty"`
}

type ProjectInfo struct {
	Path      string           `json:"path"`
	Dir       string           `json:"dir"`
	Config    *ProjectConfig   `json:"config"`
	Container *Container       `json:"container,omitempty"`
	Status    string           `json:"status"`
}
