import type { Product } from '../data/products';
import { apiFetch, ApiError } from './apiClient';

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
