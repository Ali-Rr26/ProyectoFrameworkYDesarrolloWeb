// src/components/InstallAppButton.tsx
// Botón "Instalar app" reutilizable (pantalla de login): abre el diálogo de instalación
// del navegador (Chrome/Edge) o, en iPhone/iPad, muestra los pasos para agregarla a la
// pantalla de inicio. No se muestra si la app ya está instalada o el navegador no
// permite instalarla (Firefox de escritorio, Safari de Mac).
import { useState } from 'react';
import { Download } from 'lucide-react';
import { IOS_INSTALL_STEPS, promptInstall, useInstallPrompt } from '../pwa/installPrompt';

const InstallAppButton = () => {
  const install = useInstallPrompt();
  const [showSteps, setShowSteps] = useState<boolean>(false);

  if (install.standalone || (!install.canPrompt && !install.ios)) return null;

  const handleClick = () => {
    if (install.canPrompt) void promptInstall();
    else setShowSteps((visible) => !visible);
  };

  return (
    <div className="mt-6 pt-6 border-t border-slate-200 text-center">
      <p className="text-sm text-slate-600 mb-3">
        Usa MultiCatálogo como una app: abre más rápido y funciona sin conexión.
      </p>
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={install.canPrompt ? undefined : showSteps}
        className="w-full sm:w-auto min-h-11 inline-flex items-center justify-center gap-2 px-6 rounded-lg border-2 border-[#20b2aa] text-[#008080] font-semibold hover:bg-[#20b2aa] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#20b2aa] focus:ring-offset-2 transition"
      >
        <Download size={20} aria-hidden="true" />
        Instalar app
      </button>
      {showSteps && (
        <p role="status" className="mt-3 text-sm text-[#008080] bg-teal-50 border border-teal-200 rounded-lg p-3">
          {IOS_INSTALL_STEPS}
        </p>
      )}
    </div>
  );
};

export default InstallAppButton;
