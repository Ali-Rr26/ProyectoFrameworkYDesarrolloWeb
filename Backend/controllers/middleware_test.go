package controllers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// fakeTokens acepta solo el token "valido" y lo asocia al usuario 7 con el rol indicado.
type fakeTokens struct{ role string }

func (f fakeTokens) Parse(token string) (*auth.Claims, error) {
	if token != "valido" {
		return nil, errors.New("firma inválida")
	}
	return &auth.Claims{Email: "viejo@x.ec", Role: f.role, RegisteredClaims: jwt.RegisteredClaims{Subject: "7"}}, nil
}

// fakeAccounts devuelve la cuenta configurada (o el error) para cualquier ID.
type fakeAccounts struct {
	user *models.User
	err  error
}

func (f fakeAccounts) GetUserByID(context.Context, int) (*models.User, error) { return f.user, f.err }

func newAuthApp(tokens TokenParser, accounts AccountLookup) *fiber.App {
	mw := NewAuthMiddleware(tokens, accounts)
	login := NewAuthController(nil, nil)
	app := fiber.New()
	app.Get("/api/me", mw.RequireAuth, login.Me)
	app.Get("/api/admin", mw.RequireAuth, mw.RequireRole("admin"), func(c *fiber.Ctx) error { return c.SendString("ok") })
	return app
}

func get(t *testing.T, app *fiber.App, path, token string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

var activeCustomer = &models.User{ID: 7, Email: "cliente@x.ec", Name: "Cliente", Role: "customer", Active: true}

func TestRequireAuthRejectsInvalidSessions(t *testing.T) {
	cases := []struct {
		name     string
		token    string
		accounts fakeAccounts
		status   int
	}{
		{"sin token", "", fakeAccounts{user: activeCustomer}, fiber.StatusUnauthorized},
		{"token adulterado", "otro", fakeAccounts{user: activeCustomer}, fiber.StatusUnauthorized},
		{"cuenta desactivada", "valido", fakeAccounts{user: &models.User{ID: 7, Role: "customer", Active: false}}, fiber.StatusUnauthorized},
		{"cuenta inexistente", "valido", fakeAccounts{err: repository.ErrNotFound}, fiber.StatusUnauthorized},
		{"base caída", "valido", fakeAccounts{err: errors.New("conexión rechazada")}, fiber.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := get(t, newAuthApp(fakeTokens{role: "customer"}, tc.accounts), "/api/me", tc.token)
			if status != tc.status {
				t.Fatalf("status=%d body=%s; se esperaba %d", status, body, tc.status)
			}
		})
	}
}

func TestRequireAuthUsesCurrentRoleFromDatabase(t *testing.T) {
	// El token dice admin, pero en la base ya es customer: RequireRole debe negar el acceso.
	status, _ := get(t, newAuthApp(fakeTokens{role: "admin"}, fakeAccounts{user: activeCustomer}), "/api/admin", "valido")
	if status != fiber.StatusForbidden {
		t.Fatalf("status=%d; un admin degradado a customer debe recibir 403", status)
	}

	promoted := &models.User{ID: 7, Email: "cliente@x.ec", Role: "admin", Active: true}
	status, _ = get(t, newAuthApp(fakeTokens{role: "customer"}, fakeAccounts{user: promoted}), "/api/admin", "valido")
	if status != fiber.StatusOK {
		t.Fatalf("status=%d; un customer promovido a admin debe tener acceso", status)
	}
}

func TestMeReturnsCurrentAccount(t *testing.T) {
	status, body := get(t, newAuthApp(fakeTokens{role: "customer"}, fakeAccounts{user: activeCustomer}), "/api/me", "valido")
	if status != fiber.StatusOK || !strings.Contains(body, `"email":"cliente@x.ec"`) || !strings.Contains(body, `"active":true`) {
		t.Fatalf("status=%d body=%s; se esperaba la cuenta vigente", status, body)
	}
	if strings.Contains(body, "password") {
		t.Fatal("la respuesta nunca debe incluir el hash de la contraseña")
	}
}
