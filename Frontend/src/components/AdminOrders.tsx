// src/components/AdminOrders.tsx
import { useEffect, useState } from 'react';
import {
  ORDER_STATUSES,
  orderNumber,
  STATUS_ACTIONS,
  STATUS_LABELS,
  type OrderStatus,
  type OrderSummary,
  type Page,
} from '../data/orders';
import { useAuth } from '../context/auth';
import { draftOwner } from '../offline/drafts';
import { sendOrQueue } from '../offline/outbox';
import { useOutbox } from '../offline/outboxContext';
import { ApiError, errorMessage } from '../services/apiClient';
import { getOrders, updateOrderStatus, type OrderStatusPayload } from '../services/orderService';
import OrderCard from './OrderCard';
import Pagination from './Pagination';

const PAGE_SIZE = 10;

// /admin/orders: todos los pedidos con filtro por estado y gestión de su ciclo de vida.
const AdminOrders = () => {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState<number>(1);
  const [result, setResult] = useState<Page<OrderSummary> | null>(null);
  const [error, setError] = useState<string>('');
  // Aviso de un cambio guardado sin conexión (se enviará al volver la red)
  const [notice, setNotice] = useState<string>('');
  const { user } = useAuth();
  // Cambios de estado guardados sin conexión, por ruta del pedido.
  const { entries } = useOutbox();
  const pendingByPath = new Map(entries.filter((e) => e.type === 'order:status').map((e) => [e.path, e.label]));
  // ID del pedido que se está actualizando
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getOrders(page, PAGE_SIZE, status)
      .then((r) => active && setResult(r))
      .catch((err) => active && setError(errorMessage(err, 'No se pudieron cargar los pedidos')));
    return () => {
      active = false;
    };
  }, [page, status]);

  const changeStatus = async (order: OrderSummary, next: OrderStatus) => {
    const warning = next === 'cancelled' ? '\nSe repondrá el stock y se revertirán sus comisiones.' : '';
    if (!window.confirm(`¿${STATUS_ACTIONS[next]} ${orderNumber(order.id)}?${warning}`)) return;
    setSavingId(order.id);
    setError('');
    setNotice('');
    // from_status: si otro admin cambió el pedido mientras tanto, el servidor responde 409.
    const change: OrderStatusPayload = { status: next, from_status: order.status };
    try {
      const outcome = await sendOrQueue(
        {
          userId: draftOwner(user?.email),
          type: 'order:status',
          method: 'PATCH',
          path: `/api/orders/${order.id}/status`,
          payload: change,
          label: `${STATUS_ACTIONS[next]} ${orderNumber(order.id)}`,
        },
        (key) => updateOrderStatus(order.id, change, key),
      );
      if (outcome.status === 'queued') {
        setNotice(`Sin conexión: "${STATUS_ACTIONS[next]} ${orderNumber(order.id)}" se guardó y se enviará al volver la conexión.`);
        return;
      }
      const updated = outcome.result;
      setResult((prev) => prev && {
        ...prev,
        data: prev.data.map((o) => (o.id === updated.id ? { ...o, status: updated.status } : o)),
      });
    } catch (err) {
      // Otro admin lo cambió mientras tanto (409 con el estado vigente): se muestra el
      // estado actual en la fila y el admin decide de nuevo con los botones vigentes.
      const current = err instanceof ApiError && err.status === 409
        ? (err.details as { status?: OrderStatus } | undefined)?.status
        : undefined;
      if (current) {
        setResult((prev) => prev && {
          ...prev,
          data: prev.data.map((o) => (o.id === order.id ? { ...o, status: current } : o)),
        });
        setError(`${errorMessage(err, '')}: ${orderNumber(order.id)} ya está "${STATUS_LABELS[current]}".`);
        return;
      }
      setError(errorMessage(err, 'No se pudo actualizar el pedido'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Pedidos</h1>
      <p className="text-slate-500 mb-6">Gestiona el ciclo de vida de los pedidos de todos los clientes.</p>

      <div className="mb-6 max-w-xs">
        <label htmlFor="status-filter" className="block text-sm font-medium text-slate-700 mb-1">Filtrar por estado</label>
        <select
          id="status-filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrderStatus | '');
            setPage(1);
          }}
          className="w-full min-h-11 px-3 rounded-lg border border-slate-300 bg-white"
        >
          <option value="">Todos</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200">{error}</div>}
      {notice && <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm mb-6 border border-amber-200">{notice}</div>}
      {!result && !error && <p className="text-slate-500">Cargando pedidos...</p>}
      {result && result.data.length === 0 && <p className="text-slate-500">No hay pedidos con ese estado.</p>}

      {result && result.data.length > 0 && (
        <>
          <ul className="space-y-3">
            {result.data.map((order) => (
              <OrderCard key={order.id} order={order} admin busy={savingId === order.id} onChangeStatus={changeStatus}
                pendingChange={pendingByPath.get(`/api/orders/${order.id}/status`)} />
            ))}
          </ul>
          <Pagination page={result.page} limit={result.limit} total={result.total} onChange={setPage} />
        </>
      )}
    </div>
  );
};

export default AdminOrders;
