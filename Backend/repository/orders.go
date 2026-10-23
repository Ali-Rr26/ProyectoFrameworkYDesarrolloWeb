package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"time"

	"multicatalogo-backend/config"
	"multicatalogo-backend/models"
)

// ErrSimulatedFailure es el error que lanza la falla simulada del checkout (HTTP 500).
var ErrSimulatedFailure = errors.New("falla simulada: caída del sistema a mitad de la transacción")

// CreateOrder registra un pedido completo de forma ACID dentro de una transacción:
//  1. verifica que el comprador exista y esté activo,
//  2. crea la cabecera en orders,
//  3. inserta cada línea en order_items; el trigger trg_order_items_stock valida y
//     descuenta el stock y fija unit_price con el precio vigente de la BD.
//
// Si cualquier paso falla se hace ROLLBACK: no queda ni pedido ni stock descontado.
// Las fallas simuladas (CHECKOUT_FAIL_AT / CHECKOUT_COMMIT_DELAY) se inyectan aquí.
func (r *Repository) CreateOrder(ctx context.Context, userID int, req models.CreateOrderRequest) (*models.Order, error) {
	// Defensa en profundidad: el controlador ya valida, pero el repositorio no confía
	// en su llamador (una cantidad negativa sumaría stock en lugar de descontarlo).
	for _, it := range req.Items {
		if it.Quantity <= 0 {
			return nil, &DomainError{Kind: ErrInvalidQuantity, Detail: fmt.Sprintf("producto %d", it.ProductID), Public: true}
		}
	}
	items := mergeItems(req.Items)

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("iniciar transacción del pedido: %w", err)
	}
	// Rollback tras un Commit exitoso no hace nada; ante cualquier error deshace todo.
	defer tx.Rollback()

	// Pedido guardado sin conexión y reenviado: la clave impide registrarlo (y pagar sus
	// comisiones) dos veces. Se reserva en esta misma transacción.
	if err := claimIdempotency(ctx, tx); err != nil {
		return nil, err
	}

	// El comprador (tomado del JWT) debe seguir existiendo y estar activo:
	// un token emitido antes de desactivar la cuenta no permite comprar.
	var active bool
	err = tx.QueryRowContext(ctx,
		`SELECT active FROM users WHERE id = $1`, userID,
	).Scan(&active)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !active) {
		return nil, &DomainError{Kind: ErrInvalidRef, Detail: "usuario inexistente o inactivo", Public: true}
	}
	if err != nil {
		return nil, fmt.Errorf("verificar comprador: %w", err)
	}

	// El método de pago debe existir en el catálogo.
	var order models.Order
	err = tx.QueryRowContext(ctx, `
		INSERT INTO orders (user_id, payment_method_id, shipping_address, city, phone)
		SELECT $1, pm.id, $3, $4, $5 FROM payment_methods pm WHERE pm.name = $2
		RETURNING id, created_at, status`,
		userID, req.PaymentMethod, req.ShippingAddress, req.City, req.Phone,
	).Scan(&order.ID, &order.CreatedAt, &order.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &DomainError{Kind: ErrInvalidRef, Detail: "método de pago inexistente: " + req.PaymentMethod, Public: true}
	}
	if err != nil {
		return nil, mapError(err)
	}

	// ===== PUNTO DE FALLA 1 (CHECKOUT_FAIL_AT=after_order) =====
	// La cabecera ya se insertó en la transacción, pero aún no está confirmada.
	// Al retornar, el defer tx.Rollback() la deshace: no queda un "pedido fantasma".
	if r.faults.FailAt == config.FailAfterOrder {
		return nil, simulatedFailure("tras insertar la cabecera del pedido", order.ID)
	}

	for _, it := range items {
		line := models.OrderItem{ProductID: it.ProductID, Quantity: it.Quantity}

		// No se envía unit_price: lo fija el trigger con el precio de la BD, junto con
		// la validación y el descuento de stock (bloquea la fila del producto).
		err := tx.QueryRowContext(ctx, `
			INSERT INTO order_items (order_id, product_id, quantity)
			VALUES ($1, $2, $3)
			RETURNING unit_price::float8,
			          (SELECT p.name FROM products p WHERE p.id = order_items.product_id)`,
			order.ID, it.ProductID, it.Quantity,
		).Scan(&line.UnitPrice, &line.Name)
		if err != nil {
			return nil, orderItemError(err, it.ProductID)
		}
		order.Items = append(order.Items, line)
	}

	// ===== PUNTO DE FALLA 2 (CHECKOUT_FAIL_AT=after_items) =====
	// El trigger ya descontó el stock de cada línea; el ROLLBACK también lo repone.
	if r.faults.FailAt == config.FailAfterItems {
		return nil, simulatedFailure("tras insertar las líneas y descontar el stock", order.ID)
	}

	// El total es un dato derivado: se calcula con la vista, no se almacena.
	if err := tx.QueryRowContext(ctx,
		`SELECT total::float8 FROM v_order_totals WHERE order_id = $1`, order.ID,
	).Scan(&order.Total); err != nil {
		return nil, fmt.Errorf("calcular total del pedido: %w", err)
	}

	// El cliente vio otro total (precios cambiados mientras el pedido esperaba sin
	// conexión): no se cobra un monto distinto al que aceptó; ROLLBACK y 409.
	if req.ExpectedTotal != nil && totalsDiffer(*req.ExpectedTotal, order.Total) {
		return nil, &PriceChangedError{Expected: *req.ExpectedTotal, Total: order.Total}
	}

	// ===== PUNTO DE FALLA 3 (CHECKOUT_COMMIT_DELAY=10s) =====
	// Pausa antes del COMMIT: da tiempo a ejecutar `docker kill multicatalogo-db`.
	// Si la conexión se corta, PostgreSQL descarta la transacción al recuperarse.
	if d := r.faults.CommitDelay; d > 0 {
		log.Printf("checkout: pedido %d en espera %s antes del COMMIT (demostración)", order.ID, d)
		select {
		case <-time.After(d):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	if err := storeIdempotentResponse(ctx, tx, http.StatusCreated, &order); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("confirmar pedido: %w", err)
	}
	return &order, nil
}

// totalsDiffer compara montos en dólares con tolerancia de medio centavo (los totales
// viajan como float64 y pueden diferir en el último decimal sin que cambie el precio).
func totalsDiffer(a, b float64) bool {
	return math.Abs(a-b) >= 0.005
}

// simulatedFailure registra la falla inyectada y devuelve ErrSimulatedFailure.
func simulatedFailure(stage string, orderID int) error {
	log.Printf("checkout: FALLA SIMULADA %s (pedido %d) -> ROLLBACK", stage, orderID)
	return ErrSimulatedFailure
}

// orderItemError traduce el error de una línea del pedido indicando el producto
// afectado: stock insuficiente (409), producto dado de baja o inexistente (422).
func orderItemError(err error, productID int) error {
	mapped := mapError(err)
	switch {
	case errors.Is(mapped, ErrInsufficientStock):
		return &DomainError{Kind: ErrInsufficientStock, Detail: fmt.Sprintf("producto %d", productID), Public: true}
	case errors.Is(mapped, ErrProductInactive):
		return &DomainError{Kind: ErrProductInactive, Detail: fmt.Sprintf("producto %d", productID), Public: true}
	case errors.Is(mapped, ErrInvalidRef):
		return &DomainError{Kind: ErrInvalidRef, Detail: fmt.Sprintf("producto %d inexistente", productID), Public: true}
	default:
		return mapped
	}
}

// mergeItems suma cantidades del mismo producto (la PK de order_items es
// (order_id, product_id)) y ordena por ID: todas las transacciones bloquean las
// filas en el mismo orden, lo que evita interbloqueos (deadlocks) entre compras.
func mergeItems(items []models.OrderItemInput) []models.OrderItemInput {
	totals := map[int]int{}
	for _, it := range items {
		totals[it.ProductID] += it.Quantity
	}
	merged := make([]models.OrderItemInput, 0, len(totals))
	for id, qty := range totals {
		merged = append(merged, models.OrderItemInput{ProductID: id, Quantity: qty})
	}
	sort.Slice(merged, func(i, j int) bool { return merged[i].ProductID < merged[j].ProductID })
	return merged
}
