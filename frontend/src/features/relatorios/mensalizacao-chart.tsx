import React from 'react';

import { fmtQtd, MESES_ABREV_PT } from './fmt';
import type { MesMensalizacao } from './types';

const LARGURA = 600;
const ALTURA = 180;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;
const PAD_X = 4;
const GAP_GRUPO = 6;
const RAIO = 2;

export function MensalizacaoChart({ meses, mesCorrente }: {
  meses: MesMensalizacao[];
  mesCorrente: number;
}): React.JSX.Element {
  const escala = Math.max(1, ...meses.map((m) => Math.max(m.meta, m.carteira)));
  const alturaUtil = ALTURA - PAD_TOP - PAD_BOTTOM;
  const larguraGrupo = (LARGURA - PAD_X * 2) / meses.length;
  const larguraBarra = (larguraGrupo - GAP_GRUPO) / 2;

  function altura(v: number): number {
    return escala > 0 ? (v / escala) * alturaUtil : 0;
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex gap-[14px] text-[11px] text-text-mute">
        <span><span className="inline-block w-[10px] h-[10px] rounded-[2px] mr-[4px] align-middle border border-[var(--line)] bg-[var(--surface-2)]" />Meta</span>
        <span><span className="inline-block w-[10px] h-[10px] rounded-[2px] mr-[4px] align-middle bg-[var(--accent)]" />Carteira</span>
        <span><span className="inline-block w-[10px] h-[10px] rounded-[2px] mr-[4px] align-middle bg-green" />Executado</span>
      </div>
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} width="100%" role="img"
           aria-label="Mensalização: meta, carteira e executado por mês">
        {meses.map((m, i) => {
          const x0 = PAD_X + i * larguraGrupo;
          const hMeta = altura(m.meta);
          const hCarteira = altura(m.carteira);
          const hExec = m.mes <= mesCorrente ? altura(m.executado) : 0;
          const baseY = ALTURA - PAD_BOTTOM;
          return (
            <g key={m.mes}>
              <rect x={x0} y={baseY - hMeta} width={larguraBarra} height={hMeta}
                    rx={RAIO} fill="var(--surface-2)" stroke="var(--line)">
                <title>{`${MESES_ABREV_PT[m.mes - 1]} · Meta ${fmtQtd(m.meta)}`}</title>
              </rect>
              <rect x={x0 + larguraBarra + GAP_GRUPO} y={baseY - hCarteira}
                    width={larguraBarra} height={hCarteira} rx={RAIO} fill="var(--accent)">
                <title>{`${MESES_ABREV_PT[m.mes - 1]} · Carteira ${fmtQtd(m.carteira)}`}</title>
              </rect>
              {hExec > 0 && (
                <rect x={x0 + larguraBarra + GAP_GRUPO} y={baseY - hExec}
                      width={larguraBarra} height={hExec} rx={RAIO} fill="var(--green)">
                  <title>{`${MESES_ABREV_PT[m.mes - 1]} · Executado ${fmtQtd(m.executado)}`}</title>
                </rect>
              )}
              <text x={x0 + larguraGrupo / 2 - GAP_GRUPO / 2} y={ALTURA - 6}
                    textAnchor="middle" className="edp-mono" fontSize="10"
                    fill="var(--text-mute)">
                {MESES_ABREV_PT[m.mes - 1]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
