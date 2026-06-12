package db

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	_ "modernc.org/sqlite"
)

type User struct {
	ID             string     `json:"id"`
	Username       string     `json:"username"`
	Email          string     `json:"email"`
	Password       string     `json:"password"`
	Role           string     `json:"role"`
	CreatedAt      time.Time  `json:"created_at"`
	LastLogin      *time.Time `json:"last_login,omitempty"`
	ContainerLimit int        `json:"container_limit"`
	MemoryLimit    int64      `json:"memory_limit"`
	CPULimit       float64    `json:"cpu_limit"`
	DiskLimit      int64      `json:"disk_limit"`
	PortLimit      int        `json:"port_limit"`
}

type Settings struct {
	Registration           bool    `json:"registration"`
	DckBin                 string  `json:"dck_bin"`
	DckData                string  `json:"dck_data"`
	AllowUserContainers    bool    `json:"allow_user_containers"`
	AllowUserPorts         bool    `json:"allow_user_ports"`
	AllowUserImages        bool    `json:"allow_user_images"`
	AllowUserTemplates     bool    `json:"allow_user_templates"`
	AllowUserProjects      bool    `json:"allow_user_projects"`
	PortRangeStart         int     `json:"port_range_start"`
	PortRangeEnd           int     `json:"port_range_end"`
	DisabledFeatures       string  `json:"disabled_features"`
	DefaultContainerLimit  int     `json:"default_container_limit"`
	DefaultMemoryLimit     int64   `json:"default_memory_limit"`
	DefaultCPULimit        float64 `json:"default_cpu_limit"`
	DefaultDiskLimit       int64   `json:"default_disk_limit"`
	DefaultPortLimit       int     `json:"default_port_limit"`
}

type Node struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	APIKey    string `json:"api_key,omitempty"`
	CreatedAt string `json:"created_at"`
}

type Store struct {
	db *sql.DB
}

func NewStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(1)

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

type ContainerPermission struct {
	UserID       string `json:"user_id"`
	Username     string `json:"username"`
	ContainerID  string `json:"container_id"`
	Permission   string `json:"permission"`   // "view", "edit", "admin" (legacy)
	Permissions  string `json:"permissions"`  // JSON object for granular permissions
	CreatedAt    string `json:"created_at"`
}

type ActivityLog struct {
	ID          int64   `json:"id"`
	UserID      string  `json:"user_id"`
	Username    string  `json:"username,omitempty"`
	ContainerID *string `json:"container_id,omitempty"`
	Action      string  `json:"action"`
	Details     string  `json:"details"`
	CreatedAt   string  `json:"created_at"`
}

type Template struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Image       string `json:"image"`
	Tag         string `json:"tag,omitempty"`
	Command     string `json:"command"`
	Env         string `json:"env"` // JSON array of {key,value}
	Ports       string `json:"ports"` // comma-separated
	Memory      string `json:"memory,omitempty"`
	CPUs        string `json:"cpus,omitempty"`
	Restart     string `json:"restart,omitempty"`
	Network     string `json:"network,omitempty"`
	Volumes     string `json:"volumes,omitempty"` // comma-separated
	CreatedAt   string `json:"created_at"`
	UserID      string `json:"user_id,omitempty"`
}

func (s *Store) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			email TEXT NOT NULL DEFAULT '',
			password TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'user',
			created_at TEXT NOT NULL,
			last_login TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS user_containers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id TEXT NOT NULL,
			container_id TEXT NOT NULL,
			container_name TEXT NOT NULL,
			image TEXT NOT NULL,
			created_at TEXT NOT NULL,
			node_id TEXT NOT NULL DEFAULT '',
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS container_permissions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id TEXT NOT NULL,
			container_id TEXT NOT NULL,
			permission TEXT NOT NULL DEFAULT 'view',
			created_at TEXT NOT NULL,
			UNIQUE(user_id, container_id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS activity_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id TEXT NOT NULL,
			container_id TEXT,
			action TEXT NOT NULL,
			details TEXT DEFAULT '',
			created_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS two_factor (
			user_id TEXT PRIMARY KEY,
			secret TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 0,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS container_sftp (
			container_id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS template_categories (
			id TEXT PRIMARY KEY,
			name TEXT UNIQUE NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS nodes (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			url TEXT NOT NULL,
			api_key TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS templates (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			category TEXT NOT NULL,
			description TEXT DEFAULT '',
			image TEXT NOT NULL,
			tag TEXT DEFAULT '',
			command TEXT DEFAULT '',
			env TEXT DEFAULT '[]',
			ports TEXT DEFAULT '',
			memory TEXT DEFAULT '',
			cpus TEXT DEFAULT '',
			restart TEXT DEFAULT 'no',
			network TEXT DEFAULT 'bridge',
			volumes TEXT DEFAULT '',
			created_at TEXT NOT NULL,
			user_id TEXT,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	// Add limit columns (ignore errors if already exist)
	s.db.Exec("ALTER TABLE users ADD COLUMN container_limit INTEGER DEFAULT 0")
	s.db.Exec("ALTER TABLE users ADD COLUMN memory_limit INTEGER DEFAULT 0") // in MB
	s.db.Exec("ALTER TABLE users ADD COLUMN cpu_limit REAL DEFAULT 0")
	s.db.Exec("ALTER TABLE users ADD COLUMN port_limit INTEGER DEFAULT 0")
	s.db.Exec("ALTER TABLE users ADD COLUMN disk_limit INTEGER DEFAULT 0")

	// Add granular permissions column
	s.db.Exec("ALTER TABLE container_permissions ADD COLUMN permissions TEXT DEFAULT ''")

	// Add node_id column to user_containers
	s.db.Exec("ALTER TABLE user_containers ADD COLUMN node_id TEXT NOT NULL DEFAULT ''")

	// Add email column to users
	s.db.Exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''")

	// Migrate old memory_limit from bytes to MB (one-time)
	var migrated int
	s.db.QueryRow("SELECT COUNT(*) FROM settings WHERE key='memory_limit_migrated'").Scan(&migrated)
	if migrated == 0 {
		// Convert values assuming they were set in bytes (divide by 1048576)
		s.db.Exec("UPDATE users SET memory_limit = memory_limit / 1048576 WHERE memory_limit > 0")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('memory_limit_migrated', '1')")
	}

	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM settings").Scan(&count)
	if count == 0 {
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('registration', 'true')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_user_containers', 'true')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_user_ports', 'true')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_user_images', 'true')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_user_templates', 'true')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_user_projects', 'true')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('port_range_start', '20000')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('port_range_end', '30000')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('disabled_features', '')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_container_limit', '0')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_memory_limit', '0')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_cpu_limit', '0')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_disk_limit', '0')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_port_limit', '0')")
	}

	// One-time: reset port_limit=0 for all users who still have 1 (old default)
	var portReset int
	s.db.QueryRow("SELECT COUNT(*) FROM settings WHERE key='port_limit_reset'").Scan(&portReset)
	if portReset == 0 {
		s.db.Exec("UPDATE users SET port_limit = 0 WHERE port_limit = 1")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('port_limit_reset', '1')")
	}
	return nil
}

func scanUser(scanner interface {
	Scan(dest ...interface{}) error
}) (User, error) {
	var u User
	var createdAt, lastLogin string
	err := scanner.Scan(&u.ID, &u.Username, &u.Email, &u.Password, &u.Role, &createdAt, &lastLogin, &u.ContainerLimit, &u.MemoryLimit, &u.CPULimit, &u.DiskLimit, &u.PortLimit)
	if err != nil {
		return u, err
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	if lastLogin != "" {
		t, err := time.Parse(time.RFC3339, lastLogin)
		if err == nil {
			u.LastLogin = &t
		}
	}
	return u, nil
}

func (s *Store) userColumns() string {
	return "id, username, email, password, role, created_at, COALESCE(last_login, ''), COALESCE(container_limit, 0), COALESCE(memory_limit, 0), COALESCE(cpu_limit, 0), COALESCE(disk_limit, 0), COALESCE(port_limit, 0)"
}

func (s *Store) ListUsers() []User {
	rows, err := s.db.Query(fmt.Sprintf("SELECT %s FROM users ORDER BY created_at ASC", s.userColumns()))
	if err != nil {
		return nil
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			continue
		}
		users = append(users, u)
	}
	return users
}

func (s *Store) GetUser(id string) *User {
	row := s.db.QueryRow(fmt.Sprintf("SELECT %s FROM users WHERE id = ?", s.userColumns()), id)
	u, err := scanUser(row)
	if err != nil {
		return nil
	}
	u.Password = ""
	return &u
}

func (s *Store) GetUserByUsername(username string) *User {
	row := s.db.QueryRow(fmt.Sprintf("SELECT %s FROM users WHERE username = ?", s.userColumns()), username)
	u, err := scanUser(row)
	if err != nil {
		return nil
	}
	return &u
}

func (s *Store) UpdateUserLimits(id string, containerLimit int, memoryLimit int64, cpuLimit float64, diskLimit int64, portLimit int) *User {
	s.db.Exec("UPDATE users SET container_limit = ?, memory_limit = ?, cpu_limit = ?, disk_limit = ?, port_limit = ? WHERE id = ?", containerLimit, memoryLimit, cpuLimit, diskLimit, portLimit, id)
	return s.GetUser(id)
}

func (s *Store) GetUserResourceUsage(userID string) (containerCount int, totalMemory int64, totalCPU float64) {
	rows, err := s.db.Query("SELECT container_id FROM user_containers WHERE user_id = ?", userID)
	if err != nil {
		return 0, 0, 0
	}
	defer rows.Close()

	for rows.Next() {
		var containerID string
		rows.Scan(&containerID)
		containerCount++
	}
	return containerCount, 0, 0
}

func (s *Store) AddNode(id, name, url, apiKey string) error {
	_, err := s.db.Exec("INSERT INTO nodes (id, name, url, api_key, created_at) VALUES (?, ?, ?, ?, ?)",
		id, name, url, apiKey, time.Now().UTC().Format(time.RFC3339))
	return err
}

func (s *Store) ListNodes() ([]Node, error) {
	rows, err := s.db.Query("SELECT id, name, url, api_key, created_at FROM nodes ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var nodes []Node
	for rows.Next() {
		var n Node
		if err := rows.Scan(&n.ID, &n.Name, &n.URL, &n.APIKey, &n.CreatedAt); err != nil {
			return nil, err
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}

func (s *Store) RemoveNode(id string) error {
	_, err := s.db.Exec("DELETE FROM nodes WHERE id = ?", id)
	return err
}

func (s *Store) CheckPassword(username, password string) *User {
	u := s.GetUserByUsername(username)
	if u == nil {
		return nil
	}
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
	if err != nil {
		return nil
	}
	u.Password = ""
	return u
}

func (s *Store) CreateUser(username, password, role, email string) (*User, error) {
	existing := s.GetUserByUsername(username)
	if existing != nil {
		return nil, fmt.Errorf("username already exists")
	}

	id := generateID()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	settings := s.GetSettings()

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(
		"INSERT INTO users (id, username, email, password, role, created_at, container_limit, memory_limit, cpu_limit, disk_limit, port_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		id, username, email, string(hash), role, now,
		settings.DefaultContainerLimit, settings.DefaultMemoryLimit, settings.DefaultCPULimit, settings.DefaultDiskLimit, settings.DefaultPortLimit,
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	u := &User{
		ID:             id,
		Username:       username,
		Email:          email,
		Role:           role,
		CreatedAt:      time.Now().UTC(),
		ContainerLimit: settings.DefaultContainerLimit,
		MemoryLimit:    settings.DefaultMemoryLimit,
		CPULimit:       settings.DefaultCPULimit,
		PortLimit:      settings.DefaultPortLimit,
	}
	return u, nil
}

func (s *Store) UpdateUser(id string, updates map[string]string) *User {
	u := s.GetUser(id)
	if u == nil {
		return nil
	}

	if uname, ok := updates["username"]; ok && uname != "" {
		s.db.Exec("UPDATE users SET username = ? WHERE id = ?", uname, id)
	}
	if pwd, ok := updates["password"]; ok && pwd != "" {
		hash, _ := bcrypt.GenerateFromPassword([]byte(pwd), bcrypt.DefaultCost)
		s.db.Exec("UPDATE users SET password = ? WHERE id = ?", string(hash), id)
	}
	if role, ok := updates["role"]; ok && role != "" {
		s.db.Exec("UPDATE users SET role = ? WHERE id = ?", role, id)
	}

	return s.GetUser(id)
}

func (s *Store) DeleteUser(id string) bool {
	res, err := s.db.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n > 0
}

func (s *Store) GetSettings() Settings {
	settings := Settings{Registration: true, AllowUserContainers: true, AllowUserPorts: true}

	rows, err := s.db.Query("SELECT key, value FROM settings")
	if err != nil {
		return settings
	}
	defer rows.Close()

	for rows.Next() {
		var key, value string
		rows.Scan(&key, &value)
		switch key {
		case "registration":
			settings.Registration = value == "true"
		case "dck_bin":
			settings.DckBin = value
		case "dck_data":
			settings.DckData = value
		case "allow_user_containers":
			settings.AllowUserContainers = value == "true"
		case "allow_user_ports":
			settings.AllowUserPorts = value == "true"
		case "port_range_start":
			settings.PortRangeStart, _ = strconv.Atoi(value)
		case "port_range_end":
			settings.PortRangeEnd, _ = strconv.Atoi(value)
		case "disabled_features":
			settings.DisabledFeatures = value
		case "default_container_limit":
			settings.DefaultContainerLimit, _ = strconv.Atoi(value)
		case "default_memory_limit":
			v, _ := strconv.ParseInt(value, 10, 64)
			settings.DefaultMemoryLimit = v
		case "default_cpu_limit":
			settings.DefaultCPULimit, _ = strconv.ParseFloat(value, 64)
		case "default_port_limit":
			settings.DefaultPortLimit, _ = strconv.Atoi(value)
		case "default_disk_limit":
			v, _ := strconv.ParseInt(value, 10, 64)
			settings.DefaultDiskLimit = v
		}
	}
	return settings
}

func (s *Store) UpdateSettings(updates map[string]interface{}) Settings {
	for key, value := range updates {
		var strVal string
		switch v := value.(type) {
		case bool:
			strVal = fmt.Sprintf("%t", v)
		case string:
			strVal = v
		case float64:
			strVal = fmt.Sprintf("%.0f", v)
		default:
			continue
		}
		s.db.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, strVal)
	}
	return s.GetSettings()
}

func (s *Store) CountUsers() int {
	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count
}

func (s *Store) UpdateLastLogin(id string) {
	now := time.Now().UTC().Format(time.RFC3339)
	s.db.Exec("UPDATE users SET last_login = ? WHERE id = ?", now, id)
}

func (s *Store) RecordContainer(userID, containerID, containerName, image, nodeID string) {
	now := time.Now().UTC().Format(time.RFC3339)
	s.db.Exec("INSERT INTO user_containers (user_id, container_id, container_name, image, created_at, node_id) VALUES (?, ?, ?, ?, ?, ?)",
		userID, containerID, containerName, image, now, nodeID)
}

func (s *Store) GetContainerNodeID(containerID string) string {
	var nodeID string
	s.db.QueryRow("SELECT node_id FROM user_containers WHERE container_id = ?", containerID).Scan(&nodeID)
	return nodeID
}

func (s *Store) GetContainerUserID(containerID string) (string, error) {
	var userID string
	err := s.db.QueryRow("SELECT user_id FROM user_containers WHERE container_id = ?", containerID).Scan(&userID)
	return userID, err
}

func (s *Store) UpdateContainerOwner(containerID, newUserID string) error {
	_, err := s.db.Exec("UPDATE user_containers SET user_id = ? WHERE container_id = ?", newUserID, containerID)
	return err
}

func (s *Store) RemoveUserContainer(containerID string) {
	s.db.Exec("DELETE FROM user_containers WHERE container_id = ?", containerID)
}

func (s *Store) PruneStaleUserContainers(containerDir string) {
	log.Printf("PruneStaleUserContainers: scanning %s", containerDir)
	entries, err := os.ReadDir(containerDir)
	if err != nil {
		log.Printf("PruneStaleUserContainers: ReadDir error: %v", err)
		return
	}
	valid := make(map[string]bool)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			valid[strings.TrimSuffix(e.Name(), ".json")] = true
		}
	}
	log.Printf("PruneStaleUserContainers: found %d valid containers", len(valid))
	rows, err := s.db.Query("SELECT id, container_id FROM user_containers")
	if err != nil {
		log.Printf("PruneStaleUserContainers: Query error: %v", err)
		return
	}
	defer rows.Close()
	var pruned int
	for rows.Next() {
		var id int64
		var cid string
		rows.Scan(&id, &cid)
		if !valid[cid] {
			s.db.Exec("DELETE FROM user_containers WHERE id = ?", id)
			pruned++
		}
	}
	log.Printf("PruneStaleUserContainers: pruned %d stale entries", pruned)
}

func (s *Store) IsContainerOwner(userID, containerID string) bool {
	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM user_containers WHERE user_id = ? AND container_id = ?", userID, containerID).Scan(&count)
	return count > 0
}

func (s *Store) GetUserContainerCount(userID string) int {
	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM user_containers WHERE user_id = ?", userID).Scan(&count)
	return count
}

func (s *Store) GetUserContainerIDs(userID string) []string {
	rows, err := s.db.Query("SELECT container_id FROM user_containers WHERE user_id = ? UNION SELECT container_id FROM container_permissions WHERE user_id = ?", userID, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func (s *Store) GetUserOwnedContainerIDs(userID string) []string {
	rows, err := s.db.Query("SELECT container_id FROM user_containers WHERE user_id = ?", userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func (s *Store) GetAllUserContainerCounts() map[string]int {
	rows, err := s.db.Query("SELECT user_id, COUNT(*) as cnt FROM user_containers GROUP BY user_id")
	if err != nil {
		return nil
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var userID string
		var count int
		rows.Scan(&userID, &count)
		counts[userID] = count
	}
	return counts
}

type UserWithStats struct {
	User
	ContainerCount int    `json:"container_count"`
	LastLoginStr   string `json:"last_login,omitempty"`
}

func (s *Store) GetUserStats() (int, []UserWithStats) {
	users := s.ListUsers()
	counts := s.GetAllUserContainerCounts()

	out := make([]UserWithStats, 0, len(users))
	for _, u := range users {
		u.Password = ""
		lastLogin := ""
		if u.LastLogin != nil {
			lastLogin = u.LastLogin.Format(time.RFC3339)
		}
		out = append(out, UserWithStats{
			User:           u,
			ContainerCount: counts[u.ID],
			LastLoginStr:   lastLogin,
		})
	}
	return len(users), out
}

// ─── Container Permissions ───────────────────────────────────────

func (s *Store) SetContainerPermission(userID, containerID, permission, permissions string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO container_permissions (user_id, container_id, permission, permissions, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(user_id, container_id) DO UPDATE SET permission = ?, permissions = ?`,
		userID, containerID, permission, permissions, now, permission, permissions)
	return err
}

func (s *Store) RemoveContainerPermission(userID, containerID string) error {
	_, err := s.db.Exec("DELETE FROM container_permissions WHERE user_id = ? AND container_id = ?", userID, containerID)
	return err
}

func (s *Store) ListContainerPermissions(containerID string) []ContainerPermission {
	rows, err := s.db.Query(`
		SELECT cp.user_id, u.username, cp.container_id, cp.permission, COALESCE(cp.permissions, ''), cp.created_at
		FROM container_permissions cp
		JOIN users u ON u.id = cp.user_id
		WHERE cp.container_id = ?`, containerID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out = make([]ContainerPermission, 0)
	for rows.Next() {
		var cp ContainerPermission
		if err := rows.Scan(&cp.UserID, &cp.Username, &cp.ContainerID, &cp.Permission, &cp.Permissions, &cp.CreatedAt); err == nil {
			out = append(out, cp)
		}
	}
	return out
}

func (s *Store) GetUserContainerPermission(userID, containerID string) (permission string, permissions string) {
	err := s.db.QueryRow("SELECT permission, COALESCE(permissions, '') FROM container_permissions WHERE user_id = ? AND container_id = ?", userID, containerID).Scan(&permission, &permissions)
	if err != nil {
		return "", ""
	}
	return permission, permissions
}

// ─── Activity Logs ───────────────────────────────────────────────

func (s *Store) AddActivityLog(userID, containerID, action, details string) int64 {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec("INSERT INTO activity_logs (user_id, container_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)",
		userID, containerID, action, details, now)
	if err != nil {
		return 0
	}
	id, _ := res.LastInsertId()
	return id
}

func (s *Store) ListContainerActivity(containerID string, limit int) []ActivityLog {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.Query(`
		SELECT al.id, al.user_id, u.username, al.container_id, al.action, al.details, al.created_at
		FROM activity_logs al
		JOIN users u ON u.id = al.user_id
		WHERE al.container_id = ?
		ORDER BY al.created_at DESC LIMIT ?`, containerID, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out = make([]ActivityLog, 0)
	for rows.Next() {
		var l ActivityLog
		if err := rows.Scan(&l.ID, &l.UserID, &l.Username, &l.ContainerID, &l.Action, &l.Details, &l.CreatedAt); err == nil {
			out = append(out, l)
		}
	}
	return out
}

func (s *Store) ListUserActivity(userID string, limit int) []ActivityLog {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.Query(`
		SELECT al.id, al.user_id, u.username, COALESCE(al.container_id, ''), al.action, al.details, al.created_at
		FROM activity_logs al
		JOIN users u ON u.id = al.user_id
		WHERE al.user_id = ?
		ORDER BY al.created_at DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out = make([]ActivityLog, 0)
	for rows.Next() {
		var l ActivityLog
		if err := rows.Scan(&l.ID, &l.UserID, &l.Username, &l.ContainerID, &l.Action, &l.Details, &l.CreatedAt); err == nil {
			out = append(out, l)
		}
	}
	return out
}

func (s *Store) ListAllActivity(limit int) []ActivityLog {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.Query(`
		SELECT al.id, al.user_id, u.username, COALESCE(al.container_id, ''), al.action, al.details, al.created_at
		FROM activity_logs al
		JOIN users u ON u.id = al.user_id
		ORDER BY al.created_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out = make([]ActivityLog, 0)
	for rows.Next() {
		var l ActivityLog
		if err := rows.Scan(&l.ID, &l.UserID, &l.Username, &l.ContainerID, &l.Action, &l.Details, &l.CreatedAt); err == nil {
			out = append(out, l)
		}
	}
	return out
}

// ─── Two‑Factor Auth ─────────────────────────────────────────────

func (s *Store) GetTwoFactor(userID string) (secret string, enabled bool) {
	err := s.db.QueryRow("SELECT secret, enabled FROM two_factor WHERE user_id = ?", userID).Scan(&secret, &enabled)
	if err != nil {
		return "", false
	}
	return secret, enabled
}

func (s *Store) SetTwoFactorSecret(userID, secret string) error {
	_, err := s.db.Exec("INSERT OR REPLACE INTO two_factor (user_id, secret, enabled) VALUES (?, ?, 0)", userID, secret)
	return err
}

func (s *Store) EnableTwoFactor(userID string) error {
	_, err := s.db.Exec("UPDATE two_factor SET enabled = 1 WHERE user_id = ?", userID)
	return err
}

func (s *Store) DisableTwoFactor(userID string) error {
	_, err := s.db.Exec("DELETE FROM two_factor WHERE user_id = ?", userID)
	return err
}

// ─── Change Password (with old password check) ──────────────────

func (s *Store) ChangePassword(userID, oldPassword, newPassword string) error {
	row := s.db.QueryRow("SELECT password FROM users WHERE id = ?", userID)
	var hash string
	if err := row.Scan(&hash); err != nil {
		return fmt.Errorf("user not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(oldPassword)); err != nil {
		return fmt.Errorf("old password is incorrect")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("UPDATE users SET password = ? WHERE id = ?", string(newHash), userID)
	return err
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ─── SFTP per-container credentials ────────────────────────────

type SFTPUser struct {
	ContainerID string `json:"container_id"`
	Username    string `json:"username"`
	CreatedAt   string `json:"created_at"`
}

func generateSFTPPassword() string {
	b := make([]byte, 12)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func generateSFTPUsername(containerID string) string {
	short := containerID
	if len(short) > 8 {
		short = short[:8]
	}
	return fmt.Sprintf("sftp_%s", short)
}

func (s *Store) GetOrCreateSFTPUser(containerID string) (SFTPUser, string, error) {
	// Check if already exists
	row := s.db.QueryRow("SELECT container_id, username, created_at FROM container_sftp WHERE container_id = ?", containerID)
	var existing SFTPUser
	if err := row.Scan(&existing.ContainerID, &existing.Username, &existing.CreatedAt); err == nil {
		return existing, "", nil
	}

	// Create new
	username := generateSFTPUsername(containerID)
	password := generateSFTPPassword()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return SFTPUser{}, "", err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec("INSERT INTO container_sftp (container_id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
		containerID, username, string(hash), now)
	if err != nil {
		return SFTPUser{}, "", err
	}
	return SFTPUser{ContainerID: containerID, Username: username, CreatedAt: now}, password, nil
}

func (s *Store) GetSFTPUserByUsername(username string) (string, string, error) {
	row := s.db.QueryRow("SELECT container_id, password_hash FROM container_sftp WHERE username = ?", username)
	var containerID, passwordHash string
	if err := row.Scan(&containerID, &passwordHash); err != nil {
		return "", "", err
	}
	return containerID, passwordHash, nil
}

// ─── Template Categories ─────────────────────────────────────────

func (s *Store) ListTemplateCategories() []string {
	rows, err := s.db.Query("SELECT name FROM template_categories ORDER BY name ASC")
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	cats := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			cats = append(cats, name)
		}
	}
	return cats
}

func (s *Store) CreateTemplateCategory(name string) error {
	id := generateID()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec("INSERT OR IGNORE INTO template_categories (id, name, created_at) VALUES (?, ?, ?)", id, name, now)
	return err
}

func (s *Store) DeleteTemplateCategory(name string) error {
	_, err := s.db.Exec("DELETE FROM template_categories WHERE name = ?", name)
	return err
}

// ─── Templates ───────────────────────────────────────────────────

func (s *Store) ListTemplates() []Template {
	rows, err := s.db.Query("SELECT id, name, category, COALESCE(description,''), image, COALESCE(tag,''), COALESCE(command,''), COALESCE(env,'[]'), COALESCE(ports,''), COALESCE(memory,''), COALESCE(cpus,''), COALESCE(restart,'no'), COALESCE(network,'bridge'), COALESCE(volumes,''), created_at, COALESCE(user_id,'') FROM templates ORDER BY category, name")
	if err != nil {
		return []Template{}
	}
	defer rows.Close()
	out := make([]Template, 0)
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.Name, &t.Category, &t.Description, &t.Image, &t.Tag, &t.Command, &t.Env, &t.Ports, &t.Memory, &t.CPUs, &t.Restart, &t.Network, &t.Volumes, &t.CreatedAt, &t.UserID); err == nil {
			out = append(out, t)
		}
	}
	return out
}

func (s *Store) ListTemplatesByCategory(category string) []Template {
	rows, err := s.db.Query("SELECT id, name, category, COALESCE(description,''), image, COALESCE(tag,''), COALESCE(command,''), COALESCE(env,'[]'), COALESCE(ports,''), COALESCE(memory,''), COALESCE(cpus,''), COALESCE(restart,'no'), COALESCE(network,'bridge'), COALESCE(volumes,''), created_at, COALESCE(user_id,'') FROM templates WHERE category = ? ORDER BY name", category)
	if err != nil {
		return []Template{}
	}
	defer rows.Close()
	out := make([]Template, 0)
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.Name, &t.Category, &t.Description, &t.Image, &t.Tag, &t.Command, &t.Env, &t.Ports, &t.Memory, &t.CPUs, &t.Restart, &t.Network, &t.Volumes, &t.CreatedAt, &t.UserID); err == nil {
			out = append(out, t)
		}
	}
	return out
}

func (s *Store) GetTemplate(id string) *Template {
	row := s.db.QueryRow("SELECT id, name, category, COALESCE(description,''), image, COALESCE(tag,''), COALESCE(command,''), COALESCE(env,'[]'), COALESCE(ports,''), COALESCE(memory,''), COALESCE(cpus,''), COALESCE(restart,'no'), COALESCE(network,'bridge'), COALESCE(volumes,''), created_at, COALESCE(user_id,'') FROM templates WHERE id = ?", id)
	var t Template
	if err := row.Scan(&t.ID, &t.Name, &t.Category, &t.Description, &t.Image, &t.Tag, &t.Command, &t.Env, &t.Ports, &t.Memory, &t.CPUs, &t.Restart, &t.Network, &t.Volumes, &t.CreatedAt, &t.UserID); err != nil {
		return nil
	}
	return &t
}

func (s *Store) CreateTemplate(t Template) error {
	id := generateID()
	now := time.Now().UTC().Format(time.RFC3339)
	if t.CreatedAt == "" {
		t.CreatedAt = now
	}
	_, err := s.db.Exec(`INSERT INTO templates (id, name, category, description, image, tag, command, env, ports, memory, cpus, restart, network, volumes, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, t.Name, t.Category, t.Description, t.Image, t.Tag, t.Command, t.Env, t.Ports, t.Memory, t.CPUs, t.Restart, t.Network, t.Volumes, t.CreatedAt, t.UserID)
	return err
}

func (s *Store) DeleteTemplate(id string) error {
	_, err := s.db.Exec("DELETE FROM templates WHERE id = ?", id)
	return err
}

func (s *Store) RegenerateSFTPPassword(containerID string) (string, error) {
	password := generateSFTPPassword()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec("UPDATE container_sftp SET password_hash = ? WHERE container_id = ?", string(hash), containerID)
	if err != nil {
		return "", err
	}
	return password, nil
}
