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
