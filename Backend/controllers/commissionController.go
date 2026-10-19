package controllers

import (
	"github.com/gofiber/fiber/v2"
)

// CommissionController expone el ledger de comisiones del distribuidor autenticado.
type CommissionController struct {
	commissions CommissionQueryRepository
}

// NewCommissionController recibe sus dependencias por inyección.
func NewCommissionController(commissions CommissionQueryRepository) *CommissionController {
	return &CommissionController{commissions: commissions}
}

// MyCommissions devuelve las comisiones del usuario del token (GET /api/commissions/mine,
// paginado): pedido, comprador, nivel, monto y estado, más los totales por estado.
func (h *CommissionController) MyCommissions(c *fiber.Ctx) error {
	userID, err := currentClaims(c).UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}
	page, limit, err := pagination(c)
	if err != nil {
		return apiError(c, fiber.StatusBadRequest, "Paginación inválida", err.Error())
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	ledger, err := h.commissions.ListUserCommissions(ctx, userID, page, limit)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(ledger)
}
