// src/components/CommissionsPanel.tsx
import { useEffect, useState } from 'react';
import {
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_STYLES,
  type CommissionLedger,
  type CommissionStatus,
} from '../data/commissions';
import { orderNumber } from '../data/orders';
import { ApiError } from '../services/apiClient';
import { getMyCommissions } from '../services/commissionService';
import Pagination from './Pagination';
import { formatDate } from '../data/dates';
import { BUSINESS_TIMEZONE } from '../data/constants';

const PAGE_SIZE = 10;
const TOTAL_ORDER: CommissionStatus[] = ['pending', 'paid', 'reversed'];

// Panel "Mis comisiones": totales por estado y detalle del ledger, paginado.
const CommissionsPanel = () => {
  const [page, setPage] = useState<number>(1);
  const [ledger, setLedger] = useState<CommissionLedger | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let active = true;
    getMyCommissions(page, PAGE_SIZE)
      .then((l) => active && setLedger(l))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus comisiones'));
    return () => {
      active = false;
    };
  }, [page]);

  return (
    <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mt-8">
      <h2 className="text-lg font-bold text-slate-800 mb-4">Mis comisiones</h2>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!ledger && !error && <p className="text-slate-500 text-sm">Cargando comisiones...</p>}

      {ledger && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {TOTAL_ORDER.map((status) => (
              <div key={status} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs text-slate-500 uppercase font-semibold">{COMMISSION_STATUS_LABELS[status]}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">${ledger.totals[status].toFixed(2)}</p>
              </div>
            ))}
          </div>

          {ledger.data.length === 0 ? (
            <p className="text-slate-500 text-sm">Aún no tienes comisiones. Invita a tu red: cada compra de tus referidos suma aquí.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {ledger.data.map((c) => (
                  <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800">
                        {c.buyer_name} · Nivel {c.level} ({(c.rate * 100).toFixed(0)} %)
                      </p>
                      <p className="text-sm text-slate-500">
                        Pedido <span className="font-mono">{orderNumber(c.order_id)}</span> ·{' '}
                        {formatDate(c.created_at, BUSINESS_TIMEZONE)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${COMMISSION_STATUS_STYLES[c.status]}`}>
                        {COMMISSION_STATUS_LABELS[c.status]}
                      </span>
                      <span className={`font-bold ${c.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-600'}`}>
                        ${c.amount.toFixed(2)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={ledger.page} limit={ledger.limit} total={ledger.total} onChange={setPage} />
            </>
          )}
        </>
      )}
    </section>
  );
};

export default CommissionsPanel;
