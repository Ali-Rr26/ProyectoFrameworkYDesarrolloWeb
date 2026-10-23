import { describe, expect, it } from 'vitest';
import { isImageRequest, isPublicCatalogRequest, type CacheableRequest } from './cacheRules';

const API_ORIGIN = 'http://localhost:4000';

const req = (path: string, overrides: Partial<CacheableRequest> = {}): CacheableRequest => ({
  url: new URL(path, API_ORIGIN),
  method: 'GET',
  destination: '',
  hasAuthorization: false,
  ...overrides,
});

describe('isPublicCatalogRequest', () => {
  it.each(['/api/products', '/api/products/7', '/api/categories'])('cachea %s', (path) => {
    expect(isPublicCatalogRequest(req(path), API_ORIGIN)).toBe(true);
  });

  it.each([
    '/api/admin/products',
    '/api/products/abc',
    '/api/products/7/extra',
    '/api/me',
    '/api/orders/mine',
    '/api/network',
    '/api/checkout',
    '/api/login',
  ])('no cachea %s', (path) => {
    expect(isPublicCatalogRequest(req(path), API_ORIGIN)).toBe(false);
  });

  it('no cachea si lleva Authorization', () => {
    expect(isPublicCatalogRequest(req('/api/products', { hasAuthorization: true }), API_ORIGIN)).toBe(false);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('no cachea el método %s', (method) => {
    expect(isPublicCatalogRequest(req('/api/products/7', { method }), API_ORIGIN)).toBe(false);
  });

  it('no cachea la misma ruta en otro origen', () => {
    const other: CacheableRequest = { ...req('/api/products'), url: new URL('https://otro.example/api/products') };
    expect(isPublicCatalogRequest(other, API_ORIGIN)).toBe(false);
  });
});

describe('isImageRequest', () => {
  it('cachea imágenes externas', () => {
    const image = { ...req('/'), url: new URL('https://fastly.picsum.photos/id/64/400/300.jpg'), destination: 'image' };
    expect(isImageRequest(image)).toBe(true);
  });

  it('no cachea otros destinos ni peticiones autenticadas', () => {
    expect(isImageRequest(req('/api/products', { destination: '' }))).toBe(false);
    expect(isImageRequest(req('/foto.png', { destination: 'image', hasAuthorization: true }))).toBe(false);
  });
});
