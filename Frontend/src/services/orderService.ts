import type { OrderDetail, OrderStatus, OrderSummary, Page } from '../data/orders';
import { apiFetch, idempotencyHeaders, listQuery } from './apiClient';

// Cuerpo de POST /api/checkout. El comprador NO se envía: el backend lo toma del JWT,
// y el precio tampoco: se lee de la base de datos.
export interface CreateOrderPayload {
  payment_method: string;
  shipping_address: string;
  city: string;
  phone: string;
  items: { product_id: number; quantity: number }[];
  // Total que vio el cliente (pedidos guardados sin conexión): si los precios cambiaron,
  // el servidor responde 409 en lugar de cobrar otro monto.
  expected_total?: number;
}

// Respuesta del backend tras registrar el pedido.
export interface CreatedOrder {
  id: number;
  created_at: string;
  status: OrderStatus;
  total: number;
  items: { product_id: number; name: string; quantity: number; unit_price: number }[];
}

export const createOrder = (order: CreateOrderPayload, idempotencyKey?: string): Promise<CreatedOrder> =>
  apiFetch<CreatedOrder>('/api/checkout', { method: 'POST', body: order, headers: idempotencyHeaders(idempotencyKey) });

// Catálogo de métodos de pago (tabla payment_methods).
export const getPaymentMethods = (): Promise<string[]> => apiFetch<string[]>('/api/payment-methods');

// Arma el query string de un listado paginado (?page=&limit=&status=).
// Pedidos del usuario autenticado (el comprador sale del token).
export const getMyOrders = (page: number, limit: number): Promise<Page<OrderSummary>> =>
  apiFetch<Page<OrderSummary>>(`/api/orders/mine?${listQuery(page, limit)}`);

// Detalle de un pedido: el dueño o un admin.
export const getOrder = (id: number): Promise<OrderDetail> => apiFetch<OrderDetail>(`/api/orders/${id}`);

// ===== Solo administrador =====

export const getOrders = (page: number, limit: number, status: OrderStatus | ''): Promise<Page<OrderSummary>> =>
  apiFetch<Page<OrderSummary>>(`/api/orders?${listQuery(page, limit, { status })}`);

// Cambia el estado; "cancelled" repone el stock y revierte las comisiones. fromStatus es el
// estado que vio el admin: si otro lo cambió mientras tanto, el servidor responde 409.
export interface OrderStatusPayload {
  status: OrderStatus;
  from_status?: OrderStatus;
}

export const updateOrderStatus = (id: number, change: OrderStatusPayload, idempotencyKey?: string): Promise<OrderDetail> =>
  apiFetch<OrderDetail>(`/api/orders/${id}/status`, { method: 'PATCH', body: change, headers: idempotencyHeaders(idempotencyKey) });
