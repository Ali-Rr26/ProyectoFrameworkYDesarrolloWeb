import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { PWA_IDENTITY } from './pwa';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

describe('PWA_IDENTITY', () => {
  it('usa colores hexadecimales válidos para el manifest', () => {
    expect(PWA_IDENTITY.themeColor).toMatch(HEX_COLOR);
    expect(PWA_IDENTITY.backgroundColor).toMatch(HEX_COLOR);
  });

  it('mantiene start_url dentro del scope', () => {
    expect(PWA_IDENTITY.startUrl.startsWith(PWA_IDENTITY.scope)).toBe(true);
  });

  it('coincide con el theme-color y el idioma de index.html', () => {
    expect(indexHtml).toContain(`<meta name="theme-color" content="${PWA_IDENTITY.themeColor}" />`);
    expect(indexHtml).toContain(`<html lang="${PWA_IDENTITY.lang}">`);
  });
});

describe('entorno de pruebas', () => {
  it('expone IndexedDB en memoria (fake-indexeddb)', () => {
    expect(globalThis.indexedDB).toBeDefined();
  });
});
