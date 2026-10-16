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

// Health devuelve el estado de salud del servidor.
func Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":  "ok",
		"message": "Servidor Go/Fiber operativo",
	})
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
