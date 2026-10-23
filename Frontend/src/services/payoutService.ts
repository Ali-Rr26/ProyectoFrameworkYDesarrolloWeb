import type { Page } from '../data/orders';
import type { Payout, PendingDebt } from '../data/payouts';
import { apiFetch } from './apiClient';
import { snapshotGet } from './snapshotClient';

// Cobros del distribuidor autenticado.
export const getMyPayouts = (page: number, limit: number): Promise<Page<Payout>> =>
  snapshotGet<Page<Payout>>(`/api/payouts/mine?page=${page}&limit=${limit}`);

// ===== Solo administrador =====

// Deuda por distribuidor (comisiones pendientes de pedidos no cancelados).
export const getPendingDebts = (): Promise<PendingDebt[]> =>
  snapshotGet<PendingDebt[]>('/api/reports/pending-commissions');

// Historial de pagos de todos los distribuidores.
export const getPayouts = (page: number, limit: number): Promise<Page<Payout>> =>
  snapshotGet<Page<Payout>>(`/api/payouts?page=${page}&limit=${limit}`);

// Liquida todas las comisiones pendientes del distribuidor (409 si no tiene deuda).
export const createPayout = (beneficiaryId: number): Promise<Payout> =>
  apiFetch<Payout>('/api/payouts', { method: 'POST', body: { beneficiary_id: beneficiaryId } });
