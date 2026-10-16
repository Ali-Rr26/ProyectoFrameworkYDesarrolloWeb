import { apiFetch } from './apiClient';

// Cuerpo de POST /api/checkout. El comprador NO se envía: el backend lo toma del JWT,
// y el precio tampoco: se lee de la base de datos.
export interface CreateOrderPayload {
  payment_method: string;
  shipping_address: string;
  city: string;
  phone: string;
  items: { product_id: number; quantity: number }[];
}

// Respuesta del backend tras registrar el pedido.
export interface CreatedOrder {
  id: number;
  created_at: string;
  total: number;
  items: { product_id: number; name: string; quantity: number; unit_price: number }[];
}

export const createOrder = (order: CreateOrderPayload): Promise<CreatedOrder> =>
  apiFetch<CreatedOrder>('/api/checkout', { method: 'POST', body: order });

// Catálogo de métodos de pago (tabla payment_methods).
export const getPaymentMethods = (): Promise<string[]> => apiFetch<string[]>('/api/payment-methods');
