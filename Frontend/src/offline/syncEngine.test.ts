import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../services/apiClient';
import { OfflineDB, type OutboxEntry, type OutboxStatus } from './db';
import { DONE_RETENTION_MS, runSync } from './syncEngine';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const USER = 'ana@correo.com';

let database: OfflineDB;
let sequence = 0;

// Registros con createdAt creciente: el orden FIFO es el de creación.
const entry = (overrides: Partial<OutboxEntry> = {}): OutboxEntry => {
  sequence += 1;
  return {
    id: `id-${sequence}`,
    userId: USER,
    type: 'checkout',
    method: 'POST',
    path: '/api/checkout',
    payload: {},
    label: `registro ${sequence}`,
    status: 'pending' as OutboxStatus,
    attempts: 0,
    createdAt: new Date(NOW - 60_000 + sequence * 1000).toISOString(),
    ...overrides,
  };
};

const sync = (send: (e: OutboxEntry) => Promise<unknown>) =>
  runSync(USER, { database, send, now: () => NOW, random: () => 1 });

beforeEach(() => {
  database = new OfflineDB(`test-sync-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('runSync', () => {
  it('envía en orden FIFO, de uno en uno, y guarda la respuesta', async () => {
    const a = entry();
    const b = entry();
    await database.outbox.bulkAdd([b, a]);
    const sent: string[] = [];

    const report = await sync(async (e) => {
      sent.push(e.id);
      return { id: e.id === a.id ? 10 : 11 };
    });

    expect(sent).toEqual([a.id, b.id]);
    expect(report.sent.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(await database.outbox.get(a.id)).toMatchObject({ status: 'done', result: { id: 10 } });
  });

  it('solo envía los registros del usuario con sesión', async () => {
    const mine = entry();
    const other = entry({ userId: 'luis@correo.com' });
    await database.outbox.bulkAdd([mine, other]);
    const send = vi.fn(async () => ({}));

    await sync(send);

    expect(send).toHaveBeenCalledOnce();
    expect((await database.outbox.get(other.id))?.status).toBe('pending');
  });

  it('ante un fallo transitorio programa el reintento y detiene la cola (respeta el orden)', async () => {
    const a = entry();
    const b = entry();
    await database.outbox.bulkAdd([a, b]);
    const send = vi.fn(async () => {
      throw new NetworkError();
    });

    const report = await sync(send);

    expect(send).toHaveBeenCalledOnce();
    const saved = await database.outbox.get(a.id);
    expect(saved).toMatchObject({ status: 'pending', attempts: 1 });
    expect(saved?.nextAttemptAt).toBe(new Date(NOW + 5_000).toISOString());
    expect(report.nextAttemptAt).toBe(saved?.nextAttemptAt);
    expect((await database.outbox.get(b.id))?.attempts).toBe(0);
  });

  it('no envía antes de la hora de reintento', async () => {
    await database.outbox.add(entry({ nextAttemptAt: new Date(NOW + 60_000).toISOString() }));
    const send = vi.fn();

    const report = await sync(send);

    expect(send).not.toHaveBeenCalled();
    expect(report.nextAttemptAt).toBe(new Date(NOW + 60_000).toISOString());
  });

  it('con la sesión vencida (401) pausa sin contar el intento', async () => {
    const a = entry();
    const b = entry();
    await database.outbox.bulkAdd([a, b]);
    const send = vi.fn(async () => {
      throw new ApiError(401, 'Token inválido o expirado');
    });

    const report = await sync(send);

    expect(report.paused).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(await database.outbox.get(a.id)).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('un conflicto o un error de datos marca ese registro y sigue con el siguiente', async () => {
    const conflict = entry();
    const invalid = entry();
    const ok = entry();
    await database.outbox.bulkAdd([conflict, invalid, ok]);
    const details = { expected_total: 40, total: 50 };

    const report = await sync(async (e) => {
      if (e.id === conflict.id) throw new ApiError(409, 'Los precios cambiaron', details);
      if (e.id === invalid.id) throw new ApiError(422, 'Referencia inválida');
      return {};
    });

    expect(await database.outbox.get(conflict.id)).toMatchObject({ status: 'conflict', details, lastError: 'Los precios cambiaron' });
    expect((await database.outbox.get(invalid.id))?.status).toBe('failed');
    expect((await database.outbox.get(ok.id))?.status).toBe('done');
    expect([report.conflicts.length, report.failed.length, report.sent.length]).toEqual([1, 1, 1]);
  });

  it('reenvía un registro que quedó "syncing" (la página se cerró a mitad del envío)', async () => {
    const stuck = entry({ status: 'syncing' });
    await database.outbox.add(stuck);
    const send = vi.fn(async () => ({}));

    await sync(send);

    expect(send).toHaveBeenCalledOnce();
    expect((await database.outbox.get(stuck.id))?.status).toBe('done');
  });

  it('no reenvía conflictos ni fallidos y borra los enviados de hace más de un día', async () => {
    const old = entry({ status: 'done', completedAt: new Date(NOW - DONE_RETENTION_MS - 1).toISOString() });
    const recent = entry({ status: 'done', completedAt: new Date(NOW - 1000).toISOString() });
    const conflict = entry({ status: 'conflict' });
    await database.outbox.bulkAdd([old, recent, conflict]);
    const send = vi.fn();

    await sync(send);

    expect(send).not.toHaveBeenCalled();
    expect(await database.outbox.get(old.id)).toBeUndefined();
    expect(await database.outbox.get(recent.id)).toBeDefined();
  });
});
