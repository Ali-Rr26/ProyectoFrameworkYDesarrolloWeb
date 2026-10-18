// src/components/MyOrders.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { OrderSummary, Page } from '../data/orders';
import { ApiError } from '../services/apiClient';
import { getMyOrders } from '../services/orderService';
import OrderCard from './OrderCard';
import Pagination from './Pagination';

const PAGE_SIZE = 10;

// /my-orders: historial de compras del usuario autenticado (cualquier rol).
const MyOrders = () => {
  const [page, setPage] = useState<number>(1);
  const [result, setResult] = useState<Page<OrderSummary> | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let active = true;
    getMyOrders(page, PAGE_SIZE)
      .then((r) => active && setResult(r))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus pedidos'));
    return () => {
      active = false;
    };
  }, [page]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Mis pedidos</h1>
      <p className="text-slate-500 mb-6">Consulta el estado y el detalle de tus compras.</p>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200">{error}</div>}
      {!result && !error && <p className="text-slate-500">Cargando pedidos...</p>}

      {result && result.data.length === 0 && (
        <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500 mb-4">Todavía no tienes pedidos.</p>
          <Link to="/catalog" className="inline-flex items-center min-h-11 px-6 bg-[#20b2aa] text-white font-semibold rounded-lg hover:bg-[#008080] transition">
            Ver Catálogo
          </Link>
        </div>
      )}

      {result && result.data.length > 0 && (
        <>
          <ul className="space-y-3">
            {result.data.map((order) => <OrderCard key={order.id} order={order} />)}
          </ul>
          <Pagination page={result.page} limit={result.limit} total={result.total} onChange={setPage} />
        </>
      )}
    </div>
  );
};

export default MyOrders;
