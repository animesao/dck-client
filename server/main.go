package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"

	"dck-panel/api"
	"dck-panel/db"
	"dck-panel/dck"
)

func ufwAllowPort(port int) {
	if err := exec.Command("ufw", "allow", fmt.Sprintf("%d/tcp", port)).Run(); err == nil {
		log.Printf("Port %d/tcp opened in UFW", port)
	}
}

var (
	port        = flag.Int("port", 443, "HTTP/HTTPS port")
	sftpPort    = flag.Int("sftp-port", 2222, "SFTP port (0 to disable)")
	certFile    = flag.String("tls-cert", "", "TLS certificate file (enables HTTPS)")
	keyFile     = flag.String("tls-key", "", "TLS private key file")
	dckBin      = flag.String("dck-bin", "dck", "Path to dck binary")
	dckData     = flag.String("dck-data", "", "dck data directory (default: ~/.dck)")
	dataDir     = flag.String("data-dir", "", "Panel data directory (default: ~/.dck-panel)")
	serveDir    = flag.String("serve-dir", "", "Frontend directory (default: embedded)")
	autoSetup   = flag.Bool("auto-setup", true, "Auto-create admin user on first run")
)

func main() {
	flag.Parse()

	ufwAllowPort(*port)
	if *sftpPort > 0 {
		ufwAllowPort(*sftpPort)
	}

	home, _ := os.UserHomeDir()

	dckHome := *dckData
	if dckHome == "" {
		dckHome = os.Getenv("DCK_HOME")
	}
	if dckHome == "" {
		if home != "" {
			dckHome = filepath.Join(home, ".dck")
		} else {
			dckHome = "/root/.dck"
		}
	}

	panelDir := *dataDir
	if panelDir == "" {
		panelDir = filepath.Join(home, ".dck-panel")
	}
	os.MkdirAll(panelDir, 0755)

	store, err := db.NewStore(filepath.Join(panelDir, "data.db"))
	if err != nil {
		log.Fatalf("Failed to init store: %v", err)
	}

	if *autoSetup {
		users := store.ListUsers()
		if len(users) == 0 {
			store.CreateUser("admin", "admin", "admin", "")
			log.Println("Created default admin user (admin/admin)")
		}
	}

	dckClient := &dck.Client{
		BinPath:     *dckBin,
		DataDir:     dckHome,
		WingsURL:    os.Getenv("DECK_WINGS_URL"),
		WingsAPIKey: os.Getenv("DECK_WINGS_API_KEY"),
	}

	if dckClient.WingsURL != "" {
		log.Printf("Using dck-wings at %s", dckClient.WingsURL)
	}

	store.PruneStaleUserContainers(filepath.Join(dckHome, "containers"))

	srv := api.NewServer(store, dckClient, dckHome, *serveDir)

	addr := fmt.Sprintf(":%d", *port)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: srv.Router(),
	}

	go func() {
		var err error
		if *certFile != "" && *keyFile != "" {
			log.Printf("dck Panel listening on https://0.0.0.0%s", addr)
			err = httpServer.ListenAndServeTLS(*certFile, *keyFile)
		} else {
			log.Printf("dck Panel listening on http://0.0.0.0%s", addr)
			err = httpServer.ListenAndServe()
		}
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	if *sftpPort > 0 {
		if err := srv.StartSFTPServer(fmt.Sprintf("%d", *sftpPort), panelDir); err != nil {
			log.Fatalf("SFTP server error: %v", err)
		}
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")
	httpServer.Close()
	store.Close()
}
