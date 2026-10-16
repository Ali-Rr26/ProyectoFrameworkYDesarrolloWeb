package controllers

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// dbTimeout es el tiempo máximo que una petición espera a la base de datos.
const dbTimeout = 5 * time.Second

// dbCtx crea un contexto con límite de tiempo derivado de la petición HTTP.
func dbCtx(c *fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.UserContext(), dbTimeout)
}

// apiError responde con la estructura estándar APIError.
func apiError(c *fiber.Ctx, status int, message string, details interface{}) error {
	return c.Status(status).JSON(models.APIError{Status: status, Message: message, Details: details})
}

// repoError traduce los errores del repositorio a respuestas HTTP sin exponer
// detalles internos de PostgreSQL. Los errores no previstos se registran y se
// devuelven como 500 genérico.
func repoError(c *fiber.Ctx, err error) error {
	var detail interface{}
	var de *repository.DomainError
	if errors.As(err, &de) {
		detail = de.Detail
	}

	switch {
	case errors.Is(err, repository.ErrNotFound):
		return apiError(c, fiber.StatusNotFound, "Recurso no encontrado", detail)
	case errors.Is(err, repository.ErrDuplicate):
		return apiError(c, fiber.StatusConflict, "El registro ya existe", detail)
	case errors.Is(err, repository.ErrInsufficientStock):
		return apiError(c, fiber.StatusConflict, "Stock insuficiente", detail)
	case errors.Is(err, repository.ErrInvalidRef):
		return apiError(c, fiber.StatusUnprocessableEntity, "Referencia inválida", detail)
	case errors.Is(err, repository.ErrConstraint):
		return apiError(c, fiber.StatusUnprocessableEntity, "Datos inválidos", detail)
	case errors.Is(err, context.DeadlineExceeded):
		return apiError(c, fiber.StatusServiceUnavailable, "La base de datos no respondió a tiempo", nil)
	default:
		log.Printf("error interno en %s %s: %v", c.Method(), c.Path(), err)
		return apiError(c, fiber.StatusInternalServerError, "Error interno del servidor", nil)
	}
}
