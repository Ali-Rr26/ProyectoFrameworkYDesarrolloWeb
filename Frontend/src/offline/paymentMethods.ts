// Métodos de pago con copia local: el checkout los necesita también sin conexión.
// La lista no es un dato privado del usuario (es la misma para todos), por eso se
// guarda en `meta` y no se borra al cerrar sesión.
import { getPaymentMethods } from '../services/orderService';
import { db, type OfflineDB } from './db';

export const PAYMENT_METHODS_KEY = 'paymentMethods';

// Red primero; si falla, la última lista guardada. Sin red y sin copia, propaga el error.
export const loadPaymentMethods = async (
  fetchMethods: () => Promise<string[]> = getPaymentMethods,
  database: OfflineDB = db,
): Promise<string[]> => {
  try {
    const methods = await fetchMethods();
    await database.meta.put({ key: PAYMENT_METHODS_KEY, value: JSON.stringify(methods) }).catch(() => undefined);
    return methods;
  } catch (err) {
    const saved = await database.meta.get(PAYMENT_METHODS_KEY).catch(() => undefined);
    if (!saved) throw err;
    return JSON.parse(saved.value) as string[];
  }
};
