import { useEffect, useState } from 'react';

// Devuelve el valor después de que deja de cambiar durante "delay" ms. Se usa en las
// búsquedas: se consulta al servidor cuando el usuario termina de escribir, no en cada tecla.
export const useDebouncedValue = <T,>(value: T, delay = 300): T => {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};
