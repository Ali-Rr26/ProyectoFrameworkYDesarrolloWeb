// Pedidos tal como los entrega la API, y las reglas puras de su ciclo de vida
// (mismas transiciones que models/orders.go del backend).

export type OrderStatus = 'pending' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'preparing', 'shipped', 'delivered', 'cancelled'];

// Texto visible de cada estado
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  preparing: 'Preparando',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

// Estilo de la etiqueta de cada estado
export const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  preparing: 'bg-cyan-100 text-cyan-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-200 text-slate-600',
};

// Texto del botón que lleva a cada estado (panel del admin)
export const STATUS_ACTIONS: Record<OrderStatus, string> = {
  pending: 'Volver a pendiente',
  preparing: 'Marcar en preparación',
  shipped: 'Marcar enviado',
  delivered: 'Marcar entregado',
  cancelled: 'Cancelar pedido',
};

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

// Estados a los que puede pasar un pedido (función pura)
export const nextStatuses = (status: OrderStatus): OrderStatus[] => TRANSITIONS[status] ?? [];

// Respuesta paginada estándar de la API
export interface Page<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface OrderSummary {
  id: number;
  created_at: string;
  status: OrderStatus;
  total: number;
  items_count: number;
  buyer_id: number;
  buyer_name: string;
  buyer_email: string;
}

export interface OrderDetail extends OrderSummary {
  payment_method: string;
  shipping_address: string;
  city: string;
  phone: string;
  items: { product_id: number; name: string; quantity: number; unit_price: number }[];
  next_statuses: OrderStatus[];
}

// Número visible del pedido (el mismo formato que muestra la confirmación)
export const orderNumber = (id: number): string => `MC-${id.toString().padStart(6, '0')}`;
