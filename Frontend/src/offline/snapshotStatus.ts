// Qué consultas de la pantalla actual se están mostrando desde una instantánea (sin
// conexión). Lo lee OfflineDataBanner (en Layout) con useSyncExternalStore: así las vistas
// no necesitan cambiar para avisar "datos guardados el {fecha}".

export interface SnapshotUsage {
  key: string;
  // Ruta de la página que pidió los datos (el aviso solo se muestra en esa página).
  path: string;
  savedAt: string;
}

let usages: SnapshotUsage[] = [];
const listeners = new Set<() => void>();

const emit = (next: SnapshotUsage[]) => {
  usages = next;
  listeners.forEach((listener) => listener());
};

const currentPath = () => (typeof location !== 'undefined' ? location.pathname : '');

export const markSnapshotUsed = (key: string, savedAt: string, path: string = currentPath()): void =>
  emit([...usages.filter((u) => u.key !== key), { key, path, savedAt }]);

// La consulta volvió a responder con red: deja de mostrarse como guardada.
export const markSnapshotFresh = (key: string): void => {
  if (usages.some((u) => u.key === key)) emit(usages.filter((u) => u.key !== key));
};

export const clearSnapshotUsage = (): void => emit([]);

export const subscribeSnapshotUsage = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getSnapshotUsage = (): SnapshotUsage[] => usages;
