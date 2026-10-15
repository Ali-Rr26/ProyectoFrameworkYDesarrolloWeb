package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"

	"multicatalogo-backend/models"
)

// CreateOrder registra un pedido completo de forma ACID:
//  1. crea la cabecera en orders,
//  2. por cada producto descuenta stock con un UPDATE condicional (stock >= quantity),
//  3. inserta la línea con el precio vigente leído de la BD (nunca el enviado por el cliente).
//
// Si cualquier paso falla se hace ROLLBACK y no queda ni pedido ni stock descontado.
func (r *Repository) CreateOrder(ctx context.Context, userID int, req models.CreateOrderRequest) (*models.Order, error) {
	items := mergeItems(req.Items)

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
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
		return nil, err
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

		// UPDATE condicional: PostgreSQL bloquea la fila, así dos compras simultáneas
		// no pueden dejar el stock negativo (evita la carrera "leer y luego restar").
		err := tx.QueryRowContext(ctx, `
			UPDATE products SET stock = stock - $1
			WHERE id = $2 AND stock >= $1
			RETURNING name, price::float8`,
			it.Quantity, it.ProductID,
		).Scan(&line.Name, &line.UnitPrice)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, productUnavailableError(ctx, tx, it.ProductID)
		}
		if err != nil {
			return nil, mapError(err)
		}

		// unit_price se copia desde products dentro de la misma transacción (valor NUMERIC exacto).
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO order_items (order_id, product_id, quantity, unit_price)
			SELECT $1, id, $3, price FROM products WHERE id = $2`,
			order.ID, it.ProductID, it.Quantity,
		); err != nil {
			return nil, mapError(err)
		}
		order.Items = append(order.Items, line)
	}

	// El total es un dato derivado: se calcula con la vista, no se almacena.
	if err := tx.QueryRowContext(ctx,
		`SELECT total::float8 FROM v_order_totals WHERE order_id = $1`, order.ID,
	).Scan(&order.Total); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &order, nil
}

// productUnavailableError distingue entre producto inexistente y stock insuficiente.
func productUnavailableError(ctx context.Context, tx *sql.Tx, productID int) error {
	var exists bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM products WHERE id = $1)`, productID,
	).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return &DomainError{Kind: ErrInvalidRef, Detail: fmt.Sprintf("producto %d inexistente", productID)}
	}
	return &DomainError{Kind: ErrInsufficientStock, Detail: fmt.Sprintf("producto %d", productID)}
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
