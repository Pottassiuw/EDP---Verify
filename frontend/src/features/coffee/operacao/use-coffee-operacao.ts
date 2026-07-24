import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OperacaoApi } from './operacao-api';

export const OPERACAO_KEY = ['coffee', 'operacao'] as const;

export function useCoffeeOperacao() {
  const queryClient = useQueryClient();
  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: OPERACAO_KEY });
  };
  const quadro = useQuery({
    queryKey: OPERACAO_KEY,
    queryFn: OperacaoApi.quadro,
    refetchInterval: (query) =>
      query.state.data?.operacoes_ativas.some(
        (operacao) => operacao.estado === 'rodando',
      )
        ? 800
        : false,
  });

  const consultar = useMutation({
    mutationFn: (ids: number[]) => OperacaoApi.consultar(ids),
    onSuccess: invalidate,
  });
  const gerar = useMutation({
    mutationFn: (ids: number[]) => OperacaoApi.gerar(ids),
    onSuccess: invalidate,
  });
  const atualizarSap = useMutation({
    mutationFn: (ids: number[]) => OperacaoApi.atualizarSap(ids),
    onSuccess: invalidate,
  });
  const remover = useMutation({
    mutationFn: (input: { ids: number[]; justificativa: string }) =>
      OperacaoApi.remover(input.ids, input.justificativa),
    onSuccess: invalidate,
  });

  return {
    quadro,
    consultar,
    gerar,
    atualizarSap,
    remover,
  };
}
