package controllers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/cache"
)

// HealthController expone el estado de PostgreSQL y Redis.
type HealthController struct {
	db    Pinger
	cache cache.Cache
}

// NewHealthController recibe la base de datos y la caché por inyección.
func NewHealthController(db Pinger, c cache.Cache) *HealthController {
	return &HealthController{db: db, cache: c}
}

// Estados de GET /api/health.
const (
	healthOK       = "ok"       // PostgreSQL y Redis responden.
	healthDegraded = "degraded" // Redis caído: la API funciona sin caché (200).
	healthError    = "error"    // PostgreSQL caído: la API no puede atender (503).
)

// Tiempos máximos de cada ping: el health check debe responder rápido aunque algo caiga.
const (
	healthDBTimeout    = 2 * time.Second
	healthRedisTimeout = time.Second
)

// Health devuelve el estado del servidor y de sus dependencias:
//   - 200 "ok":       PostgreSQL y Redis operativos.
//   - 200 "degraded": Redis no responde; se sirve desde PostgreSQL sin caché.
//   - 503 "error":    PostgreSQL no responde; el balanceador debe sacar esta instancia.
func (h *HealthController) Health(c *fiber.Ctx) error {
	database := h.ping(c, healthDBTimeout, h.db.Ping)
	redis := h.ping(c, healthRedisTimeout, h.cache.Ping)

	status, code := healthOK, fiber.StatusOK
	switch {
	case database != healthOK:
		status, code = healthError, fiber.StatusServiceUnavailable
	case redis != healthOK:
		status = healthDegraded
	}
	return c.Status(code).JSON(fiber.Map{
		"status":   status,
		"database": database,
		"redis":    redis,
	})
}

// ping ejecuta la verificación con su propio límite de tiempo y devuelve "ok" o "error".
func (h *HealthController) ping(c *fiber.Ctx, timeout time.Duration, check func(context.Context) error) string {
	ctx, cancel := context.WithTimeout(c.UserContext(), timeout)
	defer cancel()
	if err := check(ctx); err != nil {
		return healthError
	}
	return healthOK
}

// HealthDB verifica que PostgreSQL responda (200 si está operativo, 503 si no).
func (h *HealthController) HealthDB(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	if err := h.db.Ping(ctx); err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"status":  "error",
			"message": "Base de datos no disponible",
		})
	}
	return c.JSON(fiber.Map{
		"status":  "ok",
		"message": "PostgreSQL operativo",
	})
}

// HealthRedis verifica que Redis responda (200 si está operativo, 503 si no).
// Un 503 aquí no afecta al resto de la API: sin Redis se sirve desde PostgreSQL.
func (h *HealthController) HealthRedis(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.UserContext(), time.Second)
	defer cancel()

	if err := h.cache.Ping(ctx); err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"status":  "error",
			"message": "Redis no disponible (la API responde sin caché)",
		})
	}
	return c.JSON(fiber.Map{
		"status":  "ok",
		"message": "Redis operativo",
	})
}
