import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfflineDB, type OutboxEntry } from './db';
import { recordConflict } from './outbox';
import { discardEntry, requeueEntry } from './resolve';

const conflicted = (): OutboxEntry => ({
  id: crypto.randomUUID(),
  userId: 'admin@correo.com',
  type: 'order:status',
  method: 'PATCH',
  path: '/api/orders/10/status',
  payload: { status: 'cancelled', from_status: 'pending' },
  label: 'Cancelar pedido MC-000010',
  status: 'conflict',
  attempts: 2,
  lastError: 'El pedido cambió de estado mientras tanto',
  details: { status: 'preparing' },
  nextAttemptAt: '2026-10-22T12:00:00Z',
  createdAt: '2026-10-22T11:00:00Z',
});

let database: OfflineDB;

beforeEach(() => {
  database = new OfflineDB(`test-resolve-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('requeueEntry', () => {
  it('vuelve a la cola con el cuerpo corregido, sin errores ni intentos previos y con el mismo id', async () => {
    const entry = conflicted();
    await database.outbox.add(entry);

    await requeueEntry(entry.id, { payload: { status: 'cancelled', from_status: 'preparing' } }, database);

    const saved = await database.outbox.get(entry.id);
    expect(saved).toMatchObject({
      id: entry.id,
      status: 'pending',
      attempts: 0,
      payload: { status: 'cancelled', from_status: 'preparing' },
    });
    expect(saved?.lastError).toBeUndefined();
    expect(saved?.details).toBeUndefined();
    expect(saved?.nextAttemptAt).toBeUndefined();
  });

  it('sin cambios reintenta el mismo cuerpo', async () => {
    const entry = { ...conflicted(), status: 'failed' as const };
    await database.outbox.add(entry);

    await requeueEntry(entry.id, {}, database);

    expect(await database.outbox.get(entry.id)).toMatchObject({ status: 'pending', payload: entry.payload });
  });

  it('ignora un registro que ya no existe', async () => {
    await expect(requeueEntry('no-existe', {}, database)).resolves.toBeUndefined();
  });
});

describe('discardEntry', () => {
  it('borra el registro', async () => {
    const entry = conflicted();
    await database.outbox.add(entry);

    await discardEntry(entry.id, database);

    expect(await database.outbox.get(entry.id)).toBeUndefined();
  });
});

describe('recordConflict', () => {
  it('guarda la edición rechazada en línea como conflicto con el detalle del servidor', async () => {
    const entry = await recordConflict(
      {
        userId: 'admin@correo.com',
        type: 'product:update',
        method: 'PUT',
        path: '/api/products/1',
        payload: { price: 50, version: 1 },
        baseVersion: 1,
        label: 'Editar "Sérum"',
      },
      'El producto fue modificado mientras lo editabas',
      { id: 1, version: 2 },
      database,
    );

    expect(await database.outbox.get(entry.id)).toMatchObject({
      status: 'conflict',
      details: { id: 1, version: 2 },
      lastError: 'El producto fue modificado mientras lo editabas',
    });
  });
});
