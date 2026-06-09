package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"dck-panel/api"
	"dck-panel/db"
	"dck-panel/dck"
)

var (
	port        = flag.Int("port", 443, "HTTP port")
	dckBin      = flag.String("dck-bin", "dck", "Path to dck binary")
	dckData     = flag.String("dck-data", "", "dck data directory (default: ~/.dck)")
	dataDir     = flag.String("data-dir", "", "Panel data directory (default: ~/.dck-panel)")
	serveDir    = flag.String("serve-dir", "", "Frontend directory (default: embedded)")
	autoSetup   = flag.Bool("auto-setup", true, "Auto-create admin user on first run")
)

func main() {
	flag.Parse()

	home, _ := os.UserHomeDir()

	dckHome := *dckData
	if dckHome == "" {
		dckHome = filepath.Join(home, ".dck")
	}

	panelDir := *dataDir
	if panelDir == "" {
		panelDir = filepath.Join(home, ".dck-panel")
	}
	os.MkdirAll(panelDir, 0755)

	store, err := db.NewStore(filepath.Join(panelDir, "data.json"))
	if err != nil {
		log.Fatalf("Failed to init store: %v", err)
	}

	if *autoSetup {
		users := store.ListUsers()
		if len(users) == 0 {
			store.CreateUser("admin", "admin", "admin")
			log.Println("Created default admin user (admin/admin)")
		}
	}

	dckClient := &dck.Client{
		BinPath: *dckBin,
		DataDir: dckHome,
	}

	srv := api.NewServer(store, dckClient, dckHome, *serveDir)

	addr := fmt.Sprintf(":%d", *port)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: srv.Router(),
	}

	go func() {
		log.Printf("dck Panel listening on http://0.0.0.0%s", addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")
	httpServer.Close()
}
