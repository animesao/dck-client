package server

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"dck-client/internal/db"
	"dck-client/internal/dck"
	"dck-client/internal/models"

	"github.com/go-chi/chi"
	chimw "github.com/go-chi/chi/middleware"
)

//go:embed web/*
var webFS embed.FS

type Server struct {
	db        *db.Database
	dck       *dck.Executor
	jwtSecret []byte
	events    *eventBroker
}

func New(database *db.Database, dckExecutor *dck.Executor, jwtSecret []byte) *Server {
	return &Server{
		db:        database,
		dck:       dckExecutor,
		jwtSecret: jwtSecret,
		events:    newEventBroker(),
	}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(corsMiddleware)

	auth := &AuthHandler{s}
	containers := &ContainerHandler{s}
	images := &ImageHandler{s}
	config := &ConfigHandler{s}
	dashboard := &DashboardHandler{s}
	settings := &SettingsHandler{s}
	version := &VersionHandler{Server: s}
	blueprints := &BlueprintHandler{Server: s}
	categories := &CategoriesHandler{Server: s}
	projects := &ProjectHandler{Server: s}

	r.Route("/api", func(r chi.Router) {
		r.Post("/auth/login", auth.Login)
		r.Post("/auth/register", auth.Register)

		// Public SSE endpoint for container status (no auth required for streaming)
		r.Get("/events", s.EventsHandler)

		// Public catalog, categories, and blueprints
		r.Get("/catalog", s.CatalogHandler)
		r.Get("/categories", categories.List)
		r.Get("/blueprints", blueprints.List)
		r.Get("/blueprints/category/{category}", blueprints.ListByCategory)

		// Blueprint launch (authenticated)
		r.Group(func(r chi.Router) {
			r.Use(s.authMiddleware)
			r.Post("/blueprints/{name}/launch", blueprints.Launch)
		})

		// Project routes — public for scan (no auth needed), rest authenticated
		r.Get("/projects/scan", projects.Scan)
		r.Get("/projects/read", projects.Read)

		r.Group(func(r chi.Router) {
			r.Use(s.authMiddleware)

			r.Route("/projects", func(r chi.Router) {
				r.Post("/create", projects.Create)
				r.Post("/save", projects.Save)
				r.Delete("/delete", projects.Delete)
				r.Post("/deploy", projects.Deploy)
				r.Post("/auto-deploy", projects.AutoDeploy)
			})
		})

		r.Group(func(r chi.Router) {
			r.Use(s.authMiddleware)

			r.Get("/auth/me", auth.Me)

			r.Route("/dashboard", func(r chi.Router) {
				r.Get("/stats", dashboard.Stats)
			})

			r.Route("/containers", func(r chi.Router) {
				r.Get("/", containers.List)
				r.Get("/{id}", containers.Get)
				r.Post("/", containers.Create)
				r.Post("/{id}/start", containers.Start)
				r.Post("/{id}/stop", containers.Stop)
				r.Post("/{id}/restart", containers.Restart)
				r.Delete("/{id}", containers.Remove)
				r.Get("/{id}/logs", containers.Logs)
				r.Get("/{id}/state", containers.State)
				r.Get("/{id}/stats", containers.Stats)
				r.Get("/{id}/config", containers.Config)
				r.Put("/{id}/config", containers.UpdateConfig)
				r.Post("/{id}/exec", containers.Exec)
			})

			r.Route("/images", func(r chi.Router) {
				r.Get("/", images.List)
				r.Post("/pull", images.Pull)
				r.Delete("/{name}/{tag}", images.Remove)
			})

			r.Route("/config", func(r chi.Router) {
				r.Get("/", config.GetConfig)
				r.Post("/", config.SaveConfig)
				r.Post("/deploy", config.Deploy)
				r.Post("/down", config.Down)
			})

			r.Route("/templates", func(r chi.Router) {
				r.Get("/", containers.Templates)
				r.Post("/", containers.Templates)
				r.Delete("/{templateID}", containers.Templates)
				r.Post("/{templateID}/launch", containers.LaunchTemplate)
			})

			r.Route("/settings", func(r chi.Router) {
				r.Get("/", settings.Get)
				r.Put("/", settings.Update)
			})

			r.Route("/dck", func(r chi.Router) {
				r.Post("/update", version.UpdateDck)
			})

			r.Post("/dck-client/update", version.UpdateDckClient)

			r.Route("/update", func(r chi.Router) {
				r.Get("/check", version.CheckUpdatesWeb)
				r.Post("/apply", version.UpdateDckClient)
			})

			r.Get("/version", version.Get)
		})

		// Console WebSocket — outside auth middleware because WS cannot send Authorization header
		// JWT is validated inside the handler via ?token= query param
		r.Get("/console/{id}", (&ConsoleHandler{s}).Connect)
	})

	// SPA file server
	staticFS := getFileSystem()
	fileServer := http.FileServer(staticFS)
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}

		if f, err := staticFS.Open(strings.TrimPrefix(path, "/")); err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		index, err := webFS.ReadFile("web/index.html")
		if err != nil {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(index)
	})

	// Background event broadcaster
	go s.broadcastEvents()

	return r
}

func getFileSystem() http.FileSystem {
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		if _, err := os.Stat("web/index.html"); err == nil {
			return http.Dir("web")
		}
		panic(err)
	}
	return http.FS(sub)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// ── SSE Event Broker ──

type eventBroker struct {
	mu      sync.RWMutex
	clients map[chan string]struct{}
}

func newEventBroker() *eventBroker {
	return &eventBroker{
		clients: make(map[chan string]struct{}),
	}
}

func (b *eventBroker) subscribe() chan string {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan string, 10)
	b.clients[ch] = struct{}{}
	return ch
}

func (b *eventBroker) unsubscribe(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.clients[ch]; ok {
		delete(b.clients, ch)
		close(ch)
	}
}

func (b *eventBroker) publish(data string) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.clients {
		select {
		case ch <- data:
		default:
		}
	}
}

func (s *Server) broadcastEvents() {
	statsTicker := time.NewTicker(2 * time.Second)
	containersTicker := time.NewTicker(2 * time.Second)
	defer statsTicker.Stop()
	defer containersTicker.Stop()

	go func() {
		for range containersTicker.C {
			containers, err := s.dck.ListContainers(true)
			if err != nil {
				continue
			}
			if len(containers) == 0 {
				s.events.publish(`{"type":"containers","data":[]}`)
				continue
			}
			data, err := json.Marshal(map[string]interface{}{
				"type": "containers",
				"data": containers,
			})
			if err != nil {
				continue
			}
			s.events.publish(string(data))
		}
	}()

	for range statsTicker.C {
		containers, err := s.dck.ListContainers(true)
		if err != nil || len(containers) == 0 {
			continue
		}
		var statsList []models.ContainerCPU
		for _, c := range containers {
			if c.PID > 0 {
				stats, err := s.dck.GetContainerStats(c.PID)
				if err == nil {
					stats.ID = c.ID
					stats.Name = c.Name
					statsList = append(statsList, *stats)
				}
			}
		}
		if len(statsList) == 0 {
			continue
		}
		data, err := json.Marshal(map[string]interface{}{
			"type": "container_stats",
			"data": statsList,
		})
		if err != nil {
			continue
		}
		s.events.publish(string(data))
	}
}

func (s *Server) EventsHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := s.events.subscribe()
	defer s.events.unsubscribe(ch)

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}

// ── Container Catalog ──

var imageCatalog = []models.CatalogItem{
	{
		Name: "Nginx",
		Description: "High-performance web server, reverse proxy, and load balancer. Perfect for serving static content or as a gateway.",
		Category: "Web Server",
		Image: "nginx:alpine",
		DefaultPort: "80",
	},
	{
		Name: "Redis",
		Description: "In-memory data structure store, used as database, cache, and message broker. Blazing fast key-value storage.",
		Category: "Database",
		Image: "redis:alpine",
		DefaultPort: "6379",
	},
	{
		Name: "PostgreSQL",
		Description: "Powerful open-source relational database with advanced features, ACID compliance, and strong reliability.",
		Category: "Database",
		Image: "postgres:16-alpine",
		DefaultPort: "5432",
		EnvTips: "POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB",
	},
	{
		Name: "MySQL",
		Description: "Widely-used open-source relational database management system, known for its reliability and performance.",
		Category: "Database",
		Image: "mysql:8.4",
		DefaultPort: "3306",
		EnvTips: "MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER",
	},
	{
		Name: "MongoDB",
		Description: "NoSQL document database with high performance, high availability, and automatic scaling.",
		Category: "Database",
		Image: "mongo:7",
		DefaultPort: "27017",
		EnvTips: "MONGO_INITDB_ROOT_USERNAME, MONGO_INITDB_ROOT_PASSWORD",
	},
	{
		Name: "Python",
		Description: "Official Python runtime. Great for running scripts, web apps (Django/Flask), and data processing.",
		Category: "Runtime",
		Image: "python:3.12-slim",
		DefaultCmd: "python3",
	},
	{
		Name: "Node.js",
		Description: "JavaScript runtime built on V8 engine. Ideal for web servers, APIs, and microservices.",
		Category: "Runtime",
		Image: "node:22-alpine",
		DefaultCmd: "node",
	},
	{
		Name: "Alpine Linux",
		Description: "Minimal Linux distribution (~5MB). Perfect as a base image for small containers or testing.",
		Category: "Base",
		Image: "alpine:3.20",
		DefaultCmd: "sh",
	},
	{
		Name: "Ubuntu",
		Description: "Full-featured Linux distribution. Use when you need a complete environment with package manager.",
		Category: "Base",
		Image: "ubuntu:24.04",
		DefaultCmd: "bash",
	},
}

func (s *Server) CatalogHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, imageCatalog)
}
