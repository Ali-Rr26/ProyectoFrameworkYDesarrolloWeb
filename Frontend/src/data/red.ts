import { TASA_COMISION } from './constants';

export interface Referido {
  id: number;
  nombre: string;
  nivel: number;
  ventas: number;
  hijos?: Referido[];
}

export const contarRed = (raiz: Referido): number => {
  const directos = raiz.hijos ?? [];
  return directos.reduce((total, hijo) => total + 1 + contarRed(hijo), 0);
};

export const sumarVentasRed = (raiz: Referido): number => {
  const directos = raiz.hijos ?? [];
  return directos.reduce((total, hijo) => total + hijo.ventas + sumarVentasRed(hijo), 0);
};

export const comisionDeReferido = (ref: Referido): number =>
  ref.ventas * (TASA_COMISION[ref.nivel] ?? 0);

export const sumarComisiones = (raiz: Referido): number => {
  const directos = raiz.hijos ?? [];
  return directos.reduce(
    (total, hijo) => total + comisionDeReferido(hijo) + sumarComisiones(hijo),
    0
  );
};

export const nivelAlcanzado = (referidosDirectos: number): string => {
  if (referidosDirectos >= 6) return 'Diamante';
  if (referidosDirectos >= 4) return 'Oro';
  if (referidosDirectos >= 2) return 'Plata';
  return 'Bronce';
};
