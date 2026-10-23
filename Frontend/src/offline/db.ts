// Base de datos local (IndexedDB con Dexie): lo que la app necesita sin conexión.
// - products: copia del catálogo público (sin datos privados).
// - meta:     marcas de sincronización (p. ej. catalogSyncedAt).
// - drafts:   borradores de formularios, por usuario.
// - outbox:   registros pendientes de enviar al servidor, por usuario (se usa en la Fase 6).
//
// Para cambiar el esquema se agrega un nuevo `this.version(n)` (nunca se edita uno publicado).
import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Product } from '../data/products';

// Producto del catálogo local: `position` conserva el orden en que lo entregó el servidor.
export interface LocalProduct extends Product {
  position: number;
}

export interface MetaEntry {
  key: string;
  value: string;
}

export interface DraftEntry {
  userId: string;
  formKey: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

export type OutboxStatus = 'pending' | 'syncing' | 'done' | 'conflict' | 'failed';

// Operaciones que se pueden guardar sin conexión (D8).
export type OutboxType = 'checkout' | 'product:create' | 'product:update' | 'order:status';

// Registro pendiente: su `id` viaja al backend como Idempotency-Key.
// Los campos sin índice (label, result, details...) no requieren cambiar el esquema.
export interface OutboxEntry {
  id: string;
  userId: string;
  type: OutboxType;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  payload: unknown;
  baseVersion?: number;
  // Valores del recurso cuando se empezó a editar (edición de producto): permiten la
  // combinación a tres bandas de un conflicto (qué cambié yo y qué cambió el servidor).
  base?: unknown;
  // Texto para el usuario: "Pedido de 3 productos ($45.00)".
  label: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  // Detalle del 409/422 del servidor (producto vigente, total vigente...) para la Fase 7.
  details?: unknown;
  nextAttemptAt?: string;
  // Respuesta del servidor al enviarse (p. ej. el pedido creado con su número).
  result?: unknown;
  completedAt?: string;
  createdAt: string;
}

export class OfflineDB extends Dexie {
  declare products: EntityTable<LocalProduct, 'id'>;
  declare meta: EntityTable<MetaEntry, 'key'>;
  declare drafts: Table<DraftEntry, [string, string]>;
  declare outbox: EntityTable<OutboxEntry, 'id'>;

  constructor(name = 'multicatalogo') {
    super(name);
    this.version(1).stores({
      products: 'id, position',
      meta: 'key',
      drafts: '[userId+formKey], userId',
      outbox: 'id, userId, status, createdAt, [userId+status]',
    });
  }
}

export const db = new OfflineDB();
