import React from 'react';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { farol, fmtPct, fmtQtd, fmtRS, type Farol } from './fmt';
import type { LinhaAnual } from './types';

const AREAS: LinhaAnual['area'][] = ['Construção', 'CSD', 'Outros'];

const FAROL_STYLE: Record<Farol, React.CSSProperties> = {
  verde:    { background: 'var(--tint-green)', color: 'var(--green)' },
  ambar:    { background: 'var(--tint-amber)', color: 'var(--amber)' },
  vermelho: { background: 'var(--tint-red)', color: 'var(--red)' },
};

function BadgeDisp({ pct }: { pct: number | null }): React.JSX.Element {
  const cor = farol(pct);
  if (cor === null) {
    return <span className="text-text-mute">—</span>;
  }
  return (
    <span className="inline-block py-[2px] px-[8px] rounded-[999px] text-[11px] font-semibold tracking-[.03em]"
          style={FAROL_STYLE[cor]}>
      {fmtPct(pct)}
    </span>
  );
}

export function TabelaAnual({ linhas, aoClicarPlano }: {
  linhas: LinhaAnual[];
  aoClicarPlano: (plano: string) => void;
}): React.JSX.Element {
  const porArea = React.useMemo(() => {
    const mapa = new Map<LinhaAnual['area'], LinhaAnual[]>();
    for (const l of linhas) {
      const grupo = mapa.get(l.area) ?? [];
      grupo.push(l);
      mapa.set(l.area, grupo);
    }
    return mapa;
  }, [linhas]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Plano</TableHead>
          <TableHead>U.M</TableHead>
          <TableHead className="text-right">Meta</TableHead>
          <TableHead className="text-right">Carteira</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="text-right">%Disp</TableHead>
          <TableHead className="text-right">R$ gap</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {AREAS.map((area) => {
          const grupo = porArea.get(area);
          if (!grupo || grupo.length === 0) return null;
          return (
            <React.Fragment key={area}>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="edp-eyebrow py-[6px]">{area}</TableCell>
              </TableRow>
              {grupo.map((l) => (
                <TableRow key={l.plano} onClick={() => aoClicarPlano(l.plano)}
                          tabIndex={0} role="button"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoClicarPlano(l.plano); }
                          }}
                          className="cursor-pointer"
                          aria-label={`Ver notas do plano ${l.plano}`}>
                  <TableCell title={l.plano}>{l.nome_curto}</TableCell>
                  <TableCell className="text-text-mute">{l.unidade}</TableCell>
                  <TableCell className="text-right edp-mono">{fmtQtd(l.meta)}</TableCell>
                  <TableCell className="text-right edp-mono">{fmtQtd(l.carteira)}</TableCell>
                  <TableCell className="text-right edp-mono">{fmtQtd(l.saldo)}</TableCell>
                  <TableCell className="text-right"><BadgeDisp pct={l.pct_disp} /></TableCell>
                  <TableCell className="text-right edp-mono text-text-mute">
                    {l.gap_rs !== 0 ? fmtRS(l.gap_rs) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
