// src/components/ProductConflictPanel.tsx
// Conflicto de una edición de producto (409 por versión): comparación campo a campo entre
// mi edición y la versión vigente, con elección sugerida (combinación a tres bandas).
import { useState } from 'react';
import type { Product, ProductUpdate } from '../data/products';
import {
  defaultChoices,
  mergeProductChanges,
  PRODUCT_FIELD_LABELS,
  productConflicts,
  productValues,
  type Choice,
  type ProductValues,
} from '../offline/conflicts';
import type { OutboxEntry } from '../offline/db';
import { discardEntry, requeueEntry } from '../offline/resolve';

const formatValue = (field: string, value: unknown): string => {
  if (field === 'price' && typeof value === 'number') return `$${value.toFixed(2)}`;
  if (Array.isArray(value)) return value.length ? value.join('\n') : '(sin imágenes)';
  if (value === '' || value === undefined || value === null) return '(vacío)';
  return String(value);
};

const ORIGIN_LABEL = (changedByMe: boolean, changedByServer: boolean): string =>
  changedByMe && changedByServer ? 'Cambiado por ambos' : changedByMe ? 'Solo lo cambiaste tú' : 'Cambió en el servidor';

interface Props {
  entry: OutboxEntry;
}

const ProductConflictPanel = ({ entry }: Props) => {
  const mine = entry.payload as ProductUpdate;
  const server = entry.details as Product;
  const base = entry.base as ProductValues | undefined;
  const conflicts = productConflicts(mine, server, base);
  const [choices, setChoices] = useState<Record<string, Choice>>(() => defaultChoices(conflicts));

  // Reenvía con la versión vigente; la nueva base es la versión del servidor.
  const resend = (selection: Record<string, Choice>) =>
    requeueEntry(entry.id, {
      payload: mergeProductChanges(mine, server, selection),
      baseVersion: server.version,
      base: productValues(server),
    });

  const keepMine = () => resend(Object.fromEntries(conflicts.map((c) => [c.field, 'mine'])));
  const useServer = () => {
    if (window.confirm('¿Descartar tu edición y quedarte con la versión del servidor?')) void discardEntry(entry.id);
  };

  if (conflicts.length === 0) {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-slate-600">
          Tus cambios no chocan con la versión vigente (solo cambió la versión). Puedes reenviarlos tal cual.
        </p>
        <button type="button" onClick={() => void resend({})}
          className="min-h-11 px-4 bg-[#20b2aa] text-white text-sm font-semibold rounded-lg hover:bg-[#008080] transition">
          Reenviar mis cambios
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-slate-600">
        El producto cambió mientras lo editabas (versión {entry.baseVersion ?? '?'} → {server.version}). Elige qué valor
        conservar en cada campo:
      </p>
      <div className="space-y-3">
        {conflicts.map((c) => (
          <fieldset key={c.field} className="border border-slate-200 rounded-lg p-3">
            <legend className="px-1 text-sm font-semibold text-slate-700">
              {PRODUCT_FIELD_LABELS[c.field]}{' '}
              <span className="font-normal text-xs text-slate-500">· {ORIGIN_LABEL(c.changedByMe, c.changedByServer)}</span>
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['mine', 'server'] as const).map((side) => (
                <label key={side}
                  className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer min-h-11 ${
                    choices[c.field] === side ? 'border-[#20b2aa] bg-teal-50' : 'border-slate-200'
                  }`}>
                  <input type="radio" name={`${entry.id}-${c.field}`} className="mt-1 accent-[#20b2aa]"
                    checked={choices[c.field] === side}
                    onChange={() => setChoices((prev) => ({ ...prev, [c.field]: side }))} />
                  <span className="text-sm min-w-0">
                    <span className="block text-xs text-slate-500">{side === 'mine' ? 'Tu versión' : 'Versión vigente'}</span>
                    <span className="block text-slate-800 whitespace-pre-line break-words">
                      {formatValue(c.field, side === 'mine' ? c.mine : c.server)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={() => void resend(choices)}
          className="min-h-11 px-4 bg-[#20b2aa] text-white text-sm font-semibold rounded-lg hover:bg-[#008080] transition">
          Combinar y reenviar
        </button>
        <button type="button" onClick={() => void keepMine()}
          className="min-h-11 px-4 border border-[#20b2aa] text-[#008080] text-sm font-semibold rounded-lg hover:bg-teal-50 transition">
          Conservar lo mío
        </button>
        <button type="button" onClick={useServer}
          className="min-h-11 px-4 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
          Usar la del servidor
        </button>
      </div>
    </div>
  );
};

export default ProductConflictPanel;
