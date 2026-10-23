// Estado de la conexión del navegador (navigator.onLine + eventos online/offline).
// Ojo: "online" solo significa que hay red; el servidor puede seguir sin responder
// (eso lo detecta NetworkError en cada petición).
import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

const getOnline = () => navigator.onLine;

export const useOnlineStatus = (): boolean => useSyncExternalStore(subscribe, getOnline, () => true);
