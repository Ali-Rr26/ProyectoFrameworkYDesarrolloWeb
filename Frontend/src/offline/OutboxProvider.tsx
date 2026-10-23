// Proveedor de la sincronización del outbox. Dispara el motor:
// - al arrancar la app y al iniciar sesión (cambia el usuario),
// - al volver la conexión (evento `online`),
// - al guardar un pendiente nuevo (evento OUTBOX_CHANGED),
// - cuando el SW recibe Background Sync (mensaje SYNC_OUTBOX; solo Chromium),
// - al vencer el reintento programado de la cabeza de la cola,
// - con el botón "Sincronizar ahora" (syncNow).
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../context/auth';
import { draftOwner } from './drafts';
import { isOffline, OUTBOX_CHANGED, userOutbox } from './outbox';
import { SYNC_OUTBOX_MESSAGE } from './syncMessages';
import { OutboxContext } from './outboxContext';
import { syncOutbox, type SyncReport } from './syncEngine';

const NO_ENTRIES: never[] = [];

export const OutboxProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  const owner = draftOwner(user?.email);

  const entries = useLiveQuery(
    async () => (isAuthenticated ? (await userOutbox(owner)).filter((e) => e.status !== 'done') : NO_ENTRIES),
    [owner, isAuthenticated],
  ) ?? NO_ENTRIES;

  const [syncing, setSyncing] = useState<boolean>(false);
  const [online, setOnline] = useState<boolean>(() => !isOffline());
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);

  const syncNow = useCallback(async () => {
    if (!isAuthenticated || isOffline()) return;
    setSyncing(true);
    try {
      setLastReport(await syncOutbox(owner));
    } catch {
      // IndexedDB no disponible: no hay nada que enviar desde aquí.
    } finally {
      setSyncing(false);
    }
  }, [isAuthenticated, owner]);

  // Arranque / inicio de sesión. Se difiere a una microtarea: el efecto no cambia estado
  // de forma síncrona.
  useEffect(() => {
    void Promise.resolve().then(syncNow);
  }, [syncNow]);

  // Conexión, pendientes nuevos y Background Sync.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const onOffline = () => setOnline(false);
    const onChanged = () => void syncNow();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === SYNC_OUTBOX_MESSAGE) void syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(OUTBOX_CHANGED, onChanged);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(OUTBOX_CHANGED, onChanged);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [syncNow]);

  // Reintento programado (backoff) mientras la app está abierta.
  const nextAttemptAt = lastReport?.nextAttemptAt;
  useEffect(() => {
    if (!nextAttemptAt) return;
    const timer = setTimeout(() => void syncNow(), Math.max(0, Date.parse(nextAttemptAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [nextAttemptAt, syncNow]);

  const value = useMemo(() => {
    const queued = entries.filter((e) => e.status === 'pending' || e.status === 'syncing').length;
    return {
      entries,
      queued,
      needsAttention: entries.length - queued,
      syncing,
      online,
      lastReport,
      syncNow,
    };
  }, [entries, syncing, online, lastReport, syncNow]);

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
};
