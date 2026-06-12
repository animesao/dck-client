package dck

type ClientInterface interface {
	ListContainers(all bool) ([]Container, error)
	GetContainer(id string) (*Container, error)
	CreateContainer(image, name, ports, volumes, env, restart, memory, cpus, network, cmd, startupScript string) (string, error)
	StartContainer(id string) error
	StopContainer(id string) error
	RestartContainer(id string) error
	RemoveContainer(id string, force bool) error
	SaveContainer(ct *Container) error
	UpdateContainerCmd(id, cmd string) error
	UpdateContainerStartupScript(id, script string) error
	UpdateContainerRestart(id, restart string) error
	Exec(id string, command string) (string, error)
	Logs(id string) (string, error)

	ListImages() ([]string, error)
	PullImage(name string) error
	RemoveImage(name string) error

	BackupDir() string
	ConsoleSocketPath(id string) string
	ConsoleWebSocketURL(id string) string
	ContainerStatePath(id string) string
	ContainersDir() string
	OverlayPath(id string) string
	OverlayDiffPath(id string) string
	LogPath(id string) string
	ReadImageWorkingDir(imageName, imageTag string) string
}
