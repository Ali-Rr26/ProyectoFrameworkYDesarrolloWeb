import type { RangePreset, SalesSummary, TopProduct, TopSponsor } from '../data/reports';
import { apiFetch } from './apiClient';

// Periodo de un reporte: un periodo predefinido (?range=) o un rango personalizado
// (?from&to, AAAA-MM-DD, ambos días completos en la zona horaria del negocio).
export type ReportPeriod =
  | { range: Exclude<RangePreset, 'custom'> }
  | { from: string; to: string };

const query = (period: ReportPeriod) =>
  new URLSearchParams('range' in period ? { range: period.range } : { from: period.from, to: period.to }).toString();

// Reportes del Dashboard (solo admin).
export const getSummary = (period: ReportPeriod): Promise<SalesSummary> =>
  apiFetch<SalesSummary>(`/api/reports/summary?${query(period)}`);

export const getTopProducts = (period: ReportPeriod, limit = 5): Promise<TopProduct[]> =>
  apiFetch<TopProduct[]>(`/api/reports/top-products?${query(period)}&limit=${limit}`);

export const getTopSponsors = (period: ReportPeriod, limit = 5): Promise<TopSponsor[]> =>
  apiFetch<TopSponsor[]>(`/api/reports/top-sponsors?${query(period)}&limit=${limit}`);
