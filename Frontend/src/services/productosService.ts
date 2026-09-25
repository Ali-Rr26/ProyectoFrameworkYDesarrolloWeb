import { API_URL } from '../data/constants';
import type { Producto } from '../data/productos';

export const getProductos = async (): Promise<Producto[]> => {
  const response = await fetch(`${API_URL}/api/productos`);
  if (!response.ok) {
    throw new Error('Error al traer productos');
  }
  return response.json();
};

export const getProductoById = async (id: number): Promise<Producto | null> => {
  const productos = await getProductos();
  return productos.find((p) => p.id === id) ?? null;
};
