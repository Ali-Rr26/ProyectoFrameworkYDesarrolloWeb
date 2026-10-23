import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../services/apiClient';
import { OfflineDB } from './db';
import {
  OFFLINE_NO_DATA_MESSAGE,
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_MAX_ENTRIES,
  withSnapshot,
} from './snapshots';
import { clearSnapshotUsage, getSnapshotUsage, markSnapshotFresh, markSnapshotUsed } from './snapshotStatus';
import { clearUserData } from './userData';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const USER = 'ana@correo.com';
const KEY = '/api/orders/mine?page=1&limit=10';

let database: OfflineDB;
const options = (now = NOW) => ({ database, now: () => now });
const offline = async (): Promise<never> => Promise.reject(new NetworkError());

beforeEach(() => {
  database = new OfflineDB(`test-snapshots-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('withSnapshot', () => {
  it('con red devuelve la respuesta y la guarda para el usuario', async () => {
    const result = await withSnapshot(USER, KEY, async () => ({ total: 3 }), options());

    expect(result).toEqual({ data: { total: 3 } });
    expect(await database.snapshots.get([USER, KEY])).toMatchObject({
      data: { total: 3 },
      savedAt: new Date(NOW).toISOString(),
    });
  });

  it('sin red devuelve la instantánea con su fecha', async () => {
    await withSnapshot(USER, KEY, async () => ({ total: 3 }), options());

    const result = await withSnapshot(USER, KEY, offline, options(NOW + 60_000));

    expect(result).toEqual({ data: { total: 3 }, savedAt: new Date(NOW).toISOString() });
  });

  it('sin red y sin instantánea dice "Requiere conexión"', async () => {
    await expect(withSnapshot(USER, KEY, offline, options())).rejects.toThrow(OFFLINE_NO_DATA_MESSAGE);
  });

  it('no comparte instantáneas entre usuarios', async () => {
    await withSnapshot(USER, KEY, async () => ({ total: 3 }), options());

    await expect(withSnapshot('luis@correo.com', KEY, offline, options())).rejects.toThrow(OFFLINE_NO_DATA_MESSAGE);
  });

  it('descarta la instantánea vencida (más de 7 días)', async () => {
    await withSnapshot(USER, KEY, async () => ({ total: 3 }), options());

    await expect(withSnapshot(USER, KEY, offline, options(NOW + SNAPSHOT_MAX_AGE_MS + 1))).rejects.toThrow(
      OFFLINE_NO_DATA_MESSAGE,
    );
    expect(await database.snapshots.get([USER, KEY])).toBeUndefined();
  });

  it('ante 401 no usa la instantánea y borra las del usuario', async () => {
    await withSnapshot(USER, KEY, async () => ({ total: 3 }), options());
    await withSnapshot(USER, '/api/network', async () => ({ id: 1 }), options());
    await withSnapshot('luis@correo.com', KEY, async () => ({ total: 1 }), options());

    await expect(
      withSnapshot(USER, KEY, async () => Promise.reject(new ApiError(401, 'Token inválido o expirado')), options()),
    ).rejects.toMatchObject({ status: 401 });
    expect(await database.snapshots.where('userId').equals(USER).count()).toBe(0);
    expect(await database.snapshots.where('userId').equals('luis@correo.com').count()).toBe(1);
  });

  it('ante 403 no usa la instantánea (pero la conserva)', async () => {
    await withSnapshot(USER, KEY, async () => ({ total: 3 }), options());

    await expect(
      withSnapshot(USER, KEY, async () => Promise.reject(new ApiError(403, 'Sin permisos')), options()),
    ).rejects.toMatchObject({ status: 403 });
    expect(await database.snapshots.get([USER, KEY])).toBeDefined();
  });

  it('conserva como máximo SNAPSHOT_MAX_ENTRIES por usuario, borrando las más viejas', async () => {
    await database.snapshots.bulkAdd(
      Array.from({ length: SNAPSHOT_MAX_ENTRIES }, (_, i) => ({
        userId: USER,
        key: `/api/orders/mine?page=${i + 1}`,
        data: i,
        savedAt: new Date(NOW - (SNAPSHOT_MAX_ENTRIES - i) * 1000).toISOString(),
      })),
    );

    await withSnapshot(USER, '/api/network', async () => ({ id: 1 }), options());

    expect(await database.snapshots.where('userId').equals(USER).count()).toBe(SNAPSHOT_MAX_ENTRIES);
    expect(await database.snapshots.get([USER, '/api/orders/mine?page=1'])).toBeUndefined();
    expect(await database.snapshots.get([USER, '/api/network'])).toBeDefined();
  });

  it('propaga errores inesperados sin usar la instantánea', async () => {
    const boom = vi.fn(async () => Promise.reject(new Error('boom')));
    await expect(withSnapshot(USER, KEY, boom, options())).rejects.toThrow('boom');
  });
});

describe('clearUserData', () => {
  it('borra también las instantáneas del usuario al cerrar sesión', async () => {
    await withSnapshot(USER, KEY, async () => ({ total: 3 }), options());

    await clearUserData(USER, database);

    expect(await database.snapshots.count()).toBe(0);
  });
});

describe('snapshotStatus', () => {
  afterEach(() => clearSnapshotUsage());

  it('registra qué consultas de una página vienen de una instantánea', () => {
    markSnapshotUsed(KEY, '2026-10-22T10:00:00Z', '/my-orders');
    markSnapshotUsed(KEY, '2026-10-22T11:00:00Z', '/my-orders');

    expect(getSnapshotUsage()).toEqual([{ key: KEY, path: '/my-orders', savedAt: '2026-10-22T11:00:00Z' }]);
  });

  it('deja de marcarla cuando vuelve a responder con red', () => {
    markSnapshotUsed(KEY, '2026-10-22T10:00:00Z', '/my-orders');

    markSnapshotFresh(KEY);

    expect(getSnapshotUsage()).toEqual([]);
  });
});
