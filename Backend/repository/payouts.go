package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"multicatalogo-backend/models"
)

// CreatePayout liquida las comisiones pendientes de un distribuidor en una transacción:
// crea el pago con su total y marca esas comisiones como pagadas.
//
// Regla de negocio: solo se liquidan comisiones de pedidos entregados. Un pedido entregado
// ya no puede cancelarse, así que nunca se paga una venta que después se deshace; las
// comisiones de pedidos en curso esperan a la entrega.
//
// Bloquea en el mismo orden que el cambio de estado de pedidos (primero pedidos, después
// comisiones) para que nunca se bloqueen mutuamente:
//  1. los pedidos entregados con comisiones pendientes del distribuidor, con FOR SHARE:
//     ningún cambio de estado concurrente los altera mientras se liquida;
//  2. sus comisiones pendientes, con FOR UPDATE: una segunda liquidación simultánea espera
//     y, al reevaluar, las encuentra pagadas (no paga doble).
//
// El pago y la marca de pagadas se hacen en una sola sentencia sobre el mismo conjunto
// de filas bloqueadas, así el total siempre coincide con las comisiones liquidadas.
// Devuelve ErrNotFound si el distribuidor no existe y ErrNothingToPay si no tiene
// comisiones listas para liquidar.
func (r *Repository) CreatePayout(ctx context.Context, beneficiaryID int) (*models.Payout, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	p := models.Payout{BeneficiaryID: beneficiaryID}
	if err := tx.QueryRowContext(ctx, `SELECT name, email FROM users WHERE id = $1`, beneficiaryID).
		Scan(&p.BeneficiaryName, &p.BeneficiaryEmail); err != nil {
		return nil, mapError(err)
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT o.id FROM orders o
		WHERE o.status = 'delivered'
		  AND EXISTS (SELECT 1 FROM commissions c
		              WHERE c.order_id = o.id AND c.beneficiary_id = $1 AND c.status = 'pending')
		ORDER BY o.id
		FOR SHARE`, beneficiaryID)
	if err != nil {
		return nil, mapError(err)
	}
	var orderIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		orderIDs = append(orderIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(orderIDs) == 0 {
		return nil, &DomainError{Kind: ErrNothingToPay, Detail: fmt.Sprintf("distribuidor %d", beneficiaryID), Public: true}
	}

	err = tx.QueryRowContext(ctx, `
		WITH locked AS (
		    SELECT id, amount FROM commissions
		    WHERE beneficiary_id = $1 AND status = 'pending' AND order_id = ANY($2)
		    ORDER BY id
		    FOR UPDATE
		), payout AS (
		    INSERT INTO payouts (beneficiary_id, total)
		    SELECT $1, SUM(amount) FROM locked
		    HAVING count(*) > 0
		    RETURNING id, total, created_at
		), paid AS (
		    UPDATE commissions c SET status = 'paid', payout_id = payout.id
		    FROM payout
		    WHERE c.id IN (SELECT id FROM locked)
		    RETURNING c.id
		)
		SELECT payout.id, payout.total::float8, payout.created_at, (SELECT count(*) FROM paid)::int
		FROM payout`, beneficiaryID, orderIDs,
	).Scan(&p.ID, &p.Total, &p.CreatedAt, &p.CommissionsCount)
	if errors.Is(err, sql.ErrNoRows) {
		// Otra liquidación pagó esas comisiones mientras se esperaba el bloqueo.
		return nil, &DomainError{Kind: ErrNothingToPay, Detail: fmt.Sprintf("distribuidor %d", beneficiaryID), Public: true}
	}
	if err != nil {
		return nil, mapError(err)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &p, nil
}

// payoutColumns arma una fila del historial de pagos con su beneficiario y la cantidad
// de comisiones que cubrió.
const payoutColumns = `
	SELECT p.id, p.beneficiary_id, u.name, u.email, p.total::float8,
	       (SELECT count(*) FROM commissions c WHERE c.payout_id = p.id)::int, p.created_at
	FROM payouts p
	JOIN users u ON u.id = p.beneficiary_id
	WHERE ($1::int IS NULL OR p.beneficiary_id = $1)`

// ListPayouts devuelve una página del historial de pagos, del más reciente al más antiguo
// (beneficiaryID nil = de todos los distribuidores).
func (r *Repository) ListPayouts(ctx context.Context, beneficiaryID *int, page, limit int) (*models.Page[models.Payout], error) {
	result := &models.Page[models.Payout]{Data: []models.Payout{}, Page: page, Limit: limit}
	if err := r.db.QueryRowContext(ctx,
		`SELECT count(*) FROM payouts p WHERE ($1::int IS NULL OR p.beneficiary_id = $1)`, beneficiaryID,
	).Scan(&result.Total); err != nil {
		return nil, mapError(err)
	}

	rows, err := r.db.QueryContext(ctx, payoutColumns+` ORDER BY p.created_at DESC, p.id DESC LIMIT $2 OFFSET $3`,
		beneficiaryID, limit, (page-1)*limit)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()
	for rows.Next() {
		var p models.Payout
		if err := rows.Scan(&p.ID, &p.BeneficiaryID, &p.BeneficiaryName, &p.BeneficiaryEmail, &p.Total,
			&p.CommissionsCount, &p.CreatedAt); err != nil {
			return nil, err
		}
		result.Data = append(result.Data, p)
	}
	return result, rows.Err()
}

// GetPendingDebts devuelve la deuda por distribuidor separando lo listo para liquidar
// (comisiones de pedidos entregados) de lo que espera la entrega, ordenada por el monto
// listo para liquidar.
func (r *Repository) GetPendingDebts(ctx context.Context) ([]models.PendingDebt, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.id, u.name, u.email,
		       COALESCE(SUM(c.amount) FILTER (WHERE o.status = 'delivered'), 0)::float8,
		       count(*) FILTER (WHERE o.status = 'delivered')::int,
		       COALESCE(SUM(c.amount) FILTER (WHERE o.status <> 'delivered'), 0)::float8,
		       count(*) FILTER (WHERE o.status <> 'delivered')::int
		FROM commissions c
		JOIN orders o ON o.id = c.order_id
		JOIN users u ON u.id = c.beneficiary_id
		WHERE c.status = 'pending' AND o.status <> 'cancelled'
		GROUP BY u.id, u.name, u.email
		ORDER BY 4 DESC, 6 DESC, u.id`)
	if err != nil {
		return nil, mapError(err)
	}
	defer rows.Close()

	debts := []models.PendingDebt{}
	for rows.Next() {
		var d models.PendingDebt
		if err := rows.Scan(&d.BeneficiaryID, &d.Name, &d.Email, &d.ReadyTotal, &d.ReadyCount,
			&d.WaitingTotal, &d.WaitingCount); err != nil {
			return nil, err
		}
		debts = append(debts, d)
	}
	return debts, rows.Err()
}
