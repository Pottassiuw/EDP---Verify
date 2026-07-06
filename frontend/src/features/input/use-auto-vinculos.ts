import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { NotaInput } from './types';
import { InputApi } from './api';
import { varrerVinculos } from './lib';

export interface VinculoStatus {
  atualizadas: number;
  hora: string;
}

export function useAutoVinculos(registros: NotaInput[]): { status: VinculoStatus | null } {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<VinculoStatus | null>(null);
  const rodandoRef = React.useRef(false);

  React.useEffect(() => {
    const sugestoes = varrerVinculos(registros);

    if (sugestoes.length === 0) {
      setStatus((prev) => prev ?? {
        atualizadas: 0,
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      });
      return;
    }

    if (rodandoRef.current) return;
    rodandoRef.current = true;

    const payload: Record<string, number[]> = {};
    for (const s of sugestoes) {
      if (!payload[s.Possivel_Nota_Mae]) payload[s.Possivel_Nota_Mae] = [];
      payload[s.Possivel_Nota_Mae].push(s.Nota_Filha_Orfa);
    }

    InputApi.vincularHierarquia(payload)
      .then(({ atualizadas }) => {
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setStatus({ atualizadas, hora });
        if (atualizadas > 0) {
          toast.success(`${atualizadas} vínculo(s) Nota_Mae aplicados automaticamente`);
          void qc.invalidateQueries({ queryKey: ['input-dados'] });
        }
      })
      .catch(() => { /* backend fora: erro visível no fluxo principal */ })
      .finally(() => { rodandoRef.current = false; });
  }, [registros, qc]);

  return { status };
}
