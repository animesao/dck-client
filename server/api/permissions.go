package api

import "encoding/json"

// Granular container permissions (like Pterodactyl)
type GranularPerms struct {
	Console        bool `json:"console"`
	ConsoleSend    bool `json:"console_send"`
	FilesRead      bool `json:"files_read"`
	FilesWrite     bool `json:"files_write"`
	FilesDelete    bool `json:"files_delete"`
	BackupCreate   bool `json:"backup_create"`
	BackupRestore  bool `json:"backup_restore"`
	BackupDelete   bool `json:"backup_delete"`
	ContainerStart bool `json:"container_start"`
	ContainerStop  bool `json:"container_stop"`
	ContainerRestart bool `json:"container_restart"`
	ContainerDelete bool `json:"container_delete"`
	ContainerEdit  bool `json:"container_edit"`
	PortsManage    bool `json:"ports_manage"`
	Collaborators  bool `json:"collaborators"`
}

// Expand preset or parse JSON permissions string into GranularPerms.
// Presets:
//   "view"  → console
//   "edit"  → console, console_send, files_read, files_write, container_start, container_stop, container_restart, container_edit, backup_create
//   "admin" → everything
func expandPerms(permission, permissionsJSON string) GranularPerms {
	// If there's a JSON permissions string, use it
	if permissionsJSON != "" {
		var gp GranularPerms
		if json.Unmarshal([]byte(permissionsJSON), &gp) == nil {
			return gp
		}
	}

	// Fall back to preset
	switch permission {
	case "admin":
		return GranularPerms{
			Console:        true,
			ConsoleSend:    true,
			FilesRead:      true,
			FilesWrite:     true,
			FilesDelete:    true,
			BackupCreate:   true,
			BackupRestore:  true,
			BackupDelete:   true,
			ContainerStart: true,
			ContainerStop:  true,
			ContainerRestart: true,
			ContainerDelete: true,
			ContainerEdit:  true,
			PortsManage:    true,
			Collaborators:  true,
		}
	case "edit":
		return GranularPerms{
			Console:        true,
			ConsoleSend:    true,
			FilesRead:      true,
			FilesWrite:     true,
			ContainerStart: true,
			ContainerStop:  true,
			ContainerRestart: true,
			ContainerEdit:  true,
			BackupCreate:   true,
		}
	case "view":
		return GranularPerms{
			Console: true,
		}
	default:
		return GranularPerms{}
	}
}

// hasPerm checks if the permission or JSON permissions string has a specific action.
func hasPerm(permission, permissionsJSON, action string) bool {
	gp := expandPerms(permission, permissionsJSON)
	switch action {
	case "console":
		return gp.Console
	case "console_send":
		return gp.ConsoleSend
	case "files_read":
		return gp.FilesRead
	case "files_write":
		return gp.FilesWrite
	case "files_delete":
		return gp.FilesDelete
	case "backup_create":
		return gp.BackupCreate
	case "backup_restore":
		return gp.BackupRestore
	case "backup_delete":
		return gp.BackupDelete
	case "container_start":
		return gp.ContainerStart
	case "container_stop":
		return gp.ContainerStop
	case "container_restart":
		return gp.ContainerRestart
	case "container_delete":
		return gp.ContainerDelete
	case "container_edit":
		return gp.ContainerEdit
	case "ports_manage":
		return gp.PortsManage
	case "collaborators":
		return gp.Collaborators
	}
	return false
}

// ContainerActions returns all granted actions for a given permission/permissions pair.
func containerActions(permission, permissionsJSON string) map[string]bool {
	gp := expandPerms(permission, permissionsJSON)
	return map[string]bool{
		"console":          gp.Console,
		"console_send":     gp.ConsoleSend,
		"files_read":       gp.FilesRead,
		"files_write":      gp.FilesWrite,
		"files_delete":     gp.FilesDelete,
		"backup_create":    gp.BackupCreate,
		"backup_restore":   gp.BackupRestore,
		"backup_delete":    gp.BackupDelete,
		"container_start":  gp.ContainerStart,
		"container_stop":   gp.ContainerStop,
		"container_restart": gp.ContainerRestart,
		"container_delete": gp.ContainerDelete,
		"container_edit":   gp.ContainerEdit,
		"ports_manage":     gp.PortsManage,
		"collaborators":    gp.Collaborators,
	}
}

func allContainerActions() []string {
	return []string{
		"console", "console_send",
		"files_read", "files_write", "files_delete",
		"backup_create", "backup_restore", "backup_delete",
		"container_start", "container_stop", "container_restart",
		"container_delete", "container_edit",
		"ports_manage", "collaborators",
	}
}
