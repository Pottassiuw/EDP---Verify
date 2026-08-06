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

import { fmtQtd } from '../fmt';
import type { PlanoRelatorio } from '../relatorios-data';
import { EstadoVazio, TituloPainel } from '../relatorios-ui';

export function PostergacoesTabela({
  planos,
  semDadosNoMes,
  onSelecionarPlano,
}: {
  planos: PlanoRelatorio[];
  semDadosNoMes: boolean;
  onSelecionarPlano: (plano: PlanoRelatorio) => void;
}): React.JSX.Element {
  const postergados = React.useMemo(
    () => planos.filter((plano) => plano.postergado > 0).sort((primeiro, segundo) => segundo.postergado - primeiro.postergado),
    [planos],
  );

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <TituloPainel
          titulo="Planos com postergação"
          detalhe="Destino e reincidência não são retornados pelo contrato atual."
        />
      </div>
      {postergados.length === 0 ? (
        <EstadoVazio>
          {semDadosNoMes
            ? 'O detalhamento por plano só está disponível para o mês corrente.'
            : 'Nenhum plano postergado no escopo atual.'}
        </EstadoVazio>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Regional</TableHead>
                <TableHead className="text-right">Postergado</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Reincidência</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {postergados.map((plano) => (
                <TableRow key={plano.id}>
                  <TableCell>
                    <div className="font-medium text-text">{plano.nome_curto}</div>
                    <div className="mt-1 font-mono text-xs text-text-mute">{plano.plano} · {plano.area}</div>
                  </TableCell>
                  <TableCell className="text-text-dim">{plano.regional}</TableCell>
                  <TableCell className="text-right font-mono text-amber">{fmtQtd(plano.postergado)}</TableCell>
                  <TableCell className="text-text-mute">—</TableCell>
                  <TableCell className="text-text-mute">—</TableCell>
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
