import React from 'react';
import type { CoffeeNota } from './types';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Coffee, ScrollText } from 'lucide-react';
import { coffeeUrl } from '../api';

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
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: ".03em",
      ...STATUS_STYLE[classificacao],
    }}>
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
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        Carregando notas...
      </div>
    );
  }

  if (notas.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontSize: 13, textAlign: "center", padding: 32 }}>
        {emptyMessage ?? "Nenhuma nota encontrada."}
      </div>
    );
  }

  const allSelected = notas.length > 0 && selectedPks?.size === notas.length;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 22px 24px" }}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b-2">
            {selectable && (
              <TableHead style={{ ...STICKY_TH, width: 36, textAlign: "center" }}>
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
                <TableCell style={{ textAlign: "center" }}>
                  <input type="checkbox" aria-label={`Selecionar nota ${n.pk}`}
                         checked={selectedPks?.has(n.pk) ?? false}
                         onChange={() => onToggleSelect?.(n.pk)} />
                </TableCell>
              )}
              <TableCell>
                <span className="edp-mono" style={{ fontWeight: 600 }}>{n.pk}</span>
              </TableCell>
              <TableCell>
                <span className="edp-mono">{n.id_sap}</span>
                {n.id_sap === SAP_PENDENTE && (
                  <span style={{ marginLeft: 8 }}><StatusBadge classificacao="pendente" /></span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge classificacao={n.classificacao} />
              </TableCell>
              {mostrarIdade && (
                <TableCell style={{ color: "var(--text-mute)", fontSize: 12 }}>
                  {n.classificacao_em ? formatRelativeTime(n.classificacao_em) : "—"}
                </TableCell>
              )}
              <TableCell style={{ color: "var(--text-mute)", fontSize: 12 }}>
                {n.buscado_em ? formatRelativeTime(n.buscado_em) : "—"}
              </TableCell>
              {actionColumn && (
                <TableCell>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
