import { API_URL } from '../data/constants';
import type { Referido } from '../data/red';

export const getNetwork = async (): Promise<Referido> => {
  const response = await fetch(`${API_URL}/api/network`);
  if (!response.ok) {
    throw new Error('Error al traer red de referidos');
  }
  return response.json();
};
