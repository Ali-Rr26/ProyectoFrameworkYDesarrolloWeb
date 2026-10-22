import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfflineDB, type OutboxEntry, type OutboxStatus } from './db';
import { saveDraft } from './drafts';
import { clearUserData, countPending } from './userData';

const entry = (userId: string, status: OutboxStatus): OutboxEntry => ({
  id: crypto.randomUUID(),
  userId,
  type: 'checkout',
  method: 'POST',
  path: '/api/checkout',
  payload: {},
  status,
  attempts: 0,
  createdAt: new Date().toISOString(),
});

let database: OfflineDB;

beforeEach(() => {
  database = new OfflineDB(`test-user-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('countPending', () => {
  it('cuenta los registros del usuario que no se han enviado', async () => {
    await database.outbox.bulkAdd([
      entry('ana@correo.com', 'pending'),
      entry('ana@correo.com', 'conflict'),
      entry('ana@correo.com', 'failed'),
      entry('ana@correo.com', 'done'),
      entry('luis@correo.com', 'pending'),
    ]);

    expect(await countPending('ana@correo.com', database)).toBe(3);
  });
});

describe('clearUserData', () => {
  it('borra borradores y pendientes solo del usuario y conserva el catálogo', async () => {
    await saveDraft('ana@correo.com', 'checkout', { city: 'Quito' }, database);
    await saveDraft('luis@correo.com', 'checkout', { city: 'Cuenca' }, database);
    await database.outbox.bulkAdd([entry('ana@correo.com', 'pending'), entry('luis@correo.com', 'pending')]);
    await database.meta.put({ key: 'catalogSyncedAt', value: '2026-10-22T00:00:00Z' });

    await clearUserData('ana@correo.com', database);

    expect(await database.drafts.where('userId').equals('ana@correo.com').count()).toBe(0);
    expect(await database.outbox.where('userId').equals('ana@correo.com').count()).toBe(0);
    expect(await database.drafts.where('userId').equals('luis@correo.com').count()).toBe(1);
    expect(await database.outbox.where('userId').equals('luis@correo.com').count()).toBe(1);
    expect(await database.meta.count()).toBe(1);
  });
});
