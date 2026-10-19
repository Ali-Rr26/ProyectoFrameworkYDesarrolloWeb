package models

import "time"

// DateRange es el periodo de un reporte: [From, To) en la zona horaria del negocio; To es
// el inicio del día siguiente a la fecha final, así el último día entra completo.
type DateRange struct {
	From time.Time
	To   time.Time
}

// Periodos predefinidos de los reportes (?range=).
const (
	RangeLast30Days  = "last_30_days" // por defecto: hoy y los 29 días anteriores
	RangeMonthToDate = "month_to_date"
	RangeToday       = "today"
	RangeCustom      = "custom" // ?from&to
)

// ResolvedRange es el periodo ya interpretado: los límites y cómo informarlo al cliente.
type ResolvedRange struct {
	DateRange
	Name     string // uno de los Range*
	FromDay  string // AAAA-MM-DD (primer día incluido)
	ToDay    string // AAAA-MM-DD (último día incluido)
	Timezone string // nombre IANA de la zona del negocio
}

// SalesSummary son los KPIs del negocio en un periodo (GET /api/reports/summary).
// Los pedidos cancelados no cuentan como ventas.
type SalesSummary struct {
	// Range, From, To y Timezone describen el periodo aplicado: el cliente lo muestra tal cual.
	Range              string  `json:"range"`
	From               string  `json:"from"`
	To                 string  `json:"to"`
	Timezone           string  `json:"timezone"`
	TotalSales         float64 `json:"total_sales"`
	OrdersCount        int     `json:"orders_count"`
	AverageTicket      float64 `json:"average_ticket"`
	CancelledCount     int     `json:"cancelled_count"`
	CommissionsAccrued float64 `json:"commissions_accrued"`
	NewMembers         int     `json:"new_members"`
}

// TopProduct es un producto del ranking de ventas del periodo.
type TopProduct struct {
	ProductID int     `json:"product_id"`
	Name      string  `json:"name"`
	Units     int     `json:"units"`
	Revenue   float64 `json:"revenue"`
}

// TopSponsor es un patrocinador del ranking de ventas de su red (niveles 1 a 3) en el periodo.
type TopSponsor struct {
	SponsorID    int     `json:"sponsor_id"`
	Name         string  `json:"name"`
	Email        string  `json:"email"`
	NetworkSales float64 `json:"network_sales"`
	OrdersCount  int     `json:"orders_count"`
	Commissions  float64 `json:"commissions"`
}
