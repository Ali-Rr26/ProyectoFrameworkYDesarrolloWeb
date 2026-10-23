// Acciones sobre registros del outbox desde la vista de pendientes (Fase 7).
// Reutilizar el id (Idempotency-Key) al reenviar es seguro: un 409/422 hace ROLLBACK
// en el servidor y la clave no queda registrada.
import { db, type OfflineDB, type OutboxEntry } from './db';
import { notifyOutboxChanged } from './outbox';

// Vuelve a poner el registro en la cola (opcionalmente con otro cuerpo) y dispara el envío.
export const requeueEntry = async (
  id: string,
  changes: Pick<Partial<OutboxEntry>, 'payload' | 'baseVersion' | 'base' | 'label'> = {},
  database: OfflineDB = db,
): Promise<void> => {
  const entry = await database.outbox.get(id);
  if (!entry) return;
  await database.outbox.put({
    ...entry,
    ...changes,
    status: 'pending',
    attempts: 0,
    lastError: undefined,
    details: undefined,
    nextAttemptAt: undefined,
  });
  notifyOutboxChanged();
};

// Descarta el registro: la operación no se enviará.
export const discardEntry = async (id: string, database: OfflineDB = db): Promise<void> => {
  await database.outbox.delete(id);
};
