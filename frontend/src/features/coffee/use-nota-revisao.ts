import { useQuery } from '@tanstack/react-query';
import { EDPApi } from '../../api';

export const REVISAO_KEY = (pk: number | null) => ['coffee', 'revisao', pk] as const;

export function useNotaRevisao(pk: number | null) {
  return useQuery({
    queryKey: REVISAO_KEY(pk),
    queryFn: () => EDPApi.revisarNota(pk as number),
    enabled: pk !== null,
    staleTime: 60_000,
  });
}
