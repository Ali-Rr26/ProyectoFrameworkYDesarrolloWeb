// src/components/Register.tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, NetworkError } from '../services/apiClient';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { registerUser } from '../services/userService';
import { isStrongPassword, isValidEmail, PASSWORD_RULES } from '../data/validation';
import { useDraft } from '../offline/useDraft';

// Errores por campo que devuelve el backend en APIError.details
type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'referral_code', string>>;

const inputClass =
  'w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#20b2aa] focus:border-[#20b2aa] outline-none transition';

const Register = () => {
  // El link de invitación es /register?ref=CODIGO: el código llega precargado.
  const [searchParams] = useSearchParams();
  const refFromLink = searchParams.get('ref');
  // Borrador local de los datos (nunca la contraseña, que vive en su propio estado). Si se
  // llegó por un link de invitación, el código del link manda sobre el del borrador.
  const [draft, setDraft, clearDraft] = useDraft(
    'register',
    { name: '', email: '', referralCode: refFromLink ?? '' },
    { exclude: refFromLink ? ['referralCode'] : [] },
  );
  const { name, email, referralCode } = draft;
  const setName = (value: string) => setDraft((prev) => ({ ...prev, name: value }));
  const setEmail = (value: string) => setDraft((prev) => ({ ...prev, email: value }));
  const setReferralCode = (value: string) => setDraft((prev) => ({ ...prev, referralCode: value }));
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState<boolean>(false);

  const navigate = useNavigate();
  // El registro valida correo y código de referido en el servidor: solo con conexión (D8).
  const online = useOnlineStatus();

  // Aviso temprano en el navegador; el servidor vuelve a validar.
  const emailInvalid = email.trim() !== '' && !isValidEmail(email.trim());
  const canSubmit = name.trim() !== '' && isValidEmail(email.trim()) && isStrongPassword(password);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setFieldErrors({});

    try {
      const code = referralCode.trim();
      await registerUser({ name, email, password, ...(code ? { referral_code: code } : {}) });
      await clearDraft();
      // Tras registrarse inicia sesión con su cuenta nueva: el login muestra el aviso.
      navigate('/login', { state: { registeredEmail: email.trim() } });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details && typeof err.details === 'object') setFieldErrors(err.details as FieldErrors);
      } else {
        setError(err instanceof NetworkError ? 'Requiere conexión: necesitas internet para crear tu cuenta' : 'Error al conectar con el servidor');
      }
    } finally {
      setLoading(false);
    }
  };

  // Mensaje bajo cada campo con error
  const fieldError = (field: keyof FieldErrors) =>
    fieldErrors[field] && <p className="text-red-600 text-xs mt-1">{fieldErrors[field]}</p>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-slate-200">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900">Crear cuenta</h2>
          <p className="text-slate-500 mt-2">Únete a MultiCatálogo y empieza a construir tu red</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 text-center border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">Nombre completo</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
              className={inputClass} placeholder="Ana García" autoComplete="name" required maxLength={120} />
            {fieldError('name')}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">Correo Electrónico</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className={inputClass} placeholder="ana@correo.com" autoComplete="email" required />
            {emailInvalid && !fieldErrors.email && (
              <p className="text-red-600 text-xs mt-1">Formato inválido (ejemplo: nombre@dominio.com)</p>
            )}
            {fieldError('email')}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className={inputClass} placeholder="Mínimo 8 caracteres" autoComplete="new-password" required
              aria-describedby="password-rules" />
            <ul id="password-rules" className="mt-2 space-y-1 text-xs">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(password);
                return (
                  <li key={rule.label} className={ok ? 'text-green-600' : 'text-slate-500'}>
                    {ok ? '✓' : '○'} {rule.label}
                  </li>
                );
              })}
            </ul>
            {fieldError('password')}
          </div>

          <div>
            <label htmlFor="referral" className="block text-sm font-medium text-slate-700 mb-2">
              Código de referido <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input id="referral" type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              className={`${inputClass} font-mono uppercase`} placeholder="ABCD2345" autoComplete="off" maxLength={20} />
            {fieldError('referral_code')}
          </div>

          <button
            type="submit"
            disabled={loading || !canSubmit || !online}
            className="w-full min-h-11 bg-[#20b2aa] text-white font-bold py-3 rounded-lg hover:bg-[#008080] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
          {!online && (
            <p className="text-sm text-amber-700 text-center">{'Requiere conexión: necesitas internet para crear tu cuenta. Lo que escribiste queda guardado.'}</p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="inline-flex items-center min-h-11 font-semibold text-[#20b2aa] hover:text-[#008080]">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
