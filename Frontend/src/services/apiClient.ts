import { API_URL } from '../data/constants';

// 1. Token JWT en memoria del módulo: lo fija AuthContext al iniciar/cerrar sesión.
// Así los servicios (funciones fuera de React) pueden adjuntarlo sin recibirlo por parámetro.
let authToken: string | null = null;

// 2. Acción a ejecutar cuando el backend rechaza el token (expirado o inválido): cerrar sesión.
let unauthorizedHandler: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

// 3. Error tipado con el formato APIError del backend: { status, message, details }
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// 4. Fallo de red: la petición no llegó a recibir respuesta (sin conexión, servidor caído,
// CORS). Se distingue de ApiError (el servidor sí respondió con un error): una escritura
// que falla por red se puede guardar en el outbox y reenviar con la misma Idempotency-Key.
export class NetworkError extends Error {
  constructor(message = 'Sin conexión con el servidor') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  // auth=false para rutas públicas (login, catálogo): no envía token ni dispara el cierre de sesión.
  auth?: boolean;
  // Cabeceras adicionales (p. ej. Idempotency-Key en las escrituras reintentables).
  headers?: Record<string, string>;
}

// 5. Cliente HTTP único: agrega JSON, cabecera Authorization y traduce errores.
export const apiFetch = async <T>(
  path: string,
  { method = 'GET', body, auth = true, headers: extraHeaders = {} }: ApiOptions = {},
): Promise<T> => {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && authToken) headers['Authorization'] = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch solo rechaza cuando no hubo respuesta HTTP.
    throw new NetworkError();
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    // Token rechazado en una ruta protegida: la sesión ya no es válida.
    if (response.status === 401 && auth) {
      unauthorizedHandler?.();
    }
    throw new ApiError(response.status, data?.message ?? 'Error de comunicación con el servidor', data?.details);
  }

  return response.json() as Promise<T>;
};

// Cabecera de idempotencia (opcional) de las escrituras que la PWA puede reintentar.
export const idempotencyHeaders = (key?: string): Record<string, string> =>
  key ? { 'Idempotency-Key': key } : {};

// Query string de los listados paginados (?page&limit) con filtros opcionales; los
// filtros vacíos no se envían (el backend los interpreta como "sin filtro").
export const listQuery = (page: number, limit: number, filters: Record<string, string | undefined> = {}): string => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const [name, value] of Object.entries(filters)) {
    if (value) params.set(name, value);
  }
  return params.toString();
};
