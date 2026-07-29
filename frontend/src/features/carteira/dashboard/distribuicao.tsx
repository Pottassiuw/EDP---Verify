import React from 'react';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { farol, FAROL_COR, fmtQtd, fmtPct } from '../../relatorios/fmt';
import type { LinhaPlano, LinhaRegional } from '../types';

function corCobertura(pct: number | null): string | undefined {
  const f = farol(pct);
  return f === null ? undefined : FAROL_COR[f];
}

export function DistribuicaoPlano({ linhas, onDrill }: {
  linhas: LinhaPlano[];
  onDrill: (plano: string) => void;
}): React.JSX.Element {
  return (
    <div className="carteira-table" style={{ overflowX: 'auto' }}>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Plano</TableHead><TableHead>Meta</TableHead>
          <TableHead>Planejado</TableHead><TableHead>Base</TableHead>
          <TableHead>Gap</TableHead><TableHead>Cobertura</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.plano} className="cursor-pointer"
                      onClick={() => onDrill(l.plano)}>
              <TableCell>{l.nome_curto ?? l.plano}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.meta)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.planejado)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.base_disponivel)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.gap)}</TableCell>
              <TableCell className="num-cell" style={{ color: corCobertura(l.cobertura_pct) }}>
                {l.cobertura_pct === null ? '—' : fmtPct(l.cobertura_pct)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DistribuicaoRegional({ linhas, onDrill }: {
  linhas: LinhaRegional[];
  onDrill: (regional: string) => void;
}): React.JSX.Element {
  return (
    <div className="carteira-table" style={{ overflowX: 'auto' }}>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Regional</TableHead><TableHead>Meta</TableHead>
          <TableHead>Planejado</TableHead><TableHead>Base</TableHead>
          <TableHead>Cobertura</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.regional} className="cursor-pointer"
                      onClick={() => onDrill(l.regional)}>
              <TableCell>{l.regional}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.meta)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.planejado)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.base_disponivel)}</TableCell>
              <TableCell className="num-cell" style={{ color: corCobertura(l.cobertura_pct) }}>
                {l.cobertura_pct === null ? '—' : fmtPct(l.cobertura_pct)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
