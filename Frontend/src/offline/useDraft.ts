// Estado de formulario con autoguardado en IndexedDB (borrador por usuario y formulario).
// Uso: const [values, setValues, clearDraft] = useDraft('checkout', initialValues);
// - Al montar, el borrador guardado (si existe) se mezcla sobre los valores iniciales.
// - Cada cambio del usuario se guarda con debounce.
// - clearDraft() se llama al enviar con éxito o al cancelar.
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '../context/auth';
import { clearDraft as removeDraft, draftOwner, loadDraft, omitKeys, saveDraft } from './drafts';

const SAVE_DELAY_MS = 400;

interface DraftOptions {
  // Campos que nunca se guardan ni se restauran (p. ej. un valor que llega por la URL).
  exclude?: readonly string[];
}

export const useDraft = <T extends Record<string, unknown>>(
  formKey: string,
  initial: T | (() => T),
  { exclude = [] }: DraftOptions = {},
): [T, Dispatch<SetStateAction<T>>, () => Promise<void>] => {
  const { user } = useAuth();
  const userId = draftOwner(user?.email);
  const excludeKey = exclude.join('|');

  const [values, setValues] = useState<T>(initial);
  const [loaded, setLoaded] = useState<boolean>(false);
  // Solo se guarda lo que el usuario cambió (no los valores iniciales sin tocar).
  const [dirty, setDirty] = useState<boolean>(false);
  // Tras clearDraft() no se vuelve a guardar (evita que un guardado pendiente lo recree).
  const clearedRef = useRef<boolean>(false);

  useEffect(() => {
    let active = true;
    loadDraft<T>(userId, formKey)
      .then((draft) => {
        if (active && draft) setValues((prev) => ({ ...prev, ...omitKeys(draft, excludeKey.split('|')) }));
      })
      .catch(() => undefined)
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [userId, formKey, excludeKey]);

  useEffect(() => {
    if (!loaded || !dirty) return;
    const timer = setTimeout(() => {
      if (clearedRef.current) return;
      saveDraft(userId, formKey, omitKeys(values, excludeKey.split('|'))).catch(() => undefined);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, loaded, dirty, userId, formKey, excludeKey]);

  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    clearedRef.current = false;
    setDirty(true);
    setValues(next);
  }, []);

  const clear = useCallback(async () => {
    clearedRef.current = true;
    await removeDraft(userId, formKey).catch(() => undefined);
  }, [userId, formKey]);

  return [values, update, clear];
};
