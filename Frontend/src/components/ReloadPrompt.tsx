// src/components/ReloadPrompt.tsx
// Registro del service worker y aviso de actualización (registerType: 'prompt'):
// cuando hay una versión nueva en espera se ofrece "Recargar"; al aceptar, el SW nuevo
// recibe SKIP_WAITING (src/sw.ts), toma el control y la página se recarga.
// No se ofrece en /checkout ni mientras se envían pendientes (shouldOfferReload).
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useOutbox } from '../offline/outboxContext';
import { shouldOfferReload, UPDATE_CHECK_MS } from '../pwa/updatePolicy';

const toastClass =
  'fixed z-50 right-4 left-4 sm:left-auto sm:max-w-sm bottom-[calc(1rem+env(safe-area-inset-bottom))] bg-white border border-slate-200 rounded-xl shadow-lg p-4';

const ReloadPrompt = () => {
  const { pathname } = useLocation();
  const { syncing } = useOutbox();
  const [updating, setUpdating] = useState<boolean>(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // Con la app abierta mucho tiempo (p. ej. instalada) se revisa cada hora si hay versión nueva.
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });

  if (shouldOfferReload(needRefresh, pathname, syncing)) {
    return (
      <div role="alert" className={toastClass}>
        <p className="font-semibold text-slate-800">Nueva versión disponible</p>
        <p className="text-sm text-slate-500 mt-1">Recarga para usar la versión más reciente de MultiCatálogo.</p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            disabled={updating}
            onClick={() => {
              setUpdating(true);
              void updateServiceWorker(true);
            }}
            className="min-h-11 px-4 bg-[#20b2aa] text-white text-sm font-semibold rounded-lg hover:bg-[#008080] transition disabled:opacity-50"
          >
            {updating ? 'Actualizando...' : 'Recargar'}
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="min-h-11 px-4 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            Más tarde
          </button>
        </div>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div role="status" className={toastClass}>
        <p className="text-sm text-slate-700">MultiCatálogo está lista para usarse sin conexión.</p>
        <button
          type="button"
          onClick={() => setOfflineReady(false)}
          className="min-h-11 mt-2 px-4 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          Entendido
        </button>
      </div>
    );
  }

  return null;
};

export default ReloadPrompt;
