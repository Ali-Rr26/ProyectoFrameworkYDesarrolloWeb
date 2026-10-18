package repository

import (
	"context"

	"multicatalogo-backend/models"
)

// commissionsQuery sube por la red desde el comprador del pedido ($1) hasta $2 niveles
// y registra una comisión por patrocinador con la tasa de su nivel. Es una sola
// sentencia: o se insertan todas las comisiones del pedido o ninguna.
// ON CONFLICT (order_id, level): reprocesar el pedido no paga doble (idempotente).
const commissionsQuery = `
	WITH RECURSIVE up AS (
	    SELECT nm.sponsor_id AS beneficiary_id, 1 AS level
	    FROM orders o
	    JOIN network_members nm ON nm.user_id = o.user_id
	    WHERE o.id = $1 AND nm.sponsor_id IS NOT NULL
	  UNION ALL
	    SELECT nm.sponsor_id, up.level + 1
	    FROM up
	    JOIN network_members nm ON nm.user_id = up.beneficiary_id
	    WHERE up.level < $2 AND nm.sponsor_id IS NOT NULL
	)
	INSERT INTO commissions (order_id, beneficiary_id, level, rate, amount)
	SELECT $1, up.beneficiary_id, up.level, cr.rate, round(t.total * cr.rate, 2)
	FROM up
	JOIN commission_rates cr ON cr.level = up.level
	JOIN v_order_totals t ON t.order_id = $1
	ON CONFLICT ON CONSTRAINT ux_commissions_order_level DO NOTHING`

// CreateCommissions calcula y registra las comisiones de los patrocinadores (niveles
// 1 a MaxNetworkLevel) de un pedido ya confirmado. Devuelve cuántas se insertaron:
// 0 si el comprador no tiene patrocinador, si el pedido ya se había procesado o si fue
// cancelado.
//
// Lee el pedido con FOR SHARE: si una cancelación está en curso (FOR UPDATE) espera a que
// termine y ve el estado cancelled; si la cancelación llega después, es ella la que espera
// y revierte las comisiones recién insertadas. Así nunca queda una comisión pendiente de
// un pedido cancelado.
func (r *Repository) CreateCommissions(ctx context.Context, orderID int) (int, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var status string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM orders WHERE id = $1 FOR SHARE`, orderID).Scan(&status); err != nil {
		return 0, mapError(err)
	}
	if status == models.OrderCancelled {
		return 0, tx.Commit()
	}

	res, err := tx.ExecContext(ctx, commissionsQuery, orderID, MaxNetworkLevel)
	if err != nil {
		return 0, mapError(err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	return int(n), tx.Commit()
}

// GetPendingCommissions devuelve los pedidos no cancelados que debieron generar comisiones
// y no tienen ninguna: los que quedaron sin procesar porque el servidor se detuvo entre el
// COMMIT del pedido y el fin de la goroutine. Solo cuentan los compradores que ya
// estaban afiliados al momento de la compra (no se pagan comisiones retroactivas).
func (r *Repository) GetPendingCommissions(ctx context.Context) ([]models.PendingCommission, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT o.id, o.user_id
		FROM orders o
		JOIN network_members nm ON nm.user_id = o.user_id
		WHERE nm.sponsor_id IS NOT NULL
		  AND o.status <> 'cancelled'
		  AND nm.joined_at <= o.created_at
		  AND NOT EXISTS (SELECT 1 FROM commissions c WHERE c.order_id = o.id)
		ORDER BY o.id`)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	pending := []models.PendingCommission{}
	for rows.Next() {
		var p models.PendingCommission
		if err := rows.Scan(&p.OrderID, &p.BuyerID); err != nil {
			return nil, err
		}
		pending = append(pending, p)
	}
	return pending, rows.Err()
}
