package controllers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/cache"
	"multicatalogo-backend/models"
)

// CheckoutController procesa las compras. Todas sus dependencias llegan por el
// constructor como interfaces: no conoce PostgreSQL, Redis ni goroutines.
type CheckoutController struct {
	orders      OrderRepository
	cache       cache.Cache
	network     NetworkInvalidator
	commissions CommissionProcessor
	// timeout es el presupuesto de la transacción; incluye la pausa de demostración
	// antes del COMMIT (CHECKOUT_COMMIT_DELAY) para que no la corte el plazo normal.
	timeout time.Duration
}

// NewCheckoutController construye el controlador con sus dependencias.
func NewCheckoutController(orders OrderRepository, c cache.Cache, network NetworkInvalidator,
	commissions CommissionProcessor, commitDelay time.Duration) *CheckoutController {
	return &CheckoutController{
		orders:      orders,
		cache:       c,
		network:     network,
		commissions: commissions,
		timeout:     dbTimeout + commitDelay,
	}
}

// Checkout registra una compra (POST /api/checkout, alias POST /api/orders; requiere JWT):
//  1. valida el cuerpo enviado por Checkout.tsx (400 si es inválido);
//  2. registra pedido + líneas en una transacción ACID (ROLLBACK ante cualquier falla);
//  3. tras el COMMIT invalida la caché y lanza en una goroutine el cálculo de comisiones;
//  4. responde 201 sin esperar a las comisiones.
//
// El comprador se toma del token, nunca del cuerpo: nadie puede comprar a nombre de otro.
func (h *CheckoutController) Checkout(c *fiber.Ctx) error {
	userID, err := currentClaims(c).UserID()
	if err != nil {
		return apiError(c, fiber.StatusUnauthorized, "Token inválido o expirado", nil)
	}

	var req models.CreateOrderRequest
	if err := c.BodyParser(&req); err != nil {
		return apiError(c, fiber.StatusBadRequest, "Cuerpo de petición inválido", nil)
	}
	if fieldErrors := validateOrder(&req); len(fieldErrors) > 0 {
		return apiError(c, fiber.StatusBadRequest, "Datos de pedido inválidos", fieldErrors)
	}
	// La cantidad se valida aparte para devolver su propio mensaje (no se confunde con
	// "Stock insuficiente") y antes de abrir la transacción.
	if productID, ok := invalidQuantity(req.Items); ok {
		return apiError(c, fiber.StatusBadRequest, msgInvalidQuantity, fmt.Sprintf("producto %d", productID))
	}

	ctx, cancel := context.WithTimeout(c.UserContext(), h.timeout)
	defer cancel()

	order, err := h.orders.CreateOrder(ctx, userID, req)
	if err != nil {
		// Hubo ROLLBACK: no hay pedido, ni stock descontado, ni comisiones que pagar.
		return repoError(c, err)
	}

	// El trigger descontó stock y cambiaron las ventas del comprador:
	// se invalidan el catálogo y los árboles de red donde aparece.
	cache.Delete(h.cache, cache.KeyProducts)
	h.network.InvalidateNetwork(ctx, userID)

	// Misión crítica sin bloquear al cliente: las comisiones de los niveles 1 a 3 se
	// calculan en una goroutine; al terminar, vuelve a invalidar la caché de la red.
	h.commissions.ProcessAsync(order.ID, userID)

	return c.Status(fiber.StatusCreated).JSON(order)
}

// validateOrder normaliza el pedido y devuelve los errores por campo (vacío si es válido).
func validateOrder(req *models.CreateOrderRequest) map[string]string {
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
		if it.ProductID <= 0 {
			fieldErrors[fmt.Sprintf("items[%d].product_id", i)] = "debe ser mayor que cero"
		}
	}
	if req.ExpectedTotal != nil && *req.ExpectedTotal <= 0 {
		fieldErrors["expected_total"] = "debe ser mayor que cero"
	}
	return fieldErrors
}

// invalidQuantity devuelve el primer producto cuya cantidad es cero o negativa.
// Se revisa cada línea tal como llegó: sumar antes permitiría que una línea negativa
// "compense" a otra del mismo producto.
func invalidQuantity(items []models.OrderItemInput) (int, bool) {
	for _, it := range items {
		if it.Quantity <= 0 {
			return it.ProductID, true
		}
	}
	return 0, false
}

// GetPaymentMethods lista los métodos de pago disponibles (catálogo de la BD).
func (h *CheckoutController) GetPaymentMethods(c *fiber.Ctx) error {
	ctx, cancel := dbCtx(c)
	defer cancel()

	methods, err := h.orders.GetPaymentMethods(ctx)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(methods)
}
