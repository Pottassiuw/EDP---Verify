import React from 'react';
import { AlertCircle, Clock3 } from 'lucide-react';
import { formatRelativeTime } from '../../format';
import type { CoffeeJob, CoffeeOperacaoItem } from '../../types';

interface NotaOperacaoCardProps {
  item: CoffeeOperacaoItem;
  selected: boolean;
  progress?: Pick<CoffeeJob, 'feitas' | 'total'>;
  onSelect: (selected: boolean) => void;
  onOpen: (trigger: HTMLButtonElement) => void;
}

function field(item: CoffeeOperacaoItem, key: string): string | null {
  const value = item.nota?.dados_json?.[key];
  return value == null || value === '' ? null : String(value);
}

export function NotaOperacaoCard({
  item,
  selected,
  progress,
  onSelect,
  onOpen,
}: NotaOperacaoCardProps): React.JSX.Element {
  const id = item.nota_pk ?? item.entrada_id;
  const local = [
    field(item, 'cidade'),
    field(item, 'tipo_local_instalacao'),
    field(item, 'local_instalacao_numero'),
  ].filter(Boolean).join('-');

  return (
    <article
      className={[
        'rounded-[11px] border bg-surface p-3 shadow-sm',
        'transition-[border-color,box-shadow] motion-reduce:transition-none',
        selected ? 'border-primary shadow' : 'border-line',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`Selecionar nota ${id}`}
          className="mt-1"
        />
        <button
          type="button"
          onClick={(event) => onOpen(event.currentTarget)}
          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Abrir detalhes da nota ${id}`}
        >
          <span className="edp-mono text-sm font-semibold">#{id}</span>
          <span className="ml-2 text-xs text-text-mute">
            {item.origem === 'verificar' ? 'Verificar' : 'Avulsa'}
          </span>
          <span className="ml-2 text-xs font-medium text-text-dim">
            {item.etapa === 'fila' && 'Na fila'}
            {item.etapa === 'pronta' && 'Pronta'}
            {item.etapa === 'processando' && 'Processando'}
            {item.etapa === 'aguardando_sap' && 'Aguardando SAP'}
          </span>
          <div className="mt-2 truncate text-xs text-text-dim">
            {local || 'Local ainda não consultado'}
          </div>
          <div className="mt-1 truncate text-xs text-text-mute">
            {field(item, 'alimentador') ?? 'Alimentador —'}
            {' · '}
            prioridade {field(item, 'prioridade') ?? '—'}
          </div>
          <span className="mt-2 block text-xs font-medium text-primary">
            Abrir detalhes
          </span>
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {item.erro ? (
          <span className="inline-flex items-center gap-1 text-red">
            <AlertCircle className="size-3" /> {item.erro}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-text-mute">
            <Clock3 className="size-3" />
            {formatRelativeTime(item.atualizado_em)}
          </span>
        )}
      </div>
      {progress && (
        <div className="mt-3" aria-label={`${progress.feitas} de ${progress.total}`}>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${progress.total === 0
                  ? 0
                  : Math.round((progress.feitas / progress.total) * 100)}%`,
              }}
            />
          </div>
          <span className="edp-mono mt-1 block text-xs text-text-mute">
            {progress.feitas}/{progress.total}
          </span>
        </div>
      )}
    </article>
  );
}
