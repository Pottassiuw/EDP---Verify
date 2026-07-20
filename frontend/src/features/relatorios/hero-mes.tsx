import React from 'react';

import { StatTile } from '@/components/branded/section';
import { Button } from '@/components/ui/button';

import { fmtPct, fmtQtd, fmtRS } from './fmt';
import type { DashboardRelatorios, HeroMes as HeroMesData } from './types';

export function HeroMes({ hero, financeiroAno, aoVerNotas }: {
  hero: HeroMesData;
  financeiroAno: DashboardRelatorios['financeiro_ano'];
  aoVerNotas: () => void;
}): React.JSX.Element {
  const progresso = hero.meta > 0 ? Math.min(hero.executado / hero.meta, 1) : 0;

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-baseline justify-between">
        <span className="edp-title text-[16px] capitalize">{hero.mes_nome}</span>
        <Button variant="ghost" size="sm" onClick={aoVerNotas}>
          Ver notas do mês
        </Button>
      </div>

      <div className="flex gap-[10px] flex-wrap">
        <StatTile label="Meta do mês" value={fmtQtd(hero.meta)} />
        <StatTile label="Carteira" value={fmtQtd(hero.carteira)} />
        <StatTile label="Executado" value={fmtQtd(hero.executado)} />
        <StatTile label="Postergadas" value={fmtQtd(hero.postergadas)} />
        <StatTile label="% Disp." value={fmtPct(hero.pct_disp)} />
        <StatTile label="R$ carteira/meta" value={`${fmtRS(hero.carteira_rs)} / ${fmtRS(hero.meta_rs)}`} />
      </div>

      <div className="h-[6px] w-full rounded-[999px] bg-[var(--surface-2)] overflow-hidden"
           role="progressbar" aria-valuenow={Math.round(progresso * 100)} aria-valuemin={0} aria-valuemax={100}
           aria-label="Executado em relação à meta do mês">
        <div className="h-full bg-green rounded-[999px] [transition:width_.3s_ease]"
             style={{ width: `${progresso * 100}%` }} />
      </div>

      <span className="edp-mono text-[12px] text-text-mute">
        Financeiro do ano — Carteira {fmtRS(financeiroAno.carteira_rs)} · Meta {fmtRS(financeiroAno.meta_rs)} · Gap {fmtRS(financeiroAno.gap_rs)}
      </span>
    </div>
  );
}
