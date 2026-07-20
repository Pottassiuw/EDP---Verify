import React from 'react';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { FAROL_COR, farol, fmtPct, fmtQtd, MESES_ABREV_PT } from './fmt';
import type { MesMensalizacao } from './types';

export function TabelaMensal({ meses, mesCorrente }: {
  meses: MesMensalizacao[];
  mesCorrente: number;
}): React.JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mês</TableHead>
          <TableHead className="text-right">Meta</TableHead>
          <TableHead className="text-right">Carteira</TableHead>
          <TableHead className="text-right">Executado</TableHead>
          <TableHead className="text-right">%Exec</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {meses.map((m) => {
          const execPct = m.meta > 0 ? m.executado / m.meta : null;
          const f = farol(execPct);
          const futuro = m.mes > mesCorrente;
          return (
            <TableRow key={m.mes} className="hover:bg-transparent">
              <TableCell className="capitalize">{MESES_ABREV_PT[m.mes - 1]}</TableCell>
              <TableCell className="text-right edp-mono">{fmtQtd(m.meta)}</TableCell>
              <TableCell className="text-right edp-mono">{fmtQtd(m.carteira)}</TableCell>
              <TableCell className="text-right edp-mono">{futuro ? '' : fmtQtd(m.executado)}</TableCell>
              <TableCell className="text-right edp-mono"
                         style={{ color: f ? FAROL_COR[f] : 'var(--text-mute)' }}>
                {futuro ? '' : fmtPct(execPct)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
