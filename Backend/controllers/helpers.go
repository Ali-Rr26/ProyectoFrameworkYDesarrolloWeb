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

// msgInvalidQuantity es el mensaje de una línea con cantidad cero o negativa
// (distinto del 409 "Stock insuficiente": aquí el error es del dato enviado).
const msgInvalidQuantity = "cantidad debe ser mayor que cero"

// localsExposeDetails es la clave con la que ErrorDetails marca si se puede mostrar
// el detalle técnico de los errores en esta petición.
const localsExposeDetails = "expose_error_details"

// ErrorDetails decide, según el entorno (APP_ENV), si repoError incluye el detalle
// técnico (nombres de restricciones, mensajes de PostgreSQL) en APIError.Details.
// Se registra con app.Use en main: el valor llega por inyección, no por una global.
func ErrorDetails(expose bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Locals(localsExposeDetails, expose)
		return c.Next()
	}
}

// exposeDetails indica si la petición actual puede ver el detalle técnico (falso por defecto).
func exposeDetails(c *fiber.Ctx) bool {
	expose, _ := c.Locals(localsExposeDetails).(bool)
	return expose
}

// dbCtx crea un contexto con límite de tiempo derivado de la petición HTTP.
func dbCtx(c *fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.UserContext(), dbTimeout)
}

// apiError responde con la estructura estándar APIError.
func apiError(c *fiber.Ctx, status int, message string, details interface{}) error {
	return c.Status(status).JSON(models.APIError{Status: status, Message: message, Details: details})
}

// repoError traduce los errores del repositorio a respuestas HTTP. El detalle solo se
// incluye si fue redactado para el usuario (DomainError.Public) o si APP_ENV=dev: en
// producción no se revelan nombres de restricciones ni mensajes de PostgreSQL. Los
// errores no previstos se registran y se devuelven como 500 genérico (nunca con detalle).
func repoError(c *fiber.Ctx, err error) error {
	var detail interface{}
	var de *repository.DomainError
	if errors.As(err, &de) && (de.Public || exposeDetails(c)) {
		detail = de.Detail
	}

	switch {
	case errors.Is(err, repository.ErrNotFound):
		return apiError(c, fiber.StatusNotFound, "Recurso no encontrado", detail)
	case errors.Is(err, repository.ErrDuplicate):
		return apiError(c, fiber.StatusConflict, "El registro ya existe", detail)
	case errors.Is(err, repository.ErrInvalidQuantity):
		return apiError(c, fiber.StatusBadRequest, msgInvalidQuantity, detail)
	case errors.Is(err, repository.ErrInvalidReferral):
		return apiError(c, fiber.StatusBadRequest, "Código de referido inválido", detail)
	case errors.Is(err, repository.ErrProductInactive):
		return apiError(c, fiber.StatusUnprocessableEntity, "Producto no disponible", detail)
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
