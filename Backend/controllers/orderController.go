package controllers

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
)

// CreateOrder registra una compra de forma transaccional (requiere JWT).
// El comprador se toma del token, nunca del cuerpo: nadie puede comprar a nombre de otro.
func (h *Handler) CreateOrder(c *fiber.Ctx) error {
	userID, err := currentClaims(c).UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}

	var req models.CreateOrderRequest
	if err := c.BodyParser(&req); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}

	req.PaymentMethod = strings.TrimSpace(req.PaymentMethod)
	req.ShippingAddress = strings.TrimSpace(req.ShippingAddress)
	req.City = strings.TrimSpace(req.City)
	req.Phone = strings.TrimSpace(req.Phone)

	fieldErrors := map[string]string{}
	required := map[string]string{
		"payment_method":   req.PaymentMethod,
		"shipping_address": req.ShippingAddress,
		"city":             req.City,
		"phone":            req.Phone,
	}
	for field, value := range required {
		if value == "" {
			fieldErrors[field] = "es requerido"
		}
	}
	if len(req.Items) == 0 {
		fieldErrors["items"] = "debe incluir al menos un producto"
	}
	for i, it := range req.Items {
		if it.ProductID <= 0 || it.Quantity <= 0 {
			fieldErrors[fmt.Sprintf("items[%d]", i)] = "product_id y quantity deben ser mayores a 0"
		}
	}
	if len(fieldErrors) > 0 {
		return apiError(c, fiber.StatusBadRequest, "Datos de pedido inválidos", fieldErrors)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	order, err := h.repo.CreateOrder(ctx, userID, req)
	if err != nil {
		return repoError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(order)
}

// GetPaymentMethods lista los métodos de pago disponibles (catálogo de la BD).
func (h *Handler) GetPaymentMethods(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	methods, err := h.repo.GetPaymentMethods(ctx)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(methods)
}
