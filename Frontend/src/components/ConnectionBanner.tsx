// src/components/ConnectionBanner.tsx
// Franja bajo la barra superior mientras el navegador no tiene red.
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const ConnectionBanner = () => {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className="bg-slate-800 text-white text-sm text-center px-4 py-2">
      Sin conexión — trabajando con datos guardados. Lo que guardes se enviará al volver la conexión.
    </div>
  );
};

export default ConnectionBanner;
