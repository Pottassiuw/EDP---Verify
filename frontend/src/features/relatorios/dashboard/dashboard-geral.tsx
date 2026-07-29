import React from 'react';

import { AcoesCriticas } from './acoes-criticas';
import { DetalhamentoCarteira } from './detalhamento-carteira';
import { ResumoDecisao } from './resumo-decisao';
import { SaldoRegionalResumo } from './saldo-regional-resumo';
import type { PlanoRelatorio } from '../relatorios-data';
import type { DashboardRelatorios } from '../types';
import type { ResumoRegionalDetalhado } from '../use-relatorios-data';

export function DashboardGeral({
  dashboard,
  mes,
  planos,
  regionais,
  regionalSelecionada,
  corrigidasForaDoPlano,
  onSelecionarPlano,
  onSelecionarRegional,
  onVerNotasDoMes,
  onIrParaCoffee,
}: {
  dashboard: DashboardRelatorios;
  mes: number;
  planos: PlanoRelatorio[];
  regionais: ResumoRegionalDetalhado[];
  regionalSelecionada: string | null;
  corrigidasForaDoPlano: number | undefined;
  onSelecionarPlano: (plano: PlanoRelatorio) => void;
  onSelecionarRegional: (regional: string | null) => void;
  onVerNotasDoMes: () => void;
  onIrParaCoffee: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <ResumoDecisao
        dashboard={dashboard}
        mes={mes}
        planos={planos}
        corrigidasForaDoPlano={corrigidasForaDoPlano}
        onVerNotasDoMes={onVerNotasDoMes}
        onIrParaCoffee={onIrParaCoffee}
      />
      <AcoesCriticas planos={planos} onSelecionarPlano={onSelecionarPlano} />
      <SaldoRegionalResumo
        regionais={regionais}
        regionalSelecionada={regionalSelecionada}
        onSelecionarRegional={onSelecionarRegional}
      />
      <DetalhamentoCarteira planos={planos} onSelecionarPlano={onSelecionarPlano} />
    </div>
  );
}
