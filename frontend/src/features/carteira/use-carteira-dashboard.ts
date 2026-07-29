import { useQuery } from '@tanstack/react-query';
import { CarteiraApi } from './api';

export function useCarteiraDashboard(mes?: number, regional?: string) {
  return useQuery({
    queryKey: ['carteira', 'dashboard', mes ?? null, regional ?? null],
    queryFn: () => CarteiraApi.dashboard({ mes, regional }),
    staleTime: 60_000,
    retry: 1,
  });
}
