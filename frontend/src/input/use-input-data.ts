import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';

export function useInputData() {
  return useQuery({
    queryKey: ['input-dados'],
    queryFn: InputApi.dados,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useRecarregarInput(): () => Promise<void> {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['input-dados'] });
  }, [qc]);
}

/** Polling leve de /sync: retorna true quando outro usuário salvou algo. */
export function useAvisoSincronizacao(ultimaConhecida: string | null | undefined): {
  desatualizado: boolean;
  limpar: () => void;
} {
  const [desatualizado, setDesatualizado] = React.useState(false);
  React.useEffect(() => {
    if (ultimaConhecida === undefined) return;
    const id = window.setInterval(() => {
      InputApi.sync()
        .then((s) => {
          if (s.ultima_alteracao !== (ultimaConhecida ?? null)) setDesatualizado(true);
        })
        .catch(() => { /* backend fora: o erro aparece no fluxo principal */ });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [ultimaConhecida]);
  return { desatualizado, limpar: () => setDesatualizado(false) };
}
