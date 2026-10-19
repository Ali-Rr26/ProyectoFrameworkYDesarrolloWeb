// Producto del catálogo tal como lo entrega GET /api/products
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  gallery: string[];
  // Unidades disponibles; la validación definitiva la hace la base de datos al vender
  stock: number;
  // false si fue dado de baja (solo lo ve el admin; el catálogo público no lo incluye)
  active: boolean;
}

// Cuerpo de POST /api/products (solo admin)
export interface ProductInput {
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  gallery: string[];
}

// Cuerpo de PUT /api/products/:id (solo admin): edición parcial; active reactiva un producto
export type ProductUpdate = Partial<ProductInput> & { active?: boolean };
