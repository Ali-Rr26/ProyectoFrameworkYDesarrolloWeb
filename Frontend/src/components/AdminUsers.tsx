// src/components/AdminUsers.tsx
import { useEffect, useState } from 'react';
import { useAuth, type Role } from '../context/auth';
import { ROLE_LABELS } from '../data/constants';
import type { Page } from '../data/orders';
import type { UpdateUserPayload, UserAccount } from '../data/users';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { errorMessage } from '../services/apiClient';
import { useOutbox } from '../offline/outboxContext';
import { getUsers, updateUser } from '../services/userService';
import Pagination from './Pagination';
import SearchInput from './SearchInput';
import { ADMIN_USERS_PAGE_SIZE as PAGE_SIZE } from '../services/pageSizes';

// /admin/users: cuentas paginadas con búsqueda en el servidor (?q=).
const AdminUsers = () => {
  const { user: currentUser } = useAuth();
  // Cambiar rol o estado de una cuenta solo con conexión (D8).
  const { online } = useOutbox();
  const [search, setSearch] = useState<string>('');
  const q = useDebouncedValue(search.trim());
  // La página pertenece a una búsqueda: al cambiar el texto se vuelve a la primera.
  const [paging, setPaging] = useState<{ q: string; page: number }>({ q: '', page: 1 });
  const page = paging.q === q ? paging.page : 1;
  const key = `${q}|${page}`;

  const [result, setResult] = useState<{ key: string; users: Page<UserAccount> } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [error, setError] = useState<string>('');
  // ID de la cuenta que se está actualizando (deshabilita sus controles mientras tanto)
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getUsers(page, PAGE_SIZE, q)
      .then((users) => active && setResult({ key, users }))
      .catch((err) => active && setFailure({
        key,
        message: errorMessage(err, 'No se pudo cargar la lista de usuarios'),
      }));
    return () => {
      active = false;
    };
  }, [key, page, q]);

  const loadError = failure?.key === key ? failure.message : '';
  const users = result?.users;

  const applyChange = async (account: UserAccount, changes: UpdateUserPayload) => {
    setSavingId(account.id);
    setError('');
    try {
      const updated = await updateUser(account.id, changes);
      setResult((prev) => prev && {
        ...prev,
        users: { ...prev.users, data: prev.users.data.map((u) => (u.id === updated.id ? updated : u)) },
      });
    } catch (err) {
      setError(errorMessage(err, 'No se pudo actualizar la cuenta'));
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Usuarios</h1>
      <p className="text-slate-500 mb-6">Gestiona el rol y el estado de las cuentas registradas.</p>

      <SearchInput id="user-search" label="Buscar" placeholder="Nombre, correo o código de referido"
        value={search} onChange={setSearch} />

      {(error || loadError) && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-200">{error || loadError}</div>
      )}
      {!users && !loadError && <p className="text-slate-500">Cargando usuarios...</p>}

      {users && users.data.length === 0 && (
        <p className="text-slate-500">{q ? `No hay usuarios que coincidan con "${q}".` : 'No hay usuarios registrados.'}</p>
      )}
      {users && users.data.length > 0 && (
        <>
          <ul className={`space-y-3 ${result?.key === key ? '' : 'opacity-60 transition-opacity'}`}>
            {users.data.map((account) => {
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
                      disabled={isSelf || busy || !online}
                      title={online ? undefined : 'Requiere conexión: esta operación no se puede guardar sin conexión'}
                      onChange={(e) => applyChange(account, { role: e.target.value as Role })}
                      className="min-h-11 px-3 rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                    >
                      {(['customer', 'admin'] as Role[]).map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={isSelf || busy || !online}
                      title={online ? undefined : 'Requiere conexión: esta operación no se puede guardar sin conexión'}
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
          <Pagination page={users.page} limit={users.limit} total={users.total}
            onChange={(next) => setPaging({ q, page: next })} />
        </>
      )}
    </div>
  );
};

export default AdminUsers;
