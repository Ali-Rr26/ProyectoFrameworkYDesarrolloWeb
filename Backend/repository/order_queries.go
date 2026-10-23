package repository

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"

	"multicatalogo-backend/models"
)

// orderSummaryColumns arma una fila de listado: el total sale de v_order_totals (dato
// derivado) y las unidades de la suma de las líneas.
const orderSummaryColumns = `
	SELECT o.id, o.created_at, o.status, t.total::float8,
	       (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id)::int,
	       u.id, u.name, u.email`

// orderFrom y orderWhere son la base de los listados; $1 = comprador (NULL = todos),
// $2 = estado (cadena vacía = todos).
const (
	orderFrom = `
	FROM orders o
	JOIN users u ON u.id = o.user_id
	JOIN v_order_totals t ON t.order_id = o.id`
	orderWhere = `
	WHERE ($1::int IS NULL OR o.user_id = $1)
	  AND ($2 = '' OR o.status = $2)`
)

func scanOrderSummary(s scanner) (models.OrderSummary, error) {
	var o models.OrderSummary
	err := s.Scan(&o.ID, &o.CreatedAt, &o.Status, &o.Total, &o.ItemsCount, &o.BuyerID, &o.BuyerName, &o.BuyerEmail)
	return o, err
}

// ListOrders devuelve una página de pedidos, del más reciente al más antiguo, y el total
// de pedidos que cumplen el filtro (para la paginación).
func (r *Repository) ListOrders(ctx context.Context, f models.OrderFilter) (*models.Page[models.OrderSummary], error) {
	page := &models.Page[models.OrderSummary]{Data: []models.OrderSummary{}, Page: f.Page, Limit: f.Limit}
	if err := r.db.QueryRowContext(ctx, `SELECT count(*)`+orderFrom+orderWhere, f.UserID, f.Status).Scan(&page.Total); err != nil {
		return nil, mapError(err)
	}

	rows, err := r.db.QueryContext(ctx,
		orderSummaryColumns+orderFrom+orderWhere+` ORDER BY o.created_at DESC, o.id DESC LIMIT $3 OFFSET $4`,
		f.UserID, f.Status, f.Limit, (f.Page-1)*f.Limit)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()
	for rows.Next() {
		o, err := scanOrderSummary(rows)
		if err != nil {
			return nil, err
		}
		page.Data = append(page.Data, o)
	}
	return page, rows.Err()
}

// GetOrder devuelve un pedido con sus líneas y datos de envío, o ErrNotFound.
func (r *Repository) GetOrder(ctx context.Context, id int) (*models.OrderDetail, error) {
	return getOrder(ctx, r.db, id)
}

// queryer abstrae *sql.DB y *sql.Tx para leer el pedido dentro o fuera de una transacción.
type queryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

func getOrder(ctx context.Context, q queryer, id int) (*models.OrderDetail, error) {
	var d models.OrderDetail
	row := q.QueryRowContext(ctx, orderSummaryColumns+`,
	       pm.name, o.shipping_address, o.city, o.phone`+orderFrom+`
	JOIN payment_methods pm ON pm.id = o.payment_method_id
	WHERE o.id = $1`, id)
	err := row.Scan(&d.ID, &d.CreatedAt, &d.Status, &d.Total, &d.ItemsCount, &d.BuyerID, &d.BuyerName, &d.BuyerEmail,
		&d.PaymentMethod, &d.ShippingAddress, &d.City, &d.Phone)
	if err != nil {
		return nil, mapError(err)
	}

	rows, err := q.QueryContext(ctx, `
		SELECT oi.product_id, p.name, oi.quantity, oi.unit_price::float8
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		WHERE oi.order_id = $1
		ORDER BY oi.product_id`, id)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()
	d.Items = []models.OrderItem{}
	for rows.Next() {
		var it models.OrderItem
		if err := rows.Scan(&it.ProductID, &it.Name, &it.Quantity, &it.UnitPrice); err != nil {
			return nil, err
		}
		d.Items = append(d.Items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	d.NextStatuses = models.NextOrderStatuses(d.Status)
	return &d, nil
}

// UpdateOrderStatus cambia el estado de un pedido respetando el ciclo de vida
// (models.OrderTransitionAllowed). La cancelación es el espejo ACID del checkout, todo
// en una transacción:
//  1. bloquea el pedido (FOR UPDATE): espera a que termine un cálculo de comisiones en
//     curso, que lo lee con FOR SHARE, y le impide empezar después;
//  2. rechaza la cancelación si alguna comisión ya se liquidó (no se revierte dinero pagado);
//  3. repone el stock de cada línea (bloqueando los productos en orden de ID, igual que el
//     checkout, para evitar interbloqueos) y revierte las comisiones pendientes.
//
// fromStatus (opcional) es el estado que vio el cliente: si el pedido ya está en otro,
// no se cambia nada y se devuelve *StatusChangedError con el estado vigente.
func (r *Repository) UpdateOrderStatus(ctx context.Context, id int, status, fromStatus string) (*models.OrderDetail, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if err := claimIdempotency(ctx, tx); err != nil {
		return nil, err
	}

	var current string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM orders WHERE id = $1 FOR UPDATE`, id).Scan(&current); err != nil {
		return nil, mapError(err)
	}
	if fromStatus != "" && fromStatus != current {
		return nil, &StatusChangedError{Current: current}
	}
	if !models.OrderTransitionAllowed(current, status) {
		return nil, &DomainError{Kind: ErrInvalidTransition, Detail: fmt.Sprintf("%s → %s", current, status), Public: true}
	}

	if status == models.OrderCancelled {
		var paid bool
		if err := tx.QueryRowContext(ctx,
			`SELECT EXISTS (SELECT 1 FROM commissions WHERE order_id = $1 AND status = 'paid')`, id,
		).Scan(&paid); err != nil {
			return nil, mapError(err)
		}
		if paid {
			return nil, &DomainError{Kind: ErrCommissionsPaid, Detail: fmt.Sprintf("pedido %d", id), Public: true}
		}

		if _, err := tx.ExecContext(ctx, `
			SELECT p.id FROM products p
			JOIN order_items oi ON oi.product_id = p.id
			WHERE oi.order_id = $1
			ORDER BY p.id
			FOR UPDATE OF p`, id); err != nil {
			return nil, mapError(err)
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE products p SET stock = p.stock + oi.quantity
			FROM order_items oi
			WHERE oi.order_id = $1 AND p.id = oi.product_id`, id); err != nil {
			return nil, mapError(err)
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE commissions SET status = 'reversed' WHERE order_id = $1 AND status = 'pending'`, id,
		); err != nil {
			return nil, mapError(err)
		}
	}

	if _, err := tx.ExecContext(ctx, `UPDATE orders SET status = $2 WHERE id = $1`, id, status); err != nil {
		return nil, mapError(err)
	}

	detail, err := getOrder(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if err := storeIdempotentResponse(ctx, tx, http.StatusOK, detail); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return detail, nil
}
