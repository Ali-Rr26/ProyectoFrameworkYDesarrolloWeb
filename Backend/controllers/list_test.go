package controllers

import (
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
)

// Listados del administrador con búsqueda: GET /api/users y GET /api/admin/products.

func TestAdminListsPassFilterToRepository(t *testing.T) {
	users := &fakeUsers{}
	status, body := send(t, newUserApp(users, &fakeInvalidator{}), http.MethodGet, "/api/users?q=%20Ana%20&page=2&limit=5", "")
	if status != fiber.StatusOK {
		t.Fatalf("status = %d, body = %s", status, body)
	}
	if want := (models.ListFilter{Query: "Ana", Page: 2, Limit: 5}); users.listed == nil || *users.listed != want {
		t.Fatalf("filtro = %+v, se esperaba %+v", users.listed, want)
	}
	if !strings.Contains(body, `"data":[]`) || !strings.Contains(body, `"page":2`) {
		t.Fatalf("respuesta sin el formato Page: %s", body)
	}

	products := &fakeProducts{}
	status, body = send(t, newProductApp(products, &fakeCache{}), http.MethodGet, "/api/admin/products", "")
	if status != fiber.StatusOK {
		t.Fatalf("status = %d, body = %s", status, body)
	}
	if want := (models.ListFilter{Page: 1, Limit: defaultPageLimit}); products.listed == nil || *products.listed != want {
		t.Fatalf("filtro por defecto = %+v, se esperaba %+v", products.listed, want)
	}
}

func TestAdminListsRejectInvalidParams(t *testing.T) {
	longQuery := strings.Repeat("a", maxSearchLength+1)
	cases := []struct{ name, query string }{
		{"página cero", "page=0"},
		{"límite excesivo", "limit=51"},
		{"límite no numérico", "limit=diez"},
		{"búsqueda muy larga", "q=" + longQuery},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			users := &fakeUsers{}
			if status, _ := send(t, newUserApp(users, &fakeInvalidator{}), http.MethodGet, "/api/users?"+tc.query, ""); status != fiber.StatusBadRequest {
				t.Fatalf("usuarios: status = %d, se esperaba 400", status)
			}
			products := &fakeProducts{}
			if status, _ := send(t, newProductApp(products, &fakeCache{}), http.MethodGet, "/api/admin/products?"+tc.query, ""); status != fiber.StatusBadRequest {
				t.Fatalf("productos: status = %d, se esperaba 400", status)
			}
			if users.listed != nil || products.listed != nil {
				t.Fatal("con parámetros inválidos no se debe consultar la base")
			}
		})
	}
}

func TestListFilterAcceptsMaxLengthInRunes(t *testing.T) {
	// 100 caracteres con tilde (200 bytes) siguen siendo válidos: se cuentan runas.
	users := &fakeUsers{}
	query := strings.Repeat("á", maxSearchLength)
	status, _ := send(t, newUserApp(users, &fakeInvalidator{}), http.MethodGet, "/api/users?q="+query, "")
	if status != fiber.StatusOK || users.listed == nil || users.listed.Query != query {
		t.Fatalf("status = %d, filtro = %+v", status, users.listed)
	}
}
