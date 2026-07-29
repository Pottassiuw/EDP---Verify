import { useQuery } from '@tanstack/react-query';

import { EDPApi } from '../../api';
import { CarteiraApi } from '../carteira/api';

// Fase 4a: Relatórios deriva da carteira. O dashboard vem de
// /api/carteira/dashboard (superset de DashboardRelatorios com a camada base).
export function useDashboardRelatorios(regional: string | null) {
  return useQuery({
    queryKey: ['relatorios-dashboard', regional],
    queryFn: () => CarteiraApi.dashboard({ regional: regional ?? undefined }),
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
