package repository

import (
	"context"

	"multicatalogo-backend/models"
)

// Los reportes agregan sobre las vistas de datos derivados (v_order_totals) y excluyen
// los pedidos cancelados de las ventas. El periodo es [$1, $2) sobre orders.created_at.

// GetSalesSummary calcula los KPIs del negocio en el periodo: ventas, pedidos, ticket
// promedio, pedidos cancelados, comisiones devengadas (no revertidas) y nuevos afiliados.
func (r *Repository) GetSalesSummary(ctx context.Context, period models.DateRange) (*models.SalesSummary, error) {
	var s models.SalesSummary
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(t.total) FILTER (WHERE o.status <> 'cancelled'), 0)::float8,
		       count(*) FILTER (WHERE o.status <> 'cancelled')::int,
		       COALESCE(AVG(t.total) FILTER (WHERE o.status <> 'cancelled'), 0)::float8,
		       count(*) FILTER (WHERE o.status = 'cancelled')::int,
		       (SELECT COALESCE(SUM(c.amount), 0)::float8 FROM commissions c
		        JOIN orders oc ON oc.id = c.order_id
		        WHERE c.status <> 'reversed' AND oc.created_at >= $1 AND oc.created_at < $2),
		       (SELECT count(*)::int FROM network_members nm WHERE nm.joined_at >= $1 AND nm.joined_at < $2)
		FROM orders o
		JOIN v_order_totals t ON t.order_id = o.id
		WHERE o.created_at >= $1 AND o.created_at < $2`,
		period.From, period.To,
	).Scan(&s.TotalSales, &s.OrdersCount, &s.AverageTicket, &s.CancelledCount, &s.CommissionsAccrued, &s.NewMembers)
	if err != nil {
		return nil, mapError(err)
	}
	return &s, nil
}

// GetTopProducts devuelve los productos más vendidos del periodo por ingresos
// (SUM(quantity × unit_price) de pedidos no cancelados).
func (r *Repository) GetTopProducts(ctx context.Context, period models.DateRange, limit int) ([]models.TopProduct, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT p.id, p.name, SUM(oi.quantity)::int, SUM(oi.quantity * oi.unit_price)::float8
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		WHERE o.status <> 'cancelled' AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY p.id, p.name
		ORDER BY 4 DESC, 3 DESC, p.id
		LIMIT $3`, period.From, period.To, limit)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	top := []models.TopProduct{}
	for rows.Next() {
		var t models.TopProduct
		if err := rows.Scan(&t.ProductID, &t.Name, &t.Units, &t.Revenue); err != nil {
			return nil, err
		}
		top = append(top, t)
	}
	return top, rows.Err()
}

// GetTopSponsors devuelve los patrocinadores cuya red (niveles 1 a 3) más vendió en el
// periodo. Usa el ledger de comisiones como relación pedido → patrocinador: cada comisión
// no revertida une un pedido de la red con quien cobra por él.
func (r *Repository) GetTopSponsors(ctx context.Context, period models.DateRange, limit int) ([]models.TopSponsor, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.id, u.name, u.email,
		       SUM(t.total)::float8, count(*)::int, SUM(c.amount)::float8
		FROM commissions c
		JOIN orders o ON o.id = c.order_id
		JOIN v_order_totals t ON t.order_id = o.id
		JOIN users u ON u.id = c.beneficiary_id
		WHERE c.status <> 'reversed' AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY u.id, u.name, u.email
		ORDER BY 4 DESC, u.id
		LIMIT $3`, period.From, period.To, limit)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	top := []models.TopSponsor{}
	for rows.Next() {
		var t models.TopSponsor
		if err := rows.Scan(&t.SponsorID, &t.Name, &t.Email, &t.NetworkSales, &t.OrdersCount, &t.Commissions); err != nil {
			return nil, err
		}
		top = append(top, t)
	}
	return top, rows.Err()
}
