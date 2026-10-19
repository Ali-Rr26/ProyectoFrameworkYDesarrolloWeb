package controllers

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"

	"multicatalogo-backend/models"
)

// Límites de los reportes.
const (
	dateLayout       = "2006-01-02"
	maxReportDays    = 366
	defaultRankLimit = 5
	maxRankLimit     = 20
)

// ReportController expone los reportes del negocio para el Dashboard (solo admin).
type ReportController struct {
	reports ReportRepository
	// loc es la zona horaria del negocio: "18 de octubre" significa el día 18 en Ecuador,
	// aunque el servidor y la base trabajen en UTC.
	loc *time.Location
}

// NewReportController recibe sus dependencias por inyección.
func NewReportController(reports ReportRepository, loc *time.Location) *ReportController {
	return &ReportController{reports: reports, loc: loc}
}

// now es la hora actual en la zona horaria del negocio.
func (h *ReportController) now() time.Time { return time.Now().In(h.loc) }

// resolveRange interpreta el periodo de un reporte en la zona horaria de now (la del
// negocio). Es una función pura: recibe "ahora" para probarla sin depender del reloj.
//   - ?from y/o ?to: rango personalizado (ver parseDateRange).
//   - ?range=today | month_to_date | last_30_days; sin nada, last_30_days.
//
// Todos los periodos incluyen hoy completo (hasta las 23:59:59) y se expresan como
// [inicio del primer día, inicio del día siguiente al último).
func resolveRange(rangeName, fromStr, toStr string, now time.Time) (models.ResolvedRange, error) {
	custom := fromStr != "" || toStr != ""
	if custom && rangeName != "" && rangeName != models.RangeCustom {
		return models.ResolvedRange{}, errors.New("use range o from/to, no ambos")
	}

	loc := now.Location()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	var first, last time.Time
	name := rangeName
	switch {
	case custom || rangeName == models.RangeCustom:
		r, fromDay, toDay, err := parseDateRange(fromStr, toStr, now)
		if err != nil {
			return models.ResolvedRange{}, err
		}
		return models.ResolvedRange{DateRange: r, Name: models.RangeCustom, FromDay: fromDay, ToDay: toDay, Timezone: loc.String()}, nil
	case rangeName == "" || rangeName == models.RangeLast30Days:
		name, first, last = models.RangeLast30Days, today.AddDate(0, 0, -29), today
	case rangeName == models.RangeMonthToDate:
		first, last = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc), today
	case rangeName == models.RangeToday:
		first, last = today, today
	default:
		return models.ResolvedRange{}, errors.New("range debe ser today, month_to_date o last_30_days")
	}
	return models.ResolvedRange{
		// AddDate trabaja con días de calendario: respeta días de 23 o 25 horas por cambio de horario.
		DateRange: models.DateRange{From: first, To: last.AddDate(0, 0, 1)},
		Name:      name,
		FromDay:   first.Format(dateLayout),
		ToDay:     last.Format(dateLayout),
		Timezone:  loc.String(),
	}, nil
}

// parseDateRange interpreta el rango personalizado ?from=AAAA-MM-DD&to=AAAA-MM-DD (ambos
// días incluidos) en la zona horaria de now. "from" vacío = 1.º del mes en curso; "to"
// vacío = hoy (hasta las 23:59:59).
func parseDateRange(fromStr, toStr string, now time.Time) (models.DateRange, string, string, error) {
	loc := now.Location()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	to := today

	var err error
	if fromStr != "" {
		if from, err = time.ParseInLocation(dateLayout, fromStr, loc); err != nil {
			return models.DateRange{}, "", "", errors.New("from debe tener el formato AAAA-MM-DD")
		}
	}
	if toStr != "" {
		if to, err = time.ParseInLocation(dateLayout, toStr, loc); err != nil {
			return models.DateRange{}, "", "", errors.New("to debe tener el formato AAAA-MM-DD")
		}
	}
	if to.Before(from) {
		return models.DateRange{}, "", "", errors.New("from no puede ser posterior a to")
	}
	if to.Sub(from) > maxReportDays*24*time.Hour {
		return models.DateRange{}, "", "", errors.New("el periodo no puede superar un año")
	}
	// [from, to + 1 día): el último día entra completo.
	return models.DateRange{From: from, To: to.AddDate(0, 0, 1)}, from.Format(dateLayout), to.Format(dateLayout), nil
}

// rankLimit lee ?limit de los rankings (1 a 20, por defecto 5).
func rankLimit(c *fiber.Ctx) (int, error) {
	v := c.Query("limit")
	if v == "" {
		return defaultRankLimit, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > maxRankLimit {
		return 0, errors.New("limit debe ser un entero entre 1 y 20")
	}
	return n, nil
}

// period interpreta ?range / ?from / ?to de la petición en la zona horaria del negocio.
func (h *ReportController) period(c *fiber.Ctx) (models.ResolvedRange, error) {
	return resolveRange(c.Query("range"), c.Query("from"), c.Query("to"), h.now())
}

// Summary devuelve los KPIs del periodo (GET /api/reports/summary?range | ?from&to) y
// describe el periodo aplicado (nombre, fechas y zona horaria).
func (h *ReportController) Summary(c *fiber.Ctx) error {
	r, err := h.period(c)
	if err != nil {
		return apiError(c, fiber.StatusBadRequest, "Periodo inválido", err.Error())
	}
	ctx, cancel := dbCtx(c)
	defer cancel()

	summary, err := h.reports.GetSalesSummary(ctx, r.DateRange)
	if err != nil {
		return repoError(c, err)
	}
	summary.Range, summary.From, summary.To, summary.Timezone = r.Name, r.FromDay, r.ToDay, r.Timezone
	return c.JSON(summary)
}

// TopProducts devuelve los productos más vendidos del periodo
// (GET /api/reports/top-products?range | ?from&to, &limit).
func (h *ReportController) TopProducts(c *fiber.Ctx) error {
	r, err := h.period(c)
	if err != nil {
		return apiError(c, fiber.StatusBadRequest, "Periodo inválido", err.Error())
	}
	limit, err := rankLimit(c)
	if err != nil {
		return apiError(c, fiber.StatusBadRequest, "Límite inválido", err.Error())
	}
	ctx, cancel := dbCtx(c)
	defer cancel()

	top, err := h.reports.GetTopProducts(ctx, r.DateRange, limit)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(top)
}

// TopSponsors devuelve los patrocinadores cuya red más vendió en el periodo
// (GET /api/reports/top-sponsors?range | ?from&to, &limit).
func (h *ReportController) TopSponsors(c *fiber.Ctx) error {
	r, err := h.period(c)
	if err != nil {
		return apiError(c, fiber.StatusBadRequest, "Periodo inválido", err.Error())
	}
	limit, err := rankLimit(c)
	if err != nil {
		return apiError(c, fiber.StatusBadRequest, "Límite inválido", err.Error())
	}
	ctx, cancel := dbCtx(c)
	defer cancel()

	top, err := h.reports.GetTopSponsors(ctx, r.DateRange, limit)
	if err != nil {
		return repoError(c, err)
	}
	return c.JSON(top)
}
