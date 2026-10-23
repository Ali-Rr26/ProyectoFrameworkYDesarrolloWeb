import { useEffect, useState, type ReactNode } from 'react';
import type { Product } from '../data/products';
import { useAuth } from './auth';
import { CartContext, type CartItem } from './cart';

// 1. Prefijo de la clave de persistencia en localStorage.
// Se completa con el correo del usuario para que CADA CUENTA tenga su propio carrito.
// (Clave nueva: los carritos guardados con el formato anterior en español se descartan.)
const CART_STORAGE_PREFIX = "multicatalogo_cart_";

// 2. Tipamos los props del Provider
interface CartProviderProps {
  children: ReactNode;
}

// 3. El Provider (contexto, tipos y hook useCart en ./cart)
export const CartProvider = ({ children }: CartProviderProps) => {
  const { user } = useAuth();

  // Clave de almacenamiento según el usuario autenticado.
  // App.tsx remonta este provider con key={user?.email} al cambiar de cuenta,
  // por lo que el estado siempre se inicializa con el carrito de ESTE usuario.
  const storageKey = user
    ? `${CART_STORAGE_PREFIX}${user.email}`
    : `${CART_STORAGE_PREFIX}anonymous`;

  // Inicializamos el estado leyendo el carrito guardado del usuario actual
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const items = saved ? (JSON.parse(saved) as CartItem[]) : [];
      // Se descartan ítems guardados antes de que el producto incluyera stock
      return items.filter((item) => typeof item.stock === "number");
    } catch {
      return [];
    }
  });

  // Persistimos el carrito del usuario en cada cambio (Tema 5: carrito persistente)
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  }, [cart, storageKey]);

  // Unidades de un producto que ya están en el carrito
  const getQuantityInCart = (id: number) =>
    cart.find((item) => item.id === id)?.quantity ?? 0;

  // Agrega una unidad si hay stock disponible. Devuelve false si se alcanzó el stock.
  // Es solo un aviso temprano: la base de datos vuelve a validar al confirmar el pedido.
  const addToCart = (product: Product): boolean => {
    if (getQuantityInCart(product.id) >= product.stock) return false;

    setCart((prevCart) => {
      const itemExists = prevCart.find((item) => item.id === product.id);
      if (itemExists) {
        return prevCart.map((item) =>
          item.id === product.id
            ? { ...item, stock: product.stock, quantity: Math.min(item.quantity + 1, product.stock) }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
    return true;
  };

  const removeFromCart = (id: number) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  const incrementQuantity = (id: number) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        // No se supera el stock conocido del producto
        item.id === id && item.quantity < item.stock
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  const decrementQuantity = (id: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0) // si llega a 0, se elimina
    );
  };

  // Vacía el carrito tras confirmar el pedido
  const clearCart = () => {
    setCart([]);
  };

  const replaceCart = (items: CartItem[]) => {
    setCart(items);
  };

  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
  const totalPrice = cart.reduce((total, item) => total + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        getQuantityInCart,
        incrementQuantity,
        decrementQuantity,
        clearCart,
        replaceCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};