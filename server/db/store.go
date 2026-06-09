package db

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"password"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

type Settings struct {
	Registration bool   `json:"registration"`
	DckBin       string `json:"dck_bin"`
	DckData      string `json:"dck_data"`
}

type dataFile struct {
	Users    []User   `json:"users"`
	Settings Settings `json:"settings"`
}

type Store struct {
	mu   sync.RWMutex
	path string
	data dataFile
}

func NewStore(path string) (*Store, error) {
	s := &Store{path: path}
	if _, err := os.Stat(path); err == nil {
		b, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(b, &s.data); err != nil {
			return nil, err
		}
	} else {
		s.data.Settings = Settings{
			Registration: true,
		}
		s.save()
	}
	return s, nil
}

func (s *Store) save() {
	b, _ := json.MarshalIndent(s.data, "", "  ")
	os.WriteFile(s.path, b, 0644)
}

func (s *Store) ListUsers() []User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]User, len(s.data.Users))
	copy(out, s.data.Users)
	return out
}

func (s *Store) GetUser(id string) *User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.data.Users {
		if s.data.Users[i].ID == id {
			u := s.data.Users[i]
			u.Password = ""
			return &u
		}
	}
	return nil
}

func (s *Store) GetUserByUsername(username string) *User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.data.Users {
		if s.data.Users[i].Username == username {
			return &s.data.Users[i]
		}
	}
	return nil
}

func (s *Store) CheckPassword(username, password string) *User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.data.Users {
		if s.data.Users[i].Username == username {
			err := bcrypt.CompareHashAndPassword([]byte(s.data.Users[i].Password), []byte(password))
			if err == nil {
				u := s.data.Users[i]
				u.Password = ""
				return &u
			}
			return nil
		}
	}
	return nil
}

func (s *Store) CreateUser(username, password, role string) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.data.Users {
		if s.data.Users[i].Username == username {
			return nil, fmt.Errorf("username already exists")
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	u := User{
		ID:        generateID(),
		Username:  username,
		Password:  string(hash),
		Role:      role,
		CreatedAt: time.Now(),
	}
	s.data.Users = append(s.data.Users, u)
	s.save()
	u.Password = ""
	return &u, nil
}

func (s *Store) UpdateUser(id string, updates map[string]string) *User {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.data.Users {
		if s.data.Users[i].ID == id {
			if u, ok := updates["username"]; ok {
				s.data.Users[i].Username = u
			}
			if p, ok := updates["password"]; ok && p != "" {
				hash, _ := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
				s.data.Users[i].Password = string(hash)
			}
			if r, ok := updates["role"]; ok {
				s.data.Users[i].Role = r
			}
			s.save()
			u := s.data.Users[i]
			u.Password = ""
			return &u
		}
	}
	return nil
}

func (s *Store) DeleteUser(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.data.Users {
		if s.data.Users[i].ID == id {
			s.data.Users = append(s.data.Users[:i], s.data.Users[i+1:]...)
			s.save()
			return true
		}
	}
	return false
}

func (s *Store) GetSettings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data.Settings
}

func (s *Store) UpdateSettings(updates map[string]interface{}) Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	if v, ok := updates["registration"]; ok {
		s.data.Settings.Registration = v.(bool)
	}
	if v, ok := updates["dck_bin"]; ok {
		s.data.Settings.DckBin = v.(string)
	}
	if v, ok := updates["dck_data"]; ok {
		s.data.Settings.DckData = v.(string)
	}
	s.save()
	return s.data.Settings
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
