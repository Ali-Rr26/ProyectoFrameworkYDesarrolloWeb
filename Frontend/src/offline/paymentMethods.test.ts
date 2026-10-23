import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfflineDB } from './db';
import { loadPaymentMethods } from './paymentMethods';

const METHODS = ['Tarjeta de crédito', 'Transferencia bancaria'];
const offline = async (): Promise<string[]> => Promise.reject(new TypeError('Failed to fetch'));

let database: OfflineDB;

beforeEach(() => {
  database = new OfflineDB(`test-payments-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('loadPaymentMethods', () => {
  it('con red devuelve la lista del servidor y la guarda', async () => {
    expect(await loadPaymentMethods(async () => METHODS, database)).toEqual(METHODS);
    expect(await loadPaymentMethods(offline, database)).toEqual(METHODS);
  });

  it('sin red y sin copia guardada propaga el error', async () => {
    await expect(loadPaymentMethods(offline, database)).rejects.toThrow('Failed to fetch');
  });
});
