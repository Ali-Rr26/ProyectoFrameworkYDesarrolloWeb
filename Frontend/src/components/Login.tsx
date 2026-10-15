// src/components/Login.tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch, ApiError } from '../services/apiClient';

// Respuesta de POST /api/login
interface LoginResponse {
  token: string;
  email: string;
  role: string;
  expires_at: string;
}

const Login = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Ruta pública: auth=false (no envía token ni dispara el cierre de sesión ante un 401).
      const data = await apiFetch<LoginResponse>('/api/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });

      // La API devuelve el JWT, el rol (admin | customer) y la expiración del token
      const role = data.role === 'admin' ? 'admin' : 'customer';
      login({ email: data.email, role }, data.token, data.expires_at);

      // Redirigimos según el rol: admin al Dashboard, cliente a la Tienda
      navigate(role === 'admin' ? '/' : '/store');
    } catch (err) {
      // El backend responde { status, message }: mostramos su mensaje (p. ej. "Credenciales incorrectas").
      setError(err instanceof ApiError ? err.message : 'Error al conectar con el servidor');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-slate-200">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900">MultiCatálogo</h2>
          <p className="text-slate-500 mt-2">Ingresa a tu cuenta para continuar</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 text-center border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Correo Electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] focus:border-[#20b2aa] outline-none transition"
              placeholder="admin@upse.edu.ec"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] focus:border-[#20b2aa] outline-none transition"
              placeholder="••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#20b2aa] text-white font-bold py-3 rounded-lg hover:bg-[#008080] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Validando...' : 'Iniciar Sesión'}
          </button>
        </form>
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">Cuentas de prueba:</p>
          <p>👑 Admin: <span className="font-mono">admin@upse.edu.ec / 123456</span></p>
          <p>🛍️ Cliente: <span className="font-mono">cliente@upse.edu.ec / 123456</span></p>
        </div>
      </div>
    </div>
  );
};

export default Login;