// GET privado con instantánea (Fase 8): igual que apiFetch, pero guarda la respuesta por
// usuario y, sin conexión, devuelve la última guardada. Solo para consultas de lectura
// que se quieren ver offline (nunca /api/login ni /api/me).
import { getSnapshotOwner, withSnapshot } from '../offline/snapshots';
import { markSnapshotFresh, markSnapshotUsed } from '../offline/snapshotStatus';
import { apiFetch } from './apiClient';

export const snapshotGet = async <T>(path: string): Promise<T> => {
  const owner = getSnapshotOwner();
  if (!owner) return apiFetch<T>(path);

  const { data, savedAt } = await withSnapshot(owner, path, () => apiFetch<T>(path));
  if (savedAt) markSnapshotUsed(path, savedAt);
  else markSnapshotFresh(path);
  return data;
};
