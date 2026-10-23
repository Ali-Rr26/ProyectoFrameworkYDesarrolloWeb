// src/components/PendingSync.tsx
// /pending: operaciones guardadas sin conexión que aún no llegaron al servidor, con su
// estado y las acciones para resolver las que el servidor rechazó (Fase 7).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { useCart } from '../context/cart';
import { STATUS_LABELS, type OrderStatus } from '../data/orders';
import { recoverCart } from '../offline/cartRecovery';
import { canApplyStatus, type OrderLine } from '../offline/conflicts';
import type { OutboxEntry, OutboxStatus } from '../offline/db';
import { draftOwner, saveDraft } from '../offline/drafts';
import { useOutbox } from '../offline/outboxContext';
import { discardEntry, requeueEntry } from '../offline/resolve';
import type { CreateOrderPayload, OrderStatusPayload } from '../services/orderService';
import ProductConflictPanel from './ProductConflictPanel';

const STATUS_BADGES: Record<OutboxStatus, { text: string; style: string }> = {
  pending: { text: 'En cola', style: 'bg-sky-100 text-sky-700' },
  syncing: { text: 'Enviando', style: 'bg-cyan-100 text-cyan-700' },
  conflict: { text: 'Conflicto', style: 'bg-amber-100 text-amber-800' },
  failed: { text: 'Rechazado', style: 'bg-red-100 text-red-700' },
  done: { text: 'Enviado', style: 'bg-green-100 text-green-700' },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });

const buttonPrimary =
  'min-h-11 px-4 bg-[#20b2aa] text-white text-sm font-semibold rounded-lg hover:bg-[#008080] transition disabled:opacity-50';
const buttonSecondary =
  'min-h-11 px-4 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition disabled:opacity-50';

// Detalle legible del 409 de un pedido: total cambiado o producto sin stock.
const checkoutDetail = (details: unknown): string => {
  if (typeof details === 'string') return details;
  const totals = details as { expected_total?: number; total?: number } | undefined;
  if (totals?.total !== undefined && totals.expected_total !== undefined) {
    return `Total guardado $${totals.expected_total.toFixed(2)} → total vigente $${totals.total.toFixed(2)}`;
  }
  return '';
};

const PendingCard = ({ entry }: { entry: OutboxEntry }) => {
  const { user } = useAuth();
  const { replaceCart } = useCart();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const badge = STATUS_BADGES[entry.status];
  const rejected = entry.status === 'conflict' || entry.status === 'failed';

  const discard = () => {
    if (window.confirm(`¿Descartar "${entry.label}"? No se enviará al servidor.`)) void discardEntry(entry.id);
  };

  // Pedido rechazado (precio, stock, producto dado de baja): vuelve al carrito con los
  // datos vigentes y al checkout con los datos de envío, para revisarlo y confirmar.
  const reviewOrder = async () => {
    setBusy(true);
    const order = entry.payload as CreateOrderPayload;
    const { items, notes } = await recoverCart(order.items as OrderLine[]);
    replaceCart(items);
    await saveDraft(draftOwner(user?.email), 'checkout', {
      address: order.shipping_address,
      city: order.city,
      phone: order.phone,
      paymentMethod: order.payment_method,
    }).catch(() => undefined);
    await discardEntry(entry.id);
    navigate(items.length ? '/checkout' : '/cart', {
      state: { notice: ['Revisa el pedido con los precios y el stock vigentes', ...notes].join('. ') },
    });
  };

  const statusChange = entry.type === 'order:status' ? (entry.payload as OrderStatusPayload) : null;
  const currentStatus = (entry.details as { status?: OrderStatus } | undefined)?.status;

  return (
    <li className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 break-words">{entry.label}</p>
          <p className="text-xs text-slate-500">
            Guardado el {formatDate(entry.createdAt)}
            {entry.attempts > 0 && ` · ${entry.attempts} ${entry.attempts === 1 ? 'intento' : 'intentos'}`}
            {entry.status === 'pending' && entry.nextAttemptAt && ` · próximo intento ${formatDate(entry.nextAttemptAt)}`}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badge.style}`}>{badge.text}</span>
      </div>

      {entry.lastError && (
        <p className={`text-sm mt-2 ${rejected ? 'text-red-700' : 'text-slate-600'}`}>
          {entry.lastError}
          {entry.type === 'checkout' && rejected && checkoutDetail(entry.details) && ` (${checkoutDetail(entry.details)})`}
        </p>
      )}

      {entry.type === 'product:update' && entry.status === 'conflict' && entry.details ? (
        <ProductConflictPanel entry={entry} />
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          {entry.type === 'checkout' && rejected && (
            <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void reviewOrder()}>
              Revisar en el carrito
            </button>
          )}
          {statusChange && entry.status === 'conflict' && currentStatus && (
            <>
              <p className="text-sm text-slate-600 sm:self-center">
                El pedido ya está "{STATUS_LABELS[currentStatus]}".
              </p>
              {canApplyStatus(currentStatus, statusChange.status) && (
                <button type="button" className={buttonPrimary}
                  onClick={() => void requeueEntry(entry.id, { payload: { ...statusChange, from_status: currentStatus } })}>
                  Aplicar de todos modos
                </button>
              )}
            </>
          )}
          {entry.status === 'failed' && entry.type !== 'checkout' && (
            <button type="button" className={buttonPrimary} onClick={() => void requeueEntry(entry.id)}>
              Reintentar
            </button>
          )}
          {entry.status !== 'syncing' && (
            <button type="button" className={buttonSecondary} disabled={busy} onClick={discard}>
              Descartar
            </button>
          )}
        </div>
      )}
    </li>
  );
};

const PendingSync = () => {
  const { entries, queued, online, syncing, syncNow } = useOutbox();

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pendientes de envío</h1>
          <p className="text-slate-500">
            Operaciones guardadas en este dispositivo sin conexión. Se envían solas al volver la conexión;
            las rechazadas por el servidor esperan tu revisión.
          </p>
        </div>
        {queued > 0 && (
          <button type="button" className={buttonPrimary} disabled={!online || syncing} onClick={() => void syncNow()}>
            {syncing ? 'Enviando...' : online ? 'Sincronizar ahora' : 'Sin conexión'}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="bg-white p-10 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-600 mb-4">No tienes operaciones pendientes de envío.</p>
          <Link to="/store" className="text-[#008080] font-semibold hover:underline">← Volver a la tienda</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <PendingCard key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default PendingSync;
