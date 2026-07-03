import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';

export const RAMAL_KEY = ['input', 'ramal'] as const;

export function useRamalData() {
  return useQuery({ queryKey: RAMAL_KEY, queryFn: InputApi.ramal });
}

export function useRecarregarRamal() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: RAMAL_KEY });
}
