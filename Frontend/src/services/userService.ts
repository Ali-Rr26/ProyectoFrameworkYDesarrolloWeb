import type { Page } from '../data/orders';
import type { RegisterPayload, UpdateUserPayload, UserAccount } from '../data/users';
import { apiFetch, listQuery } from './apiClient';

// Registro público: ruta sin token (auth=false).
export const registerUser = (payload: RegisterPayload): Promise<UserAccount> =>
  apiFetch<UserAccount>('/api/users', { method: 'POST', body: payload, auth: false });

// Cuenta autenticada con su estado vigente (401 si fue desactivada: apiFetch cierra la sesión).
export const getMe = (): Promise<UserAccount> => apiFetch<UserAccount>('/api/me');

// Solo administrador: cuentas paginadas, con búsqueda por nombre, correo o código (?q=).
export const getUsers = (page: number, limit: number, q: string): Promise<Page<UserAccount>> =>
  apiFetch<Page<UserAccount>>(`/api/users?${listQuery(page, limit, { q })}`);

export const updateUser = (id: number, changes: UpdateUserPayload): Promise<UserAccount> =>
  apiFetch<UserAccount>(`/api/users/${id}`, { method: 'PATCH', body: changes });
