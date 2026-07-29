import React from 'react';

import { DashboardGeral } from './dashboard/dashboard-geral';
import { Exportar } from './exportar/exportar';
import { Financeiro } from './financeiro/financeiro';
import { Mensalizacao } from './mensalizacao/mensalizacao';
import { Postergacoes } from './postergacoes/postergacoes';
import { CarteiraRegional } from './regional/carteira-regional';
import type { PlanoRelatorio } from './relatorios-data';
import type { DashboardRelatorios } from './types';
import type { ResumoRegionalDetalhado } from './use-relatorios-data';
import type { RelatoriosPage } from '@/types';

export interface RelatoriosPageContentProps {
  page: RelatoriosPage;
  dashboard: DashboardRelatorios;
  mes: number;
  regional: string | null;
  busca: string;
  planos: PlanoRelatorio[];
  regionais: ResumoRegionalDetalhado[];
  corrigidasForaDoPlano: number | undefined;
  onSelecionarPlano: (plano: PlanoRelatorio) => void;
  onSelecionarRegional: (regional: string | null) => void;
  onSelecionarMes: (mes: number) => void;
  onVerNotasDoMes: () => void;
  onIrParaCoffee: () => void;
}

export function RelatoriosPageContent({
  page,
  dashboard,
  mes,
  regional,
  busca,
  planos,
  regionais,
  corrigidasForaDoPlano,
  onSelecionarPlano,
  onSelecionarRegional,
  onSelecionarMes,
  onVerNotasDoMes,
  onIrParaCoffee,
}: RelatoriosPageContentProps): React.JSX.Element {
  if (page === 'regional') {
    return (
      <CarteiraRegional
        planos={planos}
        regionais={regionais}
        regionalSelecionada={regional}
        onSelecionarRegional={onSelecionarRegional}
      />
    );
  }

  if (page === 'mensalizacao') {
    return (
      <Mensalizacao
        dashboard={dashboard}
        mesSelecionado={mes}
        onSelecionarMes={onSelecionarMes}
        onVerNotasDoMes={onVerNotasDoMes}
      />
    );
  }

  if (page === 'financeiro') {
    return (
      <Financeiro
        dashboard={dashboard}
        planos={planos}
        regionais={regionais}
        onSelecionarPlano={onSelecionarPlano}
        onSelecionarRegional={onSelecionarRegional}
      />
    );
  }

  if (page === 'postergacoes') {
    return (
      <Postergacoes
        dashboard={dashboard}
        planos={planos}
        mesSelecionado={mes}
        onSelecionarPlano={onSelecionarPlano}
      />
    );
  }

  if (page === 'exportar') {
    return <Exportar ano={dashboard.ano} mes={mes} regional={regional} busca={busca} planos={planos} />;
  }

  return (
    <DashboardGeral
      dashboard={dashboard}
      mes={mes}
      planos={planos}
      regionais={regionais}
      regionalSelecionada={regional}
      corrigidasForaDoPlano={corrigidasForaDoPlano}
      onSelecionarPlano={onSelecionarPlano}
      onSelecionarRegional={onSelecionarRegional}
      onVerNotasDoMes={onVerNotasDoMes}
      onIrParaCoffee={onIrParaCoffee}
    />
  );
}
