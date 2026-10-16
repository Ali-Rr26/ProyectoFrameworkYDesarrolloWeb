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

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  // auth=false para rutas públicas (login, catálogo): no envía token ni dispara el cierre de sesión.
  auth?: boolean;
}

// 4. Cliente HTTP único: agrega JSON, cabecera Authorization y traduce errores.
export const apiFetch = async <T>(path: string, { method = 'GET', body, auth = true }: ApiOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
