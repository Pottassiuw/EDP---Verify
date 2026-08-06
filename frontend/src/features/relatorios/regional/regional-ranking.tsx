import React from 'react';
import { ChevronRight } from 'lucide-react';

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
import { BarraDisponibilidade, BadgeDisponibilidade, EstadoVazio, TituloPainel } from '../relatorios-ui';
import type { ResumoRegionalDetalhado } from '../use-relatorios-data';

export function RegionalRanking({
  regionais,
  regionalSelecionada,
  onSelecionarRegional,
}: {
  regionais: ResumoRegionalDetalhado[];
  regionalSelecionada: string | null;
  onSelecionarRegional: (regional: string | null) => void;
}): React.JSX.Element {
  const ordenadas = React.useMemo(
    () => [...regionais].sort((primeira, segunda) => disponibilidade(primeira) - disponibilidade(segunda)),
    [regionais],
  );

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <TituloPainel
          titulo="Ranking de disponibilidade"
          detalhe="Regionais com menor disponibilidade aparecem primeiro."
        />
      </div>
      {ordenadas.length === 0 ? (
        <EstadoVazio>Aguardando o detalhamento do recorte por regional.</EstadoVazio>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Regional</TableHead>
              <TableHead className="w-56">Disponibilidade</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead className="text-right">Carteira</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenadas.map((regional) => (
              <TableRow key={regional.regional} className={regionalSelecionada === regional.regional ? 'bg-accent-tint' : ''}>
                <TableCell className="font-medium text-text">{regional.regional}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="min-w-28 flex-1"><BarraDisponibilidade pct={regional.pctDisp} label={`Disponibilidade de ${regional.regional}`} /></div>
                    <BadgeDisponibilidade pct={regional.pctDisp} />
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{fmtQtd(regional.meta)}</TableCell>
                <TableCell className="text-right font-mono">{fmtQtd(regional.carteira)}</TableCell>
                <TableCell className={`text-right font-mono ${regional.saldo < 0 ? 'text-red' : 'text-green'}`}>{fmtQtd(regional.saldo)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-text-dim"
                    onClick={() => onSelecionarRegional(regionalSelecionada === regional.regional ? null : regional.regional)}
                  >
                    {regionalSelecionada === regional.regional ? 'Limpar' : 'Filtrar'}
                    <ChevronRight />
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

function disponibilidade(regional: ResumoRegionalDetalhado): number {
  return regional.pctDisp ?? Number.POSITIVE_INFINITY;
}
