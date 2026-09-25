import { useState, useEffect } from 'react';
import { contarRed, sumarVentasRed, sumarComisiones, nivelAlcanzado, comisionDeReferido, type Referido } from '../data/red';
import { getNetwork } from '../services/networkService';
import { TASA_COMISION, COLORES_NIVEL } from '../data/constants';

// Componente recursivo: renderiza un referido y, debajo, a sus hijos
const NodoReferido = ({ nodo }: { nodo: Referido }) => {
  const estilo = COLORES_NIVEL[nodo.nivel] ?? COLORES_NIVEL[1];
  const comision = comisionDeReferido(nodo);

  return (
    <li>
      <div className={`bg-white rounded-lg border ${estilo.border} shadow-sm p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
            {nodo.nombre.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{nodo.nombre}</p>
            <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${estilo.badge}`}>
              Nivel {nodo.nivel} · {estilo.tasa} comisión
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">Ventas</p>
          <p className="font-bold text-slate-800">${nodo.ventas.toLocaleString()}</p>
          <p className="text-xs text-[#20b2aa] font-semibold mt-1">
            +${comision.toFixed(2)} para ti
          </p>
        </div>
      </div>

      {/* Hijos del referido (más profundidad en el árbol) */}
      {nodo.hijos && nodo.hijos.length > 0 && (
        <ul className="mt-3 ml-6 space-y-3 border-l-2 border-slate-200 pl-4">
          {nodo.hijos.map((hijo) => (
            <NodoReferido key={hijo.id} nodo={hijo} />
          ))}
        </ul>
      )}
    </li>
  );
};

const MiRed = () => {
  const [redInicial, setRedInicial] = useState<Referido | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNetwork()
      .then(data => {
        setRedInicial(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error cargando red:', err);
        setLoading(false);
      });
  }, []);

  if (loading || !redInicial) return <div className="text-center p-8">Cargando red...</div>;

  // KPIs derivados de los datos de la red (funciones puras en data/red.ts)
  const referidosActivos = contarRed(redInicial);
  const ventasRed = sumarVentasRed(redInicial);
  const comisionesMes = sumarComisiones(redInicial);
  const nivel = nivelAlcanzado(redInicial.hijos?.length ?? 0);

  const resumen = [
    { etiqueta: "Referidos Activos", valor: referidosActivos.toString(), color: "text-[#20b2aa]" },
    { etiqueta: "Ventas de la Red", valor: `$${ventasRed.toLocaleString()}`, color: "text-[#20b2aa]" },
    { etiqueta: "Comisiones del Mes", valor: `$${comisionesMes.toFixed(2)}`, color: "text-green-600" },
    { etiqueta: "Nivel Alcanzado", valor: nivel, color: "text-amber-600" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Mi Red de Referidos</h1>
      <p className="text-slate-500 mb-6">
        Estructura multinivel: gana el {TASA_COMISION[1] * 100} % de nivel 1, {TASA_COMISION[2] * 100} % de nivel 2 y {TASA_COMISION[3] * 100} % de nivel 3.
      </p>

      {/* ===== TARJETAS DE RESUMEN ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {resumen.map((item) => (
          <div key={item.etiqueta} className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <p className="text-sm text-slate-500 uppercase font-semibold">{item.etiqueta}</p>
            <p className={`text-3xl font-bold mt-2 ${item.color}`}>{item.valor}</p>
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
              {redInicial.nombre.charAt(0)}
            </div>
            <div>
              <p className="font-semibold">{redInicial.nombre}</p>
              <p className="text-xs text-white">Nivel alcanzado: {nivel}</p>
            </div>
          </div>
          <p className="font-bold text-[#005954]">
            Comisiones del mes: ${comisionesMes.toFixed(2)}
          </p>
        </div>

        <ul className="space-y-3">
          {redInicial.hijos?.map((hijo) => (
            <NodoReferido key={hijo.id} nodo={hijo} />
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MiRed;
