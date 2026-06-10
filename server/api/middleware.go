package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const userKey contextKey = "user"

type UserClaims struct {
	Sub      string `json:"sub"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

type authHandler func(w http.ResponseWriter, r *http.Request, claims *UserClaims)

func (s *Server) auth(next authHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenStr := ""
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			tokenStr = strings.TrimPrefix(auth, "Bearer ")
		}
		if tokenStr == "" {
			tokenStr = r.URL.Query().Get("token")
		}
		if tokenStr == "" {
			writeError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}

		token, err := jwt.ParseWithClaims(tokenStr, &UserClaims{}, func(t *jwt.Token) (interface{}, error) {
			return []byte(s.jwtSecret), nil
		})
		if err != nil || !token.Valid {
			writeError(w, http.StatusUnauthorized, "Invalid token")
			return
		}

		claims, ok := token.Claims.(*UserClaims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "Invalid token claims")
			return
		}

		ctx := context.WithValue(r.Context(), userKey, claims)
		next(w, r.WithContext(ctx), claims)
	}
}

func (s *Server) admin(next authHandler) authHandler {
	return func(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
		if claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "Forbidden")
			return
		}
		next(w, r, claims)
	}
}

func noAuth(h authHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		h(w, r, nil)
	}
}

// requireContainerAccess checks if the user owns the container or has at least 'view' permission
func (s *Server) requireContainerAccess(next authHandler) authHandler {
	return func(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
		id := r.PathValue("id")
		if claims.Role == "admin" {
			next(w, r, claims)
			return
		}
		if s.store.IsContainerOwner(claims.Sub, id) {
			next(w, r, claims)
			return
		}
		perm := s.store.GetUserContainerPermission(claims.Sub, id)
		if perm == "view" || perm == "edit" || perm == "admin" {
			next(w, r, claims)
			return
		}
		writeError(w, http.StatusForbidden, "You do not have permission to access this container")
	}
}

type apiFunc func(w http.ResponseWriter, r *http.Request) error

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
