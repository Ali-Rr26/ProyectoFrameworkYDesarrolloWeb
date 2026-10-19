package models

import "time"

// CommissionEntry es una fila del ledger de comisiones de un distribuidor.
type CommissionEntry struct {
	ID      int `json:"id"`
	OrderID int `json:"order_id"`
	// BuyerName es el miembro de la red cuya compra generó la comisión.
	BuyerName string    `json:"buyer_name"`
	Level     int       `json:"level"`
	Rate      float64   `json:"rate"`
	Amount    float64   `json:"amount"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// CommissionTotals suma el ledger por estado (pending + paid = saldo de v_user_commissions).
type CommissionTotals struct {
	Pending  float64 `json:"pending"`
	Paid     float64 `json:"paid"`
	Reversed float64 `json:"reversed"`
}

// CommissionLedger es la respuesta de GET /api/commissions/mine: una página del ledger
// ({data, page, limit, total}) más los totales de todas las comisiones del usuario.
type CommissionLedger struct {
	Page[CommissionEntry]
	Totals CommissionTotals `json:"totals"`
}
