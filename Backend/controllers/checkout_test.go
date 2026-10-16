package controllers

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/cache"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// Dobles de prueba: gracias a la inyección de dependencias el controlador se prueba
// sin PostgreSQL, sin Redis y sin goroutines reales.

type fakeOrders struct {
	order *models.Order
	err   error
	calls int
}

func (f *fakeOrders) CreateOrder(context.Context, int, models.CreateOrderRequest) (*models.Order, error) {
	f.calls++
	return f.order, f.err
}

func (f *fakeOrders) GetPaymentMethods(context.Context) ([]string, error) { return nil, nil }

type fakeCache struct{ deleted []string }

func (f *fakeCache) Get(context.Context, string) ([]byte, error) { return nil, cache.ErrMiss }

func (f *fakeCache) Set(context.Context, string, []byte, time.Duration) error { return nil }

func (f *fakeCache) Del(_ context.Context, keys ...string) error {
	f.deleted = append(f.deleted, keys...)
	return nil
}

func (f *fakeCache) Ping(context.Context) error { return nil }

type fakeInvalidator struct{ users []int }

func (f *fakeInvalidator) InvalidateNetwork(_ context.Context, userID int) {
	f.users = append(f.users, userID)
}

type fakeCommissions struct{ orders []int }

func (f *fakeCommissions) ProcessAsync(orderID, _ int) { f.orders = append(f.orders, orderID) }

const buyerID = 7

type checkoutFixture struct {
	app         *fiber.App
	orders      *fakeOrders
	cache       *fakeCache
	network     *fakeInvalidator
	commissions *fakeCommissions
}

func newCheckoutFixture(order *models.Order, err error) *checkoutFixture {
	f := &checkoutFixture{
		orders:      &fakeOrders{order: order, err: err},
		cache:       &fakeCache{},
		network:     &fakeInvalidator{},
		commissions: &fakeCommissions{},
	}
	ctrl := NewCheckoutController(f.orders, f.cache, f.network, f.commissions, 0)

	f.app = fiber.New()
	// Simula a RequireAuth: deja en el contexto los claims del comprador.
	fakeAuth := func(c *fiber.Ctx) error {
		c.Locals(localsClaims, &auth.Claims{RegisteredClaims: jwt.RegisteredClaims{Subject: "7"}})
		return c.Next()
	}
	f.app.Post("/api/checkout", fakeAuth, ctrl.Checkout)
	return f
}

func (f *checkoutFixture) post(t *testing.T, body string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/checkout", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := f.app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(data)
}

const validBody = `{"payment_method":"Tarjeta de crédito","shipping_address":"Av. 1",
	"city":"La Libertad","phone":"0990000000","items":[{"product_id":1,"quantity":2}]}`

func TestCheckoutSuccessLaunchesCommissionsAndInvalidatesCache(t *testing.T) {
	f := newCheckoutFixture(&models.Order{ID: 99, Total: 50}, nil)

	status, body := f.post(t, validBody)
	if status != fiber.StatusCreated {
		t.Fatalf("status=%d body=%s; se esperaba 201", status, body)
	}
	if len(f.commissions.orders) != 1 || f.commissions.orders[0] != 99 {
		t.Fatalf("comisiones lanzadas para %v; se esperaba el pedido 99", f.commissions.orders)
	}
	if len(f.cache.deleted) != 1 || f.cache.deleted[0] != cache.KeyProducts {
		t.Fatalf("claves invalidadas %v; se esperaba %s", f.cache.deleted, cache.KeyProducts)
	}
	if len(f.network.users) != 1 || f.network.users[0] != buyerID {
		t.Fatalf("red invalidada para %v; se esperaba el comprador %d", f.network.users, buyerID)
	}
}

func TestCheckoutRollbackDoesNotPayCommissions(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
	}{
		{"stock insuficiente", &repository.DomainError{Kind: repository.ErrInsufficientStock, Detail: "producto 1"}, fiber.StatusConflict},
		{"producto inexistente", &repository.DomainError{Kind: repository.ErrInvalidRef, Detail: "producto 99999 inexistente"}, fiber.StatusUnprocessableEntity},
		{"falla simulada", repository.ErrSimulatedFailure, fiber.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newCheckoutFixture(nil, tc.err)

			status, body := f.post(t, validBody)
			if status != tc.status {
				t.Fatalf("status=%d body=%s; se esperaba %d", status, body, tc.status)
			}
			if len(f.commissions.orders) != 0 {
				t.Fatal("tras un ROLLBACK no se deben calcular comisiones")
			}
			if len(f.cache.deleted) != 0 || len(f.network.users) != 0 {
				t.Fatal("tras un ROLLBACK no hay nada que invalidar")
			}
		})
	}
}

func TestCheckoutRejectsInvalidBodyWithoutTouchingDB(t *testing.T) {
	f := newCheckoutFixture(&models.Order{ID: 1}, nil)

	status, _ := f.post(t, `{"payment_method":"","items":[]}`)
	if status != fiber.StatusBadRequest {
		t.Fatalf("status=%d; se esperaba 400", status)
	}
	if f.orders.calls != 0 {
		t.Fatal("con datos inválidos no se debe abrir la transacción")
	}
}
