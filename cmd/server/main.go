package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"dck-client/internal/db"
	"dck-client/internal/dck"
	"dck-client/internal/server"
)

var Version = "dev"

func main() {
	server.BuildVersion = Version
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
