import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CarteiraApi } from './api';
import { INPUT_DADOS_KEY } from '../input/use-input-data';
import type { MoverPedido } from './types';

export function useMoverPreview(idOnrs: number[], habilitado: boolean) {
  return useQuery({
    queryKey: ['carteira', 'mover-preview', idOnrs],
    queryFn: () => CarteiraApi.moverPreview(idOnrs),
    enabled: habilitado && idOnrs.length > 0,
    staleTime: 0,
  });
}

export function useMoverParaPlano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pedido: MoverPedido) => CarteiraApi.mover(pedido),
    onSuccess: (r) => {
      toast.success(`${r.inseridas} nota(s) movida(s) para o plano.`);
      void qc.invalidateQueries({ queryKey: ['carteira'] });
      void qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
    },
    onError: (e) => toast.error('Falha ao mover para o plano', {
      description: e instanceof Error ? e.message : String(e),
    }),
  });
}
