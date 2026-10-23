import { createContext, useContext } from 'react';
import type { Product } from '../data/products';

// Tipos, contexto y hook del carrito. El Provider vive en CartContext.tsx: separarlos
// permite que Fast Refresh recargue el componente sin perder el estado (react-refresh).

// 1. Elemento del carrito: un producto + la cantidad seleccionada
export interface CartItem extends Product {
  quantity: number;
}

export interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product) => boolean;
  removeFromCart: (id: number) => void;
  getQuantityInCart: (id: number) => number;
  incrementQuantity: (id: number) => void;
  decrementQuantity: (id: number) => void;
  clearCart: () => void;
  // Reemplaza el carrito completo (p. ej. con stock y precios vigentes tras un conflicto)
  replaceCart: (items: CartItem[]) => void;
  totalItems: number;
  totalPrice: number;
}

// 2. Creamos el contexto indicando que puede ser CartContextType o undefined
export const CartContext = createContext<CartContextType | undefined>(undefined);

// 3. Hook personalizado con validación de tipo
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart debe ser usado dentro de un CartProvider");
  }
  return context;
};
