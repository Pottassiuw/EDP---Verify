import React from 'react';

import { Banner } from '@/components/branded/section';

import { PostergacoesKpis } from './postergacoes-kpis';
import { PostergacoesPorMes } from './postergacoes-por-mes';
import { PostergacoesTabela } from './postergacoes-tabela';
import type { PlanoRelatorio } from '../relatorios-data';
import type { DashboardRelatorios } from '../types';

export function Postergacoes({
  dashboard,
  planos,
  mesSelecionado,
  onSelecionarPlano,
}: {
  dashboard: DashboardRelatorios;
  planos: PlanoRelatorio[];
  mesSelecionado: number;
  onSelecionarPlano: (plano: PlanoRelatorio) => void;
}): React.JSX.Element {
  const dadosDoMesDisponiveis = mesSelecionado === dashboard.mes_corrente;
  const planosDoMes = dadosDoMesDisponiveis ? planos : [];

  return (
    <div className="flex flex-col gap-4">
      {mesSelecionado !== dashboard.mes_corrente && (
        <Banner tipo="err">
          O contrato atual só informa postergações para o mês corrente; o mês selecionado permanece sem total de postergações.
        </Banner>
      )}
      <PostergacoesKpis dashboard={dashboard} planos={planosDoMes} mesSelecionado={mesSelecionado} />
      <PostergacoesTabela
        planos={planosDoMes}
        semDadosNoMes={!dadosDoMesDisponiveis}
        onSelecionarPlano={onSelecionarPlano}
      />
      <PostergacoesPorMes dashboard={dashboard} />
    </div>
  );
}
