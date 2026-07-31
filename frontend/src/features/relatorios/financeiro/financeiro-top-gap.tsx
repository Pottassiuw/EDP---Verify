import React from 'react';
import { ArrowRight } from 'lucide-react';

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

import { fmtQtd, fmtRS } from '../fmt';
import { ordenarPlanos, type PlanoRelatorio } from '../relatorios-data';
import { EstadoVazio, TituloPainel } from '../relatorios-ui';

export function FinanceiroTopGap({
  planos,
  onSelecionarPlano,
}: {
  planos: PlanoRelatorio[];
  onSelecionarPlano: (plano: PlanoRelatorio) => void;
}): React.JSX.Element {
  const maioresGaps = React.useMemo(
    () => ordenarPlanos(planos.filter((plano) => plano.gapFinanceiro > 0), 'gap').slice(0, 10),
    [planos],
  );

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <TituloPainel titulo="Planos com maior gap" detalhe="Prioridade financeira dentro do escopo filtrado." />
      </div>
      {maioresGaps.length === 0 ? (
        <EstadoVazio>Nenhum plano com gap financeiro negativo.</EstadoVazio>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Regional</TableHead>
                <TableHead className="text-right">Déficit</TableHead>
                <TableHead className="text-right">Gap R$</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {maioresGaps.map((plano) => (
                <TableRow key={plano.id}>
                  <TableCell>
                    <div className="font-medium text-text">{plano.nome_curto}</div>
                    <div className="mt-1 font-mono text-xs text-text-mute">{plano.plano} · {plano.area}</div>
                  </TableCell>
                  <TableCell className="text-text-dim">{plano.regional}</TableCell>
                  <TableCell className="text-right font-mono text-red">{fmtQtd(plano.deficit)}</TableCell>
                  <TableCell className="text-right font-mono text-red">{fmtRS(plano.gapFinanceiro)}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="xs" className="text-text-dim" onClick={() => onSelecionarPlano(plano)}>
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
