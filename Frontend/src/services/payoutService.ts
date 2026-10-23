import type { Page } from '../data/orders';
import type { Payout, PendingDebt } from '../data/payouts';
import { apiFetch } from './apiClient';
import { snapshotGet } from './snapshotClient';

// Cobros del distribuidor autenticado.
export const myPayoutsPath = (page: number, limit: number): string => `/api/payouts/mine?page=${page}&limit=${limit}`;

export const getMyPayouts = (page: number, limit: number): Promise<Page<Payout>> =>
  snapshotGet<Page<Payout>>(myPayoutsPath(page, limit));

// ===== Solo administrador =====

// Deuda por distribuidor (comisiones pendientes de pedidos no cancelados).
export const PENDING_DEBTS_PATH = '/api/reports/pending-commissions';

export const getPendingDebts = (): Promise<PendingDebt[]> => snapshotGet<PendingDebt[]>(PENDING_DEBTS_PATH);

// Historial de pagos de todos los distribuidores.
export const payoutsPath = (page: number, limit: number): string => `/api/payouts?page=${page}&limit=${limit}`;

export const getPayouts = (page: number, limit: number): Promise<Page<Payout>> =>
  snapshotGet<Page<Payout>>(payoutsPath(page, limit));

// Liquida todas las comisiones pendientes del distribuidor (409 si no tiene deuda).
export const createPayout = (beneficiaryId: number): Promise<Payout> =>
  apiFetch<Payout>('/api/payouts', { method: 'POST', body: { beneficiary_id: beneficiaryId } });
