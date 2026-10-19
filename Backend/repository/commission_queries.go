package repository

import (
	"context"

	"multicatalogo-backend/models"
)

// ListUserCommissions devuelve una página del ledger de comisiones de un beneficiario
// (de la más reciente a la más antigua) y sus totales por estado, calculados sobre todas
// sus comisiones y no solo sobre la página.
func (r *Repository) ListUserCommissions(ctx context.Context, userID, page, limit int) (*models.CommissionLedger, error) {
	ledger := &models.CommissionLedger{
		Page: models.Page[models.CommissionEntry]{Data: []models.CommissionEntry{}, Page: page, Limit: limit},
	}
	if err := r.db.QueryRowContext(ctx, `
		SELECT count(*),
		       COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::float8,
		       COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::float8,
		       COALESCE(SUM(amount) FILTER (WHERE status = 'reversed'), 0)::float8
		FROM commissions
		WHERE beneficiary_id = $1`, userID,
	).Scan(&ledger.Total, &ledger.Totals.Pending, &ledger.Totals.Paid, &ledger.Totals.Reversed); err != nil {
		return nil, mapError(err)
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT c.id, c.order_id, u.name, c.level, c.rate::float8, c.amount::float8, c.status, c.created_at
		FROM commissions c
		JOIN orders o ON o.id = c.order_id
		JOIN users u ON u.id = o.user_id
		WHERE c.beneficiary_id = $1
		ORDER BY c.created_at DESC, c.id DESC
		LIMIT $2 OFFSET $3`, userID, limit, (page-1)*limit)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()
	for rows.Next() {
		var e models.CommissionEntry
		if err := rows.Scan(&e.ID, &e.OrderID, &e.BuyerName, &e.Level, &e.Rate, &e.Amount, &e.Status, &e.CreatedAt); err != nil {
			return nil, err
		}
		ledger.Data = append(ledger.Data, e)
	}
	return ledger, rows.Err()
}
