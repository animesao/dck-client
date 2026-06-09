package main

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

//go:embed dist/*
var embeddedFS embed.FS

func getFrontendFS(serveDir string) http.Handler {
	if serveDir != "" {
		return http.FileServer(http.Dir(serveDir))
	}

	subFS, err := fs.Sub(embeddedFS, "dist")
	if err != nil {
		return http.NotFoundHandler()
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}

		f, err := subFS.Open(p)
		if err != nil {
			r.URL.Path = "/"
			http.ServeFileFS(w, r, subFS, "index.html")
			return
		}
		f.Close()

		ext := path.Ext(p)
		contentTypes := map[string]string{
			".html": "text/html",
			".js":   "application/javascript",
			".css":  "text/css",
			".svg":  "image/svg+xml",
			".png":  "image/png",
			".ico":  "image/x-icon",
			".json": "application/json",
			".woff": "font/woff",
			".woff2": "font/woff2",
		}
		if ct, ok := contentTypes[ext]; ok {
			w.Header().Set("Content-Type", ct)
		}

		http.ServeFileFS(w, r, subFS, p)
	})
}

func init() {
	// Make sure dist directory exists when building
	if _, err := os.Stat("dist"); os.IsNotExist(err) {
		os.MkdirAll("dist", 0755)
	}
}
