import { createContext, useContext } from 'react';
import type { OutboxEntry } from './db';
import type { SyncReport } from './syncEngine';

// Estado del outbox del usuario con sesión. El Provider vive en OutboxProvider.tsx
// (separados para Fast Refresh, igual que auth.ts / AuthContext.tsx).
export interface OutboxContextType {
  // Registros sin enviar (incluye los que esperan corrección: conflict / failed).
  entries: OutboxEntry[];
  // Esperando envío (pending / syncing).
  queued: number;
  // Requieren al usuario (conflict / failed): se resuelven en la Fase 7.
  needsAttention: number;
  syncing: boolean;
  online: boolean;
  lastReport: SyncReport | null;
  syncNow: () => Promise<void>;
}

export const OutboxContext = createContext<OutboxContextType | undefined>(undefined);

export const useOutbox = () => {
  const context = useContext(OutboxContext);
  if (!context) {
    throw new Error('useOutbox debe ser usado dentro de un OutboxProvider');
  }
  return context;
};
