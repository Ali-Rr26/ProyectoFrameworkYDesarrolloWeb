// Motor de sincronización del outbox. Corre en la página (no en el SW) porque usa el JWT
// de la sesión, que vive en sessionStorage y el SW no puede leer.
// - FIFO por usuario, de uno en uno: un alta de producto se envía antes que su edición.
// - Solo envía los registros del usuario con sesión activa.
// - Un fallo transitorio detiene la cola (respeta el orden); un conflicto o un error de
//   datos marca ese registro y sigue con el siguiente (no bloquea a los demás).
import { apiFetch } from '../services/apiClient';
import { db, type OfflineDB, type OutboxEntry } from './db';
import { userOutbox } from './outbox';
import { classifySyncError } from './syncPolicy';

// Los registros enviados se conservan un día (para avisar y mostrar el resultado).
export const DONE_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface SyncReport {
  sent: OutboxEntry[];
  conflicts: OutboxEntry[];
  failed: OutboxEntry[];
  // Sesión vencida: la cola espera al próximo inicio de sesión.
  paused: boolean;
  // Próximo reintento programado de la cabeza de la cola.
  nextAttemptAt?: string;
}

export interface SyncOptions {
  database?: OfflineDB;
  send?: (entry: OutboxEntry) => Promise<unknown>;
  now?: () => number;
  random?: () => number;
}

const emptyReport = (): SyncReport => ({ sent: [], conflicts: [], failed: [], paused: false });

// Envío real: la misma petición de siempre más la Idempotency-Key del registro.
export const sendEntry = (entry: OutboxEntry): Promise<unknown> =>
  apiFetch(entry.path, { method: entry.method, body: entry.payload, headers: { 'Idempotency-Key': entry.id } });

export const runSync = async (userId: string, options: SyncOptions = {}): Promise<SyncReport> => {
  const { database = db, send = sendEntry, now = Date.now, random = Math.random } = options;
  const report = emptyReport();
  const iso = (ms: number) => new Date(ms).toISOString();

  // Limpieza de enviados viejos.
  const cutoff = iso(now() - DONE_RETENTION_MS);
  await database.outbox
    .where('userId')
    .equals(userId)
    .filter((e) => e.status === 'done' && (e.completedAt ?? e.createdAt) < cutoff)
    .delete();

  // 'syncing' sobrante = la página se cerró a mitad de un envío: se reintenta (es idempotente).
  const queue = (await userOutbox(userId, database)).filter((e) => e.status === 'pending' || e.status === 'syncing');

  for (const entry of queue) {
    if (entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > now()) {
      report.nextAttemptAt = entry.nextAttemptAt;
      break;
    }
    await database.outbox.update(entry.id, { status: 'syncing' });
    try {
      const result = await send(entry);
      const done: OutboxEntry = {
        ...entry,
        status: 'done',
        result,
        completedAt: iso(now()),
        lastError: undefined,
        nextAttemptAt: undefined,
      };
      await database.outbox.put(done);
      report.sent.push(done);
    } catch (err) {
      const attempts = entry.attempts + 1;
      const outcome = classifySyncError(err, attempts, random);
      if (outcome.kind === 'retry') {
        const nextAttemptAt = iso(now() + outcome.delayMs);
        await database.outbox.update(entry.id, { status: 'pending', attempts, lastError: outcome.message, nextAttemptAt });
        report.nextAttemptAt = nextAttemptAt;
        break;
      }
      if (outcome.kind === 'pause') {
        await database.outbox.update(entry.id, { status: 'pending', lastError: outcome.message });
        report.paused = true;
        break;
      }
      const marked: OutboxEntry = {
        ...entry,
        status: outcome.kind,
        attempts,
        lastError: outcome.message,
        details: outcome.details,
        nextAttemptAt: undefined,
      };
      await database.outbox.put(marked);
      (outcome.kind === 'conflict' ? report.conflicts : report.failed).push(marked);
    }
  }
  return report;
};

// Una sola sincronización a la vez: en esta pestaña (promesa compartida) y entre pestañas
// (Web Locks; si otra pestaña ya está enviando, esta no hace nada).
let running: Promise<SyncReport> | null = null;

export const syncOutbox = (userId: string, options: SyncOptions = {}): Promise<SyncReport> => {
  if (running) return running;
  const task = () => runSync(userId, options);
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  running = (
    locks
      ? locks.request('outbox-sync', { ifAvailable: true }, (lock) => (lock ? task() : emptyReport()))
      : task()
  ).finally(() => {
    running = null;
  });
  return running;
};
