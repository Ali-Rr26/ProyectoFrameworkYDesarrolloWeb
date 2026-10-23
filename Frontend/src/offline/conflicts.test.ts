import { describe, expect, it } from 'vitest';
import type { Product } from '../data/products';
import {
  canApplyStatus,
  defaultChoices,
  mergeProductChanges,
  productConflicts,
  productValues,
  rebuildCart,
} from './conflicts';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 1,
  name: 'Sérum',
  description: 'Vitamina C',
  price: 45,
  category: 'Serum',
  image: 'https://img.example/1.jpg',
  gallery: [],
  stock: 10,
  active: true,
  version: 1,
  updated_at: '2026-10-22T00:00:00Z',
  ...overrides,
});

describe('productConflicts y defaultChoices (combinación a tres bandas)', () => {
  const base = productValues(product());

  it('solo lista los campos de mi edición que difieren del servidor', () => {
    const mine = { ...base, price: 50, version: 1 };
    const server = product({ version: 3 });

    expect(productConflicts(mine, server, base).map((c) => c.field)).toEqual(['price']);
  });

  it('sugiere lo mío si solo yo lo cambié y lo del servidor si solo cambió allá', () => {
    // Yo subí el precio; mientras tanto una venta bajó el stock.
    const mine = { ...base, price: 50, version: 1 };
    const server = product({ stock: 8, version: 2 });

    const conflicts = productConflicts(mine, server, base);

    expect(conflicts).toEqual([
      { field: 'price', mine: 50, server: 45, changedByMe: true, changedByServer: false },
      { field: 'stock', mine: 10, server: 8, changedByMe: false, changedByServer: true },
    ]);
    expect(defaultChoices(conflicts)).toEqual({ price: 'mine', stock: 'server' });
  });

  it('si ambos cambiaron el mismo campo propone lo mío (decide el usuario)', () => {
    const mine = { ...base, name: 'Sérum Plus' };
    const server = product({ name: 'Sérum Pro', version: 2 });

    const [conflict] = productConflicts(mine, server, base);

    expect(conflict).toMatchObject({ changedByMe: true, changedByServer: true });
    expect(defaultChoices([conflict])).toEqual({ name: 'mine' });
  });

  it('sin base asume que ambos cambiaron cada campo distinto', () => {
    const [conflict] = productConflicts({ price: 50 }, product(), undefined);
    expect(conflict).toMatchObject({ field: 'price', changedByMe: true, changedByServer: true });
  });

  it('compara la galería por contenido', () => {
    const mine = { gallery: ['a.jpg', 'b.jpg'] };
    expect(productConflicts(mine, product({ gallery: ['a.jpg', 'b.jpg'] }), base)).toEqual([]);
    expect(productConflicts(mine, product({ gallery: ['a.jpg'] }), base)).toHaveLength(1);
  });
});

describe('mergeProductChanges', () => {
  it('conserva mis campos salvo los que se dejan al servidor y usa la versión vigente', () => {
    const mine = { name: 'Sérum', price: 50, stock: 10, version: 1 };
    const server = product({ stock: 8, version: 4 });

    expect(mergeProductChanges(mine, server, { price: 'mine', stock: 'server' })).toEqual({
      version: 4,
      name: 'Sérum',
      price: 50,
    });
  });

  it('respeta la reactivación (active) de mi edición', () => {
    expect(mergeProductChanges({ active: true, version: 1 }, product({ version: 2 }), {})).toEqual({
      version: 2,
      active: true,
    });
  });
});

describe('canApplyStatus', () => {
  it('permite la transición si sigue siendo válida desde el estado vigente', () => {
    expect(canApplyStatus('preparing', 'cancelled')).toBe(true);
    expect(canApplyStatus('pending', 'preparing')).toBe(true);
  });

  it('la rechaza si el pedido ya avanzó demasiado', () => {
    expect(canApplyStatus('shipped', 'cancelled')).toBe(false);
    expect(canApplyStatus('cancelled', 'preparing')).toBe(false);
  });
});

describe('rebuildCart', () => {
  it('usa precios y stock vigentes, ajusta cantidades y quita lo no disponible', () => {
    const products = [
      product({ id: 1, name: 'Sérum', price: 50, stock: 5 }),
      product({ id: 2, name: 'Crema', stock: 1 }),
      product({ id: 3, name: 'Tónico', active: false }),
      product({ id: 4, name: 'Labial', stock: 0 }),
    ];
    const lines = [
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 3 },
      { product_id: 3, quantity: 1 },
      { product_id: 4, quantity: 1 },
      { product_id: 99, quantity: 1 },
    ];

    const { items, notes } = rebuildCart(lines, products);

    expect(items.map((i) => [i.id, i.quantity, i.price])).toEqual([
      [1, 2, 50],
      [2, 1, 45],
    ]);
    expect(notes).toEqual([
      'Crema: solo quedan 1 unidades',
      'Tónico: ya no está disponible',
      'Labial: ya no está disponible',
      'Producto 99: ya no está disponible',
    ]);
  });
});
