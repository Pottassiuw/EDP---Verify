import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';
import type { Bloqueio } from './types';

const BLOQUEIOS_KEY = ['input', 'bloqueios'] as const;
const INTERVALO_MS = 15_000;

export interface UseBloqueiosResultado {
  /** Numero_Nota -> bloqueio ativo. Vazio enquanto a primeira carga não chega. */
  mapa: Map<number, Bloqueio>;
  recarregar: () => void;
}

/** Polling leve da tabela de bloqueios — não cacheia em disco: é estado
 * efêmero (TTL de minutos), diferente do dataset principal. */
export function useBloqueios(): UseBloqueiosResultado {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: BLOQUEIOS_KEY,
    queryFn: () => InputApi.bloqueios(),
    refetchInterval: INTERVALO_MS,
    staleTime: 0,
  });

  const mapa = React.useMemo(() => {
    const m = new Map<number, Bloqueio>();
    for (const b of data?.bloqueios ?? []) m.set(b.Numero_Nota, b);
    return m;
  }, [data]);

  const recarregar = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: BLOQUEIOS_KEY });
  }, [qc]);

  return { mapa, recarregar };
}
