// Declaramos el paquete auth: emisión y validación de tokens JWT.
package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// issuer identifica a este backend como emisor del token (claim "iss").
const issuer = "multicatalogo-backend"

// Claims es el contenido del token: identidad mínima para autorizar sin consultar la BD.
// sub (Subject) guarda el ID del usuario; email y rol se incluyen para el frontend y los middlewares.
type Claims struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

// UserID devuelve el ID del usuario almacenado en el claim "sub".
func (c *Claims) UserID() (int, error) {
	return strconv.Atoi(c.Subject)
}

// Manager firma y valida tokens con HMAC-SHA256 usando un secreto del servidor.
type Manager struct {
	secret []byte
	ttl    time.Duration
}

// NewManager crea el gestor de tokens. El secreto debe tener al menos 32 bytes.
func NewManager(secret string, ttl time.Duration) (*Manager, error) {
	if len(secret) < 32 {
		return nil, errors.New("JWT_SECRET debe tener al menos 32 caracteres")
	}
	return &Manager{secret: []byte(secret), ttl: ttl}, nil
}

// Generate emite un token firmado para el usuario indicado.
func (m *Manager) Generate(userID int, email, role string) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(m.ttl)
	claims := Claims{
		Email: email,
		Role:  role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.Itoa(userID),
			Issuer:    issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("firmar token: %w", err)
	}
	return token, exp, nil
}

// Parse valida firma, algoritmo, emisor y expiración, y devuelve los claims.
func (m *Manager) Parse(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims,
		func(t *jwt.Token) (interface{}, error) { return m.secret, nil },
		// Solo se acepta HS256: evita ataques de confusión de algoritmo ("alg": "none", RS256, etc.).
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	if _, err := claims.UserID(); err != nil {
		return nil, errors.New("claim sub inválido")
	}
	return claims, nil
}
