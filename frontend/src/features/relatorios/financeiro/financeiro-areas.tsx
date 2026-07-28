import React from 'react';

import { fmtQtd, fmtRS } from '../fmt';
import type { PlanoRelatorio } from '../relatorios-data';
import { EstadoVazio, TituloPainel } from '../relatorios-ui';

export function FinanceiroAreas({ planos }: { planos: PlanoRelatorio[] }): React.JSX.Element {
  const areas = React.useMemo(() => resumirAreas(planos), [planos]);
  const maiorGap = Math.max(1, ...areas.map((area) => area.gapFinanceiro));

  return (
    <section className="edp-panel flex flex-col gap-4">
      <TituloPainel
        titulo="Gap financeiro por área"
        detalhe="Soma dos gaps negativos informados em cada plano."
      />
      {areas.length === 0 ? (
        <EstadoVazio>Nenhum gap financeiro disponível no escopo.</EstadoVazio>
      ) : (
        <div className="flex flex-col gap-4">
          {areas.map((area) => (
            <div key={area.area} className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-text">{area.area}</span>
                <span className="edp-mono text-sm text-red">{fmtRS(area.gapFinanceiro)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-red" style={{ width: `${(area.gapFinanceiro / maiorGap) * 100}%` }} />
              </div>
              <span className="text-xs text-text-mute">{fmtQtd(area.planosComGap)} planos com gap</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function resumirAreas(planos: PlanoRelatorio[]): Array<{ area: string; gapFinanceiro: number; planosComGap: number }> {
  const totais = new Map<string, { gapFinanceiro: number; planosComGap: number }>();
  for (const plano of planos) {
    const atual = totais.get(plano.area) ?? { gapFinanceiro: 0, planosComGap: 0 };
    totais.set(plano.area, {
      gapFinanceiro: atual.gapFinanceiro + plano.gapFinanceiro,
      planosComGap: atual.planosComGap + (plano.gapFinanceiro > 0 ? 1 : 0),
    });
  }
  return [...totais.entries()]
    .map(([area, resumo]) => ({ area, ...resumo }))
    .sort((primeira, segunda) => segunda.gapFinanceiro - primeira.gapFinanceiro);
}
