// Datos locales por usuario: pendientes de envío, limpieza al cerrar sesión y
// almacenamiento persistente.
import { db, type OfflineDB } from './db';

// Registros del usuario que todavía no llegaron al servidor (todo lo que no esté en `done`).
export const countPending = (userId: string, database: OfflineDB = db): Promise<number> =>
  database.outbox.where('userId').equals(userId).filter((entry) => entry.status !== 'done').count();

// Cierre de sesión manual: borra borradores y pendientes del usuario. El catálogo es
// público y se conserva. (El cierre automático por token vencido NO llama a esto:
// los pendientes se envían cuando el mismo usuario vuelve a iniciar sesión.)
export const clearUserData = (userId: string, database: OfflineDB = db): Promise<void> =>
  database.transaction('rw', database.drafts, database.outbox, async () => {
    await database.drafts.where('userId').equals(userId).delete();
    await database.outbox.where('userId').equals(userId).delete();
  });

// Pide al navegador no borrar IndexedDB por falta de espacio. El navegador puede negarlo
// (p. ej. sin app instalada); no es un error.
export const requestPersistentStorage = async (): Promise<boolean> => {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};
