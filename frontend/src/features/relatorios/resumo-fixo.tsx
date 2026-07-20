import React from 'react';

import { FAROL_COR, farol, fmtPct, fmtRS } from './fmt';
import type { DashboardRelatorios, HeroMes } from './types';

function ResumoItem({ rotulo, valor, cor }: {
  rotulo: string;
  valor: string;
  cor?: string;
}): React.JSX.Element {
  return (
    <span className="flex items-baseline gap-[6px]">
      <span className="edp-eyebrow">{rotulo}</span>
      <span className="edp-mono text-[14px] font-semibold"
            style={cor ? { color: cor } : undefined}>
        {valor}
      </span>
    </span>
  );
}

export function ResumoFixo({ hero, financeiroAno, totalAlertas, aoVerAlertas }: {
  hero: HeroMes;
  financeiroAno: DashboardRelatorios['financeiro_ano'];
  totalAlertas: number;
  aoVerAlertas: () => void;
}): React.JSX.Element {
  const execPct = hero.meta > 0 ? hero.executado / hero.meta : null;
  const corDisp = farol(hero.pct_disp);
  return (
    <div className="flex flex-wrap items-center gap-x-[20px] gap-y-[6px] py-[10px] px-[14px] rounded-[var(--r-md)] bg-[var(--surface-2)]">
      <span className="edp-eyebrow">Resumo · <span className="capitalize">{hero.mes_nome}</span></span>
      <ResumoItem rotulo="%Disp" valor={fmtPct(hero.pct_disp)}
                  cor={corDisp ? FAROL_COR[corDisp] : undefined} />
      <ResumoItem rotulo="Exec" valor={fmtPct(execPct)} />
      <ResumoItem rotulo="Gap R$ (ano)" valor={fmtRS(financeiroAno.gap_rs)} />
      {totalAlertas > 0 && (
        <button type="button" onClick={aoVerAlertas}
                className="edp-mono text-[13px] text-amber hover:underline"
                aria-label={`Ver ${totalAlertas} planos com carteira abaixo da meta`}>
          ⚠ {totalAlertas} abaixo
        </button>
      )}
    </div>
  );
}
