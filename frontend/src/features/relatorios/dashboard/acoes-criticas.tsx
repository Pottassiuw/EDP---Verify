import React from 'react';
import { ArrowRight, CircleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { farol, FAROL_COR, fmtPct, fmtQtd, fmtRS } from '../fmt';
import { ordenarPlanos, type PlanoRelatorio } from '../relatorios-data';
import { EstadoVazio, TituloPainel } from '../relatorios-ui';

function corCobertura(pct: number | null | undefined): string | undefined {
  const f = farol(pct ?? null);
  return f === null ? undefined : FAROL_COR[f];
}

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
    <Card className="overflow-hidden">
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
          <Table className="min-w-[860px]">
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
                    <div className="mt-1 font-mono text-xs text-text-mute">{plano.plano} · {plano.area}</div>
                  </TableCell>
                  <TableCell className="text-text-dim">{plano.regional}</TableCell>
                  <TableCell className="text-right font-mono text-red">{fmtQtd(plano.deficit)}</TableCell>
                  <TableCell className="text-right font-mono text-red">{fmtPct(plano.pct_disp)}</TableCell>
                  <TableCell className="text-right font-mono text-red">{fmtRS(plano.gapFinanceiro)}</TableCell>
                  <TableCell>
                    {plano.cobertura_pct == null ? (
                      <span className="text-xs text-text-mute">—</span>
                    ) : (
                      <div>
                        <span className="font-mono" style={{ color: corCobertura(plano.cobertura_pct) }}>
                          {fmtPct(plano.cobertura_pct)}
                        </span>
                        <div className="text-xs text-text-mute">base {fmtQtd(plano.base_disponivel ?? 0)}</div>
                      </div>
                    )}
                  </TableCell>
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
    </Card>
  );
}
