import React from 'react';

import { RegionalKpis } from './regional-kpis';
import { RegionalMatriz } from './regional-matriz';
import { RegionalRanking } from './regional-ranking';
import type { PlanoRelatorio } from '../relatorios-data';
import type { ResumoRegionalDetalhado } from '../use-relatorios-data';

export function CarteiraRegional({
  planos,
  regionais,
  regionalSelecionada,
  onSelecionarRegional,
}: {
  planos: PlanoRelatorio[];
  regionais: ResumoRegionalDetalhado[];
  regionalSelecionada: string | null;
  onSelecionarRegional: (regional: string | null) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <RegionalKpis regionais={regionais} regionalSelecionada={regionalSelecionada} />
      <RegionalRanking
        regionais={regionais}
        regionalSelecionada={regionalSelecionada}
        onSelecionarRegional={onSelecionarRegional}
      />
      <RegionalMatriz
        planos={planos}
        regionais={regionais}
        onSelecionarRegional={(regional) => onSelecionarRegional(regional)}
      />
    </div>
  );
}
