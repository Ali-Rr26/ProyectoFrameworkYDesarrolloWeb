// Instantáneas de solo lectura de datos privados (Fase 8): la última respuesta vista con
// red de cada consulta (pedidos, red, comisiones, reportes, listados admin), por usuario.
// Sin conexión se muestra esa copia con su fecha; nunca se usa ante 401/403.
import { ApiError, NetworkError } from '../services/apiClient';
import { db, type OfflineDB } from './db';

// Caducidad y tope por usuario: los datos privados no se acumulan indefinidamente.
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SNAPSHOT_MAX_ENTRIES = 200;

export const OFFLINE_NO_DATA_MESSAGE =
  'Requiere conexión: estos datos todavía no se guardaron en este dispositivo';

export interface SnapshotResult<T> {
  data: T;
  // Presente cuando los datos vienen de la instantánea (sin conexión).
  savedAt?: string;
}

export interface SnapshotOptions {
  database?: OfflineDB;
  now?: () => number;
}

const deleteUserSnapshots = (userId: string, database: OfflineDB) =>
  database.snapshots.where('userId').equals(userId).delete();

// Guarda la respuesta y recorta las más viejas si el usuario supera el tope.
const saveSnapshot = async (userId: string, key: string, data: unknown, database: OfflineDB, now: number) => {
  await database.snapshots.put({ userId, key, data, savedAt: new Date(now).toISOString() });
  const all = await database.snapshots.where('userId').equals(userId).sortBy('savedAt');
  const excess = all.length - SNAPSHOT_MAX_ENTRIES;
  if (excess > 0) {
    await database.snapshots.bulkDelete(all.slice(0, excess).map((s) => [s.userId, s.key] as [string, string]));
  }
};

// Red primero (y guarda); sin red, la instantánea vigente. Sin instantánea (o vencida)
// propaga un NetworkError con OFFLINE_NO_DATA_MESSAGE para que la vista diga "Requiere
// conexión". Un 401 (sesión inválida) borra las instantáneas del usuario.
export const withSnapshot = async <T>(
  userId: string,
  key: string,
  fetcher: () => Promise<T>,
  { database = db, now = Date.now }: SnapshotOptions = {},
): Promise<SnapshotResult<T>> => {
  try {
    const data = await fetcher();
    await saveSnapshot(userId, key, data, database, now()).catch(() => undefined);
    return { data };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) await deleteUserSnapshots(userId, database).catch(() => undefined);
      throw err;
    }
    if (!(err instanceof NetworkError)) throw err;

    const snapshot = await database.snapshots.get([userId, key]).catch(() => undefined);
    if (snapshot && now() - Date.parse(snapshot.savedAt) <= SNAPSHOT_MAX_AGE_MS) {
      return { data: snapshot.data as T, savedAt: snapshot.savedAt };
    }
    if (snapshot) await database.snapshots.delete([userId, key]).catch(() => undefined);
    throw new NetworkError(OFFLINE_NO_DATA_MESSAGE);
  }
};

// Dueño de las instantáneas: lo fija AuthContext al iniciar/cerrar sesión (igual que el
// token en apiClient), así los servicios no reciben el usuario por parámetro.
let snapshotOwner: string | null = null;

export const setSnapshotOwner = (owner: string | null): void => {
  snapshotOwner = owner;
};

export const getSnapshotOwner = (): string | null => snapshotOwner;
