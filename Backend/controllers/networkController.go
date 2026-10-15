package controllers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
)

// GetNetwork devuelve el árbol de referidos multinivel leído desde PostgreSQL (requiere JWT).
// Raíz según el rol del token:
//   - customer: siempre su propia red (se ignora ?user_id para que no consulte redes ajenas).
//   - admin:    ?user_id=<id> si se envía; si no, el usuario configurado en NETWORK_ROOT_EMAIL.
func (h *Handler) GetNetwork(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	claims := currentClaims(c)
	var rootID int
	if claims.Role != "admin" {
		id, err := claims.UserID()
		if err != nil {
			return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
		}
		rootID = id
	} else if q := c.Query("user_id"); q != "" {
		id, err := strconv.Atoi(q)
		if err != nil {
			return apiError(c, fiber.StatusBadRequest, "user_id inválido, debe ser un número", q)
		}
		rootID = id
	} else {
		user, err := h.repo.GetUserByEmail(ctx, h.cfg.NetworkRootEmail)
		if err != nil {
			return repoError(c, err)
		}
		rootID = user.ID
	}

	tree, err := h.repo.GetNetwork(ctx, rootID)
	if err != nil {
		return repoError(c, err)
	}

	// "Tú" solo cuando la raíz es quien consulta; si un admin ve la red de otro
	// miembro, se conserva el nombre real para que quede claro de quién es la red.
	if requesterID, err := claims.UserID(); err == nil && requesterID == rootID {
		tree.Name = "Tú"
	}
	return c.JSON(tree)
}
