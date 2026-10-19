package controllers

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"

	"multicatalogo-backend/auth"
	"multicatalogo-backend/models"
)

// fakeCommissionQueries registra la consulta recibida y devuelve un ledger fijo.
type fakeCommissionQueries struct {
	userID, page, limit int
	called              bool
}

func (f *fakeCommissionQueries) ListUserCommissions(_ context.Context, userID, page, limit int) (*models.CommissionLedger, error) {
	f.userID, f.page, f.limit, f.called = userID, page, limit, true
	return &models.CommissionLedger{
		Page: models.Page[models.CommissionEntry]{
			Data:  []models.CommissionEntry{{ID: 1, OrderID: 5, BuyerName: "Diana", Level: 1, Rate: 0.1, Amount: 3.25, Status: "pending"}},
			Page:  page,
			Limit: limit,
			Total: 1,
		},
		Totals: models.CommissionTotals{Pending: 3.25},
	}, nil
}

func newCommissionApp(repo *fakeCommissionQueries) *fiber.App {
	ctrl := NewCommissionController(repo)
	asUser := func(c *fiber.Ctx) error {
		c.Locals(localsClaims, &auth.Claims{Role: "customer", RegisteredClaims: jwt.RegisteredClaims{Subject: "4"}})
		return c.Next()
	}
	app := fiber.New()
	app.Get("/api/commissions/mine", asUser, ctrl.MyCommissions)
	return app
}

func TestMyCommissionsUsesTokenUserAndReturnsTotals(t *testing.T) {
	repo := &fakeCommissionQueries{}
	status, body := send(t, newCommissionApp(repo), http.MethodGet, "/api/commissions/mine?page=2&limit=5", "")
	if status != fiber.StatusOK {
		t.Fatalf("status=%d body=%s; se esperaba 200", status, body)
	}
	if repo.userID != 4 || repo.page != 2 || repo.limit != 5 {
		t.Fatalf("consulta user=%d page=%d limit=%d; se esperaba el usuario del token (4), página 2, límite 5", repo.userID, repo.page, repo.limit)
	}

	// La página y los totales viajan en el mismo objeto: {data, page, limit, total, totals}.
	var got struct {
		Data   []map[string]any   `json:"data"`
		Page   int                `json:"page"`
		Total  int                `json:"total"`
		Totals map[string]float64 `json:"totals"`
	}
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatal(err)
	}
	if got.Page != 2 || got.Total != 1 || len(got.Data) != 1 || got.Data[0]["buyer_name"] != "Diana" || got.Totals["pending"] != 3.25 {
		t.Fatalf("respuesta %s; se esperaba la página con su ledger y los totales", body)
	}
}

func TestMyCommissionsRejectsBadPagination(t *testing.T) {
	for _, q := range []string{"?page=0", "?limit=100", "?limit=abc"} {
		repo := &fakeCommissionQueries{}
		status, _ := send(t, newCommissionApp(repo), http.MethodGet, "/api/commissions/mine"+q, "")
		if status != fiber.StatusBadRequest || repo.called {
			t.Errorf("%s: status=%d; se esperaba 400 sin consultar la base", q, status)
		}
	}
}
