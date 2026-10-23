// Outbox: escrituras guardadas sin conexión, por usuario, para enviarlas al volver la red.
// El id de cada registro es su Idempotency-Key: reenviarlo nunca duplica la operación.
import { NetworkError } from '../services/apiClient';
import { db, type OfflineDB, type OutboxEntry, type OutboxType } from './db';
import { OUTBOX_SYNC_TAG } from './syncMessages';

// Evento de ventana que avisa que el outbox cambió (el proveedor de sincronización lo escucha).
export const OUTBOX_CHANGED = 'outbox:changed';

export interface OutboxInput {
  // Si se omite se genera uno nuevo. Se pasa cuando la petición ya salió con esa clave
  // (falló por red a mitad de camino): reenviarla con la misma clave es seguro.
  id?: string;
  userId: string;
  type: OutboxType;
  method: OutboxEntry['method'];
  path: string;
  payload: unknown;
  baseVersion?: number;
  label: string;
}

export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

// Background Sync (solo Chromium): el SW avisará a las pestañas cuando vuelva la red.
// En los demás navegadores no hace nada: la página sincroniza al arrancar y en `online`.
const requestBackgroundSync = async (): Promise<void> => {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await registration.sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    // Sin permiso o sin soporte: queda la sincronización desde la página.
  }
};

export const notifyOutboxChanged = (): void => {
  if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event(OUTBOX_CHANGED));
};

export const enqueue = async (input: OutboxInput, database: OfflineDB = db): Promise<OutboxEntry> => {
  const entry: OutboxEntry = {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  await database.outbox.add(entry);
  notifyOutboxChanged();
  void requestBackgroundSync();
  return entry;
};

export type SendOrQueueResult<T> = { status: 'sent'; result: T } | { status: 'queued'; entry: OutboxEntry };

// Envía con Idempotency-Key si hay red; sin red (o si la red cae a mitad de la petición)
// guarda la operación en el outbox con esa misma clave. Los errores del servidor
// (ApiError: 409, 422...) se propagan: con red el usuario los resuelve en el momento.
export const sendOrQueue = async <T>(
  input: Omit<OutboxInput, 'id'>,
  send: (idempotencyKey: string) => Promise<T>,
  database: OfflineDB = db,
): Promise<SendOrQueueResult<T>> => {
  const id = crypto.randomUUID();
  if (isOffline()) return { status: 'queued', entry: await enqueue({ ...input, id }, database) };
  try {
    return { status: 'sent', result: await send(id) };
  } catch (err) {
    if (err instanceof NetworkError) return { status: 'queued', entry: await enqueue({ ...input, id }, database) };
    throw err;
  }
};

// Registros del usuario en orden de creación (FIFO).
export const userOutbox = (userId: string, database: OfflineDB = db): Promise<OutboxEntry[]> =>
  database.outbox.where('userId').equals(userId).sortBy('createdAt');
