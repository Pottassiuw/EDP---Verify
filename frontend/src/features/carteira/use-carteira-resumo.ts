import { CarteiraApi } from './api';
import { SNAPSHOT_CARTEIRA_RESUMO } from '../input/cache';
import { useSeededQuery } from '../../hooks/use-seeded-query';
import type { ResumoCarteira } from './types';

export const CARTEIRA_RESUMO_KEY = ['carteira', 'resumo'] as const;

export function useCarteiraResumo() {
  return useSeededQuery<ResumoCarteira>({
    queryKey: CARTEIRA_RESUMO_KEY,
    snapshotKey: SNAPSHOT_CARTEIRA_RESUMO,
    versao: null,
    fetchFn: () => CarteiraApi.resumo(),
  });
}
