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

import { fmtPct } from '../fmt';
import type { PlanoRelatorio } from '../relatorios-data';
import { EstadoVazio, TituloPainel } from '../relatorios-ui';
import type { ResumoRegionalDetalhado } from '../use-relatorios-data';

export function RegionalMatriz({
  planos,
  regionais,
  onSelecionarRegional,
}: {
  planos: PlanoRelatorio[];
  regionais: ResumoRegionalDetalhado[];
  onSelecionarRegional: (regional: string) => void;
}): React.JSX.Element {
  const areas = React.useMemo(
    () => [...new Set(planos.map((plano) => plano.area))].sort((primeira, segunda) => primeira.localeCompare(segunda, 'pt-BR')),
    [planos],
  );
  const matriz = React.useMemo(() => criarMatriz(planos), [planos]);

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <TituloPainel
          titulo="Matriz regional por área"
          detalhe="Disponibilidade agregada por regional e área. Traço indica que não há meta no recorte."
        />
      </div>
      {regionais.length === 0 || areas.length === 0 ? (
        <EstadoVazio>Aguardando o detalhamento do recorte por regional.</EstadoVazio>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[660px]">
          <TableHeader>
            <TableRow>
              <TableHead>Regional</TableHead>
              {areas.map((area) => <TableHead key={area} className="text-right">{area}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {regionais.map((regional) => (
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
                {areas.map((area) => {
                  const valor = matriz.get(chaveMatriz(regional.regional, area));
                  return <TableCell key={area} className={`text-right font-mono ${classeMatriz(valor)}`}>{fmtPct(valor ?? null)}</TableCell>;
                })}
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function criarMatriz(planos: PlanoRelatorio[]): Map<string, number | null> {
  const acumulados = new Map<string, { meta: number; carteira: number }>();
  for (const plano of planos) {
    if (!plano.regional) {
      continue;
    }
    const chave = chaveMatriz(plano.regional, plano.area);
    const atual = acumulados.get(chave) ?? { meta: 0, carteira: 0 };
    acumulados.set(chave, {
      meta: atual.meta + plano.meta,
      carteira: atual.carteira + plano.carteira,
    });
  }

  return new Map([...acumulados].map(([chave, valores]) => [
    chave,
    valores.meta > 0 ? valores.carteira / valores.meta : null,
  ]));
}

function chaveMatriz(regional: string, area: string): string {
  return `${regional}::${area}`;
}

function classeMatriz(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return 'text-text-mute';
  if (valor >= 1) return 'text-green';
  if (valor >= 0.85) return 'text-amber';
  return 'text-red';
}
