import React from 'react';

import { FAROL_COR, farol, fmtPct, fmtQtd } from './fmt';
import type { RegionalResumo } from './types';

function corFarol(pct: number | null): string {
  const f = farol(pct);
  return f === null ? 'var(--text-mute)' : FAROL_COR[f];
}

export function RegionaisCards({ regionais, mesNome }: {
  regionais: RegionalResumo[];
  mesNome?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[10px]">
      <span className="edp-eyebrow">
        Saldo por regional · qtd DDPM{mesNome ? <span className="capitalize"> · {mesNome}</span> : ''}
      </span>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-[12px]">
        {regionais.map((r) => (
          <div key={r.regional}
               className="flex flex-col gap-[4px] p-[14px] rounded-[var(--r-md)] bg-[var(--surface-2)]">
            <span className="edp-eyebrow">{r.regional}</span>
            <span className="edp-num text-[22px]" style={{ color: corFarol(r.pct_disp) }}>
              {fmtPct(r.pct_disp)}
            </span>
            <span className="edp-mono text-[13px]"
                  style={{ color: r.saldo < 0 ? 'var(--red)' : 'var(--text-mute)' }}>
              Saldo {r.saldo > 0 ? '+' : ''}{fmtQtd(r.saldo)}
            </span>
            <span className="text-[13px] text-text-mute">
              Meta {fmtQtd(r.meta)} · Carteira {fmtQtd(r.carteira)} (qtd DDPM)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
