// src/components/SyncIndicator.tsx
// Estado del outbox en la barra superior: botón "Sincronizar ahora" con el número de
// pendientes, aviso de los que requieren revisión y confirmación breve de lo enviado.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { orderNumber } from '../data/orders';
import type { OutboxEntry } from '../offline/db';
import { useOutbox } from '../offline/outboxContext';
import type { SyncReport } from '../offline/syncEngine';
import { ICON_SIZES } from '../constants/ui';

const SENT_MESSAGE_MS = 6000;

// "Pedido MC-000010 enviado" para un checkout; la etiqueta del registro para el resto.
const sentText = (entry: OutboxEntry): string => {
  const id = (entry.result as { id?: unknown } | undefined)?.id;
  return entry.type === 'checkout' && typeof id === 'number' ? `Pedido ${orderNumber(id)} enviado` : `${entry.label}: enviado`;
};

const SyncIndicator = () => {
  const { queued, needsAttention, syncing, online, lastReport, syncNow } = useOutbox();
  // Último reporte cuya confirmación ya se ocultó.
  const [dismissed, setDismissed] = useState<SyncReport | null>(null);

  const sent = lastReport && lastReport !== dismissed ? lastReport.sent : [];
  useEffect(() => {
    if (!lastReport || lastReport.sent.length === 0) return;
    const timer = setTimeout(() => setDismissed(lastReport), SENT_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [lastReport]);

  if (queued === 0 && needsAttention === 0 && sent.length === 0) return null;

  const title = !online
    ? 'Sin conexión: los pendientes se enviarán al volver la conexión'
    : syncing
      ? 'Enviando pendientes...'
      : lastReport?.paused
        ? 'Sesión vencida: inicia sesión para enviar los pendientes'
        : 'Enviar ahora los pendientes guardados';

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      {sent.length > 0 && (
        <span className="hidden md:inline text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-1">
          ✓ {sent.length === 1 ? sentText(sent[0]) : `${sent.length} pendientes enviados`}
        </span>
      )}

      {needsAttention > 0 && (
        <span
          className="text-xs font-semibold text-amber-800 bg-amber-100 rounded-full px-2 py-1"
          title="Pendientes rechazados por el servidor (precio, stock o datos cambiaron): requieren revisión"
        >
          {needsAttention} por revisar
        </span>
      )}

      {queued > 0 && (
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={!online || syncing}
          title={title}
          aria-label={`${title} (${queued} pendientes)`}
          className="min-h-11 flex items-center gap-1.5 px-3 rounded-lg border border-[#20b2aa] text-[#008080] text-sm font-semibold hover:bg-teal-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={ICON_SIZES.SIDEBAR} className={syncing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Sincronizar</span>
          <span className="bg-[#20b2aa] text-white text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
            {queued}
          </span>
        </button>
      )}
    </div>
  );
};

export default SyncIndicator;
