package controllers

import (
	"errors"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// Claves con las que RequireAuth guarda la identidad en el contexto de Fiber.
const (
	localsClaims = "auth_claims"
	localsUser   = "auth_user"
)

// AuthMiddleware protege rutas validando el JWT y el estado vigente de la cuenta.
type AuthMiddleware struct {
	tokens   TokenParser
	accounts AccountLookup
}

// NewAuthMiddleware recibe el validador de tokens y la consulta de cuentas por inyección.
func NewAuthMiddleware(tokens TokenParser, accounts AccountLookup) *AuthMiddleware {
	return &AuthMiddleware{tokens: tokens, accounts: accounts}
}

// RequireAuth exige un JWT válido en la cabecera "Authorization: Bearer <token>" y que
// la cuenta siga activa en la base: una cuenta desactivada pierde el acceso en su
// siguiente petición, sin esperar a que el token expire. El rol y el email de los claims
// se actualizan con los de la base, así RequireRole aplica el rol vigente (un admin al
// que se le quitó el rol deja de serlo de inmediato).
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
	userID, err := claims.UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	user, err := m.accounts.GetUserByID(ctx, userID)
	if errors.Is(err, repository.ErrNotFound) || (err == nil && !user.Active) {
		return apiError(c, fiber.StatusUnauthorized, "Sesión no válida: la cuenta no existe o fue desactivada", nil)
	}
	if err != nil {
		return repoError(c, err)
	}

	claims.Role, claims.Email = user.Role, user.Email
	c.Locals(localsClaims, claims)
	c.Locals(localsUser, user)
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

// currentUser devuelve la cuenta autenticada tal como está en la base (nil si la ruta no
// pasó por RequireAuth).
func currentUser(c *fiber.Ctx) *models.User {
	user, _ := c.Locals(localsUser).(*models.User)
	return user
}
