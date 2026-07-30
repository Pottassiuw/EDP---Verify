import React from 'react';

import { Banner, StatTile } from '@/components/branded/section';
import { Button } from '@/components/ui/button';

import { MensalizacaoChart } from './mensalizacao-chart';
import { MensalizacaoTabela } from './mensalizacao-tabela';
import { fmtPct, fmtQtd } from '../fmt';
import type { DashboardRelatorios } from '../types';

export function Mensalizacao({
  dashboard,
  mesSelecionado,
  onSelecionarMes,
  onVerNotasDoMes,
}: {
  dashboard: DashboardRelatorios;
  mesSelecionado: number;
  onSelecionarMes: (mes: number) => void;
  onVerNotasDoMes: () => void;
}): React.JSX.Element {
  const mes = dashboard.mensalizacao.find((item) => item.mes === mesSelecionado) ?? dashboard.hero;
  const disponibilidade = mes.meta > 0 ? mes.carteira / mes.meta : null;
  const abaixoDaMeta = disponibilidade !== null && disponibilidade < 1;

  return (
    <div className="flex flex-col gap-4">
      {abaixoDaMeta && (
        <Banner tipo="err">
          <span>
            A carteira de referência está em {fmtPct(disponibilidade)} da meta. Revise os planos críticos e as notas do mês.
          </span>
        </Banner>
      )}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <StatTile label="Meta do mês" value={fmtQtd(mes.meta)} />
          <StatTile label="Carteira" value={fmtQtd(mes.carteira)} />
          <StatTile label="Executado" value={fmtQtd(mes.executado)} />
          <StatTile label="Disponibilidade" value={fmtPct(disponibilidade)} />
        </div>
        <Button type="button" variant="outline" className="border-line-2 bg-bg-2" onClick={onVerNotasDoMes}>
          Ver notas do mês
        </Button>
      </section>
      <MensalizacaoChart
        meses={dashboard.mensalizacao}
        mesSelecionado={mesSelecionado}
        mesCorrente={dashboard.mes_referencia}
        postergadasMesCorrente={dashboard.hero.postergadas}
        onSelecionarMes={onSelecionarMes}
      />
      <MensalizacaoTabela
        meses={dashboard.mensalizacao}
        mesSelecionado={mesSelecionado}
        mesCorrente={dashboard.mes_referencia}
        postergadasMesCorrente={dashboard.hero.postergadas}
        onSelecionarMes={onSelecionarMes}
      />
    </div>
  );
}
