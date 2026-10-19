package models

import "testing"

func TestOrderTransitionAllowed(t *testing.T) {
	allowed := [][2]string{
		{OrderPending, OrderPreparing},
		{OrderPreparing, OrderShipped},
		{OrderShipped, OrderDelivered},
		{OrderPending, OrderCancelled},
		{OrderPreparing, OrderCancelled},
	}
	denied := [][2]string{
		{OrderDelivered, OrderPending}, // no se retrocede
		{OrderPending, OrderShipped},   // no se saltan pasos
		{OrderShipped, OrderCancelled}, // ya salió: no se cancela
		{OrderDelivered, OrderCancelled},
		{OrderCancelled, OrderPending}, // cancelado es definitivo
		{OrderPending, OrderPending},   // sin cambio
		{OrderPending, "enviado"},      // estado desconocido
		{"desconocido", OrderPreparing},
	}
	for _, tr := range allowed {
		if !OrderTransitionAllowed(tr[0], tr[1]) {
			t.Errorf("%s → %s debería estar permitida", tr[0], tr[1])
		}
	}
	for _, tr := range denied {
		if OrderTransitionAllowed(tr[0], tr[1]) {
			t.Errorf("%s → %s no debería estar permitida", tr[0], tr[1])
		}
	}
}

func TestValidOrderStatusAndNext(t *testing.T) {
	if !ValidOrderStatus(OrderShipped) || ValidOrderStatus("enviado") {
		t.Fatal("ValidOrderStatus no reconoce los estados correctamente")
	}
	next := NextOrderStatuses(OrderPending)
	if len(next) != 2 || next[0] != OrderPreparing || next[1] != OrderCancelled {
		t.Fatalf("NextOrderStatuses(pending) = %v", next)
	}
	next[0] = "alterado" // la copia no debe modificar la tabla interna
	if NextOrderStatuses(OrderPending)[0] != OrderPreparing {
		t.Fatal("NextOrderStatuses debe devolver una copia")
	}
	if len(NextOrderStatuses(OrderDelivered)) != 0 {
		t.Fatal("delivered es un estado final")
	}
}
