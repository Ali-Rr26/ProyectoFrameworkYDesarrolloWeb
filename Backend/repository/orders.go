package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"

	"multicatalogo-backend/models"
)

// CreateOrder registra un pedido completo de forma ACID dentro de una transacción:
//  1. verifica que el comprador exista y esté activo,
//  2. crea la cabecera en orders,
//  3. inserta cada línea en order_items; el trigger trg_order_items_stock valida y
//     descuenta el stock y fija unit_price con el precio vigente de la BD.
//
// Si cualquier paso falla se hace ROLLBACK: no queda ni pedido ni stock descontado.
func (r *Repository) CreateOrder(ctx context.Context, userID int, req models.CreateOrderRequest) (*models.Order, error) {
	items := mergeItems(req.Items)

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("iniciar transacción del pedido: %w", err)
	}
	// Rollback tras un Commit exitoso no hace nada; ante cualquier error deshace todo.
	defer tx.Rollback()

	// El comprador (tomado del JWT) debe seguir existiendo y estar activo:
	// un token emitido antes de desactivar la cuenta no permite comprar.
	var active bool
	err = tx.QueryRowContext(ctx,
		`SELECT active FROM users WHERE id = $1`, userID,
	).Scan(&active)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !active) {
		return nil, &DomainError{Kind: ErrInvalidRef, Detail: "usuario inexistente o inactivo"}
	}
	if err != nil {
		return nil, fmt.Errorf("verificar comprador: %w", err)
	}

	// El método de pago debe existir en el catálogo.
	var order models.Order
	err = tx.QueryRowContext(ctx, `
		INSERT INTO orders (user_id, payment_method_id, shipping_address, city, phone)
		SELECT $1, pm.id, $3, $4, $5 FROM payment_methods pm WHERE pm.name = $2
		RETURNING id, created_at`,
		userID, req.PaymentMethod, req.ShippingAddress, req.City, req.Phone,
	).Scan(&order.ID, &order.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &DomainError{Kind: ErrInvalidRef, Detail: "método de pago inexistente: " + req.PaymentMethod}
	}
	if err != nil {
		return nil, mapError(err)
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

	// El total es un dato derivado: se calcula con la vista, no se almacena.
	if err := tx.QueryRowContext(ctx,
		`SELECT total::float8 FROM v_order_totals WHERE order_id = $1`, order.ID,
	).Scan(&order.Total); err != nil {
		return nil, fmt.Errorf("calcular total del pedido: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("confirmar pedido: %w", err)
	}
	return &order, nil
}

// orderItemError traduce el error de una línea del pedido indicando el producto
// afectado: stock insuficiente (409) o producto inexistente (422).
func orderItemError(err error, productID int) error {
	mapped := mapError(err)
	switch {
	case errors.Is(mapped, ErrInsufficientStock):
		return &DomainError{Kind: ErrInsufficientStock, Detail: fmt.Sprintf("producto %d", productID)}
	case errors.Is(mapped, ErrInvalidRef):
		return &DomainError{Kind: ErrInvalidRef, Detail: fmt.Sprintf("producto %d inexistente", productID)}
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
