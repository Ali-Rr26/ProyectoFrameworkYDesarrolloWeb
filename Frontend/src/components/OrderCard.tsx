// src/components/OrderCard.tsx
import { useEffect, useState } from 'react';
import {
  nextStatuses,
  orderNumber,
  STATUS_ACTIONS,
  STATUS_LABELS,
  STATUS_STYLES,
  type OrderDetail,
  type OrderStatus,
  type OrderSummary,
} from '../data/orders';
import { errorMessage } from '../services/apiClient';
import { getOrder } from '../services/orderService';
import { formatDateTime } from '../data/dates';
import { BUSINESS_TIMEZONE } from '../data/constants';

interface OrderCardProps {
  order: OrderSummary;
  // Panel del admin: muestra al comprador y las acciones de cambio de estado
  admin?: boolean;
  busy?: boolean;
  onChangeStatus?: (order: OrderSummary, status: OrderStatus) => void;
  // Cambio guardado sin conexión que aún no llegó al servidor (outbox)
  pendingChange?: string;
}

// Tarjeta de pedido: resumen siempre visible y detalle (ítems y envío) al expandir.
const OrderCard = ({ order, admin = false, busy = false, onChangeStatus, pendingChange }: OrderCardProps) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string>('');

  // El detalle se pide al expandir y se recarga si el estado cambió (p. ej. tras cancelar).
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    getOrder(order.id)
      .then((d) => active && setDetail(d))
      .catch((err) => active && setError(errorMessage(err, 'No se pudo cargar el pedido')));
    return () => {
      active = false;
    };
  }, [expanded, order.id, order.status]);

  const actions = admin ? nextStatuses(order.status) : [];

  return (
    <li className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full min-h-11 p-4 flex flex-col sm:flex-row sm:items-center gap-2 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800">
            Pedido <span className="font-mono">{orderNumber(order.id)}</span>
          </p>
          <p className="text-sm text-slate-500">
            {formatDateTime(order.created_at, BUSINESS_TIMEZONE)} · {order.items_count} unidad(es)
          </p>
          {admin && <p className="text-sm text-slate-500 break-all">{order.buyer_name} · {order.buyer_email}</p>}
          {pendingChange && (
            <p className="mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Pendiente de envío: {pendingChange}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLES[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
          <span className="font-bold text-[#20b2aa]">${order.total.toFixed(2)}</span>
          <span className="text-slate-400" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {!detail && !error && <p className="text-slate-500 text-sm">Cargando detalle...</p>}
          {detail && (
            <>
              <ul className="space-y-1 text-sm">
                {detail.items.map((item) => (
                  <li key={item.product_id} className="flex justify-between gap-3">
                    <span className="text-slate-600">{item.name} × {item.quantity}</span>
                    <span className="font-semibold">${(item.unit_price * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-slate-500">
                {detail.payment_method} · {detail.shipping_address}, {detail.city} · {detail.phone}
              </p>
            </>
          )}

          {actions.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              {actions.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy}
                  onClick={() => onChangeStatus?.(order, status)}
                  className={`min-h-11 px-4 rounded-lg font-semibold transition disabled:opacity-50 ${
                    status === 'cancelled'
                      ? 'border border-red-300 text-red-600 hover:bg-red-50'
                      : 'bg-[#20b2aa] text-white hover:bg-[#008080]'
                  }`}
                >
                  {busy ? 'Guardando...' : STATUS_ACTIONS[status]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
};

export default OrderCard;
