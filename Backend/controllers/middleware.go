package controllers

import (
	"slices"
	"strings"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/auth"
)

// localsClaims es la clave con la que RequireAuth guarda los claims en el contexto de Fiber.
const localsClaims = "auth_claims"

// AuthMiddleware protege rutas validando el JWT.
type AuthMiddleware struct {
	tokens TokenParser
}

// NewAuthMiddleware recibe el validador de tokens por inyección.
func NewAuthMiddleware(tokens TokenParser) *AuthMiddleware {
	return &AuthMiddleware{tokens: tokens}
}

// RequireAuth exige un JWT válido en la cabecera "Authorization: Bearer <token>".
// Si es válido, guarda los claims para que los controladores conozcan al usuario.
func (m *AuthMiddleware) RequireAuth(c *fiber.Ctx) error {
	header := c.Get(fiber.HeaderAuthorization)
	tokenStr, ok := strings.CutPrefix(header, "Bearer ")
	if !ok || tokenStr == "" {
		return apiError(c, fiber.StatusUnauthorized, "Token requerido", nil)
	}
	claims, err := m.tokens.Parse(tokenStr)
	if err != nil {
		// No se detalla el motivo (firma, expiración...) para no dar pistas a un atacante.
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}
	c.Locals(localsClaims, claims)
	return c.Next()
}

// RequireRole permite el acceso solo a los roles indicados. Debe ir después de RequireAuth.
func (m *AuthMiddleware) RequireRole(roles ...string) fiber.Handler {
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
