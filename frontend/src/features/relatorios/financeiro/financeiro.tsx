import React from 'react';

import { StatTile } from '@/components/branded/section';

import { FinanceiroAreas } from './financeiro-areas';
import { FinanceiroRegionais } from './financeiro-regionais';
import { FinanceiroTopGap } from './financeiro-top-gap';
import { fmtQtd, fmtRS } from '../fmt';
import type { PlanoRelatorio } from '../relatorios-data';
import type { DashboardRelatorios } from '../types';
import type { ResumoRegionalDetalhado } from '../use-relatorios-data';

export function Financeiro({
  dashboard,
  planos,
  regionais,
  onSelecionarPlano,
  onSelecionarRegional,
}: {
  dashboard: DashboardRelatorios;
  planos: PlanoRelatorio[];
  regionais: ResumoRegionalDetalhado[];
  onSelecionarPlano: (plano: PlanoRelatorio) => void;
  onSelecionarRegional: (regional: string) => void;
}): React.JSX.Element {
  const planosComGap = planos.filter((plano) => plano.gapFinanceiro > 0).length;
  const financeiro = dashboard.financeiro_ano;

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Meta anual R$" value={fmtRS(financeiro.meta_rs)} />
        <StatTile label="Carteira anual R$" value={fmtRS(financeiro.carteira_rs)} />
        <StatTile label="Gap anual R$" value={<span className={financeiro.gap_rs < 0 ? 'text-red' : 'text-green'}>{fmtRS(financeiro.gap_rs)}</span>} />
        <StatTile label="Planos com gap" value={fmtQtd(planosComGap)} />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <FinanceiroAreas planos={planos} />
        <FinanceiroTopGap planos={planos} onSelecionarPlano={onSelecionarPlano} />
      </div>
      <FinanceiroRegionais regionais={regionais} onSelecionarRegional={onSelecionarRegional} />
    </div>
  );
}
