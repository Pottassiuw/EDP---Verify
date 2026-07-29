import { useQuery } from '@tanstack/react-query';
import { fetchCoffeeConcluidas } from './concluidas-api';

export const CONCLUIDAS_KEY = ['coffee', 'concluidas'] as const;

export function useCoffeeConcluidas() {
  return useQuery({
    queryKey: CONCLUIDAS_KEY,
    queryFn: fetchCoffeeConcluidas,
    staleTime: 30_000,
  });
}
