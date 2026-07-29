import React from 'react';

import { MESES_ABREV_PT, fmtQtd } from '../fmt';
import type { DashboardRelatorios } from '../types';
import { TituloPainel } from '../relatorios-ui';

export function PostergacoesPorMes({ dashboard }: { dashboard: DashboardRelatorios }): React.JSX.Element {
  return (
    <section className="edp-panel flex flex-col gap-4">
      <TituloPainel
        titulo="Postergações por mês"
        detalhe="O backend informa o total de postergações apenas para o mês corrente."
      />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        {MESES_ABREV_PT.map((nome, indice) => {
          const mes = indice + 1;
          const corrente = mes === dashboard.mes_corrente;
          return (
            <div key={nome} className={`rounded-edp border p-3 ${corrente ? 'border-amber bg-tint-amber' : 'border-line bg-bg-2'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="edp-mono text-xs capitalize text-text-dim">{nome}</span>
                {corrente && <span className="size-1.5 rounded-full bg-amber" aria-label="Mês corrente" />}
              </div>
              <p className={`mt-3 text-lg font-semibold tracking-display ${corrente ? 'text-amber' : 'text-text-mute'}`}>
                {corrente ? fmtQtd(dashboard.hero.postergadas) : '—'}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
