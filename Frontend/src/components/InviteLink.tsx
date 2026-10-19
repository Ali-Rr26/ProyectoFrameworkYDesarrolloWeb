// src/components/InviteLink.tsx
import { useState } from 'react';
import { inviteLink } from '../data/commissions';

// Tarjeta con el código de referido y el link de invitación, con botón para copiarlo.
const InviteLink = ({ referralCode }: { referralCode: string }) => {
  const [copied, setCopied] = useState<boolean>(false);
  const link = inviteLink(window.location.origin, referralCode);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin acceso al portapapeles (p. ej. HTTP sin localhost): se deja el link a la vista
      // y seleccionable para copiarlo a mano.
      window.prompt('Copia tu link de invitación:', link);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mb-8">
      <h2 className="text-lg font-bold text-slate-800 mb-1">Invita a tu red</h2>
      <p className="text-slate-500 text-sm mb-4">
        Quien se registre con tu link queda en tu red y sus compras te generan comisiones.
        Tu código: <span className="font-mono font-semibold text-slate-700">{referralCode}</span>
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          readOnly
          value={link}
          aria-label="Link de invitación"
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 min-h-11 px-4 rounded-lg border border-slate-300 bg-slate-50 font-mono text-sm"
        />
        <button
          type="button"
          onClick={copy}
          className="min-h-11 px-6 bg-[#20b2aa] text-white font-semibold rounded-lg hover:bg-[#008080] transition"
        >
          {copied ? '¡Copiado!' : 'Copiar link'}
        </button>
      </div>
    </div>
  );
};

export default InviteLink;
