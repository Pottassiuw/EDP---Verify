import React from 'react';

import { MensalizacaoChart } from './mensalizacao-chart';
import { TabelaMensal } from './tabela-mensal';
import type { DashboardRelatorios } from './types';

export function AbaMensalizacao({ data }: { data: DashboardRelatorios }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[16px]">
      <MensalizacaoChart meses={data.mensalizacao} mesCorrente={data.mes_referencia} />
      <TabelaMensal meses={data.mensalizacao} mesCorrente={data.mes_referencia} />
    </div>
  );
}
