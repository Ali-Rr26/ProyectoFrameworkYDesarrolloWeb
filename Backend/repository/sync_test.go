package repository

import (
	"context"
	"errors"
	"testing"
)

func TestTotalsDifferToleratesHalfCent(t *testing.T) {
	cases := []struct {
		a, b float64
		want bool
	}{
		{50, 50, false},
		{49.999, 50, false},
		{50.004, 50, false},
		{50.01, 50, true},
		{40, 50, true},
	}
	for _, tc := range cases {
		if got := totalsDiffer(tc.a, tc.b); got != tc.want {
			t.Fatalf("totalsDiffer(%v, %v) = %v; se esperaba %v", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestIdempotencyKeyTravelsInContext(t *testing.T) {
	if _, ok := IdempotencyKeyFrom(context.Background()); ok {
		t.Fatal("un contexto sin clave no debe devolver ninguna")
	}
	k := IdempotencyKey{UserID: 7, Key: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", Method: "POST", Path: "/api/checkout"}
	got, ok := IdempotencyKeyFrom(WithIdempotencyKey(context.Background(), k))
	if !ok || got != k {
		t.Fatalf("clave %+v (%v); se esperaba %+v", got, ok, k)
	}
}

func TestSyncErrorsUnwrapToTheirKind(t *testing.T) {
	if !errors.Is(&PriceChangedError{Expected: 1, Total: 2}, ErrPriceChanged) {
		t.Fatal("PriceChangedError debe ser ErrPriceChanged")
	}
	if !errors.Is(&StatusChangedError{Current: "shipped"}, ErrStatusChanged) {
		t.Fatal("StatusChangedError debe ser ErrStatusChanged")
	}
}

func TestSyncHelpersWithoutKeyDoNothing(t *testing.T) {
	// Sin clave en el contexto no se toca la transacción (nil): las escrituras normales
	// siguen igual que antes de la Fase 5.
	if err := claimIdempotency(context.Background(), nil); err != nil {
		t.Fatalf("claimIdempotency sin clave: %v", err)
	}
	if err := storeIdempotentResponse(context.Background(), nil, 201, struct{}{}); err != nil {
		t.Fatalf("storeIdempotentResponse sin clave: %v", err)
	}
}
