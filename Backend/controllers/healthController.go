package controllers

import (
	"github.com/gofiber/fiber/v2"
)

// Health devuelve el estado de salud del servidor.
func Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":  "ok",
		"message": "Servidor Go/Fiber operativo",
	})
}

// HealthDB verifica que PostgreSQL responda (200 si está operativo, 503 si no).
func (h *Handler) HealthDB(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	if err := h.repo.Ping(ctx); err != nil {
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
