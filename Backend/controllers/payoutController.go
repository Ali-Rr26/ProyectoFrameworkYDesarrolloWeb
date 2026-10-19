package controllers

import (
	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
)

// PayoutController gestiona las liquidaciones de comisiones a los distribuidores.
type PayoutController struct {
	payouts PayoutRepository
}

// NewPayoutController recibe sus dependencias por inyección.
func NewPayoutController(payouts PayoutRepository) *PayoutController {
	return &PayoutController{payouts: payouts}
}

// CreatePayout liquida las comisiones pendientes de pedidos entregados de un distribuidor
// (POST /api/payouts, solo admin). Sin nada listo para liquidar → 409; inexistente → 404.
func (h *PayoutController) CreatePayout(c *fiber.Ctx) error {
	var req models.CreatePayoutRequest
	if err := c.BodyParser(&req); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}
	if req.BeneficiaryID <= 0 {
		return apiError(c, fiber.StatusBadRequest, "Datos de liquidación inválidos",
			map[string]string{"beneficiary_id": "es requerido"})
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	payout, err := h.payouts.CreatePayout(ctx, req.BeneficiaryID)
	if err != nil {
		return repoError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(payout)
}

// ListPayouts devuelve el historial de pagos de todos los distribuidores
// (GET /api/payouts, solo admin, paginado).
func (h *PayoutController) ListPayouts(c *fiber.Ctx) error {
	return h.list(c, nil)
}

// MyPayouts devuelve los cobros del distribuidor autenticado (GET /api/payouts/mine).
func (h *PayoutController) MyPayouts(c *fiber.Ctx) error {
	userID, err := currentClaims(c).UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}
	return h.list(c, &userID)
}

func (h *PayoutController) list(c *fiber.Ctx, beneficiaryID *int) error {
	page, limit, err := pagination(c)
	if err != nil {
		return apiError(c, fiber.StatusBadRequest, "Paginación inválida", err.Error())
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	result, err := h.payouts.ListPayouts(ctx, beneficiaryID, page, limit)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(result)
}

// PendingCommissions devuelve la deuda por distribuidor
// (GET /api/reports/pending-commissions, solo admin).
func (h *PayoutController) PendingCommissions(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	debts, err := h.payouts.GetPendingDebts(ctx)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(debts)
}
