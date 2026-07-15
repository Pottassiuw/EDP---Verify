import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';

export const RAMAL_KEY = ['input', 'ramal'] as const;

export function useRamalData() {
  return useQuery({ queryKey: RAMAL_KEY, queryFn: InputApi.ramal, staleTime: 300_000 });
}

export function useRecarregarRamal(): () => Promise<void> {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: RAMAL_KEY });
  }, [qc]);
}
