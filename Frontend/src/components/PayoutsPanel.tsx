// src/components/PayoutsPanel.tsx
import { useEffect, useState } from 'react';
import type { Page } from '../data/orders';
import type { Payout } from '../data/payouts';
import { ApiError } from '../services/apiClient';
import { getMyPayouts } from '../services/payoutService';
import Pagination from './Pagination';

const PAGE_SIZE = 5;

// Panel "Mis cobros": cada liquidación recibida (fecha, monto y comisiones que cubrió).
const PayoutsPanel = () => {
  const [page, setPage] = useState<number>(1);
  const [result, setResult] = useState<Page<Payout> | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let active = true;
    getMyPayouts(page, PAGE_SIZE)
      .then((r) => active && setResult(r))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus cobros'));
    return () => {
      active = false;
    };
  }, [page]);

  return (
    <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mt-8">
      <h2 className="text-lg font-bold text-slate-800 mb-4">Mis cobros</h2>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!result && !error && <p className="text-slate-500 text-sm">Cargando cobros...</p>}
      {result && result.data.length === 0 && (
        <p className="text-slate-500 text-sm">Aún no recibiste pagos. Tus comisiones por cobrar se liquidan periódicamente.</p>
      )}

      {result && result.data.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100">
            {result.data.map((p) => (
              <li key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">Pago #{p.id}</p>
                  <p className="text-sm text-slate-500">
                    {new Date(p.created_at).toLocaleString('es-EC')} · {p.commissions_count} comisión(es)
                  </p>
                </div>
                <span className="font-bold text-green-600">${p.total.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <Pagination page={result.page} limit={result.limit} total={result.total} onChange={setPage} />
        </>
      )}
    </section>
  );
};

export default PayoutsPanel;
