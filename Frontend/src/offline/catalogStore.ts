// Sincronización del catálogo público con la copia local (IndexedDB).
// La red es la fuente de verdad; IndexedDB permite mostrar el catálogo sin conexión.
import type { Product } from '../data/products';
import { getProductById, getProducts } from '../services/productService';
import { db, type OfflineDB } from './db';

export const CATALOG_SYNCED_AT = 'catalogSyncedAt';

// Producto conocido solo por su detalle (no por el listado): va al final del orden.
const UNLISTED_POSITION = Number.MAX_SAFE_INTEGER;

// Varias vistas pueden pedir el refresco a la vez (Storefront, Catalog): una sola petición.
let inflight: Promise<void> | null = null;

// Refresco completo: reemplaza la copia local por el catálogo vigente. Así desaparecen
// también los productos dados de baja. Si la red falla, la copia anterior queda intacta.
export const refreshCatalog = (
  fetchProducts: () => Promise<Product[]> = getProducts,
  database: OfflineDB = db,
): Promise<void> => {
  inflight ??= (async () => {
    const products = await fetchProducts();
    await database.transaction('rw', database.products, database.meta, async () => {
      await database.products.clear();
      await database.products.bulkPut(products.map((product, position) => ({ ...product, position })));
      await database.meta.put({ key: CATALOG_SYNCED_AT, value: new Date().toISOString() });
    });
  })().finally(() => {
    inflight = null;
  });
  return inflight;
};

// Refresco de un producto (vista de detalle). null = ya no existe o fue dado de baja.
export const refreshProduct = async (
  id: number,
  fetchProduct: (id: number) => Promise<Product | null> = getProductById,
  database: OfflineDB = db,
): Promise<Product | null> => {
  const product = await fetchProduct(id);
  if (!product) {
    await database.products.delete(id);
    return null;
  }
  const existing = await database.products.get(id);
  await database.products.put({ ...product, position: existing?.position ?? UNLISTED_POSITION });
  return product;
};
