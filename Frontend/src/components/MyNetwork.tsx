import { useState, useEffect } from 'react';
import { countNetwork, sumNetworkSales, getMonthlyCommissions, getRank, type NetworkNode } from '../data/network';
import { getNetwork } from '../services/networkService';
import { ApiError } from '../services/apiClient';
import { COMMISSION_RATES, LEVEL_STYLES } from '../data/constants';
import InviteLink from './InviteLink';
import CommissionsPanel from './CommissionsPanel';

// Componente recursivo: renderiza un referido y, debajo, a sus hijos
const NetworkNodeItem = ({ node }: { node: NetworkNode }) => {
  const style = LEVEL_STYLES[node.level] ?? LEVEL_STYLES[1];
  const commission = node.commission ?? 0;

  return (
    <li>
      <div className={`bg-white rounded-lg border ${style.border} shadow-sm p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
            {node.name.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{node.name}</p>
            <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
              Nivel {node.level} · {style.rate} comisión
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">Ventas</p>
          <p className="font-bold text-slate-800">${node.sales.toLocaleString()}</p>
          <p className="text-xs text-[#20b2aa] font-semibold mt-1">
            +${commission.toFixed(2)} para ti
          </p>
        </div>
      </div>

      {/* Hijos del referido (más profundidad en el árbol) */}
      {node.children && node.children.length > 0 && (
        <ul className="mt-3 ml-3 sm:ml-6 space-y-3 border-l-2 border-slate-200 pl-3 sm:pl-4">
          {node.children.map((child) => (
            <NetworkNodeItem key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
};

const MyNetwork = () => {
  const [network, setNetwork] = useState<NetworkNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    getNetwork()
      .then(setNetwork)
      .catch((err) => {
        // 404: la cuenta no está afiliada a la red (p. ej. el admin sin red configurada)
        if (err instanceof ApiError && err.status === 404) {
          setError('Tu cuenta todavía no forma parte de la red de referidos.');
        } else {
          setError(err instanceof ApiError ? err.message : 'No se pudo cargar la red');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center p-8">Cargando red...</div>;
  if (error || !network) {
    return (
      <div className="bg-white p-10 rounded-lg border border-slate-200 text-center text-slate-500">
        {error || 'No se pudo cargar la red'}
      </div>
    );
  }

  // El backend nombra "Tú" a la raíz cuando es la red de quien consulta: solo entonces se
  // muestran su link de invitación y su ledger (un admin que mira otra red no los ve).
  const isOwnNetwork = network.name === 'Tú';

  // KPIs derivados de los datos de la red (funciones puras en data/network.ts)
  const activeReferrals = countNetwork(network);
  const networkSales = sumNetworkSales(network);
  const monthlyCommissions = getMonthlyCommissions(network);
  const rank = getRank(network.children?.length ?? 0);

  const summary = [
    { label: "Referidos Activos", value: activeReferrals.toString(), color: "text-[#20b2aa]" },
    { label: "Ventas de la Red", value: `$${networkSales.toLocaleString()}`, color: "text-[#20b2aa]" },
    { label: "Comisiones del Mes", value: `$${monthlyCommissions.toFixed(2)}`, color: "text-green-600" },
    { label: "Nivel Alcanzado", value: rank, color: "text-amber-600" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Mi Red de Referidos</h1>
      <p className="text-slate-500 mb-6">
        Estructura multinivel: gana el {COMMISSION_RATES[1] * 100} % de nivel 1, {COMMISSION_RATES[2] * 100} % de nivel 2 y {COMMISSION_RATES[3] * 100} % de nivel 3.
      </p>

      {isOwnNetwork && network.referral_code && <InviteLink referralCode={network.referral_code} />}

      {/* ===== TARJETAS DE RESUMEN ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {summary.map((item) => (
          <div key={item.label} className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <p className="text-sm text-slate-500 uppercase font-semibold">{item.label}</p>
            <p className={`text-3xl font-bold mt-2 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* ===== ÁRBOL DE REFERIDOS ===== */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Jerarquía de tu Red</h2>

        {/* Raíz: el usuario */}
        <div className="bg-[#9ce0db] text-white rounded-lg p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#20b2aa] flex items-center justify-center font-bold">
              {network.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold">{network.name}</p>
              <p className="text-xs text-white">Nivel alcanzado: {rank}</p>
            </div>
          </div>
          <p className="font-bold text-[#005954]">
            Comisiones del mes: ${monthlyCommissions.toFixed(2)}
          </p>
        </div>

        <ul className="space-y-3">
          {network.children?.map((child) => (
            <NetworkNodeItem key={child.id} node={child} />
          ))}
        </ul>
        {(network.children?.length ?? 0) === 0 && (
          <p className="text-slate-500 text-sm">Todavía no tienes referidos. Comparte tu link de invitación para hacer crecer tu red.</p>
        )}
      </div>

      {isOwnNetwork && <CommissionsPanel />}
    </div>
  );
};

export default MyNetwork;
