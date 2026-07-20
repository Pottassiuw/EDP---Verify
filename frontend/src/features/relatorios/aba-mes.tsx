import React from 'react';

import { AlertasCarteira } from './alertas-carteira';
import { HeroMes } from './hero-mes';
import { RegionaisCards } from './regionais-cards';
import type { DashboardRelatorios } from './types';

export function AbaMes({ data, aoVerNotas, aoVerPlano }: {
  data: DashboardRelatorios;
  aoVerNotas: () => void;
  aoVerPlano: (plano: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[16px]">
      <HeroMes hero={data.hero} aoVerNotas={aoVerNotas} />
      <AlertasCarteira linhas={data.visao_anual} aoClicarPlano={aoVerPlano} />
      <RegionaisCards regionais={data.regionais} />
    </div>
  );
}
