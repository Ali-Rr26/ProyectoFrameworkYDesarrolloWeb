package controllers

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/cache"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// fakeOrderQueries es un OrderQueryRepository en memoria: el pedido 10 es del usuario 7.
type fakeOrderQueries struct {
	filter     *models.OrderFilter
	newStatus  string
	fromStatus string
	err        error
}

func (f *fakeOrderQueries) ListOrders(_ context.Context, fl models.OrderFilter) (*models.Page[models.OrderSummary], error) {
	f.filter = &fl
	return &models.Page[models.OrderSummary]{Data: []models.OrderSummary{}, Page: fl.Page, Limit: fl.Limit}, nil
}

func (f *fakeOrderQueries) GetOrder(_ context.Context, id int) (*models.OrderDetail, error) {
	if id != 10 {
		return nil, repository.ErrNotFound
	}
	return &models.OrderDetail{OrderSummary: models.OrderSummary{ID: 10, BuyerID: 7}}, nil
}

func (f *fakeOrderQueries) UpdateOrderStatus(_ context.Context, id int, status, fromStatus string) (*models.OrderDetail, error) {
	f.newStatus, f.fromStatus = status, fromStatus
	if f.err != nil {
		return nil, f.err
	}
	return &models.OrderDetail{OrderSummary: models.OrderSummary{ID: id, BuyerID: 7, Status: status}}, nil
}

// newOrderApp monta las rutas con un usuario simulado (id y rol) en lugar de RequireAuth.
func newOrderApp(repo *fakeOrderQueries, c *fakeCache, network *fakeInvalidator, userID, role string) *fiber.App {
	ctrl := NewOrderController(repo, c, network)
	as := func(ctx *fiber.Ctx) error {
		ctx.Locals(localsClaims, &auth.Claims{Role: role, RegisteredClaims: jwt.RegisteredClaims{Subject: userID}})
		return ctx.Next()
	}
	app := fiber.New()
	app.Get("/api/orders/mine", as, ctrl.MyOrders)
	app.Get("/api/orders/:id", as, ctrl.GetOrder)
	app.Get("/api/orders", as, ctrl.ListOrders)
	app.Patch("/api/orders/:id/status", as, ctrl.UpdateStatus)
	return app
}

func TestMyOrdersUsesTokenUserAndPagination(t *testing.T) {
	repo := &fakeOrderQueries{}
	app := newOrderApp(repo, &fakeCache{}, &fakeInvalidator{}, "7", "customer")

	status, body := send(t, app, http.MethodGet, "/api/orders/mine?page=2&limit=5&status=Pending", "")
	if status != fiber.StatusOK || !strings.Contains(body, `"data":[]`) {
		t.Fatalf("status=%d body=%s; se esperaba 200 con data", status, body)
	}
	f := repo.filter
	if f.UserID == nil || *f.UserID != 7 || f.Page != 2 || f.Limit != 5 || f.Status != "pending" {
		t.Fatalf("filtro %+v; se esperaba usuario 7, página 2, límite 5, estado pending", f)
	}
}

func TestListOrdersAdminSeesAllAndDefaults(t *testing.T) {
	repo := &fakeOrderQueries{}
	status, _ := send(t, newOrderApp(repo, &fakeCache{}, &fakeInvalidator{}, "1", "admin"), http.MethodGet, "/api/orders", "")
	if status != fiber.StatusOK || repo.filter.UserID != nil || repo.filter.Page != 1 || repo.filter.Limit != 10 {
		t.Fatalf("status=%d filtro=%+v; se esperaba todos los compradores, página 1, límite 10", status, repo.filter)
	}
}

func TestListOrdersRejectsBadQuery(t *testing.T) {
	for _, q := range []string{"?page=0", "?page=x", "?limit=51", "?limit=0", "?status=enviado"} {
		repo := &fakeOrderQueries{}
		status, _ := send(t, newOrderApp(repo, &fakeCache{}, &fakeInvalidator{}, "7", "customer"), http.MethodGet, "/api/orders/mine"+q, "")
		if status != fiber.StatusBadRequest || repo.filter != nil {
			t.Errorf("%s: status=%d; se esperaba 400 sin consultar la base", q, status)
		}
	}
}

func TestGetOrderOwnership(t *testing.T) {
	cases := []struct {
		name, user, role, path string
		status                 int
	}{
		{"el dueño lo ve", "7", "customer", "/api/orders/10", fiber.StatusOK},
		{"otro cliente recibe 404", "8", "customer", "/api/orders/10", fiber.StatusNotFound},
		{"el admin lo ve", "1", "admin", "/api/orders/10", fiber.StatusOK},
		{"inexistente → 404", "7", "customer", "/api/orders/99", fiber.StatusNotFound},
		{"id inválido → 400", "7", "customer", "/api/orders/abc", fiber.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := send(t, newOrderApp(&fakeOrderQueries{}, &fakeCache{}, &fakeInvalidator{}, tc.user, tc.role), http.MethodGet, tc.path, "")
			if status != tc.status {
				t.Fatalf("status=%d body=%s; se esperaba %d", status, body, tc.status)
			}
		})
	}
}

func TestUpdateStatusCancelInvalidatesCaches(t *testing.T) {
	repo, c, network := &fakeOrderQueries{}, &fakeCache{}, &fakeInvalidator{}
	status, body := send(t, newOrderApp(repo, c, network, "1", "admin"), http.MethodPatch, "/api/orders/10/status", `{"status":" Cancelled "}`)
	if status != fiber.StatusOK || repo.newStatus != models.OrderCancelled {
		t.Fatalf("status=%d body=%s estado=%q; se esperaba 200 cancelled", status, body, repo.newStatus)
	}
	if len(c.deleted) != 1 || c.deleted[0] != cache.KeyProducts || len(network.users) != 1 || network.users[0] != 7 {
		t.Fatalf("caché %v red %v; se esperaba invalidar productos:all y la red del comprador 7", c.deleted, network.users)
	}
}

func TestUpdateStatusAdvanceDoesNotTouchCaches(t *testing.T) {
	repo, c, network := &fakeOrderQueries{}, &fakeCache{}, &fakeInvalidator{}
	status, _ := send(t, newOrderApp(repo, c, network, "1", "admin"), http.MethodPatch, "/api/orders/10/status", `{"status":"preparing"}`)
	if status != fiber.StatusOK || len(c.deleted) != 0 || len(network.users) != 0 {
		t.Fatalf("status=%d; avanzar el estado no cambia stock ni comisiones: nada que invalidar", status)
	}
}

func TestUpdateStatusErrors(t *testing.T) {
	cases := []struct {
		name, body string
		err        error
		status     int
	}{
		{"estado desconocido", `{"status":"enviado"}`, nil, fiber.StatusBadRequest},
		{"transición inválida", `{"status":"pending"}`,
			&repository.DomainError{Kind: repository.ErrInvalidTransition, Detail: "delivered → pending", Public: true}, fiber.StatusBadRequest},
		{"comisiones pagadas", `{"status":"cancelled"}`,
			&repository.DomainError{Kind: repository.ErrCommissionsPaid, Detail: "pedido 10", Public: true}, fiber.StatusConflict},
		{"pedido inexistente", `{"status":"preparing"}`, repository.ErrNotFound, fiber.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, network := &fakeCache{}, &fakeInvalidator{}
			status, body := send(t, newOrderApp(&fakeOrderQueries{err: tc.err}, c, network, "1", "admin"), http.MethodPatch, "/api/orders/10/status", tc.body)
			if status != tc.status || len(c.deleted) != 0 || len(network.users) != 0 {
				t.Fatalf("status=%d body=%s; se esperaba %d sin invalidar cachés", status, body, tc.status)
			}
		})
	}
}
