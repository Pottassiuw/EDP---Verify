import React from 'react';

import { StatTile } from '@/components/branded/section';

import { farol, FAROL_COR, fmtQtd, fmtPct } from '../../relatorios/fmt';
import type { DashboardCarteira } from '../types';

export function KpisDashboard({ dados }: { dados: DashboardCarteira }): React.JSX.Element {
  const planos = dados.visao_anual.filter((l) => l.meta > 0);
  const metaTotal = planos.reduce((s, p) => s + p.meta, 0);
  const planejado = planos.reduce((s, p) => s + p.carteira, 0);
  const base = planos.reduce((s, p) => s + (p.base_disponivel ?? 0), 0);
  const gap = Math.max(0, metaTotal - planejado);
  const cobertura = metaTotal === 0 ? null : (planejado + base) / metaTotal;
  const corFarol = farol(cobertura);
  const cor = corFarol === null ? undefined : FAROL_COR[corFarol];

  return (
    <div style={{ display: 'flex', gap: 'var(--gap)', flexWrap: 'wrap' }}>
      <StatTile label="Meta (planos)" value={fmtQtd(metaTotal)} />
      <StatTile label="Planejado" value={fmtQtd(planejado)} />
      <StatTile label="Base disponível" value={fmtQtd(base)} />
      <StatTile label="Gap" value={fmtQtd(gap)} />
      <StatTile
        label="Cobertura"
        value={<span style={{ color: cor }}>{cobertura === null ? '—' : fmtPct(cobertura)}</span>}
      />
    </div>
  );
}
