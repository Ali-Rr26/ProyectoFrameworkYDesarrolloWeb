// URL base del backend desde .env (VITE_API_URL); el valor por defecto sirve para desarrollo.
// Se quita la barra final para que `${API_URL}/api/...` no genere "//api".
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

// Zona horaria del negocio para mostrar fechas y calcular días; debe coincidir con
// APP_TIMEZONE del backend (los reportes la informan en su respuesta).
export const BUSINESS_TIMEZONE = import.meta.env.VITE_BUSINESS_TIMEZONE ?? 'America/Guayaquil';

// Porcentaje de comisión que genera cada nivel de la red (1 = referido directo)
export const COMMISSION_RATES: Record<number, number> = {
  1: 0.10,
  2: 0.05,
  3: 0.02,
};

// Rangos del distribuidor según sus referidos directos (texto visible en la interfaz)
export const RANKS = ['Bronce', 'Plata', 'Oro', 'Diamante'] as const;

// Etiqueta visible de cada rol que entrega la API
export const ROLE_LABELS: Record<string, string> = {
  admin: 'admin',
  customer: 'cliente',
};

// Estilos de cada nivel de la red en el árbol de referidos
export const LEVEL_STYLES: Record<number, { badge: string; border: string; rate: string }> = {
  1: { badge: 'bg-teal-100 text-teal-700', border: 'border-teal-200', rate: '10 %' },
  2: { badge: 'bg-cyan-100 text-cyan-700', border: 'border-cyan-200', rate: '5 %' },
  3: { badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200', rate: '2 %' },
};
