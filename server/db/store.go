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

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
