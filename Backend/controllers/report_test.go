package controllers

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
)

// Un pedido hecho el 18 de octubre a las 22:15 en Ecuador ya es 19 de octubre en UTC:
// con la zona del negocio, el día 18 lo incluye.
func TestParseDateRangeUsesBusinessTimezone(t *testing.T) {
	ecuador, err := time.LoadLocation("America/Guayaquil")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 19, 3, 15, 0, 0, time.UTC).In(ecuador) // 18-oct 22:15 en Ecuador
	order := time.Date(2026, 10, 19, 3, 0, 0, 0, time.UTC)            // 18-oct 22:00 en Ecuador

	r, from, to, err := parseDateRange("", "", now)
	if err != nil || from != "2026-10-01" || to != "2026-10-18" {
		t.Fatalf("periodo por defecto %s..%s %v; se esperaba hasta el 18 (hoy en Ecuador)", from, to, err)
	}
	if order.Before(r.From) || !order.Before(r.To) {
		t.Fatalf("el pedido de las 22:00 del 18 (hora de Ecuador) quedó fuera de [%s, %s)", r.From, r.To)
	}
}

func TestResolveRangePresets(t *testing.T) {
	ecuador, err := time.LoadLocation("America/Guayaquil")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 18, 22, 15, 0, 0, ecuador)
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, ecuador) }

	cases := []struct {
		name, rangeName      string
		wantName             string
		fromDay, toDay       string
		wantFrom, wantToExcl time.Time
	}{
		{"por defecto", "", "last_30_days", "2026-09-19", "2026-10-18", day(2026, 9, 19), day(2026, 10, 19)},
		{"últimos 30 días", "last_30_days", "last_30_days", "2026-09-19", "2026-10-18", day(2026, 9, 19), day(2026, 10, 19)},
		{"este mes", "month_to_date", "month_to_date", "2026-10-01", "2026-10-18", day(2026, 10, 1), day(2026, 10, 19)},
		{"hoy", "today", "today", "2026-10-18", "2026-10-18", day(2026, 10, 18), day(2026, 10, 19)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r, err := resolveRange(tc.rangeName, "", "", now)
			if err != nil {
				t.Fatal(err)
			}
			if r.Name != tc.wantName || r.FromDay != tc.fromDay || r.ToDay != tc.toDay ||
				!r.From.Equal(tc.wantFrom) || !r.To.Equal(tc.wantToExcl) || r.Timezone != "America/Guayaquil" {
				t.Fatalf("got %+v", r)
			}
		})
	}

	// Los 30 días incluyen hoy: el periodo dura exactamente 30 días de calendario.
	r, _ := resolveRange("", "", "", now)
	if days := int(r.To.Sub(r.From).Hours() / 24); days != 30 {
		t.Fatalf("last_30_days abarca %d días; se esperaban 30", days)
	}

	// Rango personalizado: from/to explícitos, con o sin range=custom.
	for _, rn := range []string{"", "custom"} {
		r, err := resolveRange(rn, "2026-09-01", "2026-09-30", now)
		if err != nil || r.Name != "custom" || r.FromDay != "2026-09-01" || r.ToDay != "2026-09-30" {
			t.Fatalf("custom (range=%q): %+v %v", rn, r, err)
		}
	}

	// Errores: periodo desconocido y mezcla de range con fechas.
	if _, err := resolveRange("last_week", "", "", now); err == nil {
		t.Error("un periodo desconocido debe fallar")
	}
	if _, err := resolveRange("today", "2026-10-01", "", now); err == nil {
		t.Error("mezclar range con from/to debe fallar")
	}
}

// En zonas con cambio de horario hay días de 23 y 25 horas: "hoy" debe abarcar el día de
// calendario completo, no 24 horas fijas.
func TestResolveRangeAcrossDaylightSaving(t *testing.T) {
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name  string
		now   time.Time
		hours float64
	}{
		{"inicio del horario de verano (8-mar-2026)", time.Date(2026, 3, 8, 15, 0, 0, 0, ny), 23},
		{"fin del horario de verano (1-nov-2026)", time.Date(2026, 11, 1, 15, 0, 0, 0, ny), 25},
		{"día normal", time.Date(2026, 6, 10, 15, 0, 0, 0, ny), 24},
	}
	for _, tc := range cases {
		r, err := resolveRange("today", "", "", tc.now)
		if err != nil {
			t.Fatal(err)
		}
		if got := r.To.Sub(r.From).Hours(); got != tc.hours {
			t.Errorf("%s: \"hoy\" dura %.0f h; se esperaban %.0f", tc.name, got, tc.hours)
		}
		if r.From.Hour() != 0 || r.To.Hour() != 0 {
			t.Errorf("%s: los límites deben ser medianoche local, son %s y %s", tc.name, r.From, r.To)
		}
	}
}

// Solo "desde": el periodo va de las 00:00:00 de ese día hasta hoy a las 23:59:59
// (en la zona del negocio). Se comprueban los bordes exactos.
func TestParseDateRangeOnlyFromUntilEndOfToday(t *testing.T) {
	ecuador, err := time.LoadLocation("America/Guayaquil")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 18, 22, 15, 0, 0, ecuador)
	r, from, to, err := parseDateRange("2026-10-05", "", now)
	if err != nil || from != "2026-10-05" || to != "2026-10-18" {
		t.Fatalf("periodo %s..%s %v; se esperaba del 5 a hoy (18)", from, to, err)
	}
	inside := func(ts time.Time) bool { return !ts.Before(r.From) && ts.Before(r.To) }
	cases := []struct {
		name string
		at   time.Time
		want bool
	}{
		{"5-oct 00:00:00 (inicio del primer día)", time.Date(2026, 10, 5, 0, 0, 0, 0, ecuador), true},
		{"4-oct 23:59:59 (día anterior)", time.Date(2026, 10, 4, 23, 59, 59, 0, ecuador), false},
		{"18-oct 23:59:59 (fin de hoy)", time.Date(2026, 10, 18, 23, 59, 59, 999_000_000, ecuador), true},
		{"19-oct 00:00:00 (mañana)", time.Date(2026, 10, 19, 0, 0, 0, 0, ecuador), false},
	}
	for _, tc := range cases {
		if inside(tc.at) != tc.want {
			t.Errorf("%s: dentro=%v; se esperaba %v", tc.name, inside(tc.at), tc.want)
		}
	}
}

func TestParseDateRange(t *testing.T) {
	now := time.Date(2026, 10, 18, 15, 30, 0, 0, time.UTC)
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }

	r, from, to, err := parseDateRange("", "", now)
	if err != nil || !r.From.Equal(day(2026, 10, 1)) || !r.To.Equal(day(2026, 10, 19)) || from != "2026-10-01" || to != "2026-10-18" {
		t.Fatalf("sin parámetros: %v %s %s %v; se esperaba el mes en curso hasta hoy (incluido)", r, from, to, err)
	}
	r, _, _, err = parseDateRange("2026-09-01", "2026-09-30", now)
	if err != nil || !r.From.Equal(day(2026, 9, 1)) || !r.To.Equal(day(2026, 10, 1)) {
		t.Fatalf("septiembre: %v %v; el último día debe entrar completo", r, err)
	}
	r, _, _, err = parseDateRange("2026-10-18", "2026-10-18", now)
	if err != nil || r.To.Sub(r.From) != 24*time.Hour {
		t.Fatalf("un solo día: %v %v", r, err)
	}

	for name, in := range map[string][2]string{
		"from mal formado":    {"18/10/2026", ""},
		"to mal formado":      {"", "2026-13-01"},
		"from posterior":      {"2026-10-10", "2026-10-01"},
		"periodo de dos años": {"2024-01-01", "2026-01-01"},
	} {
		if _, _, _, err := parseDateRange(in[0], in[1], now); err == nil {
			t.Errorf("%s: se esperaba error", name)
		}
	}
}

// fakeReports registra si se consultó y con qué límite.
type fakeReports struct {
	called bool
	limit  int
}

func (f *fakeReports) GetSalesSummary(context.Context, models.DateRange) (*models.SalesSummary, error) {
	f.called = true
	return &models.SalesSummary{TotalSales: 100, OrdersCount: 4, AverageTicket: 25}, nil
}

func (f *fakeReports) GetTopProducts(_ context.Context, _ models.DateRange, limit int) ([]models.TopProduct, error) {
	f.called, f.limit = true, limit
	return []models.TopProduct{}, nil
}

func (f *fakeReports) GetTopSponsors(_ context.Context, _ models.DateRange, limit int) ([]models.TopSponsor, error) {
	f.called, f.limit = true, limit
	return []models.TopSponsor{}, nil
}

func newReportApp(repo *fakeReports) *fiber.App {
	ctrl := NewReportController(repo, time.UTC)
	app := fiber.New()
	app.Get("/api/reports/summary", ctrl.Summary)
	app.Get("/api/reports/top-products", ctrl.TopProducts)
	app.Get("/api/reports/top-sponsors", ctrl.TopSponsors)
	return app
}

func TestReportHandlers(t *testing.T) {
	repo := &fakeReports{}
	status, body := send(t, newReportApp(repo), http.MethodGet, "/api/reports/summary?from=2026-09-01&to=2026-09-30", "")
	if status != fiber.StatusOK || !strings.Contains(body, `"from":"2026-09-01"`) || !strings.Contains(body, `"to":"2026-09-30"`) ||
		!strings.Contains(body, `"total_sales":100`) {
		t.Fatalf("status=%d body=%s; se esperaban los KPIs con el periodo aplicado", status, body)
	}

	repo = &fakeReports{}
	if status, _ := send(t, newReportApp(repo), http.MethodGet, "/api/reports/top-products", ""); status != fiber.StatusOK || repo.limit != 5 {
		t.Fatalf("status=%d límite=%d; por defecto se esperaba 5", status, repo.limit)
	}
	repo = &fakeReports{}
	if status, _ := send(t, newReportApp(repo), http.MethodGet, "/api/reports/top-sponsors?limit=10", ""); status != fiber.StatusOK || repo.limit != 10 {
		t.Fatalf("status=%d límite=%d; se esperaba 10", status, repo.limit)
	}

	repo = &fakeReports{}
	status, body = send(t, newReportApp(repo), http.MethodGet, "/api/reports/summary", "")
	if status != fiber.StatusOK || !strings.Contains(body, `"range":"last_30_days"`) || !strings.Contains(body, `"timezone":"UTC"`) {
		t.Fatalf("status=%d body=%s; sin periodo se esperaba last_30_days con su zona horaria", status, body)
	}
	repo = &fakeReports{}
	status, body = send(t, newReportApp(repo), http.MethodGet, "/api/reports/summary?range=month_to_date", "")
	if status != fiber.StatusOK || !strings.Contains(body, `"range":"month_to_date"`) {
		t.Fatalf("status=%d body=%s; se esperaba month_to_date", status, body)
	}

	for _, path := range []string{
		"/api/reports/summary?from=2026-10-10&to=2026-10-01",
		"/api/reports/summary?range=last_week",
		"/api/reports/summary?range=today&from=2026-10-01",
		"/api/reports/top-products?from=ayer",
		"/api/reports/top-sponsors?limit=50",
		"/api/reports/top-products?limit=0",
	} {
		repo = &fakeReports{}
		if status, _ := send(t, newReportApp(repo), http.MethodGet, path, ""); status != fiber.StatusBadRequest || repo.called {
			t.Errorf("%s: status=%d; se esperaba 400 sin consultar la base", path, status)
		}
	}
}
