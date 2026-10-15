import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAuthToken, setUnauthorizedHandler } from '../services/apiClient';

// 1. Tipos de rol que maneja la aplicación
export type Role = 'admin' | 'customer';

// 2. Usuario autenticado: correo + rol (lo entrega la API en /api/login)
export interface User {
  email: string;
  role: Role;
}

// 3. Sesión completa: usuario + JWT + fecha de expiración del token
interface Session {
  user: User;
  token: string;
  expiresAt: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (user: User, token: string, expiresAt: string) => void;
  logout: () => void;
}

// 4. La sesión se guarda en sessionStorage: sobrevive a recargar la página pero se
// borra al cerrar la pestaña (menor exposición del token que localStorage).
const SESSION_KEY = 'multicatalogo_session';

// Lee la sesión guardada y la descarta si el token ya expiró.
const readSession = (): Session | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser usado dentro de un AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // El token se registra en el cliente HTTP de forma SÍNCRONA (en el inicializador),
  // antes de que los componentes hijos hagan sus peticiones en sus useEffect.
  const [session, setSession] = useState<Session | null>(() => {
    const saved = readSession();
    setAuthToken(saved?.token ?? null);
    return saved;
  });

  const login = (user: User, token: string, expiresAt: string) => {
    const newSession: Session = { user, token, expiresAt };
    setAuthToken(token);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    } catch {
      // Sin almacenamiento disponible la sesión dura solo mientras la página esté abierta.
    }
    setSession(newSession);
  };

  const logout = useCallback(() => {
    setAuthToken(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignorado: no hay nada que limpiar.
    }
    setSession(null);
  }, []);

  // Si el backend responde 401 en una ruta protegida (token expirado/invalidado), cerramos sesión.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Cierre de sesión automático al llegar la hora de expiración del token.
  useEffect(() => {
    if (!session) return;
    const remaining = new Date(session.expiresAt).getTime() - Date.now();
    const timer = setTimeout(logout, Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [session, logout]);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: session !== null, user: session?.user ?? null, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
