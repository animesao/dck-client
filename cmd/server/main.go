package main

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"flag"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"dck-client/internal/db"
	"dck-client/internal/dck"
	"dck-client/internal/server"
)

var Version = "0.1.0"
var repoURL = "https://raw.githubusercontent.com/animesao/dck-client"

func main() {
	server.BuildVersion = Version

	// Handle CLI commands: update, version
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "update":
			doUpdate(os.Args[2:])
			return
		case "version", "--version", "-v":
			fmt.Println("dck-client version", Version)
			fmt.Println("Run 'dck-client update --check' to check for updates.")
			return
		}
	}

	port := flag.String("port", "443", "HTTPS server port")
	httpPort := flag.String("http-port", "8080", "HTTP redirect port (set empty to disable)")
	dataDir := flag.String("data", "/root/.dck-client", "Data directory")
	dckBin := flag.String("dck-bin", "dck", "Path to dck binary")
	dckData := flag.String("dck-data", "/root/.dck", "dck data directory")
	tlsCert := flag.String("tls-cert", "", "TLS certificate path")
	tlsKey := flag.String("tls-key", "", "TLS key path")
	flag.Parse()

	if err := os.MkdirAll(*dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	jwtSecret := getJWTSecret(*dataDir)

	database, err := db.New(*dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	dckExecutor := dck.New(*dckBin, *dckData)

	srv := server.New(database, dckExecutor, jwtSecret)

	// TLS cert setup
	certFile, keyFile := *tlsCert, *tlsKey
	if certFile == "" {
		certFile = filepath.Join(*dataDir, "server.crt")
		keyFile = filepath.Join(*dataDir, "server.key")
		if err := ensureSelfSignedCert(certFile, keyFile); err != nil {
			log.Fatalf("Failed to generate TLS cert: %v", err)
		}
	}

	handler := srv.Router()

	// HTTPS server
	addr := fmt.Sprintf(":%s", *port)
	log.Printf("dck-client starting on https://0.0.0.0%s", addr)
	log.Printf("Data: %s | dck: %s | dck-data: %s", *dataDir, *dckBin, *dckData)

	httpsServer := &http.Server{
		Addr:    addr,
		Handler: handler,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down...")
		httpsServer.Close()
	}()

	// Optional HTTP redirect server
	if *httpPort != "" {
		httpAddr := fmt.Sprintf(":%s", *httpPort)
		go func() {
			log.Printf("HTTP redirect on %s -> %s", httpAddr, addr)
			redirectSrv := &http.Server{
				Addr:    httpAddr,
				Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					host := r.Host
					if h, _, err := net.SplitHostPort(host); err == nil {
						host = h
					}
					target := fmt.Sprintf("https://%s%s", host, r.URL.Path)
					if r.URL.RawQuery != "" {
						target += "?" + r.URL.RawQuery
					}
					http.Redirect(w, r, target, http.StatusMovedPermanently)
				}),
			}
			if err := redirectSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("HTTP redirect server error: %v", err)
			}
		}()
	}

	if err := httpsServer.ListenAndServeTLS(certFile, keyFile); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}

func doUpdate(args []string) {
	checkOnly := false
	for _, a := range args {
		if a == "--check" || a == "-c" {
			checkOnly = true
		}
	}

	fmt.Printf("Current version: %s\n", Version)

	latest, err := fetchLatestVersion()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error checking for updates: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Latest version:  %s\n", latest)

	if compareVersions(latest, Version) <= 0 {
		fmt.Println("You are already up to date.")
		return
	}

	fmt.Printf("Update available: %s -> %s\n", Version, latest)

	if checkOnly {
		return
	}

	fmt.Print("Download and install? [y/N] ")
	var confirm string
	fmt.Scanln(&confirm)
	if confirm != "y" && confirm != "Y" {
		fmt.Println("Update cancelled.")
		return
	}

	fmt.Println("Downloading update...")
	body, err := fetchURL(repoURL + "/main/install.sh")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to fetch installer: %v\n", err)
		os.Exit(1)
	}

	tmpFile, err := os.CreateTemp("", "dck-client-install-*.sh")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create temp file: %v\n", err)
		os.Exit(1)
	}
	tmpPath := tmpFile.Name()
	if _, err := tmpFile.WriteString(body); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "Failed to write temp file: %v\n", err)
		os.Exit(1)
	}
	tmpFile.Close()
	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "Failed to chmod temp file: %v\n", err)
		os.Exit(1)
	}

	cmd := exec.Command("sudo", tmpPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	if err := cmd.Run(); err != nil {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "Update failed: %v\n", err)
		os.Exit(1)
	}

	os.Remove(tmpPath)
	fmt.Println("Update complete!")
}

func fetchURL(url string) (string, error) {
	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	return strings.TrimSpace(string(body)), err
}

func fetchLatestVersion() (string, error) {
	url := repoURL + "/main/VERSION"
	return fetchURL(url)
}

func compareVersions(a, b string) int {
	if a == "" && b == "" {
		return 0
	}
	if a == "" {
		return -1
	}
	if b == "" {
		return 1
	}

	ap := strings.Split(strings.TrimLeft(a, "v"), ".")
	bp := strings.Split(strings.TrimLeft(b, "v"), ".")
	max := len(ap)
	if len(bp) > max {
		max = len(bp)
	}
	for i := 0; i < max; i++ {
		var ai, bi int
		if i < len(ap) {
			ai, _ = strconv.Atoi(ap[i])
		}
		if i < len(bp) {
			bi, _ = strconv.Atoi(bp[i])
		}
		if ai < bi {
			return -1
		}
		if ai > bi {
			return 1
		}
	}
	return 0
}

func getJWTSecret(dataDir string) []byte {
    secretFile := filepath.Join(dataDir, "jwt_secret")
    if data, err := os.ReadFile(secretFile); err == nil && len(data) >= 32 {
        // If stored as hex (64 chars) decode it to raw bytes
        if len(data) == 64 {
            if decoded, err := hex.DecodeString(string(data)); err == nil && len(decoded) == 32 {
                return decoded
            }
        }
        // Fallback: return first 32 bytes (raw secret)
        return data[:32]
    }
    // Generate new secret
    secret := make([]byte, 32)
    rand.Read(secret)
    // Store as hex for readability
    hexSecret := []byte(hex.EncodeToString(secret))
    os.WriteFile(secretFile, hexSecret, 0600)
    return secret
}

func ensureSelfSignedCert(certFile, keyFile string) error {
	if _, err := os.Stat(certFile); err == nil {
		if _, err := os.Stat(keyFile); err == nil {
			return nil
		}
	}

	log.Println("Generating self-signed TLS certificate...")

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("generate key: %w", err)
	}

	template := x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject: pkix.Name{
			CommonName:   "dck-client",
			Organization: []string{"dck"},
		},
		NotBefore:             time.Now().Add(-24 * time.Hour),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	// Try to determine host IPs for SAN
	hostname, _ := os.Hostname()
	if hostname != "" {
		template.DNSNames = append(template.DNSNames, hostname)
	}
	template.DNSNames = append(template.DNSNames, "localhost")
	template.IPAddresses = append(template.IPAddresses, net.ParseIP("127.0.0.1"), net.ParseIP("::1"))

	// Try to get external IP
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			ipnet, ok := addr.(*net.IPNet)
			if !ok || ipnet.IP.IsLoopback() {
				continue
			}
			if ip := ipnet.IP.To4(); ip != nil {
				template.IPAddresses = append(template.IPAddresses, ip)
			}
		}
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return fmt.Errorf("create cert: %w", err)
	}

	certOut, err := os.Create(certFile)
	if err != nil {
		return fmt.Errorf("write cert: %w", err)
	}
	defer certOut.Close()
	pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER})

	keyOut, err := os.Create(keyFile)
	if err != nil {
		return fmt.Errorf("write key: %w", err)
	}
	defer keyOut.Close()
	pem.Encode(keyOut, &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(priv),
	})

	log.Printf("Self-signed certificate generated: %s", certFile)
	return nil
}
