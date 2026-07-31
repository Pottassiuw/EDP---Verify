import React from 'react';

import { Eyebrow, StatNumber } from '@/components/branded/section';

import { farol, FAROL_COR, fmtPct } from '../../relatorios/fmt';
import type { RegionalResumo } from '../../relatorios/types';

/**
 * MVP: o payload do dashboard traz a cobertura agregada por regional, sem a
 * matriz cruzada regional×plano. Este componente colore por **cobertura da
 * regional** (dado disponível), não por célula regional×plano. A matriz real
 * exigiria o backend agrupar base + meta por regional×plano em `dashboard.py`
 * — registrado como follow-up, não implementado aqui.
 */
export function HeatmapCobertura({ porRegional, onDrill }: {
  porRegional: RegionalResumo[];
  onDrill: (regional: string) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${porRegional.length}, 1fr)`, gap: 6 }}>
      {porRegional.map((r) => {
        const f = farol(r.cobertura_pct ?? null);
        const cor = f === null ? 'var(--surface-2)' : FAROL_COR[f];
        return (
          <button key={r.regional} type="button" onClick={() => onDrill(r.regional)}
                  className="rounded-lg border bg-card p-[var(--pad)] text-card-foreground shadow-sm"
                  style={{ borderLeft: `3px solid ${cor}`, cursor: 'pointer', textAlign: 'left' }}>
            <Eyebrow>{r.regional}</Eyebrow>
            <StatNumber className="block" style={{ fontSize: 20, color: cor }}>
              {r.cobertura_pct == null ? '—' : fmtPct(r.cobertura_pct)}
            </StatNumber>
          </button>
        );
      })}
    </div>
  );
}
