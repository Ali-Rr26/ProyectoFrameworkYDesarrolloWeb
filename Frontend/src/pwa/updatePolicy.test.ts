import { describe, expect, it } from 'vitest';
import { detectIOS, shouldOfferReload } from './updatePolicy';

describe('shouldOfferReload', () => {
  it('ofrece recargar cuando hay versión nueva', () => {
    expect(shouldOfferReload(true, '/store', false)).toBe(true);
  });

  it('no lo ofrece sin versión nueva', () => {
    expect(shouldOfferReload(false, '/store', false)).toBe(false);
  });

  it('lo pospone en el checkout y mientras se envían pendientes', () => {
    expect(shouldOfferReload(true, '/checkout', false)).toBe(false);
    expect(shouldOfferReload(true, '/store', true)).toBe(false);
  });
});

describe('detectIOS', () => {
  it('reconoce iPhone y iPad', () => {
    expect(detectIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true);
    expect(detectIOS('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 5)).toBe(true);
  });

  it('reconoce el iPad que se presenta como Mac (pantalla táctil)', () => {
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
  });

  it('no confunde un Mac de escritorio ni Android', () => {
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(detectIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe(false);
  });
});
