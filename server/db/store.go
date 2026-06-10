package db

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"

	_ "modernc.org/sqlite"
)

type User struct {
	ID        string     `json:"id"`
	Username  string     `json:"username"`
	Password  string     `json:"password"`
	Role      string     `json:"role"`
	CreatedAt time.Time  `json:"created_at"`
	LastLogin *time.Time `json:"last_login,omitempty"`
}

type Settings struct {
	Registration        bool   `json:"registration"`
	DckBin              string `json:"dck_bin"`
	DckData             string `json:"dck_data"`
	AllowUserContainers bool   `json:"allow_user_containers"`
	AllowUserPorts      bool   `json:"allow_user_ports"`
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
	Permission   string `json:"permission"` // "view", "edit", "admin"
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

func (s *Store) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
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
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM settings").Scan(&count)
	if count == 0 {
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('registration', 'true')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_user_containers', 'true')")
		s.db.Exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_user_ports', 'true')")
	}
	return nil
}

func scanUser(scanner interface {
	Scan(dest ...interface{}) error
}) (User, error) {
	var u User
	var createdAt, lastLogin string
	err := scanner.Scan(&u.ID, &u.Username, &u.Password, &u.Role, &createdAt, &lastLogin)
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

func (s *Store) ListUsers() []User {
	rows, err := s.db.Query("SELECT id, username, password, role, created_at, COALESCE(last_login, '') FROM users ORDER BY created_at ASC")
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
	row := s.db.QueryRow("SELECT id, username, password, role, created_at, COALESCE(last_login, '') FROM users WHERE id = ?", id)
	u, err := scanUser(row)
	if err != nil {
		return nil
	}
	u.Password = ""
	return &u
}

func (s *Store) GetUserByUsername(username string) *User {
	row := s.db.QueryRow("SELECT id, username, password, role, created_at, COALESCE(last_login, '') FROM users WHERE username = ?", username)
	u, err := scanUser(row)
	if err != nil {
		return nil
	}
	return &u
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

func (s *Store) CreateUser(username, password, role string) (*User, error) {
	existing := s.GetUserByUsername(username)
	if existing != nil {
		return nil, fmt.Errorf("username already exists")
	}

	id := generateID()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec("INSERT INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
		id, username, string(hash), role, now)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	u := &User{
		ID:        id,
		Username:  username,
		Role:      role,
		CreatedAt: time.Now().UTC(),
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

func (s *Store) RecordContainer(userID, containerID, containerName, image string) {
	now := time.Now().UTC().Format(time.RFC3339)
	s.db.Exec("INSERT INTO user_containers (user_id, container_id, container_name, image, created_at) VALUES (?, ?, ?, ?, ?)",
		userID, containerID, containerName, image, now)
}

func (s *Store) GetUserContainerCount(userID string) int {
	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM user_containers WHERE user_id = ?", userID).Scan(&count)
	return count
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

func (s *Store) SetContainerPermission(userID, containerID, permission string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO container_permissions (user_id, container_id, permission, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(user_id, container_id) DO UPDATE SET permission = ?`,
		userID, containerID, permission, now, permission)
	return err
}

func (s *Store) RemoveContainerPermission(userID, containerID string) error {
	_, err := s.db.Exec("DELETE FROM container_permissions WHERE user_id = ? AND container_id = ?", userID, containerID)
	return err
}

func (s *Store) ListContainerPermissions(containerID string) []ContainerPermission {
	rows, err := s.db.Query(`
		SELECT cp.user_id, u.username, cp.container_id, cp.permission, cp.created_at
		FROM container_permissions cp
		JOIN users u ON u.id = cp.user_id
		WHERE cp.container_id = ?`, containerID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out []ContainerPermission
	for rows.Next() {
		var cp ContainerPermission
		if err := rows.Scan(&cp.UserID, &cp.Username, &cp.ContainerID, &cp.Permission, &cp.CreatedAt); err == nil {
			out = append(out, cp)
		}
	}
	return out
}

func (s *Store) GetUserContainerPermission(userID, containerID string) string {
	var perm string
	err := s.db.QueryRow("SELECT permission FROM container_permissions WHERE user_id = ? AND container_id = ?", userID, containerID).Scan(&perm)
	if err != nil {
		return ""
	}
	return perm
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

	var out []ActivityLog
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

	var out []ActivityLog
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

	var out []ActivityLog
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
