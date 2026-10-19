package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

type fakePinger struct{ err error }

func (f fakePinger) Ping(context.Context) error { return f.err }

// pingCache es una caché cuyo Ping falla a voluntad.
type pingCache struct {
	fakeCache
	err error
}

func (p *pingCache) Ping(context.Context) error { return p.err }

func TestHealthReportsDependencies(t *testing.T) {
	down := errors.New("caído")
	cases := []struct {
		name           string
		dbErr, redis   error
		code           int
		status, db, rd string
	}{
		{"todo operativo", nil, nil, fiber.StatusOK, healthOK, healthOK, healthOK},
		{"redis caído", nil, down, fiber.StatusOK, healthDegraded, healthOK, healthError},
		{"postgres caído", down, nil, fiber.StatusServiceUnavailable, healthError, healthError, healthOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := NewHealthController(fakePinger{tc.dbErr}, &pingCache{err: tc.redis})
			app := fiber.New()
			app.Get("/api/health", h.Health)

			resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/health", nil))
			if err != nil {
				t.Fatal(err)
			}
			var body map[string]string
			if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if resp.StatusCode != tc.code || body["status"] != tc.status ||
				body["database"] != tc.db || body["redis"] != tc.rd {
				t.Fatalf("code=%d body=%v; se esperaba %d status=%s database=%s redis=%s",
					resp.StatusCode, body, tc.code, tc.status, tc.db, tc.rd)
			}
		})
	}
}
