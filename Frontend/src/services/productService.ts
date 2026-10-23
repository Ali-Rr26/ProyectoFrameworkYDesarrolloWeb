import type { Page } from '../data/orders';
import type { Product, ProductInput, ProductUpdate } from '../data/products';
import { apiFetch, ApiError, idempotencyHeaders, listQuery } from './apiClient';
import { snapshotGet } from './snapshotClient';

// El catálogo es público: no requiere token.
export const getProducts = (): Promise<Product[]> =>
  apiFetch<Product[]>('/api/products', { auth: false });

// Consulta directa por ID (antes se descargaba todo el catálogo y se filtraba en el navegador).
export const getProductById = async (id: number): Promise<Product | null> => {
  try {
    return await apiFetch<Product>(`/api/products/${id}`, { auth: false });
  } catch (err) {
    // 404 (no existe) y 400 (ID no numérico) se muestran como "Producto no encontrado".
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
};

// Categorías del catálogo (público): opciones del formulario de productos.
export const getCategories = (): Promise<string[]> => apiFetch<string[]>('/api/categories', { auth: false });

// ===== Solo administrador =====

// Productos paginados, incluidos los dados de baja, con búsqueda por nombre o categoría (?q=).
export const adminProductsPath = (page: number, limit: number, q: string): string =>
  `/api/admin/products?${listQuery(page, limit, { q })}`;

export const getAdminProducts = (page: number, limit: number, q: string): Promise<Page<Product>> =>
  snapshotGet<Page<Product>>(adminProductsPath(page, limit, q));

export const createProduct = (input: ProductInput, idempotencyKey?: string): Promise<Product> =>
  apiFetch<Product>('/api/products', { method: 'POST', body: input, headers: idempotencyHeaders(idempotencyKey) });

export const updateProduct = (id: number, changes: ProductUpdate, idempotencyKey?: string): Promise<Product> =>
  apiFetch<Product>(`/api/products/${id}`, { method: 'PUT', body: changes, headers: idempotencyHeaders(idempotencyKey) });

// Baja lógica: el producto deja de venderse pero se conserva en los pedidos.
export const deactivateProduct = (id: number): Promise<Product> =>
  apiFetch<Product>(`/api/products/${id}`, { method: 'DELETE' });
