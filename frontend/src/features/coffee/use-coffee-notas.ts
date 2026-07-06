import React from 'react';
import type { CoffeeNota } from './types';
import { BASE as API_BASE } from '../../api';

interface UseCoffeeNotasResult {
  notas: CoffeeNota[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCoffeeNotas(status?: string): UseCoffeeNotasResult {
  const [notas, setNotas] = React.useState<CoffeeNota[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  const refetch = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const url = status
      ? `${API_BASE}/coffee/notas?status=${encodeURIComponent(status)}`
      : `${API_BASE}/coffee/notas`;

    fetch(url, { headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
        return res.json();
      })
      .then((data: { registros: CoffeeNota[] }) => {
        if (!cancelled) {
          setNotas(data.registros);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [status, tick]);

  return { notas, isLoading, error, refetch };
}
