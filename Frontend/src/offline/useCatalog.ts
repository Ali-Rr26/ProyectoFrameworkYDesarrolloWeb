// Hooks del catálogo local: las vistas leen de IndexedDB (useLiveQuery se re-renderiza
// solo cuando cambian los datos) y la red refresca esa copia en segundo plano.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { refreshCatalog, refreshProduct } from './catalogStore';
import { db, type LocalProduct } from './db';

interface CatalogState {
  products: LocalProduct[];
  // Sin copia local todavía y el primer refresco en curso.
  loading: boolean;
  // Sin copia local y la red falló: no hay nada que mostrar.
  error: boolean;
}

// Catálogo completo. Refresca al montar y cada vez que vuelve la conexión.
export const useCatalog = (): CatalogState => {
  const products = useLiveQuery(() => db.products.orderBy('position').toArray(), []);
  const [refreshing, setRefreshing] = useState<boolean>(true);
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      refreshCatalog()
        .then(() => active && setFailed(false), () => active && setFailed(true))
        .finally(() => active && setRefreshing(false));
    };
    refresh();
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      window.removeEventListener('online', refresh);
    };
  }, []);

  const empty = products === undefined || products.length === 0;
  return {
    products: products ?? [],
    loading: products === undefined || (empty && refreshing),
    error: empty && !refreshing && failed,
  };
};

interface ProductState {
  product: LocalProduct | null;
  loading: boolean;
}

// Detalle de un producto: muestra la copia local al instante y la confirma con la red.
// Si el servidor dice que ya no existe, se borra de la copia local.
export const useLocalProduct = (id: number): ProductState => {
  const validId = Number.isInteger(id) && id > 0;
  const product = useLiveQuery(
    async () => (validId ? ((await db.products.get(id)) ?? null) : null),
    [id, validId],
  );
  // ID cuyo refresco ya terminó (con éxito o sin red).
  const [checkedId, setCheckedId] = useState<number | null>(null);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    refreshProduct(id)
      .catch(() => undefined)
      .finally(() => active && setCheckedId(id));
    return () => {
      active = false;
    };
  }, [id, validId]);

  return {
    product: product ?? null,
    loading: product === undefined || (product === null && validId && checkedId !== id),
  };
};
