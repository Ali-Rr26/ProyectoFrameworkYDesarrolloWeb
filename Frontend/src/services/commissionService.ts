import type { CommissionLedger } from '../data/commissions';
import { snapshotGet } from './snapshotClient';

// Ledger de comisiones del usuario autenticado (paginado, con totales por estado).
export const myCommissionsPath = (page: number, limit: number): string =>
  `/api/commissions/mine?page=${page}&limit=${limit}`;

export const getMyCommissions = (page: number, limit: number): Promise<CommissionLedger> =>
  snapshotGet<CommissionLedger>(myCommissionsPath(page, limit));
