import React from 'react';
import { ArrowRight, CircleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { fmtPct, fmtQtd, fmtRS } from '../fmt';
import { ordenarPlanos, type PlanoRelatorio } from '../relatorios-data';
import { EstadoVazio, TituloPainel } from '../relatorios-ui';

export function AcoesCriticas({
  planos,
  onSelecionarPlano,
}: {
  planos: PlanoRelatorio[];
  onSelecionarPlano: (plano: PlanoRelatorio) => void;
}): React.JSX.Element {
  const criticos = React.useMemo(
    () => ordenarPlanos(planos.filter((plano) => plano.deficit > 0), 'crit'),
    [planos],
  );

  return (
    <section className="edp-panel overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <TituloPainel
          titulo="Ações críticas"
          detalhe="Dispositivos abaixo da meta, ordenados por impacto."
        />
        <span className="inline-flex items-center gap-2 text-xs text-red">
          <CircleAlert className="size-4" aria-hidden="true" />
          {fmtQtd(criticos.length)} críticos
        </span>
      </div>

      {criticos.length === 0 ? (
        <EstadoVazio>Nenhum plano abaixo da meta no filtro atual.</EstadoVazio>
      ) : (
        <div className="overflow-x-auto">
          <Table className="edp-table min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Regional</TableHead>
                <TableHead className="text-right">Déficit</TableHead>
                <TableHead className="text-right">Disponibilidade</TableHead>
                <TableHead className="text-right">Gap R$</TableHead>
                <TableHead>Cobertura</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {criticos.map((plano) => (
                <TableRow key={plano.id}>
                  <TableCell>
                    <div className="font-medium text-text">{plano.nome_curto}</div>
                    <div className="edp-mono mt-1 text-xs text-text-mute">{plano.plano} · {plano.area}</div>
                  </TableCell>
                  <TableCell className="text-text-dim">{plano.regional}</TableCell>
                  <TableCell className="text-right edp-mono text-red">{fmtQtd(plano.deficit)}</TableCell>
                  <TableCell className="text-right edp-mono text-red">{fmtPct(plano.pct_disp)}</TableCell>
                  <TableCell className="text-right edp-mono text-red">{fmtRS(plano.gapFinanceiro)}</TableCell>
                  <TableCell><span className="text-xs text-text-mute">Não confirmável</span></TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-text-dim"
                      onClick={() => onSelecionarPlano(plano)}
                    >
                      Ver plano
                      <ArrowRight />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
