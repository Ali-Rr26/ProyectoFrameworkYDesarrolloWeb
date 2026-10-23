package controllers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

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

// Paginación estándar de los listados (?page=&limit=).
const (
	defaultPageLimit = 10
	maxPageLimit     = 50
)

// pagination lee ?page (desde 1) y ?limit (1 a 50, por defecto 10) de la petición.
func pagination(c *fiber.Ctx) (page, limit int, err error) {
	page, limit = 1, defaultPageLimit
	if v := c.Query("page"); v != "" {
		if page, err = strconv.Atoi(v); err != nil || page < 1 {
			return 0, 0, fmt.Errorf("page debe ser un entero mayor o igual a 1")
		}
	}
	if v := c.Query("limit"); v != "" {
		if limit, err = strconv.Atoi(v); err != nil || limit < 1 || limit > maxPageLimit {
			return 0, 0, fmt.Errorf("limit debe ser un entero entre 1 y %d", maxPageLimit)
		}
	}
	return page, limit, nil
}

// maxSearchLength es el largo máximo del texto de búsqueda (?q=).
const maxSearchLength = 100

// listFilter lee la paginación estándar y ?q= (texto a buscar, sin espacios a los lados)
// de los listados del administrador con búsqueda.
func listFilter(c *fiber.Ctx) (models.ListFilter, error) {
	page, limit, err := pagination(c)
	if err != nil {
		return models.ListFilter{}, err
	}
	query := strings.TrimSpace(c.Query("q"))
	if utf8.RuneCountInString(query) > maxSearchLength {
		return models.ListFilter{}, fmt.Errorf("q admite como máximo %d caracteres", maxSearchLength)
	}
	return models.ListFilter{Query: query, Page: page, Limit: limit}, nil
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

	// Conflictos de la sincronización offline: el detalle es lo que el cliente necesita
	// para resolverlos (producto vigente, total vigente, estado vigente).
	var versionConflict *repository.VersionConflictError
	var priceChanged *repository.PriceChangedError
	var statusChanged *repository.StatusChangedError
	switch {
	case errors.As(err, &versionConflict):
		return apiError(c, fiber.StatusConflict, "El producto fue modificado mientras lo editabas", versionConflict.Current)
	case errors.As(err, &priceChanged):
		return apiError(c, fiber.StatusConflict, "Los precios cambiaron desde que armaste el pedido",
			map[string]float64{"expected_total": priceChanged.Expected, "total": priceChanged.Total})
	case errors.As(err, &statusChanged):
		return apiError(c, fiber.StatusConflict, "El pedido cambió de estado mientras tanto",
			map[string]string{"status": statusChanged.Current})
	case errors.Is(err, repository.ErrIdempotencyInProgress):
		return apiError(c, fiber.StatusConflict, "Esta operación ya se está procesando; reintenta en unos segundos", nil)
	}

	switch {
	case errors.Is(err, repository.ErrNotFound):
		return apiError(c, fiber.StatusNotFound, "Recurso no encontrado", detail)
	case errors.Is(err, repository.ErrDuplicate):
		return apiError(c, fiber.StatusConflict, "El registro ya existe", detail)
	case errors.Is(err, repository.ErrInvalidQuantity):
		return apiError(c, fiber.StatusBadRequest, msgInvalidQuantity, detail)
	case errors.Is(err, repository.ErrInvalidTransition):
		return apiError(c, fiber.StatusBadRequest, "Transición de estado inválida", detail)
	case errors.Is(err, repository.ErrCommissionsPaid):
		return apiError(c, fiber.StatusConflict, "El pedido tiene comisiones ya liquidadas y no se puede cancelar", detail)
	case errors.Is(err, repository.ErrNothingToPay):
		return apiError(c, fiber.StatusConflict, "No hay comisiones listas para liquidar (solo se pagan pedidos entregados)", detail)
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
