// Borradores de formularios en IndexedDB, separados por usuario.
// Nunca se guardan contraseñas: los formularios las excluyen (ver useDraft).
import { db, type OfflineDB } from './db';

// Dueño de los borradores de quien no inició sesión (p. ej. el registro).
export const ANONYMOUS_OWNER = 'anonymous';

export const draftOwner = (email?: string | null): string =>
  email ? email.trim().toLowerCase() : ANONYMOUS_OWNER;

export const omitKeys = <T extends Record<string, unknown>>(data: T, keys: readonly string[]): Partial<T> =>
  Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key))) as Partial<T>;

export const loadDraft = async <T extends Record<string, unknown>>(
  userId: string,
  formKey: string,
  database: OfflineDB = db,
): Promise<Partial<T> | undefined> => {
  const entry = await database.drafts.get([userId, formKey]);
  return entry?.data as Partial<T> | undefined;
};

export const saveDraft = async (
  userId: string,
  formKey: string,
  data: Record<string, unknown>,
  database: OfflineDB = db,
): Promise<void> => {
  await database.drafts.put({ userId, formKey, data, updatedAt: new Date().toISOString() });
};

export const clearDraft = (userId: string, formKey: string, database: OfflineDB = db): Promise<void> =>
  database.drafts.delete([userId, formKey]);
