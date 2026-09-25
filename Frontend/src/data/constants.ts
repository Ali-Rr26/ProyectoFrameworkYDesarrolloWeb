export const API_URL = 'http://localhost:4000';

export const TASA_COMISION: Record<number, number> = {
  1: 0.10,
  2: 0.05,
  3: 0.02,
};

export const METODOS_PAGO = ['Tarjeta de crédito', 'Transferencia bancaria', 'Efectivo contra entrega'];

export const NIVELES = ['Bronce', 'Plata', 'Oro', 'Diamante'];

export const COLORES_NIVEL: Record<number, { badge: string; border: string; tasa: string }> = {
  1: { badge: 'bg-teal-100 text-teal-700', border: 'border-teal-200', tasa: '10 %' },
  2: { badge: 'bg-cyan-100 text-cyan-700', border: 'border-cyan-200', tasa: '5 %' },
  3: { badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200', tasa: '2 %' },
};
