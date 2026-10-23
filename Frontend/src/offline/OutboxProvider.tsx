// Proveedor de la sincronización del outbox. Dispara el motor:
// - al arrancar la app y al iniciar sesión (cambia el usuario),
// - al volver la conexión (evento `online`),
// - al guardar un pendiente nuevo (evento OUTBOX_CHANGED),
// - cuando el SW recibe Background Sync (mensaje SYNC_OUTBOX; solo Chromium),
// - al vencer el reintento programado de la cabeza de la cola,
// - con el botón "Sincronizar ahora" (syncNow).
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth, type Role } from '../context/auth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { draftOwner } from './drafts';
import { isOffline, OUTBOX_CHANGED, userOutbox } from './outbox';
import { SYNC_OUTBOX_MESSAGE } from './syncMessages';
import { OutboxContext } from './outboxContext';
import { syncOutbox, type SyncReport } from './syncEngine';
import { refreshCatalog } from './catalogStore';
import { loadPaymentMethods } from './paymentMethods';
import { prefetchPrivateViews } from './privatePrefetch';

// Precarga lo que se necesita sin conexión aunque el usuario nunca haya abierto esas vistas
// con red: lo del checkout (catálogo y métodos de pago) y la primera página de cada vista
// privada de su rol (pedidos, red, liquidaciones, productos, usuarios...). Fallos
// silenciosos: se reintenta al volver la conexión y cada vista vuelve a pedir sus datos.
const prefetchOfflineData = (role: Role) => {
  void refreshCatalog().catch(() => undefined);
  void loadPaymentMethods().catch(() => undefined);
  void prefetchPrivateViews(role);
};

const NO_ENTRIES: never[] = [];

export const OutboxProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  const owner = draftOwner(user?.email);

  const entries = useLiveQuery(
    async () => (isAuthenticated ? (await userOutbox(owner)).filter((e) => e.status !== 'done') : NO_ENTRIES),
    [owner, isAuthenticated],
  ) ?? NO_ENTRIES;

  const [syncing, setSyncing] = useState<boolean>(false);
  const online = useOnlineStatus();
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

  // Datos para usar la app sin conexión: al iniciar sesión y cada vez que vuelve la red.
  const role = user?.role;
  useEffect(() => {
    if (!isAuthenticated || !role) return;
    const prefetch = () => prefetchOfflineData(role);
    if (!isOffline()) prefetch();
    window.addEventListener('online', prefetch);
    return () => window.removeEventListener('online', prefetch);
  }, [isAuthenticated, owner, role]);

  // Conexión, pendientes nuevos y Background Sync.
  useEffect(() => {
    const onOnline = () => void syncNow();
    const onChanged = () => void syncNow();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === SYNC_OUTBOX_MESSAGE) void syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener(OUTBOX_CHANGED, onChanged);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('online', onOnline);
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
