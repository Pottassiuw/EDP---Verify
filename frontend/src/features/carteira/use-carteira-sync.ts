import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CarteiraApi } from './api';

export const CARTEIRA_SYNC_KEY = ['carteira', 'sincronizacao'] as const;

export function useCarteiraSync() {
  const qc = useQueryClient();
  const estado = useQuery({
    queryKey: CARTEIRA_SYNC_KEY,
    queryFn: () => CarteiraApi.sincronizacao(),
    staleTime: 30_000,
    retry: 1,
  });

  const mut = useMutation({
    mutationFn: () => CarteiraApi.sincronizar(),
    onSuccess: (execucao) => {
      const msg = execucao.estrategia === 'skip'
        ? 'Nada novo na origem — projeção já atualizada.'
        : `Sincronizado: ${execucao.novas} novas, ${execucao.atualizadas} atualizadas.`;
      toast.success(msg);
      void qc.invalidateQueries({ queryKey: ['carteira'] });
    },
    onError: (e) => toast.error('Falha ao sincronizar', {
      description: e instanceof Error ? e.message : String(e),
    }),
  });

  return { estado, sincronizar: () => mut.mutate(), sincronizando: mut.isPending };
}
