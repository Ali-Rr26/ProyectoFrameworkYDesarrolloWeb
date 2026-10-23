// Política de reintentos del outbox: funciones puras que deciden qué hacer con un
// registro cuyo envío falló. Se prueban sin red ni navegador.
import { ApiError, NetworkError } from '../services/apiClient';

export const BASE_RETRY_MS = 5_000;
export const MAX_RETRY_MS = 60 * 60 * 1000;

// Espera antes del intento número `attempts` (1, 2, 3...): exponencial desde 5 s con tope
// de 1 h y jitter (50 %–100 %) para que muchos dispositivos no reintenten a la vez.
export const backoffDelay = (attempts: number, random: () => number = Math.random): number => {
  const exponential = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exponential * (0.5 + random() * 0.5));
};

export type SyncOutcome =
  // Fallo transitorio (sin red, servidor caído, 5xx, operación en curso): reintentar.
  | { kind: 'retry'; delayMs: number; message: string }
  // Sesión vencida (401): se espera a que el mismo usuario vuelva a iniciar sesión.
  | { kind: 'pause'; message: string }
  // 409 de datos (stock, precio, versión, estado): lo resuelve el usuario (Fase 7).
  | { kind: 'conflict'; message: string; details?: unknown }
  // 400/403/404/422: el registro no es válido tal como está; requiere corrección.
  | { kind: 'failed'; message: string; details?: unknown };

// El backend marca con details.retryable el 409 de "operación en curso" (misma
// Idempotency-Key procesándose): no es un conflicto de datos.
const isRetryableConflict = (details: unknown): boolean =>
  typeof details === 'object' && details !== null && (details as { retryable?: unknown }).retryable === true;

export const classifySyncError = (
  err: unknown,
  attempts: number,
  random: () => number = Math.random,
): SyncOutcome => {
  const retry = (message: string): SyncOutcome => ({ kind: 'retry', delayMs: backoffDelay(attempts, random), message });

  if (err instanceof NetworkError) return retry(err.message);
  if (!(err instanceof ApiError)) return { kind: 'failed', message: 'Error inesperado al enviar' };

  if (err.status === 401) return { kind: 'pause', message: 'Inicia sesión para enviar los pendientes' };
  if (err.status === 409 && isRetryableConflict(err.details)) return retry(err.message);
  if (err.status === 409) return { kind: 'conflict', message: err.message, details: err.details };
  if (err.status === 408 || err.status === 429 || err.status >= 500) return retry(err.message);
  return { kind: 'failed', message: err.message, details: err.details };
};
