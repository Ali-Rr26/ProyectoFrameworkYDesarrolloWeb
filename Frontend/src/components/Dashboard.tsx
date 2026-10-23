import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_RANGE,
  MAX_RANGE_DAYS,
  money,
  presetDays,
  RANGE_LABELS,
  type RangePreset,
  type SalesSummary,
  type TopProduct,
  type TopSponsor,
} from '../data/reports';
import type { PendingDebt } from '../data/payouts';
import { addDays, formatDay, todayIn } from '../data/dates';
import { BUSINESS_TIMEZONE } from '../data/constants';
import { ApiError, errorMessage } from '../services/apiClient';
import { getSummary, getTopProducts, getTopSponsors, type ReportPeriod } from '../services/reportService';
import { getPendingDebts } from '../services/payoutService';

interface Reports {
  // Periodo pedido: permite saber si estos datos corresponden a la selección actual
  key: string;
  summary: SalesSummary;
  products: TopProduct[];
  sponsors: TopSponsor[];
  debts: PendingDebt[];
}

const PRESETS: Exclude<RangePreset, 'custom'>[] = ['last_30_days', 'month_to_date', 'today'];

// Dashboard del administrador: KPIs y rankings del negocio calculados por el backend
// (/api/reports/*). El periodo vive en la URL (?range= o ?from&to) y por defecto son los
// últimos 30 días; las fechas siempre están cargadas en el selector.
const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<Reports | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  // ----- Periodo pedido (desde la URL) -----
  const urlFrom = searchParams.get('from') ?? '';
  const urlTo = searchParams.get('to') ?? '';
  const urlRange = searchParams.get('range') as RangePreset | null;
  const isCustom = urlFrom !== '' || urlTo !== '';
  const preset: RangePreset = isCustom ? 'custom'
    : urlRange && PRESETS.includes(urlRange as Exclude<RangePreset, 'custom'>) ? urlRange : DEFAULT_RANGE;

  // Hoy en la zona del negocio: límite de las fechas y base de los periodos predefinidos.
  const today = todayIn(BUSINESS_TIMEZONE);
  // Rango personalizado: si solo llega una fecha, la otra se completa (Hasta = hoy).
  const custom = { from: urlFrom || urlTo, to: urlTo || today };
  const period: ReportPeriod = preset === 'custom' ? custom : { range: preset };
  const key = JSON.stringify(period);

  useEffect(() => {
    let active = true;
    // El periodo se reconstruye desde key: el efecto depende solo de ella y se repite
    // únicamente cuando el periodo cambia.
    const requested = JSON.parse(key) as ReportPeriod;
    Promise.all([getSummary(requested), getTopProducts(requested), getTopSponsors(requested), getPendingDebts()])
      .then(([summary, products, sponsors, debts]) => active && setReports({ key, summary, products, sponsors, debts }))
      .catch((err) => {
        if (!active) return;
        const message = err instanceof ApiError
          ? (typeof err.details === 'string' ? `${err.message}: ${err.details}` : err.message)
          : errorMessage(err, 'No se pudieron cargar los reportes');
        setFailure({ key, message });
      });
    return () => {
      active = false;
    };
  }, [key]);

  const loading = reports?.key !== key && failure?.key !== key;
  const error = failure?.key === key ? failure.message : '';
  // Mientras carga un periodo nuevo se siguen viendo (atenuados) los datos anteriores.
  const s = reports?.summary;

  // Fechas visibles: las que aplicó el servidor; mientras carga, las calculadas localmente.
  const shown = preset === 'custom'
    ? custom
    : reports?.key === key && s ? { from: s.from, to: s.to } : presetDays(preset, today);

  // ----- Cambios de periodo (actualizan la URL; replace evita llenar el historial) -----
  const choosePreset = (next: RangePreset) => {
    if (next === 'custom') setSearchParams({ from: shown.from, to: shown.to }, { replace: true });
    else if (next === DEFAULT_RANGE) setSearchParams({}, { replace: true });
    else setSearchParams({ range: next }, { replace: true });
  };
  const changeDate = (field: 'from' | 'to', value: string) => {
    if (!value) return; // el selector nunca queda vacío
    setSearchParams({ ...shown, [field]: value }, { replace: true });
  };

  const readyToPay = reports?.debts.reduce((total, d) => total + d.ready_total, 0) ?? 0;
  const waiting = reports?.debts.reduce((total, d) => total + d.waiting_total, 0) ?? 0;

  const kpis = s
    ? [
        { label: 'Ventas', value: money(s.total_sales), color: 'text-[#20b2aa]' },
        { label: 'Pedidos', value: s.orders_count.toString(), color: 'text-[#20b2aa]' },
        { label: 'Ticket promedio', value: money(s.average_ticket), color: 'text-slate-800' },
        { label: 'Comisiones devengadas', value: money(s.commissions_accrued), color: 'text-green-600' },
        { label: 'Pedidos cancelados', value: s.cancelled_count.toString(), color: 'text-slate-500' },
        { label: 'Nuevos afiliados', value: s.new_members.toString(), color: 'text-amber-600' },
      ]
    : [];

  const field = 'w-full min-h-11 px-3 rounded-lg border border-slate-300 bg-white';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Resumen del negocio</h1>
        <p className="text-slate-500">Ventas sin pedidos cancelados, calculadas por el servidor.</p>
      </div>

      {/* ===== SELECTOR DE PERIODO ===== */}
      <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:items-end">
          <div>
            <label htmlFor="preset" className="block text-sm font-medium text-slate-700 mb-1">Periodo</label>
            <select id="preset" value={preset} onChange={(e) => choosePreset(e.target.value as RangePreset)} className={field}>
              {[...PRESETS, 'custom' as const].map((p) => <option key={p} value={p}>{RANGE_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="block text-sm font-medium text-slate-700 mb-1">Desde</label>
            <input id="from" type="date" value={shown.from} min={addDays(shown.to, -(MAX_RANGE_DAYS - 1))} max={shown.to}
              onChange={(e) => changeDate('from', e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="to" className="block text-sm font-medium text-slate-700 mb-1">Hasta</label>
            <input id="to" type="date" value={shown.to} min={shown.from} max={today}
              onChange={(e) => changeDate('to', e.target.value)} className={field} />
          </div>
          <button type="button" onClick={() => setSearchParams({}, { replace: true })}
            disabled={preset === DEFAULT_RANGE}
            className="min-h-11 px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
            Restablecer
          </button>
        </div>
        {s && (
          <p className="text-sm text-slate-500 mt-3">
            Del {formatDay(s.from)} 00:00 al {formatDay(s.to)} 23:59 ({s.timezone})
          </p>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200">{error}</div>}
      {loading && !reports && <p className="text-slate-500">Cargando reportes...</p>}

      {reports && (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          {/* ===== KPIs DEL PERIODO ===== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
                <p className="text-sm text-slate-500 uppercase font-semibold">{kpi.label}</p>
                <p className={`text-3xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* ===== DEUDA DE COMISIONES (no depende del periodo) ===== */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100 mb-8 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-slate-500 uppercase font-semibold">Comisiones por liquidar</p>
              <p className="text-3xl font-bold mt-2 text-amber-600">{money(readyToPay)}</p>
              <p className="text-sm text-slate-500 mt-1">En espera de entrega: {money(waiting)}</p>
            </div>
            <Link to="/admin/payouts"
              className="inline-flex items-center justify-center min-h-11 px-6 bg-[#20b2aa] text-white font-semibold rounded-lg hover:bg-[#008080] transition">
              Ir a Liquidaciones
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ===== TOP PRODUCTOS ===== */}
            <section className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Productos más vendidos</h2>
              {reports.products.length === 0 ? (
                <p className="text-slate-500 text-sm">Sin ventas en el periodo.</p>
              ) : (
                <ol className="space-y-3">
                  {reports.products.map((p, idx) => (
                    <li key={p.product_id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 flex-shrink-0 rounded-full bg-[#40d9d8] text-white font-bold flex items-center justify-center">{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.units} unidad(es)</p>
                        </div>
                      </div>
                      <p className="font-bold text-slate-800">{money(p.revenue)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ===== TOP PATROCINADORES ===== */}
            <section className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Patrocinadores con más ventas en su red</h2>
              {reports.sponsors.length === 0 ? (
                <p className="text-slate-500 text-sm">Sin ventas de la red en el periodo.</p>
              ) : (
                <ol className="space-y-3">
                  {reports.sponsors.map((sp, idx) => (
                    <li key={sp.sponsor_id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 flex-shrink-0 rounded-full bg-[#20b2aa] text-white font-bold flex items-center justify-center">{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{sp.name}</p>
                          <p className="text-xs text-slate-500">{sp.orders_count} pedido(s) de su red</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">{money(sp.network_sales)}</p>
                        <p className="text-xs text-green-600 font-semibold">+{money(sp.commissions)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
