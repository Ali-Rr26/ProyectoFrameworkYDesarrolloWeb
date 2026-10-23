package models

import "time"

// Estados del pedido (CHECK ck_orders_status, migración 0004).
const (
	OrderPending   = "pending"
	OrderPreparing = "preparing"
	OrderShipped   = "shipped"
	OrderDelivered = "delivered"
	OrderCancelled = "cancelled"
)

// orderTransitions define el ciclo de vida: pending → preparing → shipped → delivered,
// y cancelled solo antes de enviarse (pending o preparing).
var orderTransitions = map[string][]string{
	OrderPending:   {OrderPreparing, OrderCancelled},
	OrderPreparing: {OrderShipped, OrderCancelled},
	OrderShipped:   {OrderDelivered},
	OrderDelivered: {},
	OrderCancelled: {},
}

// ValidOrderStatus indica si el valor es uno de los estados conocidos.
func ValidOrderStatus(status string) bool {
	_, ok := orderTransitions[status]
	return ok
}

// OrderTransitionAllowed indica si un pedido puede pasar de from a to (función pura).
func OrderTransitionAllowed(from, to string) bool {
	for _, next := range orderTransitions[from] {
		if next == to {
			return true
		}
	}
	return false
}

// NextOrderStatuses devuelve los estados a los que puede pasar un pedido.
func NextOrderStatuses(from string) []string {
	return append([]string{}, orderTransitions[from]...)
}

// Page es la respuesta paginada estándar de los listados.
type Page[T any] struct {
	Data  []T `json:"data"`
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
}

// ListFilter acota los listados del administrador con búsqueda (usuarios y productos):
// Query es el texto de ?q= (cadena vacía = sin filtro).
type ListFilter struct {
	Query string
	Page  int
	Limit int
}

// OrderSummary es una fila de los listados de pedidos.
type OrderSummary struct {
	ID         int       `json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	Status     string    `json:"status"`
	Total      float64   `json:"total"`
	ItemsCount int       `json:"items_count"`
	BuyerID    int       `json:"buyer_id"`
	BuyerName  string    `json:"buyer_name"`
	BuyerEmail string    `json:"buyer_email"`
}

// OrderDetail es un pedido completo con sus líneas y datos de envío.
type OrderDetail struct {
	OrderSummary
	PaymentMethod   string      `json:"payment_method"`
	ShippingAddress string      `json:"shipping_address"`
	City            string      `json:"city"`
	Phone           string      `json:"phone"`
	Items           []OrderItem `json:"items"`
	// NextStatuses son los estados válidos siguientes (los usa el panel del admin).
	NextStatuses []string `json:"next_statuses"`
}

// OrderFilter acota los listados de pedidos (UserID nil = todos los compradores).
type OrderFilter struct {
	UserID *int
	Status string
	Page   int
	Limit  int
}

// UpdateOrderStatusRequest es el cuerpo de PATCH /api/orders/:id/status (solo admin).
type UpdateOrderStatusRequest struct {
	Status string `json:"status"`
	// FromStatus es el estado que el cliente vio (opcional). Si el pedido ya no está en
	// ese estado, el cambio se rechaza con 409 (otro admin lo cambió mientras tanto).
	FromStatus string `json:"from_status"`
}
