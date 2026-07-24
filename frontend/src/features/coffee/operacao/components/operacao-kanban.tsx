import React from 'react';
import type {
  CoffeeJob,
  CoffeeOperacaoItem,
  OperacaoEtapa,
} from '../../types';
import { OperacaoColumn } from './operacao-column';

const COLUMNS: Array<{
  etapa: OperacaoEtapa;
  titulo: string;
  descricao: string;
}> = [
  {
    etapa: 'fila',
    titulo: 'Fila',
    descricao: 'Consultando ou aguardando nova tentativa.',
  },
  {
    etapa: 'pronta',
    titulo: 'Prontas para gerar',
    descricao: 'Elegíveis e sem SAP real.',
  },
  {
    etapa: 'processando',
    titulo: 'Processando',
    descricao: 'Geração em andamento.',
  },
  {
    etapa: 'aguardando_sap',
    titulo: 'Aguardando SAP',
    descricao: 'SAP temporário 10000000.',
  },
];

interface OperacaoKanbanProps {
  itens: CoffeeOperacaoItem[];
  jobs: CoffeeJob[];
  selected: Set<number>;
  onToggle: (pk: number) => void;
  onOpen: (pk: number, trigger: HTMLButtonElement) => void;
}

export function OperacaoKanban(props: OperacaoKanbanProps): React.JSX.Element {
  return (
    <div className="grid min-h-0 flex-1 snap-x snap-mandatory auto-cols-[min(82vw,340px)] grid-flow-col gap-3 overflow-x-auto scroll-smooth p-4 lg:grid-flow-row lg:grid-cols-4 lg:auto-cols-auto lg:snap-none">
      {COLUMNS.map((column) => (
        <OperacaoColumn
          key={column.etapa}
          {...column}
          itens={props.itens.filter((item) => item.etapa === column.etapa)}
          jobs={props.jobs}
          selected={props.selected}
          onToggle={props.onToggle}
          onOpen={props.onOpen}
        />
      ))}
    </div>
  );
}
