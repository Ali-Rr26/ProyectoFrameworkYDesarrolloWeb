package models

import "time"

// Payout es una liquidación: el pago a un distribuidor de todas sus comisiones pendientes.
type Payout struct {
	ID               int       `json:"id"`
	BeneficiaryID    int       `json:"beneficiary_id"`
	BeneficiaryName  string    `json:"beneficiary_name"`
	BeneficiaryEmail string    `json:"beneficiary_email"`
	Total            float64   `json:"total"`
	CommissionsCount int       `json:"commissions_count"`
	CreatedAt        time.Time `json:"created_at"`
}

// PendingDebt es lo que se le debe a un distribuidor: sus comisiones aún por liquidar.
// Regla de negocio: solo se liquidan comisiones de pedidos entregados (la venta ya es
// definitiva); las de pedidos en curso quedan en espera hasta la entrega.
type PendingDebt struct {
	BeneficiaryID int    `json:"beneficiary_id"`
	Name          string `json:"name"`
	Email         string `json:"email"`
	// ReadyTotal y ReadyCount: comisiones de pedidos entregados, listas para liquidar.
	ReadyTotal float64 `json:"ready_total"`
	ReadyCount int     `json:"ready_count"`
	// WaitingTotal y WaitingCount: comisiones de pedidos aún sin entregar.
	WaitingTotal float64 `json:"waiting_total"`
	WaitingCount int     `json:"waiting_count"`
}

// CreatePayoutRequest es el cuerpo de POST /api/payouts (solo admin).
type CreatePayoutRequest struct {
	BeneficiaryID int `json:"beneficiary_id"`
}
