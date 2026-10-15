import { COMMISSION_RATES, RANKS } from './constants';

// Nodo del árbol de referidos tal como lo entrega GET /api/network
export interface NetworkNode {
  id: number;
  name: string;
  level: number;
  sales: number;
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

// Comisión que un miembro genera para la raíz según su nivel
export const getNodeCommission = (node: NetworkNode): number =>
  node.sales * (COMMISSION_RATES[node.level] ?? 0);

// Suma de las comisiones de toda la red
export const sumCommissions = (root: NetworkNode): number => {
  const directs = root.children ?? [];
  return directs.reduce(
    (total, child) => total + getNodeCommission(child) + sumCommissions(child),
    0
  );
};

// Rango alcanzado según la cantidad de referidos directos
export const getRank = (directReferrals: number): string => {
  if (directReferrals >= 6) return RANKS[3];
  if (directReferrals >= 4) return RANKS[2];
  if (directReferrals >= 2) return RANKS[1];
  return RANKS[0];
};
