package db

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"dck-client/internal/models"

	"golang.org/x/crypto/bcrypt"
)

type Database struct {
	mu       sync.RWMutex
	dataDir  string
	users    []*models.User
	templates []*models.ContainerTemplate
	settings *models.Settings
}

func New(dataDir string) (*Database, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	d := &Database{
		dataDir:  dataDir,
		users:    []*models.User{},
		templates: []*models.ContainerTemplate{},
		settings: &models.Settings{
			DckBinaryPath:    "dck",
			DckDataDir:       "/root/.dck",
			ListenAddr:       ":8080",
			RegistrationOpen: true,
		},
	}

	if err := d.load(); err != nil {
		return nil, fmt.Errorf("load data: %w", err)
	}

	return d, nil
}

func (d *Database) load() error {
	d.loadFile("users.json", &d.users)
	if d.users == nil {
		d.users = []*models.User{}
	}

	d.loadFile("templates.json", &d.templates)
	if d.templates == nil {
		d.templates = []*models.ContainerTemplate{}
	}

	d.loadFile("settings.json", &d.settings)
	if d.settings == nil {
		d.settings = &models.Settings{
			DckBinaryPath:    "dck",
			DckDataDir:       "/root/.dck",
			ListenAddr:       ":8080",
			RegistrationOpen: true,
		}
	}
	if d.settings.DckBinaryPath == "" {
		d.settings.DckBinaryPath = "dck"
	}
	if d.settings.DckDataDir == "" {
		d.settings.DckDataDir = "/root/.dck"
	}
	if d.settings.ListenAddr == "" {
		d.settings.ListenAddr = ":8080"
	}

	return nil
}

func (d *Database) saveUsers() error {
	return d.saveFile("users.json", &d.users)
}

func (d *Database) saveTemplates() error {
	return d.saveFile("templates.json", &d.templates)
}

func (d *Database) saveSettings() error {
	return d.saveFile("settings.json", &d.settings)
}

func (d *Database) loadFile(name string, v interface{}) {
	data, err := os.ReadFile(filepath.Join(d.dataDir, name))
	if err != nil {
		return
	}
	json.Unmarshal(data, v)
}

func (d *Database) saveFile(name string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(d.dataDir, name), data, 0644)
}

func (d *Database) CreateUser(username, password string) (*models.User, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	for _, u := range d.users {
		if u.Username == username {
			return nil, fmt.Errorf("username already exists")
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	role := "user"
	if len(d.users) == 0 {
		role = "admin"
	}

	user := &models.User{
		ID:           int64(len(d.users) + 1),
		Username:     username,
		PasswordHash: string(hash),
		Role:         role,
		CreatedAt:    time.Now(),
	}
	d.users = append(d.users, user)
	return user, d.saveUsers()
}

func (d *Database) Authenticate(username, password string) (*models.User, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if len(d.users) == 0 {
		return nil, fmt.Errorf("no users exist")
	}

	for _, u := range d.users {
		if u.Username == username {
			if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
				return nil, fmt.Errorf("wrong password")
			}
			return u, nil
		}
	}
	return nil, fmt.Errorf("user not found")
}

func (d *Database) UserCount() int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return len(d.users)
}

func (d *Database) GetUser(id int64) (*models.User, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	for _, u := range d.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, fmt.Errorf("user not found")
}

func (d *Database) IsRegistrationOpen() bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.settings.RegistrationOpen
}

func (d *Database) GetSettings() (*models.Settings, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	// Return a copy
	s := *d.settings
	return &s, nil
}

func (d *Database) UpdateSettings(s *models.Settings) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if s.DckBinaryPath != "" {
		d.settings.DckBinaryPath = s.DckBinaryPath
	}
	if s.DckDataDir != "" {
		d.settings.DckDataDir = s.DckDataDir
	}
	if s.ListenAddr != "" {
		d.settings.ListenAddr = s.ListenAddr
	}
	d.settings.RegistrationOpen = s.RegistrationOpen

	return d.saveSettings()
}

func (d *Database) SaveTemplate(t *models.ContainerTemplate) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if t.ID == 0 {
		maxID := int64(0)
		for _, tmpl := range d.templates {
			if tmpl.ID > maxID {
				maxID = tmpl.ID
			}
		}
		t.ID = maxID + 1
		t.CreatedAt = time.Now()
		t.UpdatedAt = time.Now()
		d.templates = append(d.templates, t)
	} else {
		for _, tmpl := range d.templates {
			if tmpl.ID == t.ID {
				tmpl.Name = t.Name
				tmpl.Image = t.Image
				tmpl.Command = t.Command
				tmpl.Ports = t.Ports
				tmpl.Volumes = t.Volumes
				tmpl.Env = t.Env
				tmpl.Restart = t.Restart
				tmpl.Hostname = t.Hostname
				tmpl.Healthcheck = t.Healthcheck
				tmpl.UpdatedAt = time.Now()
				break
			}
		}
	}
	return d.saveTemplates()
}

func (d *Database) ListTemplates() ([]*models.ContainerTemplate, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	result := make([]*models.ContainerTemplate, len(d.templates))
	copy(result, d.templates)

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result, nil
}

func (d *Database) DeleteTemplate(id int64) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	for i, t := range d.templates {
		if t.ID == id {
			d.templates = append(d.templates[:i], d.templates[i+1:]...)
			return d.saveTemplates()
		}
	}
	return fmt.Errorf("template not found")
}

func (d *Database) LogAction(userID int64, action, details string) {
	// Stub — audit log can be added later
}

func (d *Database) Close() error {
	return nil
}
