import { RANKS } from './constants';

// Saldo de comisiones de la raíz, calculado por el backend (tabla commissions)
export interface NetworkSummary {
  commissions_month: number;
  commissions_total: number;
}

// Nodo del árbol de referidos tal como lo entrega GET /api/network
export interface NetworkNode {
  id: number;
  name: string;
  level: number;
  sales: number;
  // Comisión que las compras de este miembro ya le pagaron a la raíz
  commission: number;
  // Solo en la raíz: código para invitar (/register?ref=CODIGO) y saldo de comisiones
  referral_code?: string;
  summary?: NetworkSummary;
  children?: NetworkNode[];
}

// Cantidad total de miembros por debajo de la raíz (todos los niveles)
export const countNetwork = (root: NetworkNode): number => {
  const directs = root.children ?? [];
  return directs.reduce((total, child) => total + 1 + countNetwork(child), 0);
};

// Suma de las ventas de todos los miembros por debajo de la raíz
export const sumNetworkSales = (root: NetworkNode): number => {
  const directs = root.children ?? [];
  return directs.reduce((total, child) => total + child.sales + sumNetworkSales(child), 0);
};

// Comisiones del mes de la raíz. Ya no se estiman en el navegador: las registra el
// backend (goroutine tras cada compra) y llegan en summary. Una respuesta antigua en
// caché puede no traer summary durante unos minutos: se muestra 0.
export const getMonthlyCommissions = (root: NetworkNode): number =>
  root.summary?.commissions_month ?? 0;

// Rango alcanzado según la cantidad de referidos directos
export const getRank = (directReferrals: number): string => {
  if (directReferrals >= 6) return RANKS[3];
  if (directReferrals >= 4) return RANKS[2];
  if (directReferrals >= 2) return RANKS[1];
  return RANKS[0];
};
