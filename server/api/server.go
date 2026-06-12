package api

import (
	"net/http"
	"os"
	"path/filepath"

	"dck-panel/db"
	"dck-panel/dck"
)

type Server struct {
	store     *db.Store
	dck       dck.ClientInterface
	dckHome   string
	serveDir  string
	jwtSecret string
	sftpPort  string
}

func NewServer(store *db.Store, dckClient dck.ClientInterface, dckHome, serveDir string) *Server {
	return &Server{
		store:    store,
		dck:      dckClient,
		dckHome:  dckHome,
		serveDir: serveDir,
		jwtSecret: "dck-panel-secret-change-in-production",
	}
}

func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/auth/login", noAuth(s.handleLogin))
	mux.HandleFunc("POST /api/auth/register", noAuth(s.handleRegister))
	mux.HandleFunc("GET /api/auth/me", s.auth(s.handleMe))

	mux.HandleFunc("GET /api/system", s.auth(s.handleSystem))

	mux.HandleFunc("GET /api/containers", s.auth(s.handleListContainers))
	mux.HandleFunc("POST /api/containers", s.auth(s.handleCreateContainer))
	mux.HandleFunc("GET /api/containers/{id}", s.auth(s.requireContainerAccess(s.handleGetContainer)))
	mux.HandleFunc("DELETE /api/containers/{id}", s.auth(s.requirePerm("container_delete")(s.handleRemoveContainer)))
	mux.HandleFunc("POST /api/containers/{id}/start", s.auth(s.requirePerm("container_start")(s.handleStartContainer)))
	mux.HandleFunc("POST /api/containers/{id}/stop", s.auth(s.requirePerm("container_stop")(s.handleStopContainer)))
	mux.HandleFunc("POST /api/containers/{id}/restart", s.auth(s.requirePerm("container_restart")(s.handleRestartContainer)))
	mux.HandleFunc("GET /api/containers/{id}/logs", s.auth(s.requireContainerAccess(s.handleLogs)))
	mux.HandleFunc("POST /api/containers/{id}/exec", s.auth(s.requirePerm("console_send")(s.handleExec)))
	mux.HandleFunc("GET /api/containers/{id}/stats", s.auth(s.requireContainerAccess(s.handleContainerStats)))
	mux.HandleFunc("GET /api/containers/{id}/state", s.auth(s.requireContainerAccess(s.handleContainerState)))
	mux.HandleFunc("GET /api/containers/{id}/console", s.auth(s.requireContainerAccess(s.handleConsole)))

	mux.HandleFunc("GET /api/containers/{id}/files", s.auth(s.requirePerm("files_read")(s.handleListFiles)))
	mux.HandleFunc("GET /api/containers/{id}/files/read", s.auth(s.requirePerm("files_read")(s.handleReadFile)))
	mux.HandleFunc("POST /api/containers/{id}/files/write", s.auth(s.requirePerm("files_write")(s.handleWriteFile)))
	mux.HandleFunc("POST /api/containers/{id}/files/upload", s.auth(s.requirePerm("files_write")(s.handleUploadFile)))
	mux.HandleFunc("DELETE /api/containers/{id}/files", s.auth(s.requirePerm("files_delete")(s.handleDeleteFile)))
	mux.HandleFunc("POST /api/containers/{id}/files/mkdir", s.auth(s.requirePerm("files_write")(s.handleMkdir)))
	mux.HandleFunc("PUT /api/containers/{id}/files/rename", s.auth(s.requirePerm("files_write")(s.handleRenameFile)))

	mux.HandleFunc("GET /api/containers/{id}/backups", s.auth(s.requireContainerAccess(s.handleListBackups)))
	mux.HandleFunc("POST /api/containers/{id}/backups", s.auth(s.requirePerm("backup_create")(s.handleCreateBackup)))
	mux.HandleFunc("POST /api/containers/{id}/backups/{backup}/restore", s.auth(s.requirePerm("backup_restore")(s.handleRestoreBackup)))
	mux.HandleFunc("GET /api/containers/{id}/backups/{backup}/download", s.auth(s.requireContainerAccess(s.handleDownloadBackup)))
	mux.HandleFunc("DELETE /api/containers/{id}/backups/{backup}", s.auth(s.requirePerm("backup_delete")(s.handleDeleteBackup)))

	mux.HandleFunc("GET /api/containers/{id}/config", s.auth(s.requireContainerAccess(s.handleContainerConfig)))
	mux.HandleFunc("PUT /api/containers/{id}/config", s.auth(s.requirePerm("container_edit")(s.handleUpdateContainerConfig)))
	mux.HandleFunc("POST /api/containers/{id}/reinstall", s.auth(s.requirePerm("container_edit")(s.handleReinstallContainer)))
	mux.HandleFunc("POST /api/containers/{id}/ports", s.auth(s.admin(s.requirePerm("ports_manage")(s.handleAddContainerPort))))
	mux.HandleFunc("DELETE /api/containers/{id}/ports/{host_port}", s.auth(s.admin(s.requirePerm("ports_manage")(s.handleRemoveContainerPort))))
	mux.HandleFunc("PUT /api/containers/{id}/owner", s.auth(s.admin(s.handleUpdateContainerOwner)))

	mux.HandleFunc("GET /api/containers/{id}/collaborators", s.auth(s.requirePerm("collaborators")(s.handleListCollaborators)))
	mux.HandleFunc("POST /api/containers/{id}/collaborators", s.auth(s.requirePerm("collaborators")(s.handleAddCollaborator)))
	mux.HandleFunc("PUT /api/containers/{id}/collaborators/{user_id}", s.auth(s.requirePerm("collaborators")(s.handleUpdateCollaborator)))
	mux.HandleFunc("DELETE /api/containers/{id}/collaborators/{user_id}", s.auth(s.requirePerm("collaborators")(s.handleRemoveCollaborator)))

	mux.HandleFunc("GET /api/containers/{id}/actions", s.auth(s.handleContainerActions))

	mux.HandleFunc("GET /api/containers/{id}/activity", s.auth(s.requireContainerAccess(s.handleContainerActivity)))
	mux.HandleFunc("GET /api/activity", s.auth(s.handleUserActivity))

	mux.HandleFunc("GET /api/auth/2fa/status", s.auth(s.handleTwoFactorStatus))
	mux.HandleFunc("POST /api/auth/2fa/setup", s.auth(s.handleTwoFactorSetup))
	mux.HandleFunc("GET /api/auth/2fa/qr", s.auth(s.handleTwoFactorQR))
	mux.HandleFunc("POST /api/auth/2fa/verify", s.auth(s.handleTwoFactorVerify))
	mux.HandleFunc("POST /api/auth/2fa/disable", s.auth(s.handleTwoFactorDisable))

	mux.HandleFunc("PUT /api/auth/password", s.auth(s.handleChangePassword))

	mux.HandleFunc("GET /api/images", s.auth(s.handleListImages))
	mux.HandleFunc("POST /api/images/pull", s.auth(s.handlePullImage))
	mux.HandleFunc("DELETE /api/images/{name}/{tag}", s.auth(s.handleRemoveImage))

	mux.HandleFunc("GET /api/admin/users", s.auth(s.admin(s.handleAdminListUsers)))
	mux.HandleFunc("POST /api/admin/users", s.auth(s.admin(s.handleAdminCreateUser)))
	mux.HandleFunc("PUT /api/admin/users/{id}", s.auth(s.admin(s.handleAdminUpdateUser)))
	mux.HandleFunc("DELETE /api/admin/users/{id}", s.auth(s.admin(s.handleAdminDeleteUser)))
	mux.HandleFunc("GET /api/admin/user-stats", s.auth(s.admin(s.handleAdminUserStats)))
	mux.HandleFunc("PUT /api/admin/users/{id}/limits", s.auth(s.admin(s.handleAdminUpdateUserLimits)))
	mux.HandleFunc("GET /api/admin/activity", s.auth(s.admin(s.handleAdminActivity)))
	mux.HandleFunc("GET /api/admin/settings", s.auth(s.admin(s.handleAdminGetSettings)))
	mux.HandleFunc("PUT /api/admin/settings", s.auth(s.admin(s.handleAdminUpdateSettings)))

	mux.HandleFunc("GET /api/settings", s.auth(s.handleGetSettings))
	mux.HandleFunc("PUT /api/settings", s.auth(s.admin(s.handleUpdateSettings)))

	mux.HandleFunc("GET /api/projects/scan", s.auth(s.handleScanProjects))
	mux.HandleFunc("DELETE /api/projects/delete", s.auth(s.handleDeleteProject))
	mux.HandleFunc("POST /api/projects/deploy", s.auth(s.handleDeployProject))

	mux.HandleFunc("GET /api/dashboard/stats", s.auth(s.handleDashboardStats))
	mux.HandleFunc("GET /api/version", s.auth(s.handleVersion))

	mux.HandleFunc("GET /api/public/settings", noAuth(s.handlePublicSettings))

	mux.HandleFunc("GET /api/containers/{id}/sftp", s.auth(s.requireContainerAccess(s.handleContainerSFTP)))
	mux.HandleFunc("POST /api/containers/{id}/sftp/regenerate", s.auth(s.requireContainerAccess(s.handleRegenerateSFTPPassword)))

	// Templates
	mux.HandleFunc("GET /api/templates", s.auth(s.handleListTemplates))
	mux.HandleFunc("POST /api/templates", s.auth(s.handleCreateTemplate))
	mux.HandleFunc("DELETE /api/templates/{id}", s.auth(s.handleDeleteTemplate))
	mux.HandleFunc("POST /api/templates/import", s.auth(s.handleImportTemplate))
	mux.HandleFunc("GET /api/containers/{id}/export-template", s.auth(s.requireContainerAccess(s.handleExportContainerTemplate)))
	mux.HandleFunc("POST /api/template-categories", s.auth(s.handleAddCategory))
	mux.HandleFunc("DELETE /api/template-categories/{name}", s.auth(s.handleDeleteCategory))

	// Catch-all for unmatched /api/* routes — always return JSON, never plain text "404 page not found"
	mux.HandleFunc("/api/{path...}", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "Endpoint not found")
	})

	return withCORS(s.frontendOrAPI(mux))
}

func (s *Server) frontendOrAPI(api http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/api" {
			api.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/" || r.URL.Path == "" {
			r.URL.Path = "/"
		}
		// Serve frontend
		getFrontendFS(s.serveDir).ServeHTTP(w, r)
	})
}

func getFrontendFS(serveDir string) http.Handler {
	dir := serveDir
	if dir == "" {
		dir = "dist"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(dir, r.URL.Path)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			r.URL.Path = "/"
		}
		http.FileServer(http.Dir(dir)).ServeHTTP(w, r)
	})
}
