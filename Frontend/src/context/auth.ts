import { createContext, useContext } from 'react';

// Tipos, contexto y hook de la sesión. El Provider vive en AuthContext.tsx: separarlos
// permite que Fast Refresh recargue el componente sin perder el estado (react-refresh).

// 1. Tipos de rol que maneja la aplicación
export type Role = 'admin' | 'customer';

// 2. Usuario autenticado: correo + rol (lo entrega la API en /api/login)
export interface User {
  email: string;
  role: Role;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (user: User, token: string, expiresAt: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser usado dentro de un AuthProvider");
  }
  return context;
};
