import { useQuery } from '@tanstack/react-query';
import { CarteiraApi } from './api';

export function useCarteiraDivergencias() {
  return useQuery({
    queryKey: ['carteira', 'divergencias'],
    queryFn: () => CarteiraApi.divergencias(),
    staleTime: 60_000,
    retry: 1,
  });
}
