import React from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { gravarSnapshot, lerSnapshot } from '../features/input/cache';

interface Opcoes<T> {
  queryKey: QueryKey;
  snapshotKey: string;
  versao: string | null;
  fetchFn: () => Promise<T>;
  staleTime?: number;
}

/** useQuery que semeia do snapshot Dexie e grava snapshot a cada sucesso. */
export function useSeededQuery<T>({
  queryKey, snapshotKey, versao, fetchFn, staleTime = 300_000,
}: Opcoes<T>) {
  const qc = useQueryClient();

  React.useEffect(() => {
    let cancelado = false;
    void lerSnapshot(snapshotKey).then((snap) => {
      if (cancelado || !snap) return;
      if (qc.getQueryData(queryKey) === undefined) {
        qc.setQueryData(queryKey, snap.dados as T,
                        { updatedAt: Date.parse(snap.salvoEm) });
      }
    });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, snapshotKey]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const dados = await fetchFn();
      await gravarSnapshot(snapshotKey, versao, dados);
      return dados;
    },
    staleTime,
    retry: 1,
  });
}
