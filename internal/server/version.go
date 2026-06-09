package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var BuildVersion = "0.1.0"

type VersionInfo struct {
	Current             string `json:"current"`
	Latest              string `json:"latest"`
	UpdateAvailable     bool   `json:"update_available"`
	DckVersion          string `json:"dck_version"`
	DckLatest           string `json:"dck_latest"`
	DckUpdateAvailable  bool   `json:"dck_update_available"`
}

type VersionHandler struct {
	*Server
	mu            sync.RWMutex
	latestCache   string
	dckLatestCache string
	lastCheck     time.Time
}

func (h *VersionHandler) Get(w http.ResponseWriter, r *http.Request) {
	info := VersionInfo{
		Current:    BuildVersion,
		DckVersion: h.getDckVersion(),
	}

	h.mu.RLock()
	if time.Since(h.lastCheck) < time.Hour && h.latestCache != "" {
		info.Latest = h.latestCache
	}
	if time.Since(h.lastCheck) < time.Hour && h.dckLatestCache != "" {
		info.DckLatest = h.dckLatestCache
	}
	latestCached := h.latestCache
	dckCached := h.dckLatestCache
	h.mu.RUnlock()

	if info.Latest == "" && latestCached == "" {
		go h.checkLatest()
	}
	if info.DckLatest == "" && dckCached == "" {
		go h.checkDckLatest()
	}

	if info.Latest != "" && info.Current != "" && info.Current != "dev" {
		info.UpdateAvailable = compareVersions(info.Current, info.Latest) < 0
	}
	if info.DckLatest != "" && info.DckVersion != "" && info.DckVersion != "unknown" {
		info.DckUpdateAvailable = compareVersions(info.DckVersion, info.DckLatest) < 0
	}

	writeJSON(w, http.StatusOK, info)
}

func (h *VersionHandler) UpdateDckClient(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	latest := h.latestCache
	h.mu.RUnlock()
	if latest == "" {
		writeError(w, http.StatusInternalServerError, "no version info yet, try checking for updates first")
		return
	}

	currentExe, err := os.Executable()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot determine executable path: "+err.Error())
		return
	}

	client := &http.Client{Timeout: 30 * time.Second}

	// Fetch release info
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/animesao/dck-client/releases/latest", nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "dck-client")
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "fetch release: "+err.Error())
		return
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		resp.Body.Close()
		writeError(w, http.StatusInternalServerError, "parse release: "+err.Error())
		return
	}
	resp.Body.Close()

	if release.TagName == "" {
		writeError(w, http.StatusInternalServerError, "no releases found")
		return
	}

	// Download source archive
	archiveURL := fmt.Sprintf("https://github.com/animesao/dck-client/archive/refs/tags/%s.tar.gz", release.TagName)
	srcResp, err := client.Get(archiveURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "download source: "+err.Error())
		return
	}
	defer srcResp.Body.Close()

	if srcResp.StatusCode != http.StatusOK {
		writeError(w, http.StatusInternalServerError, "source download returned "+srcResp.Status)
		return
	}

	// Extract to temp dir
	tmpDir, err := os.MkdirTemp("", "dck-client-update-*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create tmp dir: "+err.Error())
		return
	}
	defer os.RemoveAll(tmpDir)

	archivePath := filepath.Join(tmpDir, "dck-client.tar.gz")
	f, err := os.Create(archivePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create archive: "+err.Error())
		return
	}
	if _, err := io.Copy(f, srcResp.Body); err != nil {
		f.Close()
		writeError(w, http.StatusInternalServerError, "write archive: "+err.Error())
		return
	}
	f.Close()

	if out, err := exec.Command("tar", "-xzf", archivePath, "-C", tmpDir).CombinedOutput(); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("extract: %s: %s", err, string(out)))
		return
	}

	entries, _ := os.ReadDir(tmpDir)
	var srcDir string
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "dck-client-") {
			srcDir = filepath.Join(tmpDir, e.Name())
			break
		}
	}
	if srcDir == "" {
		writeError(w, http.StatusInternalServerError, "source dir not found in archive")
		return
	}

	// Ensure Go is available
	if _, err := exec.LookPath("go"); err != nil {
		if out, err := exec.Command("which", "go").CombinedOutput(); err != nil {
			writeError(w, http.StatusInternalServerError, "go binary not found, install Go first")
			return
		} else {
			_ = out
		}
	}

	buildCmd := exec.Command("go", "build", "-ldflags=-s -w", "-o", filepath.Join(tmpDir, "dck-client"), "./cmd/server")
	buildCmd.Dir = srcDir
	buildCmd.Env = append(os.Environ(),
		"GOPATH="+filepath.Join(tmpDir, "gopath"),
		"GOMODCACHE="+filepath.Join(tmpDir, "gopath", "pkg", "mod"),
		"GOCACHE="+filepath.Join(tmpDir, "gocache"),
		"GOFLAGS=-mod=mod",
	)
	buildOut, err := buildCmd.CombinedOutput()
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("build: %s: %s", err, string(buildOut)))
		return
	}

	builtBinary := filepath.Join(tmpDir, "dck-client")
	if _, err := os.Stat(builtBinary); err != nil {
		writeError(w, http.StatusInternalServerError, "built binary not found")
		return
	}

	// Verify the built binary
	if out, err := exec.Command(builtBinary, "--version").Output(); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("built binary invalid: %s: %s", err, string(out)))
		return
	}

	// Replace the current binary
	if err := os.Rename(builtBinary, currentExe); err != nil {
		input, _ := os.ReadFile(builtBinary)
		if err := os.WriteFile(currentExe, input, 0755); err != nil {
			writeError(w, http.StatusInternalServerError, "replace binary: "+err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "updated",
		"version": latest,
	})
}

func (h *VersionHandler) UpdateDck(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	latest := h.dckLatestCache
	h.mu.RUnlock()
	if latest == "" {
		writeError(w, http.StatusInternalServerError, "no version info yet, try checking for updates first")
		return
	}

	binPath := h.dck.BinaryPath
	if binPath == "" {
		binPath = "dck"
	}

	fullPath, err := exec.LookPath(binPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dck binary not found: "+err.Error())
		return
	}

	// Step 1: fetch release info to get source archive URL
	client := &http.Client{Timeout: 30 * time.Second}
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/animesao/dck/releases/latest", nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "dck-client")
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "fetch release: "+err.Error())
		return
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		resp.Body.Close()
		writeError(w, http.StatusInternalServerError, "parse release: "+err.Error())
		return
	}
	resp.Body.Close()

	if release.TagName == "" {
		writeError(w, http.StatusInternalServerError, "no releases found")
		return
	}

	// Step 2: download source archive for this tag
	archiveURL := fmt.Sprintf("https://github.com/animesao/dck/archive/refs/tags/%s.tar.gz", release.TagName)
	srcResp, err := client.Get(archiveURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "download source: "+err.Error())
		return
	}
	defer srcResp.Body.Close()

	if srcResp.StatusCode != http.StatusOK {
		writeError(w, http.StatusInternalServerError, "source download returned "+srcResp.Status)
		return
	}

	// Step 3: extract to temp dir
	tmpDir, err := os.MkdirTemp("", "dck-update-*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create tmp dir: "+err.Error())
		return
	}
	defer os.RemoveAll(tmpDir)

	archivePath := filepath.Join(tmpDir, "dck.tar.gz")
	f, err := os.Create(archivePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create archive: "+err.Error())
		return
	}
	if _, err := io.Copy(f, srcResp.Body); err != nil {
		f.Close()
		writeError(w, http.StatusInternalServerError, "write archive: "+err.Error())
		return
	}
	f.Close()

	// Extract
	if out, err := exec.Command("tar", "-xzf", archivePath, "-C", tmpDir).CombinedOutput(); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("extract: %s: %s", err, string(out)))
		return
	}

	// Find the extracted directory
	entries, _ := os.ReadDir(tmpDir)
	var srcDir string
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "dck-") {
			srcDir = filepath.Join(tmpDir, e.Name())
			break
		}
	}
	if srcDir == "" {
		writeError(w, http.StatusInternalServerError, "source dir not found in archive")
		return
	}

	// Step 4: build
	// Detect if Go is available, if not try to install it
	if _, err := exec.LookPath("go"); err != nil {
		// Try installing Go
		arch := "amd64"
		if idx := strings.LastIndex(fullPath, "arm64"); idx != -1 || strings.Contains(fullPath, "aarch64") {
			arch = "arm64"
		}
		goDL := fmt.Sprintf("https://go.dev/dl/go1.22.5.linux-%s.tar.gz", arch)
		goResp, err := client.Get(goDL)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "cannot install Go (no 'go' binary found)")
			return
		}
		goTar := filepath.Join(tmpDir, "go.tar.gz")
		gf, _ := os.Create(goTar)
		io.Copy(gf, goResp.Body)
		gf.Close()
		goResp.Body.Close()

		exec.Command("tar", "-C", tmpDir, "-xzf", goTar).Run()
		os.Setenv("PATH", filepath.Join(tmpDir, "go", "bin")+":"+os.Getenv("PATH"))
	}

	buildCmd := exec.Command("go", "build", "-ldflags=-s -w", "-o", filepath.Join(tmpDir, "dck"), ".")
	buildCmd.Dir = srcDir
	buildCmd.Env = append(os.Environ(),
		"GOPATH="+filepath.Join(tmpDir, "gopath"),
		"GOMODCACHE="+filepath.Join(tmpDir, "gopath", "pkg", "mod"),
		"GOCACHE="+filepath.Join(tmpDir, "gocache"),
		"GOFLAGS=-mod=mod",
	)
	buildOut, err := buildCmd.CombinedOutput()
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("build: %s: %s", err, string(buildOut)))
		return
	}

	builtBinary := filepath.Join(tmpDir, "dck")
	if _, err := os.Stat(builtBinary); err != nil {
		writeError(w, http.StatusInternalServerError, "built binary not found")
		return
	}

	// Step 5: verify and replace
	if out, err := exec.Command(builtBinary, "--version").Output(); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("built binary invalid: %s: %s", err, string(out)))
		return
	}

	// Replace binary
	if err := os.Rename(builtBinary, fullPath); err != nil {
		input, _ := os.ReadFile(builtBinary)
		if err := os.WriteFile(fullPath, input, 0755); err != nil {
			writeError(w, http.StatusInternalServerError, "replace binary: "+err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "updated",
		"version": latest,
	})
}

func (h *VersionHandler) getDckVersion() string {
	v, err := h.dck.Version()
	if err != nil {
		return "unknown"
	}
	return v
}

func (h *VersionHandler) checkLatest() {
	h.mu.Lock()
	defer h.mu.Unlock()

	if time.Since(h.lastCheck) < time.Hour {
		return
	}
	h.lastCheck = time.Now()

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/animesao/dck-client/releases/latest", nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "dck-client")
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.Unmarshal(body, &release); err != nil {
		return
	}
	if release.TagName != "" {
		h.latestCache = release.TagName
	}
}

func (h *VersionHandler) checkDckLatest() {
	h.mu.Lock()
	defer h.mu.Unlock()

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/animesao/dck/releases/latest", nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "dck-client")
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.Unmarshal(body, &release); err != nil {
		return
	}
	if release.TagName != "" {
		h.dckLatestCache = release.TagName
	}
}

func compareVersions(a, b string) int {
	if len(a) > 0 && a[0] == 'v' {
		a = a[1:]
	}
	if len(b) > 0 && b[0] == 'v' {
		b = b[1:]
	}
	if a == b {
		return 0
	}

	segA := parseVersionSegments(a)
	segB := parseVersionSegments(b)

	for i := 0; i < len(segA) && i < len(segB); i++ {
		if segA[i] < segB[i] {
			return -1
		}
		if segA[i] > segB[i] {
			return 1
		}
	}

	if len(segA) < len(segB) {
		return -1
	}
	if len(segA) > len(segB) {
		return 1
	}
	return 0
}

func parseVersionSegments(v string) []int {
	var segs []int
	current := 0
	for _, c := range v {
		if c >= '0' && c <= '9' {
			current = current*10 + int(c-'0')
		} else if c == '.' {
			segs = append(segs, current)
			current = 0
		} else {
			break
		}
	}
	if v != "" {
		segs = append(segs, current)
	}
	return segs
}
