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

interface Totais {
  meta: number;
  carteira: number;
  saldo: number;
  postergado: number;
  gap_rs: number;
  pct_disp: number | null;
}

function somar(linhas: LinhaAnual[]): Totais {
  const t = linhas.reduce(
    (acc, l) => ({
      meta: acc.meta + l.meta,
      carteira: acc.carteira + l.carteira,
      saldo: acc.saldo + l.saldo,
      postergado: acc.postergado + l.postergado,
      gap_rs: acc.gap_rs + l.gap_rs,
    }),
    { meta: 0, carteira: 0, saldo: 0, postergado: 0, gap_rs: 0 },
  );
  return { ...t, pct_disp: t.meta === 0 ? null : t.carteira / t.meta };
}

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

function LinhaTotais({ rotulo, totais, forte }: {
  rotulo: string;
  totais: Totais;
  forte?: boolean;
}): React.JSX.Element {
  const borda = forte ? 'border-t-2 border-[var(--line-2)]' : 'border-t border-[var(--line)]';
  return (
    <TableRow className={`hover:bg-transparent font-semibold ${borda}`}>
      <TableCell className="edp-eyebrow py-[8px]">{rotulo}</TableCell>
      <TableCell />
      <TableCell className="text-right edp-mono">{fmtQtd(totais.meta)}</TableCell>
      <TableCell className="text-right edp-mono">{fmtQtd(totais.carteira)}</TableCell>
      <TableCell className="text-right edp-mono">{fmtQtd(totais.saldo)}</TableCell>
      <TableCell className="text-right"><BadgeDisp pct={totais.pct_disp} /></TableCell>
      <TableCell className="text-right edp-mono">{fmtQtd(totais.postergado)}</TableCell>
      <TableCell className="text-right edp-mono text-text-mute">
        {totais.gap_rs !== 0 ? fmtRS(totais.gap_rs) : ''}
      </TableCell>
    </TableRow>
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
          <TableHead className="text-right">Postergado</TableHead>
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
                <TableCell colSpan={8} className="edp-eyebrow py-[6px]">{area}</TableCell>
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
                  <TableCell className="text-right edp-mono">{fmtQtd(l.postergado)}</TableCell>
                  <TableCell className="text-right edp-mono text-text-mute">
                    {l.gap_rs !== 0 ? fmtRS(l.gap_rs) : ''}
                  </TableCell>
                </TableRow>
              ))}
              <LinhaTotais rotulo={`Subtotal ${area}`} totais={somar(grupo)} />
            </React.Fragment>
          );
        })}
        {linhas.length > 0 && (
          <LinhaTotais rotulo="Total geral" totais={somar(linhas)} forte />
        )}
      </TableBody>
    </Table>
  );
}
