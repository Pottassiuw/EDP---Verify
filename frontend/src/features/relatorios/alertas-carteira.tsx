import React from 'react';

import { FAROL_COR, farol, fmtPct, fmtQtd } from './fmt';
import type { LinhaAnual } from './types';

export function AlertasCarteira({ linhas, aoClicarPlano }: {
  linhas: LinhaAnual[];
  aoClicarPlano: (plano: string) => void;
}): React.JSX.Element | null {
  const abaixo = linhas
    .filter((l) => l.pct_disp !== null && l.pct_disp < 1)
    .sort((a, b) => (a.pct_disp ?? 0) - (b.pct_disp ?? 0));

  if (abaixo.length === 0) return null;

  return (
    <div className="flex flex-col gap-[8px]">
      <span className="edp-eyebrow text-amber">⚠ Carteira abaixo da meta ({abaixo.length})</span>
      <div className="flex flex-col gap-[4px]">
        {abaixo.map((l) => {
          const f = farol(l.pct_disp);
          return (
            <button
              key={l.plano}
              type="button"
              onClick={() => aoClicarPlano(l.plano)}
              className="flex items-center gap-[10px] text-left py-[6px] px-[10px] rounded-[6px] hover:bg-[var(--surface-2)]"
              aria-label={`Ver notas do plano ${l.plano} (carteira abaixo da meta)`}
            >
              <span className="flex-1 text-[13px]" title={l.plano}>{l.nome_curto}</span>
              <span className="edp-mono text-[13px] font-semibold"
                    style={{ color: f ? FAROL_COR[f] : 'var(--text-mute)' }}>
                {fmtPct(l.pct_disp)}
              </span>
              <span className="edp-mono text-[12px] text-text-mute">
                faltam ~{fmtQtd(-l.saldo)} {l.unidade}
              </span>
              <span aria-hidden="true" className="text-text-mute">→</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
