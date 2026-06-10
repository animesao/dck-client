package api

import (
	"encoding/base32"
	"encoding/json"
	"image/png"
	"net/http"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

func (s *Server) handleTwoFactorStatus(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	_, enabled := s.store.GetTwoFactor(claims.Sub)
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": enabled})
}

func (s *Server) handleTwoFactorSetup(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "dck-panel",
		AccountName: claims.Username,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate 2FA key")
		return
	}

	if err := s.store.SetTwoFactorSecret(claims.Sub, key.Secret()); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save 2FA secret")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"secret": key.Secret(),
		"url":    key.URL(),
	})
}

func (s *Server) handleTwoFactorQR(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	secret, _ := s.store.GetTwoFactor(claims.Sub)
	if secret == "" {
		writeError(w, http.StatusNotFound, "2FA not set up")
		return
	}

	rawSecret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to decode secret")
		return
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "dck-panel",
		AccountName: claims.Username,
		Secret:      rawSecret,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate QR")
		return
	}

	img, err := key.Image(200, 200)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate QR image")
		return
	}

	w.Header().Set("Content-Type", "image/png")
	png.Encode(w, img)
}

func (s *Server) handleTwoFactorVerify(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	secret, _ := s.store.GetTwoFactor(claims.Sub)
	if secret == "" {
		writeError(w, http.StatusBadRequest, "2FA not set up")
		return
	}

	valid, _ := totp.ValidateCustom(req.Code, secret, time.Now(), totp.ValidateOpts{
		Period:    30,
		Skew:      2,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	if !valid {
		writeError(w, http.StatusBadRequest, "Invalid code")
		return
	}

	if err := s.store.EnableTwoFactor(claims.Sub); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to enable 2FA")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "2FA enabled"})
}

func (s *Server) handleTwoFactorDisable(w http.ResponseWriter, r *http.Request, claims *UserClaims) {
	if err := s.store.DisableTwoFactor(claims.Sub); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to disable 2FA")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "2FA disabled"})
}
