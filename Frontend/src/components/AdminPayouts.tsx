// src/components/AdminPayouts.tsx
import { useCallback, useEffect, useState } from 'react';
import type { Page } from '../data/orders';
import type { Payout, PendingDebt } from '../data/payouts';
import { errorMessage } from '../services/apiClient';
import { useOutbox } from '../offline/outboxContext';
import { createPayout, getPayouts, getPendingDebts } from '../services/payoutService';
import Pagination from './Pagination';
import { formatDateTime } from '../data/dates';
import { BUSINESS_TIMEZONE } from '../data/constants';
import { ADMIN_PAYOUTS_PAGE_SIZE as PAGE_SIZE } from '../services/pageSizes';

// /admin/payouts: deuda por distribuidor con botón para liquidar e historial de pagos.
const AdminPayouts = () => {
  const [debts, setDebts] = useState<PendingDebt[] | null>(null);
  const [history, setHistory] = useState<Page<Payout> | null>(null);
  const [page, setPage] = useState<number>(1);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  // Liquidar mueve dinero: solo con conexión (D8).
  const { online } = useOutbox();
  // Distribuidor que se está liquidando
  const [payingId, setPayingId] = useState<number | null>(null);

  const loadDebts = useCallback(() => {
    getPendingDebts()
      .then(setDebts)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar la deuda')));
  }, []);

  const loadHistory = useCallback(() => {
    getPayouts(page, PAGE_SIZE)
      .then(setHistory)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el historial')));
  }, [page]);

  useEffect(loadDebts, [loadDebts]);
  useEffect(loadHistory, [loadHistory]);

  const pay = async (debt: PendingDebt) => {
    const message = `¿Liquidar $${debt.ready_total.toFixed(2)} a ${debt.name}?\n` +
      `Se marcarán como pagadas sus ${debt.ready_count} comisión(es) de pedidos entregados.`;
    if (!window.confirm(message)) return;
    setPayingId(debt.beneficiary_id);
    setError('');
    setNotice('');
    try {
      const payout = await createPayout(debt.beneficiary_id);
      setNotice(`Pago #${payout.id} registrado: $${payout.total.toFixed(2)} a ${payout.beneficiary_name}.`);
      loadDebts();
      if (page === 1) loadHistory();
      else setPage(1);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo registrar el pago'));
      loadDebts(); // la deuda pudo cambiar (p. ej. otro admin ya la liquidó)
    } finally {
      setPayingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Liquidaciones</h1>
      <p className="text-slate-500 mb-6">
        Paga a cada distribuidor sus comisiones pendientes y consulta el historial de pagos. Solo se liquidan
        las comisiones de pedidos entregados; las de pedidos en curso quedan en espera hasta la entrega.
      </p>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200">{error}</div>}
      {notice && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-6 border border-green-200">{notice}</div>}

      {/* ===== DEUDA POR DISTRIBUIDOR ===== */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-slate-800 mb-3">Deuda por distribuidor</h2>
        {!debts && <p className="text-slate-500 text-sm">Cargando deuda...</p>}
        {debts && debts.length === 0 && (
          <p className="bg-white p-6 rounded-lg border border-slate-200 text-slate-500">No hay comisiones pendientes de pago.</p>
        )}
        {debts && debts.length > 0 && (
          <ul className="space-y-3">
            {debts.map((debt) => (
              <li key={debt.beneficiary_id}
                className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{debt.name}</p>
                  <p className="text-sm text-slate-500 break-all">{debt.email}</p>
                  {debt.waiting_count > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      En espera de entrega: ${debt.waiting_total.toFixed(2)} ({debt.waiting_count} comisión(es))
                    </p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-slate-500">Listo para liquidar · {debt.ready_count} comisión(es)</p>
                  <p className={`text-xl font-bold ${debt.ready_count > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                    ${debt.ready_total.toFixed(2)}
                  </p>
                </div>
                <button type="button" disabled={payingId !== null || debt.ready_count === 0 || !online} onClick={() => pay(debt)}
                  title={!online ? 'Requiere conexión: esta operación no se puede guardar sin conexión' : debt.ready_count === 0 ? 'Sus comisiones esperan la entrega de los pedidos' : undefined}
                  className="min-h-11 px-6 bg-[#20b2aa] text-white font-semibold rounded-lg hover:bg-[#008080] transition disabled:opacity-50">
                  {payingId === debt.beneficiary_id ? 'Liquidando...' : 'Liquidar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== HISTORIAL DE PAGOS ===== */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-3">Historial de pagos</h2>
        {!history && <p className="text-slate-500 text-sm">Cargando historial...</p>}
        {history && history.data.length === 0 && <p className="text-slate-500 text-sm">Todavía no se registraron pagos.</p>}
        {history && history.data.length > 0 && (
          <>
            <ul className="bg-white rounded-lg border border-slate-200 shadow-sm divide-y divide-slate-100">
              {history.data.map((p) => (
                <li key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">Pago #{p.id} · {p.beneficiary_name}</p>
                    <p className="text-sm text-slate-500">
                      {formatDateTime(p.created_at, BUSINESS_TIMEZONE)} · {p.commissions_count} comisión(es)
                    </p>
                  </div>
                  <span className="font-bold text-green-600">${p.total.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <Pagination page={history.page} limit={history.limit} total={history.total} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
};

export default AdminPayouts;
