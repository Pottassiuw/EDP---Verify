import React from 'react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { MESES_ABREV_PT, fmtPct, fmtQtd } from '../fmt';
import type { MesMensalizacao } from '../types';
import { TituloPainel } from '../relatorios-ui';

export function MensalizacaoTabela({
  meses,
  mesSelecionado,
  mesCorrente,
  postergadasMesCorrente,
  onSelecionarMes,
}: {
  meses: MesMensalizacao[];
  mesSelecionado: number;
  mesCorrente: number;
  postergadasMesCorrente: number;
  onSelecionarMes: (mes: number) => void;
}): React.JSX.Element {
  return (
    <section className="edp-panel overflow-hidden p-0">
      <div className="px-5 pt-5 pb-4">
        <TituloPainel
          titulo="Detalhamento mensal"
          detalhe="O dado de postergação é informado somente para o mês corrente pelo contrato atual."
        />
      </div>
      <div className="overflow-x-auto">
        <Table className="edp-table min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead className="text-right">Carteira</TableHead>
              <TableHead className="text-right">Executado</TableHead>
              <TableHead className="text-right">Disponibilidade</TableHead>
              <TableHead className="text-right">Postergado</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meses.map((mes) => {
              const disponibilidade = mes.meta > 0 ? mes.carteira / mes.meta : null;
              const selecionado = mes.mes === mesSelecionado;
              return (
                <TableRow key={mes.mes} className={selecionado ? 'bg-accent-tint' : ''}>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-pressed={selecionado}
                      className="h-auto w-full justify-start px-0 py-0 font-medium capitalize text-text hover:text-accent"
                      onClick={() => onSelecionarMes(mes.mes)}
                    >
                      {MESES_ABREV_PT[mes.mes - 1]}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right edp-mono">{fmtQtd(mes.meta)}</TableCell>
                  <TableCell className="text-right edp-mono">{fmtQtd(mes.carteira)}</TableCell>
                  <TableCell className="text-right edp-mono">{fmtQtd(mes.executado)}</TableCell>
                  <TableCell className="text-right edp-mono">{fmtPct(disponibilidade)}</TableCell>
                  <TableCell className="text-right edp-mono text-text-dim">{mes.mes === mesCorrente ? fmtQtd(postergadasMesCorrente) : '—'}</TableCell>
                  <TableCell><Situacao disponibilidade={disponibilidade} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function Situacao({ disponibilidade }: { disponibilidade: number | null }): React.JSX.Element {
  if (disponibilidade === null) return <span className="text-xs text-text-mute">Sem meta</span>;
  if (disponibilidade >= 1) return <span className="text-xs font-medium text-green">Meta atendida</span>;
  if (disponibilidade >= 0.85) return <span className="text-xs font-medium text-amber">Atenção</span>;
  return <span className="text-xs font-medium text-red">Abaixo da meta</span>;
}
