package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request, _ *UserClaims) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		TwoFACode string `json:"twofa_code,omitempty"`
		TwoFAToken string `json:"twofa_token,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	user := s.store.CheckPassword(req.Username, req.Password)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	_, twoFAEnabled := s.store.GetTwoFactor(user.ID)
	if twoFAEnabled {
		if req.TwoFAToken != "" && req.TwoFACode != "" {
			token, err := jwt.ParseWithClaims(req.TwoFAToken, &UserClaims{}, func(t *jwt.Token) (interface{}, error) {
				return []byte(s.jwtSecret), nil
			})
			if err != nil || !token.Valid {
				writeError(w, http.StatusUnauthorized, "Invalid 2FA token")
				return
			}
			secret, _ := s.store.GetTwoFactor(user.ID)
			if !totpValidate(req.TwoFACode, secret) {
				writeError(w, http.StatusUnauthorized, "Invalid 2FA code")
				return
			}
		} else {
			partialToken, err := s.generateToken(user.ID, user.Username, user.Role)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "Failed to generate 2FA challenge")
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"twofa_required": true,
				"twofa_token":    partialToken,
				"user":           user,
			})
			return
		}
	}

	s.store.UpdateLastLogin(user.ID)
	s.store.AddActivityLog(user.ID, "", "login", user.Username+" logged in")

	token, err := s.generateToken(user.ID, user.Username, user.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  user,
	})
}

func totpValidate(code, secret string) bool {
	valid, _ := totp.ValidateCustom(code, secret, time.Now(), totp.ValidateOpts{
		Period:    30,
		Skew:      2,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	return valid
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request, _ *UserClaims) {
	settings := s.store.GetSettings()
	if !settings.Registration {
		writeError(w, http.StatusForbidden, "Registration is closed")
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "Username and password required")
		return
	}

	users := s.store.ListUsers()
	role := "user"
	if len(users) == 0 {
		role = "admin"
	}

	user, err := s.store.CreateUser(req.Username, req.Password, role)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.store.UpdateLastLogin(user.ID)

	token, err := s.generateToken(user.ID, user.Username, user.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  user,
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	user := s.store.GetUser(claims.Sub)
	if user == nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) generateToken(userID, username, role string) (string, error) {
	claims := UserClaims{
		Sub:      userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}
