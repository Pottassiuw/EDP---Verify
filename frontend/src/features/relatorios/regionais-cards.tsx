import React from 'react';

import { Card, CardContent } from '@/components/ui/card';

import { fmtPct, fmtQtd } from './fmt';
import type { RegionalResumo } from './types';

function corFarol(pct: number | null): string {
  if (pct === null) return 'var(--text-mute)';
  if (pct >= 1) return 'var(--green)';
  if (pct >= 0.85) return 'var(--amber)';
  return 'var(--red)';
}

export function RegionaisCards({ regionais }: { regionais: RegionalResumo[] }): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-[10px]">
      {regionais.map((r) => (
        <Card key={r.regional}>
          <CardContent className="flex flex-col gap-[4px] py-[12px]">
            <span className="edp-eyebrow">{r.regional}</span>
            <span className="edp-num text-[20px]" style={{ color: corFarol(r.pct_disp) }}>
              {fmtPct(r.pct_disp)}
            </span>
            <span className="edp-mono text-[12px]" style={{ color: r.saldo < 0 ? 'var(--red)' : 'var(--text-mute)' }}>
              Saldo {r.saldo > 0 ? '+' : ''}{fmtQtd(r.saldo)}
            </span>
            <span className="text-[11px] text-text-mute">
              Meta {fmtQtd(r.meta)} · Carteira {fmtQtd(r.carteira)}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
