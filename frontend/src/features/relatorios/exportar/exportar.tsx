import React from 'react';

import { ExportarForm } from './exportar-form';
import { ExportarHistorico } from './exportar-historico';
import type { PlanoRelatorio } from '../relatorios-data';

export function Exportar({
  ano,
  mes,
  regional,
  busca,
  planos,
}: {
  ano: number;
  mes: number;
  regional: string | null;
  busca: string;
  planos: PlanoRelatorio[];
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <ExportarForm ano={ano} mes={mes} regional={regional} busca={busca} planos={planos} />
      <ExportarHistorico />
    </div>
  );
}
