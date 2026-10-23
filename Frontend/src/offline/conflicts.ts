// Resolución de conflictos del outbox (Fase 7): funciones puras, sin red ni IndexedDB.
// - Producto: comparación campo a campo entre lo mío, lo del servidor y la base
//   (lo que había cuando empecé a editar) y combinación según la elección del usuario.
// - Estado de pedido: si la transición sigue siendo válida desde el estado vigente.
// - Checkout: reconstruye el carrito con el stock y los precios vigentes.
import type { CartItem } from '../context/cart';
import { nextStatuses, type OrderStatus } from '../data/orders';
import type { Product, ProductUpdate } from '../data/products';

export const PRODUCT_FIELDS = ['name', 'description', 'category', 'price', 'stock', 'image', 'gallery'] as const;
export type ProductField = (typeof PRODUCT_FIELDS)[number];
export type ProductValues = Pick<Product, ProductField>;

export const PRODUCT_FIELD_LABELS: Record<ProductField, string> = {
  name: 'Nombre',
  description: 'Descripción',
  category: 'Categoría',
  price: 'Precio',
  stock: 'Stock',
  image: 'Imagen principal',
  gallery: 'Galería',
};

// Valores editables de un producto (la "base" que se guarda al encolar una edición).
export const productValues = (product: Product): ProductValues => ({
  name: product.name,
  description: product.description,
  category: product.category,
  price: product.price,
  stock: product.stock,
  image: product.image,
  gallery: product.gallery,
});

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface FieldConflict {
  field: ProductField;
  mine: unknown;
  server: unknown;
  // Sin base (registro antiguo) se asume que ambos lo cambiaron.
  changedByMe: boolean;
  changedByServer: boolean;
}

// Campos de mi edición cuyo valor difiere del vigente en el servidor.
export const productConflicts = (
  mine: ProductUpdate,
  server: Product,
  base?: ProductValues,
): FieldConflict[] =>
  PRODUCT_FIELDS.filter((field) => mine[field] !== undefined && !same(mine[field], server[field])).map((field) => ({
    field,
    mine: mine[field],
    server: server[field],
    changedByMe: base ? !same(mine[field], base[field]) : true,
    changedByServer: base ? !same(server[field], base[field]) : true,
  }));

export type Choice = 'mine' | 'server';

// Elección sugerida por campo (combinación a tres bandas): si solo yo cambié el campo,
// gana lo mío; si solo cambió en el servidor (p. ej. el stock por una venta), gana el
// servidor; si ambos lo cambiaron, se propone lo mío y el usuario decide.
export const defaultChoices = (conflicts: FieldConflict[]): Record<string, Choice> =>
  Object.fromEntries(
    conflicts.map((c) => [c.field, !c.changedByMe && c.changedByServer ? 'server' : 'mine'] as const),
  );

// Edición a reenviar: mis campos salvo los que el usuario dejó al servidor, con la
// versión vigente (si vuelve a cambiar antes de enviarse, habrá un nuevo 409).
export const mergeProductChanges = (
  mine: ProductUpdate,
  server: Product,
  choices: Record<string, Choice>,
): ProductUpdate => {
  const merged: ProductUpdate = { version: server.version };
  for (const field of PRODUCT_FIELDS) {
    if (mine[field] !== undefined && choices[field] !== 'server') {
      (merged as Record<string, unknown>)[field] = mine[field];
    }
  }
  if (mine.active !== undefined) merged.active = mine.active;
  return merged;
};

// ¿Se puede aplicar el cambio de estado desde el estado vigente del pedido?
export const canApplyStatus = (current: OrderStatus, next: OrderStatus): boolean =>
  nextStatuses(current).includes(next);

export interface OrderLine {
  product_id: number;
  quantity: number;
}

export interface CartRebuild {
  items: CartItem[];
  // Mensajes para el usuario: productos que ya no están o con menos stock.
  notes: string[];
}

// Carrito a partir de las líneas de un pedido rechazado, con stock y precios vigentes:
// los productos inexistentes, dados de baja o agotados se quitan; las cantidades se
// ajustan al stock disponible.
export const rebuildCart = (lines: OrderLine[], products: Product[]): CartRebuild => {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items: CartItem[] = [];
  const notes: string[] = [];
  for (const line of lines) {
    const product = byId.get(line.product_id);
    if (!product || !product.active || product.stock <= 0) {
      notes.push(`${product?.name ?? `Producto ${line.product_id}`}: ya no está disponible`);
      continue;
    }
    const quantity = Math.min(line.quantity, product.stock);
    if (quantity < line.quantity) notes.push(`${product.name}: solo quedan ${product.stock} unidades`);
    items.push({ ...product, quantity });
  }
  return { items, notes };
};
