import React from 'react';
import type {
  CoffeeJob,
  CoffeeOperacaoItem,
  OperacaoEtapa,
} from '../../types';
import { NotaOperacaoCard } from './nota-operacao-card';

interface OperacaoColumnProps {
  etapa: OperacaoEtapa;
  titulo: string;
  descricao: string;
  itens: CoffeeOperacaoItem[];
  jobs: CoffeeJob[];
  selected: Set<number>;
  onToggle: (pk: number) => void;
  onOpen: (pk: number, trigger: HTMLButtonElement) => void;
}

export function OperacaoColumn(props: OperacaoColumnProps): React.JSX.Element {
  return (
    <section
      aria-labelledby={`coffee-column-${props.etapa}`}
      className="flex min-h-0 w-[min(82vw,340px)] shrink-0 snap-start flex-col rounded-[12px] border border-line bg-bg-2 lg:w-auto lg:min-w-0"
    >
      <header className="border-b border-line p-3">
        <div className="flex items-center gap-2">
          <h2 id={`coffee-column-${props.etapa}`} className="text-sm font-semibold">
            {props.titulo}
          </h2>
          <span className="edp-mono rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-mute">
            {props.itens.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-text-mute">{props.descricao}</p>
      </header>
      <div className="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {props.itens.length === 0 ? (
          <div className="grid min-h-28 place-items-center rounded-[9px] border border-dashed border-line text-center text-xs text-text-mute">
            Nenhuma nota nesta etapa.
          </div>
        ) : props.itens.map((item) => {
          const pk = item.nota_pk ?? item.entrada_id;
          const progress = props.jobs.find((job) => job.id === item.operacao_id);

          return (
            <NotaOperacaoCard
              key={`${item.entrada_id}-${item.nota_pk ?? 'pending'}`}
              item={item}
              selected={props.selected.has(pk)}
              progress={progress}
              onSelect={() => props.onToggle(pk)}
              onOpen={(trigger) => props.onOpen(pk, trigger)}
            />
          );
        })}
      </div>
    </section>
  );
}
