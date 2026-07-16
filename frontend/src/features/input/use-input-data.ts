import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { InputApi } from './api';

export const INPUT_DADOS_KEY = ['input-dados'] as const;

export function useInputData() {
  return useQuery({
    queryKey: INPUT_DADOS_KEY,
    queryFn: InputApi.dados,
    staleTime: 300_000,
    retry: 1,
  });
}

export function useRecarregarInput(): () => Promise<void> {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
  }, [qc]);
}

/** Polling de /sync: quando outro usuário salva, revalida em background e avisa. */
export function useSincronizacaoAutomatica(versaoConhecida: string | undefined): void {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (versaoConhecida === undefined) return;
    const id = window.setInterval(() => {
      InputApi.sync()
        .then((s) => {
          if (s.versao !== versaoConhecida) {
            toast.info('Dados atualizados por outro usuário', {
              description: 'A tabela foi recarregada em segundo plano.',
            });
            void qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
          }
        })
        .catch(() => { /* backend fora: o erro aparece no fluxo principal */ });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [versaoConhecida, qc]);
}
