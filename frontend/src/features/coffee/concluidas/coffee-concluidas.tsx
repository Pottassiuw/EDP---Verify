import React from 'react';
import type { CoffeeConclusaoFiltro } from '../../../types';

interface CoffeeConcluidasProps {
  concluidasHandoff: { filtro: CoffeeConclusaoFiltro; id: number } | null;
}

export function CoffeeConcluidas({
  concluidasHandoff: _concluidasHandoff,
}: CoffeeConcluidasProps): React.JSX.Element {
  return <div className="p-6 text-text-dim">Concluídas em preparação.</div>;
}
