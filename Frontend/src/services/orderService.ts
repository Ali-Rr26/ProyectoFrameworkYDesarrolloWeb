import type { OrderDetail, OrderStatus, OrderSummary, Page } from '../data/orders';
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
  status: OrderStatus;
  total: number;
  items: { product_id: number; name: string; quantity: number; unit_price: number }[];
}

export const createOrder = (order: CreateOrderPayload): Promise<CreatedOrder> =>
  apiFetch<CreatedOrder>('/api/checkout', { method: 'POST', body: order });

// Catálogo de métodos de pago (tabla payment_methods).
export const getPaymentMethods = (): Promise<string[]> => apiFetch<string[]>('/api/payment-methods');

// Arma el query string de un listado paginado (?page=&limit=&status=).
const listQuery = (page: number, limit: number, status?: OrderStatus | '') => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set('status', status);
  return params.toString();
};

// Pedidos del usuario autenticado (el comprador sale del token).
export const getMyOrders = (page: number, limit: number): Promise<Page<OrderSummary>> =>
  apiFetch<Page<OrderSummary>>(`/api/orders/mine?${listQuery(page, limit)}`);

// Detalle de un pedido: el dueño o un admin.
export const getOrder = (id: number): Promise<OrderDetail> => apiFetch<OrderDetail>(`/api/orders/${id}`);

// ===== Solo administrador =====

export const getOrders = (page: number, limit: number, status: OrderStatus | ''): Promise<Page<OrderSummary>> =>
  apiFetch<Page<OrderSummary>>(`/api/orders?${listQuery(page, limit, status)}`);

// Cambia el estado; "cancelled" repone el stock y revierte las comisiones.
export const updateOrderStatus = (id: number, status: OrderStatus): Promise<OrderDetail> =>
  apiFetch<OrderDetail>(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } });
