package controllers

import (
	"context"
	"errors"
	"log"
	"slices"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/config"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// dbTimeout es el tiempo máximo que una petición espera a la base de datos.
const dbTimeout = 5 * time.Second

// Handler agrupa las dependencias de los controladores (inyectadas desde main).
type Handler struct {
	repo *repository.Repository
	cfg  *config.Config
	jwt  *auth.Manager
}

// NewHandler construye el Handler con el repositorio, la configuración y el gestor de tokens.
func NewHandler(repo *repository.Repository, cfg *config.Config, jwt *auth.Manager) *Handler {
	return &Handler{repo: repo, cfg: cfg, jwt: jwt}
}

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

// localsClaims es la clave con la que RequireAuth guarda los claims en el contexto de Fiber.
const localsClaims = "auth_claims"

// RequireAuth exige un JWT válido en la cabecera "Authorization: Bearer <token>".
// Si es válido, guarda los claims para que los controladores conozcan al usuario.
func (h *Handler) RequireAuth(c *fiber.Ctx) error {
	header := c.Get(fiber.HeaderAuthorization)
	tokenStr, ok := strings.CutPrefix(header, "Bearer ")
	if !ok || tokenStr == "" {
		return apiError(c, fiber.StatusUnauthorized, "Token requerido", nil)
	}
	claims, err := h.jwt.Parse(tokenStr)
	if err != nil {
		// No se detalla el motivo (firma, expiración...) para no dar pistas a un atacante.
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}
	c.Locals(localsClaims, claims)
	return c.Next()
}

// RequireRole permite el acceso solo a los roles indicados. Debe ir después de RequireAuth.
func (h *Handler) RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims := currentClaims(c)
		if claims == nil {
			return apiError(c, fiber.StatusUnauthorized, "Token requerido", nil)
		}
		if slices.Contains(roles, claims.Role) {
			return c.Next()
		}
		return apiError(c, fiber.StatusForbidden, "No tiene permisos para este recurso", nil)
	}
}

// currentClaims devuelve los claims del usuario autenticado (nil si la ruta no pasó por RequireAuth).
func currentClaims(c *fiber.Ctx) *auth.Claims {
	claims, _ := c.Locals(localsClaims).(*auth.Claims)
	return claims
}
