// Carrito a partir de un pedido rechazado (stock, precio o producto dado de baja), con el
// catálogo vigente: primero se refresca la copia local y luego se reconstruye (rebuildCart).
import { refreshCatalog } from './catalogStore';
import { rebuildCart, type CartRebuild, type OrderLine } from './conflicts';
import { db } from './db';

export const recoverCart = async (lines: OrderLine[]): Promise<CartRebuild> => {
  // Sin red se usa la última copia local: el servidor volverá a validar al confirmar.
  await refreshCatalog().catch(() => undefined);
  return rebuildCart(lines, await db.products.toArray());
};
