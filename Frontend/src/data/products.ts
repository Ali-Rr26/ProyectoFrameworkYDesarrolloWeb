// Producto del catálogo tal como lo entrega GET /api/products
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  gallery: string[];
}
