// Precarga de datos privados para verlos sin conexión (Fase 8). Las instantáneas solo se
// guardaban al abrir cada vista con red; ahora, al iniciar sesión y al volver la conexión,
// se guarda la primera página de cada vista del rol con la misma consulta que hace la vista
// al abrirse. Las páginas siguientes, los filtros, las búsquedas y el detalle de cada
// pedido se siguen guardando al consultarlos con red.
import type { Role } from '../context/auth';
import { myCommissionsPath } from '../services/commissionService';
import { NETWORK_PATH } from '../services/networkService';
import { myOrdersPath, ordersPath } from '../services/orderService';
import {
  ADMIN_ORDERS_PAGE_SIZE,
  ADMIN_PAYOUTS_PAGE_SIZE,
  ADMIN_PRODUCTS_PAGE_SIZE,
  ADMIN_USERS_PAGE_SIZE,
  MY_COMMISSIONS_PAGE_SIZE,
  MY_ORDERS_PAGE_SIZE,
  MY_PAYOUTS_PAGE_SIZE,
} from '../services/pageSizes';
import { myPayoutsPath, payoutsPath, PENDING_DEBTS_PATH } from '../services/payoutService';
import { adminProductsPath } from '../services/productService';
import { prefetchSnapshot } from '../services/snapshotClient';
import { usersPath } from '../services/userService';

// Consultas que abre cada rol en su primera visita a cada vista del menú.
export const privatePrefetchPaths = (role: Role): string[] => {
  const common = [myOrdersPath(1, MY_ORDERS_PAGE_SIZE), NETWORK_PATH];
  if (role === 'admin') {
    return [
      ...common,
      ordersPath(1, ADMIN_ORDERS_PAGE_SIZE, ''),
      PENDING_DEBTS_PATH,
      payoutsPath(1, ADMIN_PAYOUTS_PAGE_SIZE),
      adminProductsPath(1, ADMIN_PRODUCTS_PAGE_SIZE, ''),
      usersPath(1, ADMIN_USERS_PAGE_SIZE, ''),
    ];
  }
  // "Mi Red" del distribuidor incluye sus comisiones y sus cobros.
  return [...common, myCommissionsPath(1, MY_COMMISSIONS_PAGE_SIZE), myPayoutsPath(1, MY_PAYOUTS_PAGE_SIZE)];
};

// Fallos silenciosos (allSettled): cada vista vuelve a pedir sus datos al abrirse.
export const prefetchPrivateViews = async (role: Role): Promise<void> => {
  await Promise.allSettled(privatePrefetchPaths(role).map((path) => prefetchSnapshot(path)));
};
