import { useQuery } from '@tanstack/react-query';

import { EDPApi } from '../../api';
import { InputApi } from '../input/api';

export function useDashboardRelatorios(regional: string | null, mes: number | null = null) {
  return useQuery({
    queryKey: ['relatorios-dashboard', regional, mes],
    queryFn: () => InputApi.dashboardRelatorios({ regional: regional ?? undefined, mes: mes ?? undefined }),
    staleTime: 60_000,
  });
}

export function useForaDoPlano() {
  return useQuery({
    queryKey: ['relatorios-fora-do-plano'],
    queryFn: EDPApi.resumoForaDoPlano,
    staleTime: 60_000,
  });
}
