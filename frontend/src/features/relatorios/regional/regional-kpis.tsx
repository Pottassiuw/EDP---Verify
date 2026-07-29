import React from 'react';

import { StatTile } from '@/components/branded/section';

import { fmtPct, fmtQtd } from '../fmt';
import { EstadoVazio } from '../relatorios-ui';
import type { ResumoRegionalDetalhado } from '../use-relatorios-data';

export function RegionalKpis({
  regionais,
  regionalSelecionada,
}: {
  regionais: ResumoRegionalDetalhado[];
  regionalSelecionada: string | null;
}): React.JSX.Element {
  const escopo = regionalSelecionada
    ? regionais.filter((regional) => regional.regional === regionalSelecionada)
    : regionais;
  const resumo = escopo.reduce(
    (total, regional) => ({
      meta: total.meta + regional.meta,
      carteira: total.carteira + regional.carteira,
      saldo: total.saldo + regional.saldo,
    }),
    { meta: 0, carteira: 0, saldo: 0 },
  );
  const disponibilidade = resumo.meta > 0 ? resumo.carteira / resumo.meta : null;

  if (escopo.length === 0) {
    return (
      <section className="edp-panel">
        <EstadoVazio>Aguardando o detalhamento do recorte por regional.</EstadoVazio>
      </section>
    );
  }

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Meta no escopo" value={fmtQtd(resumo.meta)} />
      <StatTile label="Carteira" value={fmtQtd(resumo.carteira)} />
      <StatTile label="Saldo" value={<span className={resumo.saldo < 0 ? 'text-red' : 'text-green'}>{fmtQtd(resumo.saldo)}</span>} />
      <StatTile label="Disponibilidade" value={fmtPct(disponibilidade)} />
    </section>
  );
}
