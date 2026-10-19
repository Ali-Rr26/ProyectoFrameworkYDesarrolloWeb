import type { Page } from './orders';

export type CommissionStatus = 'pending' | 'paid' | 'reversed';

// Fila del ledger de comisiones tal como la entrega GET /api/commissions/mine
export interface CommissionEntry {
  id: number;
  order_id: number;
  // Miembro de la red cuya compra generó la comisión
  buyer_name: string;
  level: number;
  rate: number;
  amount: number;
  status: CommissionStatus;
  created_at: string;
}

export interface CommissionLedger extends Page<CommissionEntry> {
  // Totales de todas las comisiones del usuario (no solo de la página)
  totals: Record<CommissionStatus, number>;
}

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pending: 'Por cobrar',
  paid: 'Pagada',
  reversed: 'Revertida',
};

export const COMMISSION_STATUS_STYLES: Record<CommissionStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  reversed: 'bg-slate-200 text-slate-600',
};

// Link de invitación que se comparte con un futuro referido (función pura)
export const inviteLink = (origin: string, referralCode: string): string =>
  `${origin}/register?ref=${encodeURIComponent(referralCode)}`;
