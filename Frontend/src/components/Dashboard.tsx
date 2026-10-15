import { useState, useEffect } from 'react';
import { countNetwork, sumNetworkSales, sumCommissions, getRank, getNodeCommission, type NetworkNode } from '../data/network';
import { getNetwork } from '../services/networkService';

const Dashboard = () => {
  const [network, setNetwork] = useState<NetworkNode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNetwork()
      .then(data => {
        setNetwork(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error cargando red:', err);
        setLoading(false);
      });
  }, []);

  if (loading || !network) return <div className="text-center p-8">Cargando dashboard...</div>;

  const directReferrals = network.children?.length ?? 0;
  const activeReferrals = countNetwork(network);
  const networkSales = sumNetworkSales(network);
  const monthlyCommissions = sumCommissions(network);
  const rank = getRank(directReferrals);

  const kpis = [
    { label: "Ventas de la Red", value: `$${networkSales.toLocaleString()}`, color: "text-[#20b2aa]" },
    { label: "Referidos Activos", value: activeReferrals.toString(), color: "text-[#20b2aa]" },
    { label: "Comisiones del Mes", value: `$${monthlyCommissions.toFixed(2)}`, color: "text-green-600" },
    { label: "Nivel Actual", value: rank, color: "text-amber-600" },
  ];

  // Top 3 referidos por ventas (sin recursión: solo nivel 1)
  const topReferrals = [...(network.children ?? [])]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 3);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Resumen General</h1>

      {/* ===== KPIs DERIVADOS DEL ESTADO ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <p className="text-sm text-slate-500 uppercase font-semibold">{kpi.label}</p>
            <p className={`text-3xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== TOP REFERIDOS ===== */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Top Referidos del Mes</h2>
          <div className="space-y-3">
            {topReferrals.map((referral, idx) => (
              <div
                key={referral.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[#40d9d8] text-white font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-800">{referral.name}</p>
                    <p className="text-xs text-slate-500">Nivel {referral.level}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">${referral.sales.toLocaleString()}</p>
                  <p className="text-xs text-[#20b2aa] font-semibold">
                    +${getNodeCommission(referral).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== PROGRESO DE NIVEL ===== */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Progreso al Siguiente Nivel</h2>
          <p className="text-slate-500 text-sm mb-4">
            {directReferrals} referidos directos. El nivel se calcula con:
          </p>
          <ul className="space-y-2 text-sm text-slate-600 mb-6">
            <li className="flex justify-between"><span>Bronce</span><span>0 – 1 directos</span></li>
            <li className="flex justify-between"><span>Plata</span><span>2 – 3 directos</span></li>
            <li className="flex justify-between"><span>Oro</span><span>4 – 5 directos</span></li>
            <li className="flex justify-between"><span>Diamante</span><span>6+ directos</span></li>
          </ul>

          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#40d9d8] to-[#20b2aa] rounded-full transition-all"
              style={{ width: `${Math.min((directReferrals / 6) * 100, 100)}%` }}
            />
          </div>
          <p className="text-center text-sm text-slate-500 mt-2 font-semibold">
            Nivel actual: {rank} ({directReferrals} / 6 directos para Diamante)
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
