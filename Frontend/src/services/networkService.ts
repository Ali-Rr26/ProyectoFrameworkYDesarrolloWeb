import type { NetworkNode } from '../data/network';
import { apiFetch } from './apiClient';

// Requiere token: el backend devuelve la red del usuario autenticado
// (o la red raíz configurada cuando consulta un administrador).
export const getNetwork = (): Promise<NetworkNode> => apiFetch<NetworkNode>('/api/network');
