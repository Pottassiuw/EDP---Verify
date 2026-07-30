import { useQuery } from '@tanstack/react-query';

import { CarteiraApi } from './api';

export const CARTEIRA_ENRIQUECIMENTO_KEY = (numeroSap: number | null) =>
  ['carteira', 'enriquecimento', numeroSap] as const;

export function useCarteiraEnriquecimento(
  numeroSap: number | null,
  enabled: boolean,
) {
  const numeroValido = (
    numeroSap !== null
    && Number.isSafeInteger(numeroSap)
    && numeroSap > 0
  );

  return useQuery({
    queryKey: CARTEIRA_ENRIQUECIMENTO_KEY(numeroSap),
    queryFn: () => CarteiraApi.enriquecimento(numeroSap as number),
    enabled: enabled && numeroValido,
    staleTime: 300_000,
    retry: 1,
  });
}
