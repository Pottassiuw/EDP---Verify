import React from 'react';
import type { CoffeeNota } from './types';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Coffee, Eye, ScrollText } from 'lucide-react';
import { coffeeUrl } from '../../api';

const SAP_PENDENTE = 10000000;

/** Botão-âncora "abrir no COFFEE" — compartilhado pelas telas de lista. */
export function AbrirCoffeeBtn({ pk }: { pk: number }): React.JSX.Element {
  return (
    <Button asChild variant="outline" size="icon-sm" title="Abrir no COFFEE">
      <a target="_blank" rel="noopener" href={coffeeUrl(String(pk))} aria-label={`Abrir nota ${pk} no COFFEE`}>
        <Coffee />
      </a>
    </Button>
  );
}

/** Botão "ver logs" das linhas — compartilhado pelas telas de lista. */
export function LogsBtn({ pk, onClick }: { pk: number; onClick: () => void }): React.JSX.Element {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick}
            aria-label={`Ver logs da nota ${pk}`} title="Ver logs">
      <ScrollText />
    </Button>
  );
}

/** Botão "revisar nota" das linhas — abre o sheet de revisão da integração. */
export function RevisarNotaBtn({ pk, onClick }: { pk: number; onClick: () => void }): React.JSX.Element {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick}
            aria-label={`Revisar nota ${pk}`} title="Revisar nota">
      <Eye />
    </Button>
  );
}

// ponytail: sticky inline — var(--surface) não mapeado em Tailwind config
const STICKY_TH: React.CSSProperties = {
  position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
  boxShadow: "inset 0 -1px 0 var(--line)",
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  gerada:     { background: "var(--tint-green)", color: "var(--green)" },
  corrigida:  { background: "var(--tint-blue)", color: "var(--blue)" },
  pendente:   { background: "var(--tint-amber)", color: "var(--amber)" },
  nao_gerada: { background: "var(--surface-2)", color: "var(--text-mute)" },
};

function StatusBadge({ classificacao }: { classificacao: string }): React.JSX.Element {
  return (
    <span className="inline-block py-[2px] px-[8px] rounded-[999px] text-[11px] font-semibold tracking-[.03em]"
          style={STATUS_STYLE[classificacao]}>
      {classificacao}
    </span>
  );
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `ha ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `ha ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `ha ${days}d`;
  return d.toLocaleDateString("pt-BR");
}

interface CoffeeNotasTableProps {
  notas: CoffeeNota[];
  isLoading: boolean;
  emptyMessage?: string;
  actionColumn?: (nota: CoffeeNota) => React.ReactNode;
  selectable?: boolean;
  selectedPks?: Set<number>;
  onToggleSelect?: (pk: number) => void;
  onToggleAll?: () => void;
  mostrarIdade?: boolean;
}

export function CoffeeNotasTable({
  notas, isLoading, emptyMessage, actionColumn,
  selectable, selectedPks, onToggleSelect, onToggleAll, mostrarIdade,
}: CoffeeNotasTableProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-mute font-mono text-[13px]">
        Carregando notas...
      </div>
    );
  }

  if (notas.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-mute text-[13px] text-center p-[32px]">
        {emptyMessage ?? "Nenhuma nota encontrada."}
      </div>
    );
  }

  const allSelected = notas.length > 0 && selectedPks?.size === notas.length;

  return (
    <div className="flex-1 min-h-0 overflow-auto pt-0 px-[22px] pb-[24px]">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b-2">
            {selectable && (
              <TableHead className="w-[36px] text-center" style={STICKY_TH}>
                <input type="checkbox" aria-label="Selecionar todas"
                       checked={allSelected} onChange={() => onToggleAll?.()} />
              </TableHead>
            )}
            <TableHead style={STICKY_TH}>ID</TableHead>
            <TableHead style={STICKY_TH}>SAP</TableHead>
            <TableHead style={STICKY_TH}>Status</TableHead>
            {mostrarIdade && <TableHead style={STICKY_TH}>Pendente há</TableHead>}
            <TableHead style={STICKY_TH}>Última busca</TableHead>
            {actionColumn && <TableHead style={STICKY_TH}>Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {notas.map((n) => (
            <TableRow key={n.pk}>
              {selectable && (
                <TableCell className="text-center">
                  <input type="checkbox" aria-label={`Selecionar nota ${n.pk}`}
                         checked={selectedPks?.has(n.pk) ?? false}
                         onChange={() => onToggleSelect?.(n.pk)} />
                </TableCell>
              )}
              <TableCell>
                <span className="edp-mono font-semibold">{n.pk}</span>
              </TableCell>
              <TableCell>
                <span className="edp-mono">{n.id_sap}</span>
                {n.id_sap === SAP_PENDENTE && (
                  <span className="ml-[8px]"><StatusBadge classificacao="pendente" /></span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge classificacao={n.classificacao} />
              </TableCell>
              {mostrarIdade && (
                <TableCell className="text-text-mute text-[12px]">
                  {n.classificacao_em ? formatRelativeTime(n.classificacao_em) : "—"}
                </TableCell>
              )}
              <TableCell className="text-text-mute text-[12px]">
                {n.buscado_em ? formatRelativeTime(n.buscado_em) : "—"}
              </TableCell>
              {actionColumn && (
                <TableCell>
                  <div className="flex items-center gap-[6px]">
                    {actionColumn(n)}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
