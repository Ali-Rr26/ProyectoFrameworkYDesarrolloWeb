package controllers

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/models"
	"multicatalogo-backend/repository"
)

// fakePayouts es un PayoutRepository en memoria que registra lo que recibe.
type fakePayouts struct {
	createdFor  int
	listedFor   *int
	listed      bool
	createErr   error
	debtsCalled bool
}

func (f *fakePayouts) CreatePayout(_ context.Context, beneficiaryID int) (*models.Payout, error) {
	f.createdFor = beneficiaryID
	if f.createErr != nil {
		return nil, f.createErr
	}
	return &models.Payout{ID: 1, BeneficiaryID: beneficiaryID, Total: 12.5, CommissionsCount: 3}, nil
}

func (f *fakePayouts) ListPayouts(_ context.Context, beneficiaryID *int, page, limit int) (*models.Page[models.Payout], error) {
	f.listedFor, f.listed = beneficiaryID, true
	return &models.Page[models.Payout]{Data: []models.Payout{}, Page: page, Limit: limit}, nil
}

func (f *fakePayouts) GetPendingDebts(context.Context) ([]models.PendingDebt, error) {
	f.debtsCalled = true
	return []models.PendingDebt{{BeneficiaryID: 2, Name: "Cliente", ReadyTotal: 10, ReadyCount: 2, WaitingTotal: 3, WaitingCount: 1}}, nil
}

func newPayoutApp(repo *fakePayouts) *fiber.App {
	ctrl := NewPayoutController(repo)
	as := func(c *fiber.Ctx) error {
		c.Locals(localsClaims, &auth.Claims{Role: "customer", RegisteredClaims: jwt.RegisteredClaims{Subject: "4"}})
		return c.Next()
	}
	app := fiber.New()
	app.Post("/api/payouts", as, ctrl.CreatePayout)
	app.Get("/api/payouts", as, ctrl.ListPayouts)
	app.Get("/api/payouts/mine", as, ctrl.MyPayouts)
	app.Get("/api/reports/pending-commissions", as, ctrl.PendingCommissions)
	return app
}

func TestCreatePayout(t *testing.T) {
	cases := []struct {
		name, body string
		err        error
		status     int
	}{
		{"liquida", `{"beneficiary_id":2}`, nil, fiber.StatusCreated},
		{"sin beneficiario", `{}`, nil, fiber.StatusBadRequest},
		{"beneficiario inválido", `{"beneficiary_id":-1}`, nil, fiber.StatusBadRequest},
		{"sin deuda", `{"beneficiary_id":2}`, &repository.DomainError{Kind: repository.ErrNothingToPay, Detail: "distribuidor 2", Public: true}, fiber.StatusConflict},
		{"inexistente", `{"beneficiary_id":999}`, repository.ErrNotFound, fiber.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakePayouts{createErr: tc.err}
			status, body := send(t, newPayoutApp(repo), http.MethodPost, "/api/payouts", tc.body)
			if status != tc.status {
				t.Fatalf("status=%d body=%s; se esperaba %d", status, body, tc.status)
			}
			if tc.status == fiber.StatusBadRequest && repo.createdFor != 0 {
				t.Fatal("con datos inválidos no se debe tocar la base")
			}
		})
	}
}

func TestPayoutListsAndDebts(t *testing.T) {
	repo := &fakePayouts{}
	app := newPayoutApp(repo)

	if status, _ := send(t, app, http.MethodGet, "/api/payouts/mine", ""); status != fiber.StatusOK || repo.listedFor == nil || *repo.listedFor != 4 {
		t.Fatalf("status=%d; /mine debe filtrar por el usuario del token (4)", status)
	}
	repo.listedFor = nil
	if status, _ := send(t, app, http.MethodGet, "/api/payouts?page=1&limit=20", ""); status != fiber.StatusOK || repo.listedFor != nil {
		t.Fatalf("status=%d; el historial del admin no filtra por beneficiario", status)
	}
	repo.listed = false
	if status, _ := send(t, app, http.MethodGet, "/api/payouts?limit=500", ""); status != fiber.StatusBadRequest || repo.listed {
		t.Fatalf("status=%d; paginación inválida → 400 sin consultar", status)
	}
	status, body := send(t, app, http.MethodGet, "/api/reports/pending-commissions", "")
	if status != fiber.StatusOK || !repo.debtsCalled || !strings.Contains(body, `"ready_total":10`) || !strings.Contains(body, `"waiting_total":3`) {
		t.Fatalf("status=%d body=%s; se esperaba la deuda por distribuidor", status, body)
	}
}
