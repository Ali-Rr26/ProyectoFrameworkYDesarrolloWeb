import { addDays } from './dates';

// Reportes del negocio tal como los entrega la API (/api/reports/*)

// Periodos del selector del Dashboard (mismos nombres que ?range= del backend)
export type RangePreset = 'last_30_days' | 'month_to_date' | 'today' | 'custom';

export const DEFAULT_RANGE: RangePreset = 'last_30_days';

export const RANGE_LABELS: Record<RangePreset, string> = {
  last_30_days: 'Últimos 30 días',
  month_to_date: 'Este mes',
  today: 'Hoy',
  custom: 'Personalizado',
};

// Máximo que acepta el backend para un periodo
export const MAX_RANGE_DAYS = 366;

// Días que abarca cada periodo a partir de "hoy" (AAAA-MM-DD en la zona del negocio).
// Función pura: replica la regla del backend para mostrar las fechas al instante, antes
// de que llegue la respuesta (que trae el periodo definitivo).
export const presetDays = (preset: Exclude<RangePreset, 'custom'>, today: string): { from: string; to: string } => {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'month_to_date':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last_30_days':
      return { from: addDays(today, -29), to: today };
  }
};

export interface SalesSummary {
  // Periodo aplicado por el servidor
  range: RangePreset;
  from: string;
  to: string;
  timezone: string;
  total_sales: number;
  orders_count: number;
  average_ticket: number;
  cancelled_count: number;
  commissions_accrued: number;
  new_members: number;
}

export interface TopProduct {
  product_id: number;
  name: string;
  units: number;
  revenue: number;
}

export interface TopSponsor {
  sponsor_id: number;
  name: string;
  email: string;
  network_sales: number;
  orders_count: number;
  commissions: number;
}

// Formato de dinero de los reportes
export const money = (value: number): string =>
  `$${value.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
