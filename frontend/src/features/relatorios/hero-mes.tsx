import React from 'react';

import { StatTile } from '@/components/branded/section';
import { Button } from '@/components/ui/button';

import { FAROL_COR, farol, fmtPct, fmtQtd, fmtRS } from './fmt';
import type { HeroMes as HeroMesData } from './types';

export function HeroMes({ hero, aoVerNotas }: {
  hero: HeroMesData;
  aoVerNotas: () => void;
}): React.JSX.Element {
  const execPct = hero.meta > 0 ? hero.executado / hero.meta : null;
  const progresso = execPct === null ? 0 : Math.min(execPct, 1);
  const corDisp = farol(hero.pct_disp);

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-baseline justify-between">
        <span className="edp-title text-[16px] capitalize">{hero.mes_nome}</span>
        <Button variant="ghost" size="sm" onClick={aoVerNotas}>
          Ver notas do mês
        </Button>
      </div>

      <div className="edp-panel flex flex-col gap-[16px] md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-[2px]">
          <span className="edp-eyebrow">% Disponibilização</span>
          <span className="edp-num text-[40px]"
                style={{ color: corDisp ? FAROL_COR[corDisp] : 'var(--text)' }}>
            {fmtPct(hero.pct_disp)}
          </span>
          <span className="edp-mono text-[13px] text-text-mute">
            Carteira {fmtQtd(hero.carteira)} de Meta {fmtQtd(hero.meta)}
          </span>
        </div>

        <div className="flex flex-col gap-[6px] md:w-[300px]">
          <div className="flex items-baseline justify-between">
            <span className="edp-eyebrow">Execução</span>
            <span className="edp-mono text-[13px] text-text-mute">{fmtPct(execPct)} da meta</span>
          </div>
          <div className="h-[6px] w-full rounded-[999px] bg-[var(--surface-2)] overflow-hidden"
               role="progressbar" aria-valuenow={Math.round(progresso * 100)} aria-valuemin={0} aria-valuemax={100}
               aria-label="Executado em relação à meta do mês">
            <div className="h-full bg-green rounded-[999px] [transition:width_.3s_ease]"
                 style={{ width: `${progresso * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="flex gap-[10px] flex-wrap">
        <StatTile label="Meta do mês" value={fmtQtd(hero.meta)} />
        <StatTile label="Carteira" value={fmtQtd(hero.carteira)} />
        <StatTile label="Executado" value={fmtQtd(hero.executado)} />
        {hero.postergadas > 0 && (
          <StatTile label="Postergadas" value={fmtQtd(hero.postergadas)} />
        )}
        <StatTile label="R$ carteira/meta" value={`${fmtRS(hero.carteira_rs)} / ${fmtRS(hero.meta_rs)}`} />
      </div>
    </div>
  );
}
