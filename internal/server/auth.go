package server

import (
	"encoding/json"
	"net/http"
	"time"

	"dck-client/internal/models"

	"github.com/golang-jwt/jwt/v5"
)

type AuthHandler struct {
	*Server
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.db.Authenticate(req.Username, req.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := h.generateToken(user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	h.db.LogAction(user.ID, "login", "User logged in")
	writeJSON(w, http.StatusOK, models.TokenResponse{
		Token:    token,
		Username: user.Username,
		Role:     user.Role,
	})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if !h.db.IsRegistrationOpen() {
		writeError(w, http.StatusForbidden, "registration is closed")
		return
	}

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password required")
		return
	}

	user, err := h.db.CreateUser(req.Username, req.Password)
	if err != nil {
		writeError(w, http.StatusConflict, "username already exists")
		return
	}

	token, err := h.generateToken(user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	h.db.LogAction(user.ID, "register", "User registered")
	writeJSON(w, http.StatusCreated, models.TokenResponse{
		Token:    token,
		Username: user.Username,
		Role:     user.Role,
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(int64)
	user, err := h.db.GetUser(userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) generateToken(user *models.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"role":     user.Role,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
		"iat":      time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(h.jwtSecret)
}
