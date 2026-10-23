import { describe, expect, it } from 'vitest';
import { privatePrefetchPaths } from './privatePrefetch';

// Las rutas deben ser idénticas a las que piden las vistas al abrirse (página 1, sin
// filtros ni búsqueda): la instantánea se busca por la ruta exacta.
describe('privatePrefetchPaths', () => {
  it('admin: sus pedidos, la red y la primera página de cada listado de administración', () => {
    expect(privatePrefetchPaths('admin')).toEqual([
      '/api/orders/mine?page=1&limit=10',
      '/api/network',
      '/api/orders?page=1&limit=10',
      '/api/reports/pending-commissions',
      '/api/payouts?page=1&limit=10',
      '/api/admin/products?page=1&limit=10',
      '/api/users?page=1&limit=10',
    ]);
  });

  it('distribuidor: sus pedidos, su red, sus comisiones y sus cobros (sin rutas de admin)', () => {
    expect(privatePrefetchPaths('customer')).toEqual([
      '/api/orders/mine?page=1&limit=10',
      '/api/network',
      '/api/commissions/mine?page=1&limit=10',
      '/api/payouts/mine?page=1&limit=5',
    ]);
  });
});
