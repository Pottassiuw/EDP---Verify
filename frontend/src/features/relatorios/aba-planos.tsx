import React from 'react';

import { fmtRS } from './fmt';
import { TabelaAnual } from './tabela-anual';
import type { DashboardRelatorios } from './types';

export function AbaPlanos({ data, aoVerPlano }: {
  data: DashboardRelatorios;
  aoVerPlano: (plano: string) => void;
}): React.JSX.Element {
  const fin = data.financeiro_ano;
  return (
    <div className="flex flex-col gap-[12px]">
      <TabelaAnual linhas={data.visao_anual} aoClicarPlano={aoVerPlano} />
      <span className="edp-mono text-[13px] text-text-mute">
        Financeiro do ano — Carteira {fmtRS(fin.carteira_rs)} · Meta {fmtRS(fin.meta_rs)} · Gap {fmtRS(fin.gap_rs)}
      </span>
    </div>
  );
}
