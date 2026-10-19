import type { CommissionLedger } from '../data/commissions';
import { apiFetch } from './apiClient';

// Ledger de comisiones del usuario autenticado (paginado, con totales por estado).
export const getMyCommissions = (page: number, limit: number): Promise<CommissionLedger> =>
  apiFetch<CommissionLedger>(`/api/commissions/mine?page=${page}&limit=${limit}`);
