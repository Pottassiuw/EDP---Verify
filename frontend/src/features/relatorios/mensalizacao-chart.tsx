import React from 'react';

import { fmtQtd, MESES_ABREV_PT } from './fmt';
import type { MesMensalizacao } from './types';

const LARGURA = 620;
const ALTURA = 240;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const PAD_X = 6;
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
    <div className="flex flex-col gap-[10px]">
      <div className="flex gap-[16px] text-[13px] text-text-mute">
        <span><span className="inline-block w-[11px] h-[11px] rounded-[2px] mr-[5px] align-middle border border-[var(--line)] bg-[var(--surface-2)]" />Meta</span>
        <span><span className="inline-block w-[11px] h-[11px] rounded-[2px] mr-[5px] align-middle bg-[var(--accent)]" />Carteira</span>
        <span><span className="inline-block w-[11px] h-[11px] rounded-[2px] mr-[5px] align-middle bg-[var(--green-2)]" />Executado</span>
      </div>
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} width="100%" role="img"
           aria-label="Mensalização: meta, carteira e executado por mês">
        {meses.map((m, i) => {
          const x0 = PAD_X + i * larguraGrupo;
          const hMeta = altura(m.meta);
          const hCarteira = altura(m.carteira);
          const hExec = m.mes <= mesCorrente ? altura(m.executado) : 0;
          const baseY = ALTURA - PAD_BOTTOM;
          const atual = m.mes === mesCorrente;
          const xCarteira = x0 + larguraBarra + GAP_GRUPO;
          return (
            <g key={m.mes}>
              {atual && (
                <rect x={x0 - GAP_GRUPO / 2} y={PAD_TOP - 4} width={larguraGrupo}
                      height={ALTURA - PAD_TOP - PAD_BOTTOM + 8} rx={RAIO}
                      fill="var(--surface-2)" opacity={0.6} />
              )}
              <rect x={x0} y={baseY - hMeta} width={larguraBarra} height={hMeta}
                    rx={RAIO} fill="var(--surface-2)" stroke="var(--line)">
                <title>{`${MESES_ABREV_PT[m.mes - 1]} · Meta ${fmtQtd(m.meta)}`}</title>
              </rect>
              <rect x={xCarteira} y={baseY - hCarteira}
                    width={larguraBarra} height={hCarteira} rx={RAIO} fill="var(--accent)">
                <title>{`${MESES_ABREV_PT[m.mes - 1]} · Carteira ${fmtQtd(m.carteira)}`}</title>
              </rect>
              {hExec > 0 && (
                <rect x={xCarteira} y={baseY - hExec}
                      width={larguraBarra} height={hExec} rx={RAIO} fill="var(--green-2)">
                  <title>{`${MESES_ABREV_PT[m.mes - 1]} · Executado ${fmtQtd(m.executado)}`}</title>
                </rect>
              )}
              {m.carteira > 0 && (
                <text x={xCarteira + larguraBarra / 2} y={baseY - hCarteira - 5}
                      textAnchor="middle" className="edp-mono" fontSize="9"
                      fill="var(--text-mute)">
                  {fmtQtd(Math.round(m.carteira))}
                </text>
              )}
              <text x={x0 + larguraGrupo / 2 - GAP_GRUPO / 2} y={ALTURA - 7}
                    textAnchor="middle" className="edp-mono" fontSize="11"
                    fontWeight={atual ? 600 : 400}
                    fill={atual ? 'var(--text)' : 'var(--text-mute)'}>
                {MESES_ABREV_PT[m.mes - 1]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
