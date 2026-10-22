import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfflineDB } from './db';
import { ANONYMOUS_OWNER, clearDraft, draftOwner, loadDraft, omitKeys, saveDraft } from './drafts';

let database: OfflineDB;

beforeEach(() => {
  database = new OfflineDB(`test-drafts-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('draftOwner', () => {
  it('normaliza el correo y usa "anonymous" sin sesión', () => {
    expect(draftOwner('  Ana@Correo.COM ')).toBe('ana@correo.com');
    expect(draftOwner(null)).toBe(ANONYMOUS_OWNER);
    expect(draftOwner(undefined)).toBe(ANONYMOUS_OWNER);
  });
});

describe('omitKeys', () => {
  it('quita los campos excluidos', () => {
    expect(omitKeys({ name: 'Ana', password: 'secreta', city: 'Quito' }, ['password'])).toEqual({
      name: 'Ana',
      city: 'Quito',
    });
  });
});

describe('borradores', () => {
  it('guarda, carga y borra un borrador', async () => {
    await saveDraft('ana@correo.com', 'checkout', { city: 'Quito' }, database);
    expect(await loadDraft('ana@correo.com', 'checkout', database)).toEqual({ city: 'Quito' });

    await clearDraft('ana@correo.com', 'checkout', database);
    expect(await loadDraft('ana@correo.com', 'checkout', database)).toBeUndefined();
  });

  it('separa los borradores por usuario y por formulario', async () => {
    await saveDraft('ana@correo.com', 'checkout', { city: 'Quito' }, database);
    await saveDraft('luis@correo.com', 'checkout', { city: 'Cuenca' }, database);
    await saveDraft('ana@correo.com', 'product:new', { name: 'Labial' }, database);

    expect(await loadDraft('luis@correo.com', 'checkout', database)).toEqual({ city: 'Cuenca' });
    expect(await loadDraft('ana@correo.com', 'product:new', database)).toEqual({ name: 'Labial' });
  });

  it('sobrescribe el borrador anterior del mismo formulario', async () => {
    await saveDraft('ana@correo.com', 'checkout', { city: 'Quito' }, database);
    await saveDraft('ana@correo.com', 'checkout', { city: 'Loja' }, database);

    expect(await database.drafts.count()).toBe(1);
    expect(await loadDraft('ana@correo.com', 'checkout', database)).toEqual({ city: 'Loja' });
  });
});
