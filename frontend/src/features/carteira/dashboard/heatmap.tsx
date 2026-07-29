import React from 'react';

import { farol, FAROL_COR, fmtPct } from '../../relatorios/fmt';
import type { LinhaRegional } from '../types';

/**
 * MVP: o payload do dashboard traz `por_plano` e `por_regional` agregados,
 * sem a matriz cruzada regional×plano. Este componente colore por
 * **cobertura da regional** (dado disponível), não por célula regional×plano.
 * A matriz real exigiria o backend agrupar base + meta por regional×plano em
 * `dashboard.py` — registrado como follow-up, não implementado aqui.
 */
export function HeatmapCobertura({ porRegional, onDrill }: {
  porRegional: LinhaRegional[];
  onDrill: (regional: string) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${porRegional.length}, 1fr)`, gap: 6 }}>
      {porRegional.map((r) => {
        const f = farol(r.cobertura_pct);
        const cor = f === null ? 'var(--surface-2)' : FAROL_COR[f];
        return (
          <button key={r.regional} type="button" onClick={() => onDrill(r.regional)}
                  className="edp-panel" style={{ borderLeft: `3px solid ${cor}`, cursor: 'pointer', textAlign: 'left' }}>
            <span className="edp-eyebrow">{r.regional}</span>
            <div className="edp-num" style={{ fontSize: 20, color: cor }}>
              {r.cobertura_pct === null ? '—' : fmtPct(r.cobertura_pct)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
