import React from 'react';

/** useState que hidrata de e grava em sessionStorage (defensivo a JSON/quota). */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  React.useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sessionStorage indisponível ou cheio: ignora */
    }
  }, [key, value]);
  return [value, setValue];
}
