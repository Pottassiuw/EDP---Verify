import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CarteiraApi, type ParamsNotas } from './api';

export const CARTEIRA_NOTAS_KEY = (params: ParamsNotas) =>
  ['carteira', 'notas', params] as const;

export function useCarteiraNotas(params: ParamsNotas) {
  return useQuery({
    queryKey: CARTEIRA_NOTAS_KEY(params),
    queryFn: () => CarteiraApi.notas(params),
    placeholderData: keepPreviousData,
    staleTime: 300_000,
    retry: 1,
  });
}
