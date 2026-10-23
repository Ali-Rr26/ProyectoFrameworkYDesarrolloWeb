package controllers

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/cache"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// OrderController atiende la consulta y la gestión de pedidos (el alta es del checkout).
type OrderController struct {
	orders  OrderQueryRepository
	cache   cache.Cache
	network NetworkInvalidator
}

// NewOrderController recibe sus dependencias por inyección.
func NewOrderController(orders OrderQueryRepository, c cache.Cache, network NetworkInvalidator) *OrderController {
	return &OrderController{orders: orders, cache: c, network: network}
}

// MyOrders lista los pedidos del usuario del token (GET /api/orders/mine, paginado,
// ?status= opcional). El comprador sale del JWT: nadie ve pedidos ajenos.
func (h *OrderController) MyOrders(c *fiber.Ctx) error {
	userID, err := currentClaims(c).UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}
	return h.list(c, &userID)
}

// ListOrders lista los pedidos de todos los compradores (GET /api/orders, solo admin).
func (h *OrderController) ListOrders(c *fiber.Ctx) error {
	return h.list(c, nil)
}

func (h *OrderController) list(c *fiber.Ctx, userID *int) error {
	page, limit, err := pagination(c)
	if err != nil {
		return apiError(c, fiber.StatusBadRequest, "Paginación inválida", err.Error())
	}
	status := strings.ToLower(strings.TrimSpace(c.Query("status")))
	if status != "" && !models.ValidOrderStatus(status) {
		return apiError(c, fiber.StatusBadRequest, "Estado de pedido inválido", status)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	result, err := h.orders.ListOrders(ctx, models.OrderFilter{UserID: userID, Status: status, Page: page, Limit: limit})
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(result)
}

// GetOrder devuelve un pedido con sus líneas (GET /api/orders/:id). Solo lo ve su dueño o
// un admin; a cualquier otro se le responde 404 para no revelar qué pedidos existen.
func (h *OrderController) GetOrder(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return apiError(c, fiber.StatusBadRequest, "ID inválido, debe ser un número", c.Params("id"))
	}
	claims := currentClaims(c)
	requesterID, err := claims.UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	order, err := h.orders.GetOrder(ctx, id)
	if errors.Is(err, repository.ErrNotFound) || (err == nil && claims.Role != "admin" && order.BuyerID != requesterID) {
		return apiError(c, fiber.StatusNotFound, "Pedido no encontrado", id)
	}
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(order)
}

// UpdateStatus cambia el estado de un pedido (PATCH /api/orders/:id/status, solo admin).
// Cancelar repone el stock y revierte las comisiones: se invalidan el catálogo y la red
// del comprador en caché.
func (h *OrderController) UpdateStatus(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return apiError(c, fiber.StatusBadRequest, "ID inválido, debe ser un número", c.Params("id"))
	}
	var req models.UpdateOrderStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}
	status := strings.ToLower(strings.TrimSpace(req.Status))
	if !models.ValidOrderStatus(status) {
		return apiError(c, fiber.StatusBadRequest, "Estado de pedido inválido",
			map[string]string{"status": "debe ser pending, preparing, shipped, delivered o cancelled"})
	}
	// Estado que vio el cliente (opcional): si el pedido ya cambió, el repositorio responde 409.
	fromStatus := strings.ToLower(strings.TrimSpace(req.FromStatus))
	if fromStatus != "" && !models.ValidOrderStatus(fromStatus) {
		return apiError(c, fiber.StatusBadRequest, "Estado de pedido inválido",
			map[string]string{"from_status": "debe ser pending, preparing, shipped, delivered o cancelled"})
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	order, err := h.orders.UpdateOrderStatus(ctx, id, status, fromStatus)
	if errors.Is(err, repository.ErrNotFound) {
		return apiError(c, fiber.StatusNotFound, "Pedido no encontrado", id)
	}
	if err != nil {
		return repoError(c, err)
	}
	if status == models.OrderCancelled {
		cache.Delete(h.cache, cache.KeyProducts)
		h.network.InvalidateNetwork(ctx, order.BuyerID)
	}
	return c.JSON(order)
}
