import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../data/products';
import { CATALOG_SYNCED_AT, refreshCatalog, refreshProduct } from './catalogStore';
import { OfflineDB } from './db';

const product = (id: number, name = `Producto ${id}`): Product => ({
  id,
  name,
  description: '',
  price: 10,
  category: 'Rostro',
  image: `https://img.example/${id}.jpg`,
  gallery: [],
  stock: 5,
  active: true,
});

let database: OfflineDB;

beforeEach(() => {
  database = new OfflineDB(`test-catalog-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('refreshCatalog', () => {
  it('guarda el catálogo conservando el orden del servidor y la fecha de sincronización', async () => {
    await refreshCatalog(async () => [product(3), product(1), product(2)], database);

    const ids = (await database.products.orderBy('position').toArray()).map((p) => p.id);
    expect(ids).toEqual([3, 1, 2]);
    expect(await database.meta.get(CATALOG_SYNCED_AT)).toBeDefined();
  });

  it('reemplaza la copia anterior: los productos dados de baja desaparecen', async () => {
    await refreshCatalog(async () => [product(1), product(2)], database);
    await refreshCatalog(async () => [product(2)], database);

    expect((await database.products.toArray()).map((p) => p.id)).toEqual([2]);
  });

  it('si la red falla, conserva la copia anterior', async () => {
    await refreshCatalog(async () => [product(1)], database);

    await expect(refreshCatalog(async () => Promise.reject(new TypeError('Failed to fetch')), database)).rejects.toThrow();
    expect(await database.products.count()).toBe(1);
  });

  it('comparte una sola petición entre llamadas simultáneas', async () => {
    const fetchProducts = vi.fn(async () => [product(1)]);

    await Promise.all([refreshCatalog(fetchProducts, database), refreshCatalog(fetchProducts, database)]);

    expect(fetchProducts).toHaveBeenCalledTimes(1);
  });
});

describe('refreshProduct', () => {
  it('actualiza el producto y conserva su posición en el listado', async () => {
    await refreshCatalog(async () => [product(1), product(2)], database);

    await refreshProduct(2, async () => product(2, 'Renombrado'), database);

    const saved = await database.products.get(2);
    expect(saved?.name).toBe('Renombrado');
    expect(saved?.position).toBe(1);
  });

  it('borra de la copia local un producto que ya no existe', async () => {
    await refreshCatalog(async () => [product(1)], database);

    expect(await refreshProduct(1, async () => null, database)).toBeNull();
    expect(await database.products.get(1)).toBeUndefined();
  });
});
