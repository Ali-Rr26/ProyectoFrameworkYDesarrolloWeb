package controllers

import (
	"context"
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

// fakeUsers es un UserRepository en memoria que registra lo que recibe.
type fakeUsers struct {
	created    *models.RegisterRequest
	updatedID  int
	updated    *models.UpdateUserRequest
	createUser *models.User
	createErr  error
	updateErr  error
	listed     *models.ListFilter
}

func (f *fakeUsers) ListUsers(_ context.Context, filter models.ListFilter) (*models.Page[models.User], error) {
	f.listed = &filter
	return &models.Page[models.User]{Data: []models.User{}, Page: filter.Page, Limit: filter.Limit}, nil
}

func (f *fakeUsers) CreateUser(_ context.Context, in models.RegisterRequest) (*models.User, error) {
	f.created = &in
	return f.createUser, f.createErr
}

func (f *fakeUsers) UpdateUser(_ context.Context, id int, in models.UpdateUserRequest) (*models.User, error) {
	f.updatedID, f.updated = id, &in
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	return &models.User{ID: id}, nil
}

func newUserApp(repo *fakeUsers, network *fakeInvalidator) *fiber.App {
	ctrl := NewUserController(repo, network)
	app := fiber.New()
	app.Post("/api/users", ctrl.RegisterUser)
	// Simula a RequireAuth + RequireRole("admin") con el admin de ID 1.
	asAdmin := func(c *fiber.Ctx) error {
		c.Locals(localsClaims, &auth.Claims{Role: "admin", RegisteredClaims: jwt.RegisteredClaims{Subject: "1"}})
		return c.Next()
	}
	app.Get("/api/users", asAdmin, ctrl.GetUsers)
	app.Patch("/api/users/:id", asAdmin, ctrl.UpdateUser)
	return app
}

func send(t *testing.T, app *fiber.App, method, path, body string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(data)
}

const registerBase = `"email":"nueva@x.ec","password":"Segura#2026","name":"Nueva"`

func TestRegisterNormalizesReferralCodeAndInvalidatesNetwork(t *testing.T) {
	sponsor := 2
	repo := &fakeUsers{createUser: &models.User{ID: 30, SponsorID: &sponsor}}
	network := &fakeInvalidator{}

	status, body := send(t, newUserApp(repo, network), http.MethodPost, "/api/users",
		`{`+registerBase+`,"referral_code":"  abcd2345 "}`)
	if status != fiber.StatusCreated {
		t.Fatalf("status=%d body=%s; se esperaba 201", status, body)
	}
	if repo.created.ReferralCode == nil || *repo.created.ReferralCode != "ABCD2345" {
		t.Fatalf("código recibido %v; se esperaba ABCD2345 normalizado", repo.created.ReferralCode)
	}
	if len(network.users) != 1 || network.users[0] != 30 {
		t.Fatalf("red invalidada para %v; se esperaba el nuevo afiliado 30", network.users)
	}
}

func TestRegisterWithoutSponsorDoesNotInvalidate(t *testing.T) {
	repo := &fakeUsers{createUser: &models.User{ID: 31}}
	network := &fakeInvalidator{}

	status, _ := send(t, newUserApp(repo, network), http.MethodPost, "/api/users", `{`+registerBase+`,"referral_code":""}`)
	if status != fiber.StatusCreated {
		t.Fatalf("status=%d; se esperaba 201", status)
	}
	if repo.created.ReferralCode != nil {
		t.Fatal("un código vacío debe tratarse como no enviado")
	}
	if len(network.users) != 0 {
		t.Fatal("una raíz nueva no aparece en árboles ajenos: no hay nada que invalidar")
	}
}

func TestRegisterRejectsInvalidReferralInput(t *testing.T) {
	cases := map[string]string{
		"formato inválido":    `{` + registerBase + `,"referral_code":"ab-12"}`,
		"sponsor_id y código": `{` + registerBase + `,"sponsor_id":2,"referral_code":"ABCD2345"}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeUsers{}
			status, resp := send(t, newUserApp(repo, &fakeInvalidator{}), http.MethodPost, "/api/users", body)
			if status != fiber.StatusBadRequest || !strings.Contains(resp, "referral_code") {
				t.Fatalf("status=%d body=%s; se esperaba 400 en referral_code", status, resp)
			}
			if repo.created != nil {
				t.Fatal("con datos inválidos no se debe tocar la base")
			}
		})
	}
}

func TestRegisterUnknownReferralCodeIsBadRequest(t *testing.T) {
	repo := &fakeUsers{createErr: &repository.DomainError{Kind: repository.ErrInvalidReferral, Detail: "ZZZZ9999", Public: true}}

	status, body := send(t, newUserApp(repo, &fakeInvalidator{}), http.MethodPost, "/api/users",
		`{`+registerBase+`,"referral_code":"ZZZZ9999"}`)
	if status != fiber.StatusBadRequest || !strings.Contains(body, "Código de referido inválido") {
		t.Fatalf("status=%d body=%s; se esperaba 400 \"Código de referido inválido\"", status, body)
	}
}

func TestUpdateUserValidation(t *testing.T) {
	cases := []struct {
		name, path, body string
		status           int
	}{
		{"sin cambios", "/api/users/5", `{}`, fiber.StatusBadRequest},
		{"rol inválido", "/api/users/5", `{"role":"superuser"}`, fiber.StatusBadRequest},
		{"id no numérico", "/api/users/abc", `{"active":false}`, fiber.StatusBadRequest},
		{"se desactiva a sí mismo", "/api/users/1", `{"active":false}`, fiber.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeUsers{}
			status, body := send(t, newUserApp(repo, &fakeInvalidator{}), http.MethodPatch, tc.path, tc.body)
			if status != tc.status {
				t.Fatalf("status=%d body=%s; se esperaba %d", status, body, tc.status)
			}
			if repo.updated != nil {
				t.Fatal("una petición rechazada no debe modificar la cuenta")
			}
		})
	}
}

func TestUpdateUserNotFound(t *testing.T) {
	repo := &fakeUsers{updateErr: repository.ErrNotFound}
	status, _ := send(t, newUserApp(repo, &fakeInvalidator{}), http.MethodPatch, "/api/users/999", `{"active":false}`)
	if status != fiber.StatusNotFound {
		t.Fatalf("status=%d; se esperaba 404", status)
	}
}

func TestUpdateUserAppliesChangesAndInvalidatesNetwork(t *testing.T) {
	repo := &fakeUsers{}
	network := &fakeInvalidator{}

	status, body := send(t, newUserApp(repo, network), http.MethodPatch, "/api/users/5", `{"role":" ADMIN ","active":false}`)
	if status != fiber.StatusOK {
		t.Fatalf("status=%d body=%s; se esperaba 200", status, body)
	}
	if repo.updatedID != 5 || *repo.updated.Role != "admin" || *repo.updated.Active {
		t.Fatalf("recibido id=%d %+v; se esperaba id 5, rol admin normalizado y active=false", repo.updatedID, repo.updated)
	}
	if len(network.users) != 1 || network.users[0] != 5 {
		t.Fatalf("red invalidada para %v; se esperaba 5", network.users)
	}
}

func TestRegisterRejectsWeakPasswordAndBadEmail(t *testing.T) {
	repo := &fakeUsers{}
	status, body := send(t, newUserApp(repo, &fakeInvalidator{}), http.MethodPost, "/api/users",
		`{"email":"Ana <ana@x.ec>","password":"123456","name":"Ana"}`)
	if status != fiber.StatusBadRequest {
		t.Fatalf("status=%d; se esperaba 400", status)
	}
	for _, want := range []string{`"email"`, `"password"`, "una mayúscula", "un carácter especial"} {
		if !strings.Contains(body, want) {
			t.Errorf("la respuesta %s no menciona %s", body, want)
		}
	}
	if repo.created != nil {
		t.Fatal("con datos inválidos no se debe tocar la base")
	}
}
