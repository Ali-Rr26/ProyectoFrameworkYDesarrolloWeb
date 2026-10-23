// src/components/OfflineDataBanner.tsx
// Aviso sobre el contenido de la página cuando alguno de sus datos privados se está
// mostrando desde una instantánea guardada (sin conexión con el servidor). Lo alimenta
// snapshotGet: las vistas no necesitan saber de dónde salieron sus datos.
import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { getSnapshotUsage, subscribeSnapshotUsage } from '../offline/snapshotStatus';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });

const OfflineDataBanner = () => {
  const usages = useSyncExternalStore(subscribeSnapshotUsage, getSnapshotUsage);
  const { pathname } = useLocation();
  const here = usages.filter((u) => u.path === pathname);
  if (here.length === 0) return null;

  // Si la página combina varias consultas, se informa la copia más antigua.
  const oldest = here.reduce((a, b) => (a.savedAt < b.savedAt ? a : b));
  return (
    <div role="status" className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm mb-6 border border-amber-200">
      Sin conexión con el servidor: mostrando datos guardados el {formatDate(oldest.savedAt)}. Se actualizarán al
      volver la conexión.
    </div>
  );
};

export default OfflineDataBanner;
