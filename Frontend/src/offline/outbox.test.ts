import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../services/apiClient';
import { OfflineDB } from './db';
import { enqueue, sendOrQueue, userOutbox, type OutboxInput } from './outbox';

const input: Omit<OutboxInput, 'id'> = {
  userId: 'ana@correo.com',
  type: 'checkout',
  method: 'POST',
  path: '/api/checkout',
  payload: { items: [{ product_id: 1, quantity: 2 }] },
  label: 'Pedido de 2 productos ($20.00)',
};

let database: OfflineDB;

beforeEach(() => {
  database = new OfflineDB(`test-outbox-${crypto.randomUUID()}`);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await database.delete();
});

describe('enqueue', () => {
  it('guarda el registro pendiente con un UUID como Idempotency-Key', async () => {
    const entry = await enqueue(input, database);

    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry).toMatchObject({ status: 'pending', attempts: 0, userId: 'ana@correo.com' });
    expect(await database.outbox.get(entry.id)).toEqual(entry);
  });

  it('respeta la clave recibida (petición que ya salió con ella)', async () => {
    const entry = await enqueue({ ...input, id: 'clave-previa' }, database);
    expect(entry.id).toBe('clave-previa');
  });
});

describe('sendOrQueue', () => {
  it('con red envía con una Idempotency-Key y no guarda nada', async () => {
    const send = vi.fn(async (key: string) => ({ id: 9, key }));

    const outcome = await sendOrQueue(input, send, database);

    expect(outcome.status).toBe('sent');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await database.outbox.count()).toBe(0);
  });

  it('si la red cae a mitad del envío guarda el registro con la MISMA clave', async () => {
    let usedKey = '';
    const send = vi.fn(async (key: string) => {
      usedKey = key;
      throw new NetworkError();
    });

    const outcome = await sendOrQueue(input, send, database);

    expect(outcome.status).toBe('queued');
    expect(outcome.status === 'queued' && outcome.entry.id).toBe(usedKey);
  });

  it('sin conexión guarda directamente, sin intentar enviar', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const send = vi.fn();

    const outcome = await sendOrQueue(input, send, database);

    expect(outcome.status).toBe('queued');
    expect(send).not.toHaveBeenCalled();
  });

  it('propaga los errores del servidor sin guardar (se resuelven en el momento)', async () => {
    const send = vi.fn(async () => {
      throw new ApiError(409, 'Stock insuficiente');
    });

    await expect(sendOrQueue(input, send, database)).rejects.toBeInstanceOf(ApiError);
    expect(await database.outbox.count()).toBe(0);
  });
});

describe('userOutbox', () => {
  it('devuelve solo los registros del usuario en orden de creación', async () => {
    const first = await enqueue(input, database);
    await enqueue({ ...input, userId: 'luis@correo.com' }, database);
    const second = await enqueue({ ...input, label: 'segundo' }, database);

    expect((await userOutbox('ana@correo.com', database)).map((e) => e.id)).toEqual([first.id, second.id]);
  });
});
