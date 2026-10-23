// Tamaño de página de cada listado privado. Lo comparten las vistas y la precarga offline
// (offline/privatePrefetch.ts): la instantánea se guarda por la ruta exacta, así que la
// primera página precargada solo sirve si coincide con la que pide la vista al abrirse.
export const MY_ORDERS_PAGE_SIZE = 10;
export const MY_COMMISSIONS_PAGE_SIZE = 10;
export const MY_PAYOUTS_PAGE_SIZE = 5;
export const ADMIN_ORDERS_PAGE_SIZE = 10;
export const ADMIN_PAYOUTS_PAGE_SIZE = 10;
export const ADMIN_PRODUCTS_PAGE_SIZE = 10;
export const ADMIN_USERS_PAGE_SIZE = 10;
