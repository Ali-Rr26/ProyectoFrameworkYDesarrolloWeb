// Liquidación: pago a un distribuidor de todas sus comisiones pendientes
export interface Payout {
  id: number;
  beneficiary_id: number;
  beneficiary_name: string;
  beneficiary_email: string;
  total: number;
  commissions_count: number;
  created_at: string;
}

// Deuda de un distribuidor: sus comisiones aún por liquidar. Regla de negocio: solo se
// liquidan comisiones de pedidos entregados; las de pedidos en curso esperan la entrega.
export interface PendingDebt {
  beneficiary_id: number;
  name: string;
  email: string;
  // Comisiones de pedidos entregados: listas para liquidar
  ready_total: number;
  ready_count: number;
  // Comisiones de pedidos aún sin entregar: en espera
  waiting_total: number;
  waiting_count: number;
}
