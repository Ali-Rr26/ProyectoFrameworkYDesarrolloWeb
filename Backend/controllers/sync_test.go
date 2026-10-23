package controllers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// Pruebas de los controles de concurrencia de la sincronización offline (PLAN_PWA, Fase 5):
// versión de producto (If-Match), total esperado del checkout y estado de origen del pedido.

func TestParseIfMatch(t *testing.T) {
	valid := map[string]int{`3`: 3, `"3"`: 3, `W/"12"`: 12, ` "7" `: 7}
	for header, want := range valid {
		if got, err := parseIfMatch(header); err != nil || got != want {
			t.Fatalf("parseIfMatch(%q) = %d, %v; se esperaba %d", header, got, err, want)
		}
	}
	for _, header := range []string{`abc`, `"0"`, `-1`, `*`} {
		if _, err := parseIfMatch(header); err == nil {
			t.Fatalf("parseIfMatch(%q) debió fallar", header)
		}
	}
}

// putProduct envía PUT /api/products/1 con una cabecera If-Match opcional.
func putProduct(t *testing.T, app *fiber.App, body, ifMatch string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/products/1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if ifMatch != "" {
		req.Header.Set(fiber.HeaderIfMatch, ifMatch)
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(data)
}

func TestUpdateProductPassesIfMatchVersionToRepository(t *testing.T) {
	repo := &fakeProducts{}
	status, body := putProduct(t, newProductApp(repo, &fakeCache{}), `{"price":12}`, `"4"`)
	if status != fiber.StatusOK || repo.updated == nil || repo.updated.Version == nil || *repo.updated.Version != 4 {
		t.Fatalf("status=%d body=%s; el repositorio debió recibir version=4", status, body)
	}
}

func TestUpdateProductRejectsIfMatchThatContradictsBody(t *testing.T) {
	repo := &fakeProducts{}
	status, body := putProduct(t, newProductApp(repo, &fakeCache{}), `{"price":12,"version":3}`, `"4"`)
	if status != fiber.StatusBadRequest || repo.updated != nil {
		t.Fatalf("status=%d body=%s; se esperaba 400 sin tocar el repositorio", status, body)
	}
}

func TestUpdateProductRejectsInvalidVersion(t *testing.T) {
	for _, tc := range []struct{ body, ifMatch string }{
		{`{"price":12}`, `abc`},
		{`{"price":12,"version":0}`, ``},
	} {
		repo := &fakeProducts{}
		status, body := putProduct(t, newProductApp(repo, &fakeCache{}), tc.body, tc.ifMatch)
		if status != fiber.StatusBadRequest || repo.updated != nil {
			t.Fatalf("body=%s If-Match=%q → status=%d %s; se esperaba 400", tc.body, tc.ifMatch, status, body)
		}
	}
}

func TestUpdateProductVersionConflictReturnsCurrentProduct(t *testing.T) {
	c := &fakeCache{}
	repo := &fakeProducts{err: &repository.VersionConflictError{Current: &models.Product{ID: 1, Name: "Sérum", Version: 6}}}
	status, body := send(t, newProductApp(repo, c), http.MethodPut, "/api/products/1", `{"price":12,"version":5}`)
	if status != fiber.StatusConflict || !strings.Contains(body, `"version":6`) || !strings.Contains(body, "Sérum") {
		t.Fatalf("status=%d body=%s; se esperaba 409 con el producto vigente", status, body)
	}
	if len(c.deleted) != 0 {
		t.Fatalf("caché invalidada %v; un conflicto no cambia nada", c.deleted)
	}
}

func TestCheckoutRejectsNonPositiveExpectedTotal(t *testing.T) {
	f := newCheckoutFixture(&models.Order{ID: 1}, nil)
	body := strings.Replace(validBody, `"items"`, `"expected_total":0,"items"`, 1)

	status, resp := f.post(t, body)
	if status != fiber.StatusBadRequest || f.orders.calls != 0 || !strings.Contains(resp, "expected_total") {
		t.Fatalf("status=%d body=%s; se esperaba 400 por expected_total sin abrir la transacción", status, resp)
	}
}

func TestCheckoutPriceChangedIsConflictWithoutCommissions(t *testing.T) {
	f := newCheckoutFixture(nil, &repository.PriceChangedError{Expected: 40, Total: 50})
	body := strings.Replace(validBody, `"items"`, `"expected_total":40,"items"`, 1)

	status, resp := f.post(t, body)
	if status != fiber.StatusConflict || !strings.Contains(resp, `"total":50`) {
		t.Fatalf("status=%d body=%s; se esperaba 409 con el total vigente", status, resp)
	}
	if len(f.commissions.orders) != 0 || len(f.cache.deleted) != 0 {
		t.Fatal("un pedido rechazado no lanza comisiones ni invalida la caché")
	}
}

func TestUpdateStatusPassesFromStatusNormalized(t *testing.T) {
	repo := &fakeOrderQueries{}
	status, body := send(t, newOrderApp(repo, &fakeCache{}, &fakeInvalidator{}, "1", "admin"), http.MethodPatch,
		"/api/orders/10/status", `{"status":"preparing","from_status":" Pending "}`)
	if status != fiber.StatusOK || repo.fromStatus != models.OrderPending {
		t.Fatalf("status=%d body=%s from=%q; se esperaba pending normalizado", status, body, repo.fromStatus)
	}
}

func TestUpdateStatusRejectsUnknownFromStatus(t *testing.T) {
	repo := &fakeOrderQueries{}
	status, _ := send(t, newOrderApp(repo, &fakeCache{}, &fakeInvalidator{}, "1", "admin"), http.MethodPatch,
		"/api/orders/10/status", `{"status":"preparing","from_status":"enviado"}`)
	if status != fiber.StatusBadRequest || repo.newStatus != "" {
		t.Fatalf("status=%d; se esperaba 400 sin tocar el repositorio", status)
	}
}

func TestUpdateStatusChangedMeanwhileIsConflict(t *testing.T) {
	c, network := &fakeCache{}, &fakeInvalidator{}
	repo := &fakeOrderQueries{err: &repository.StatusChangedError{Current: models.OrderShipped}}
	status, body := send(t, newOrderApp(repo, c, network, "1", "admin"), http.MethodPatch,
		"/api/orders/10/status", `{"status":"cancelled","from_status":"pending"}`)
	if status != fiber.StatusConflict || !strings.Contains(body, `"status":"shipped"`) {
		t.Fatalf("status=%d body=%s; se esperaba 409 con el estado vigente", status, body)
	}
	if len(c.deleted) != 0 || len(network.users) != 0 {
		t.Fatal("un cambio rechazado no invalida cachés")
	}
}
