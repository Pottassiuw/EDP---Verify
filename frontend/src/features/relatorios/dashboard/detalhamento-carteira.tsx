import React from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { fmtQtd, fmtRS } from '../fmt';
import { ordenarPlanos, type OrdenacaoPlanos, type PlanoRelatorio } from '../relatorios-data';
import { BadgeDisponibilidade, EstadoVazio, TituloPainel } from '../relatorios-ui';

const ROTULOS_ORDENACAO: Record<OrdenacaoPlanos, string> = {
  crit: 'Prioridade crítica',
  saldo: 'Menor saldo',
  pct: 'Menor disponibilidade',
  gap: 'Maior gap financeiro',
  nome: 'Nome do plano',
};

export function DetalhamentoCarteira({
  planos,
  onSelecionarPlano,
}: {
  planos: PlanoRelatorio[];
  onSelecionarPlano: (plano: PlanoRelatorio) => void;
}): React.JSX.Element {
  const [ordenacao, setOrdenacao] = React.useState<OrdenacaoPlanos>('crit');
  const [abertas, setAbertas] = React.useState<Record<string, boolean>>({});
  const grupos = React.useMemo(() => agruparPorArea(planos, ordenacao), [ordenacao, planos]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <TituloPainel
          titulo="Detalhamento da carteira"
          detalhe="Planos agrupados por área; abra um plano para inspecionar o saldo e as notas."
        />
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-text-mute" aria-hidden="true" />
          <Select value={ordenacao} onValueChange={(valor) => setOrdenacao(valor as OrdenacaoPlanos)}>
            <SelectTrigger className="w-52" aria-label="Ordenar detalhamento da carteira">
              <SelectValue />
            </SelectTrigger>
            <SelectContent >
              {(Object.keys(ROTULOS_ORDENACAO) as OrdenacaoPlanos[]).map((valor) => (
                <SelectItem key={valor} value={valor}>{ROTULOS_ORDENACAO[valor]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {grupos.length === 0 ? (
        <EstadoVazio>Nenhum plano encontrado para a busca atual.</EstadoVazio>
      ) : (
        <div className="divide-y divide-line">
          {grupos.map(([area, itens]) => {
            const aberta = abertas[area] ?? true;
            return (
              <Collapsible
                key={area}
                open={aberta}
                onOpenChange={(aberto) => setAbertas((atual) => ({ ...atual, [area]: aberto }))}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 bg-bg-2 px-5 py-3 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ChevronDown className={`size-4 shrink-0 text-text-mute transition-transform ${aberta ? '' : '-rotate-90'}`} aria-hidden="true" />
                      <span className="font-medium text-text">{area}</span>
                      <span className="font-mono text-xs text-text-mute">{fmtQtd(itens.length)} planos</span>
                    </span>
                    <span className="text-xs text-text-mute">{fmtQtd(itens.reduce((total, item) => total + item.deficit, 0))} em déficit</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1000px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plano</TableHead>
                          <TableHead>Regional</TableHead>
                          <TableHead className="text-right">Meta</TableHead>
                          <TableHead className="text-right">Carteira</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                          <TableHead className="text-right">Disponibilidade</TableHead>
                          <TableHead className="text-right">Postergado</TableHead>
                          <TableHead className="text-right">Gap R$</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.map((plano) => (
                          <TableRow key={plano.id}>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="h-auto max-w-full justify-start px-0 py-0 font-medium text-text hover:text-accent"
                                onClick={() => onSelecionarPlano(plano)}
                              >
                                {plano.nome_curto}
                              </Button>
                              <div className="mt-1 font-mono text-xs text-text-mute">{plano.plano} · {plano.unidade}</div>
                            </TableCell>
                            <TableCell className="text-text-dim">{plano.regional}</TableCell>
                            <TableCell className="text-right font-mono">{fmtQtd(plano.meta)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtQtd(plano.carteira)}</TableCell>
                            <TableCell className={`text-right font-mono ${plano.saldo < 0 ? 'text-red' : 'text-green'}`}>{fmtQtd(plano.saldo)}</TableCell>
                            <TableCell className="text-right"><BadgeDisponibilidade pct={plano.pct_disp} /></TableCell>
                            <TableCell className="text-right font-mono text-text-dim">{fmtQtd(plano.postergado)}</TableCell>
                            <TableCell className={`text-right font-mono ${plano.gap_rs < 0 ? 'text-red' : 'text-text-mute'}`}>{fmtRS(plano.gap_rs)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function agruparPorArea(
  planos: PlanoRelatorio[],
  ordenacao: OrdenacaoPlanos,
): Array<[string, PlanoRelatorio[]]> {
  const grupos = new Map<string, PlanoRelatorio[]>();
  for (const plano of ordenarPlanos(planos, ordenacao)) {
    const grupo = grupos.get(plano.area) ?? [];
    grupo.push(plano);
    grupos.set(plano.area, grupo);
  }
  return [...grupos.entries()];
}
