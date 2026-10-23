import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../services/apiClient';
import { BASE_RETRY_MS, MAX_RETRY_MS, backoffDelay, classifySyncError } from './syncPolicy';

const noJitter = () => 1; // factor 0.5 + 1 * 0.5 = 1 (espera completa)

describe('backoffDelay', () => {
  it('crece exponencialmente desde 5 s', () => {
    expect(backoffDelay(1, noJitter)).toBe(BASE_RETRY_MS);
    expect(backoffDelay(2, noJitter)).toBe(BASE_RETRY_MS * 2);
    expect(backoffDelay(4, noJitter)).toBe(BASE_RETRY_MS * 8);
  });

  it('nunca supera 1 hora', () => {
    expect(backoffDelay(30, noJitter)).toBe(MAX_RETRY_MS);
  });

  it('aplica jitter entre el 50 % y el 100 %', () => {
    expect(backoffDelay(3, () => 0)).toBe(BASE_RETRY_MS * 4 * 0.5);
    expect(backoffDelay(3, () => 0.5)).toBe(BASE_RETRY_MS * 4 * 0.75);
  });
});

describe('classifySyncError', () => {
  const classify = (err: unknown) => classifySyncError(err, 1, noJitter);

  it('reintenta ante falta de red y errores del servidor', () => {
    expect(classify(new NetworkError()).kind).toBe('retry');
    expect(classify(new ApiError(500, 'Error interno')).kind).toBe('retry');
    expect(classify(new ApiError(503, 'Base de datos no respondió')).kind).toBe('retry');
    expect(classify(new ApiError(429, 'Demasiadas peticiones')).kind).toBe('retry');
  });

  it('reintenta el 409 de "operación en curso" (retryable)', () => {
    const outcome = classify(new ApiError(409, 'Esta operación ya se está procesando', { retryable: true }));
    expect(outcome).toEqual({ kind: 'retry', delayMs: BASE_RETRY_MS, message: 'Esta operación ya se está procesando' });
  });

  it('pausa con la sesión vencida (401)', () => {
    expect(classify(new ApiError(401, 'Token inválido o expirado')).kind).toBe('pause');
  });

  it('marca conflicto ante un 409 de datos, con su detalle', () => {
    const details = { expected_total: 40, total: 50 };
    expect(classify(new ApiError(409, 'Los precios cambiaron', details))).toEqual({
      kind: 'conflict',
      message: 'Los precios cambiaron',
      details,
    });
    expect(classify(new ApiError(409, 'Stock insuficiente', 'producto 3')).kind).toBe('conflict');
  });

  it('marca fallido lo que requiere corrección (400, 403, 404, 422) o es inesperado', () => {
    for (const status of [400, 403, 404, 422]) {
      expect(classify(new ApiError(status, 'Datos inválidos')).kind).toBe('failed');
    }
    expect(classify(new Error('boom')).kind).toBe('failed');
  });
});
