// src/components/AdminUsers.tsx
import { useEffect, useState } from 'react';
import { useAuth, type Role } from '../context/auth';
import { ROLE_LABELS } from '../data/constants';
import type { UpdateUserPayload, UserAccount } from '../data/users';
import { ApiError } from '../services/apiClient';
import { getUsers, updateUser } from '../services/userService';

const AdminUsers = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  // ID de la cuenta que se está actualizando (deshabilita sus controles mientras tanto)
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar la lista de usuarios'))
      .finally(() => setLoading(false));
  }, []);

  const applyChange = async (account: UserAccount, changes: UpdateUserPayload) => {
    setSavingId(account.id);
    setError('');
    try {
      const updated = await updateUser(account.id, changes);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar la cuenta');
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = (account: UserAccount) => {
    const action = account.active ? 'desactivar' : 'activar';
    if (window.confirm(`¿Seguro que deseas ${action} la cuenta de ${account.name}?`)) {
      applyChange(account, { active: !account.active });
    }
  };

  if (loading) return <p className="text-slate-500">Cargando usuarios...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Usuarios</h1>
      <p className="text-slate-500 mb-6">Gestiona el rol y el estado de las cuentas registradas.</p>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200">{error}</div>
      )}

      {users.length === 0 ? (
        <p className="text-slate-500">No hay usuarios registrados.</p>
      ) : (
        <ul className="space-y-3">
          {users.map((account) => {
            // El backend impide que un admin cambie su propio rol o se desactive
            const isSelf = account.email.toLowerCase() === currentUser?.email.toLowerCase();
            const busy = savingId === account.id;
            return (
              <li
                key={account.id}
                className={`bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center gap-3 ${account.active ? '' : 'opacity-60'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">
                    {account.name} {isSelf && <span className="text-xs text-slate-400">(tú)</span>}
                  </p>
                  <p className="text-sm text-slate-500 break-all">{account.email}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {account.referral_code ? <>Código: <span className="font-mono">{account.referral_code}</span></> : 'Sin afiliación a la red'}
                    {account.sponsor_id !== null && <> · Patrocinador #{account.sponsor_id}</>}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 md:w-auto">
                  <label className="sr-only" htmlFor={`role-${account.id}`}>Rol de {account.name}</label>
                  <select
                    id={`role-${account.id}`}
                    value={account.role}
                    disabled={isSelf || busy}
                    onChange={(e) => applyChange(account, { role: e.target.value as Role })}
                    className="min-h-11 px-3 rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    {(['customer', 'admin'] as Role[]).map((role) => (
                      <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={isSelf || busy}
                    onClick={() => toggleActive(account)}
                    className={`min-h-11 px-4 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      account.active
                        ? 'border border-red-300 text-red-600 hover:bg-red-50'
                        : 'bg-[#20b2aa] text-white hover:bg-[#008080]'
                    }`}
                  >
                    {busy ? 'Guardando...' : account.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AdminUsers;
