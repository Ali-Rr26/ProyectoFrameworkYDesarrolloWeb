import type { CommissionLedger } from '../data/commissions';
import { snapshotGet } from './snapshotClient';

// Ledger de comisiones del usuario autenticado (paginado, con totales por estado).
export const getMyCommissions = (page: number, limit: number): Promise<CommissionLedger> =>
  snapshotGet<CommissionLedger>(`/api/commissions/mine?page=${page}&limit=${limit}`);
