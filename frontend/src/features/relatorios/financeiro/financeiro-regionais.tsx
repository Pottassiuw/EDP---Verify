import React from 'react';

import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { fmtRS } from '../fmt';
import { EstadoVazio, TituloPainel } from '../relatorios-ui';
import type { ResumoRegionalDetalhado } from '../use-relatorios-data';

export function FinanceiroRegionais({
  regionais,
  onSelecionarRegional,
}: {
  regionais: ResumoRegionalDetalhado[];
  onSelecionarRegional: (regional: string) => void;
}): React.JSX.Element {
  const ordenadas = React.useMemo(
    () => [...regionais].sort((primeira, segunda) => (primeira.gapRs ?? 0) - (segunda.gapRs ?? 0)),
    [regionais],
  );

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <TituloPainel
          titulo="Financeiro por regional"
          detalhe="Os valores usam o total anual retornado para cada regional."
        />
      </div>
      {ordenadas.length === 0 ? (
        <EstadoVazio>Aguardando o detalhamento financeiro por regional.</EstadoVazio>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Regional</TableHead>
              <TableHead className="text-right">Meta R$</TableHead>
              <TableHead className="text-right">Carteira R$</TableHead>
              <TableHead className="text-right">Gap R$</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenadas.map((regional) => (
              <TableRow key={regional.regional}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onSelecionarRegional(regional.regional)}
                    className="font-medium text-text hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {regional.regional}
                  </button>
                </TableCell>
                <TableCell className="text-right font-mono text-text-dim">{formatarValor(regional.metaRs)}</TableCell>
                <TableCell className="text-right font-mono text-text-dim">{formatarValor(regional.carteiraRs)}</TableCell>
                <TableCell className={`text-right font-mono ${regional.gapRs !== null && regional.gapRs !== undefined && regional.gapRs < 0 ? 'text-red' : 'text-text-dim'}`}>{formatarValor(regional.gapRs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function formatarValor(valor: number | null): string {
  return valor === null ? '—' : fmtRS(valor);
}
