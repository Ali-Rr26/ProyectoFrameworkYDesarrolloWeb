package controllers

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/repository"
)

// Cabeceras del protocolo de idempotencia.
const (
	// HeaderIdempotencyKey la envía el cliente: un UUID por operación (p. ej. por pedido
	// guardado sin conexión), el mismo en cada reintento.
	HeaderIdempotencyKey = "Idempotency-Key"
	// HeaderIdempotentReplayed marca una respuesta repetida desde la base, sin reejecutar.
	HeaderIdempotentReplayed = "Idempotent-Replayed"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Idempotency hace seguras las escrituras reintentables (outbox de la PWA). Va después
// de RequireAuth: las claves son por usuario.
//   - Sin cabecera: la petición sigue igual que siempre (compatibilidad).
//   - Clave ya usada con la misma petición: devuelve la respuesta guardada (mismo estado y
//     cuerpo) sin volver a ejecutar el controlador.
//   - Clave ya usada con otra petición: 422.
//   - Clave nueva: la deja en el contexto; el repositorio la registra junto con la
//     respuesta dentro de la transacción de la escritura (todo o nada).
type Idempotency struct {
	store IdempotencyStore
}

// NewIdempotency recibe el almacén de respuestas por inyección.
func NewIdempotency(store IdempotencyStore) *Idempotency {
	return &Idempotency{store: store}
}

// Handle es el middleware de Fiber.
func (m *Idempotency) Handle(c *fiber.Ctx) error {
	key := strings.TrimSpace(c.Get(HeaderIdempotencyKey))
	if key == "" {
		return c.Next()
	}
	if !uuidPattern.MatchString(key) {
		return apiError(c, fiber.StatusBadRequest, "Idempotency-Key inválida: debe ser un UUID", nil)
	}
	key = strings.ToLower(key)

	claims := currentClaims(c)
	if claims == nil {
		return apiError(c, fiber.StatusUnauthorized, "Token requerido", nil)
	}
	userID, err := claims.UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}
	hash := requestHash(c.Method(), c.Path(), c.Body())

	ctx, cancel := dbCtx(c)
	rec, err := m.store.GetIdempotencyRecord(ctx, userID, key)
	cancel()
	switch {
	case err == nil:
		if rec.RequestHash != hash {
			return apiError(c, fiber.StatusUnprocessableEntity,
				"La Idempotency-Key ya se usó con otra petición", nil)
		}
		c.Set(HeaderIdempotentReplayed, "true")
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
		return c.Status(rec.StatusCode).Send(rec.Body)
	case !errors.Is(err, repository.ErrNotFound):
		return repoError(c, err)
	}

	c.SetUserContext(repository.WithIdempotencyKey(c.UserContext(), repository.IdempotencyKey{
		UserID:      userID,
		Key:         key,
		Method:      c.Method(),
		Path:        c.Path(),
		RequestHash: hash,
	}))
	return c.Next()
}

// requestHash identifica la petición (método, ruta y cuerpo exactos) con SHA-256 en hex.
func requestHash(method, path string, body []byte) string {
	h := sha256.New()
	h.Write([]byte(method + "\n" + path + "\n"))
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}
