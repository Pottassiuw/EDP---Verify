import React from 'react';

import { MESES_ABREV_PT, fmtQtd } from '../fmt';
import type { MesMensalizacao } from '../types';
import { TituloPainel } from '../relatorios-ui';

export function MensalizacaoChart({
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
  const maximo = Math.max(1, ...meses.flatMap((mes) => [mes.meta, mes.carteira]));

  return (
    <section className="edp-panel overflow-hidden p-0">
      <div className="px-5 pt-5 pb-3">
        <TituloPainel
          titulo="Meta e carteira por mês"
          detalhe="Barras pareadas: meta em contorno e carteira em preenchimento."
        />
      </div>
      <div className="overflow-x-auto px-5 pb-5">
        <div className="grid min-w-[720px] grid-cols-12 gap-3">
          {meses.map((mes) => {
            const selecionado = mes.mes === mesSelecionado;
            const percentualMeta = (mes.meta / maximo) * 100;
            const percentualCarteira = (mes.carteira / maximo) * 100;
            const percentualExecutado = mes.meta > 0 ? Math.min(mes.executado / mes.meta, 1) : 0;
            const percentualExecutadoNaCarteira = (Math.min(mes.executado, mes.carteira) / maximo) * 100;
            return (
              <button
                key={mes.mes}
                type="button"
                onClick={() => onSelecionarMes(mes.mes)}
                aria-pressed={selecionado}
                className={`group flex min-w-0 flex-col gap-2 rounded-edp px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  selecionado ? 'bg-accent-tint' : 'hover:bg-surface-2'
                }`}
              >
                <div
                  className="flex h-40 items-end justify-center gap-1.5"
                  role="img"
                  aria-label={`${nomeMes(mes.mes)}: meta ${fmtQtd(mes.meta)}, carteira ${fmtQtd(mes.carteira)}, executado ${fmtQtd(mes.executado)}`}
                >
                  <span className="relative block h-full w-3 overflow-hidden rounded-sm border border-line-2 bg-bg-2">
                    <span className="absolute right-0 bottom-0 left-0 bg-surface-3" style={{ height: `${percentualMeta}%` }} />
                  </span>
                  <span className="relative block h-full w-3 overflow-hidden rounded-sm bg-surface-3">
                    <span className={`absolute right-0 bottom-0 left-0 ${corCarteira(mes)}`} style={{ height: `${percentualCarteira}%` }} />
                    <span className="absolute right-0 bottom-0 left-0 bg-green" style={{ height: `${percentualExecutadoNaCarteira}%` }} />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="edp-mono text-xs text-text-dim">{MESES_ABREV_PT[mes.mes - 1]}</span>
                  {mes.mes === mesCorrente && postergadasMesCorrente > 0 && (
                    <span className="size-1.5 rounded-full bg-amber" title={`${fmtQtd(postergadasMesCorrente)} postergadas`} aria-label={`${fmtQtd(postergadasMesCorrente)} postergadas`} />
                  )}
                </div>
                <span className="edp-mono text-[10px] text-text-mute">Exec. {Math.round(percentualExecutado * 100)}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function corCarteira(mes: MesMensalizacao): string {
  if (mes.meta === 0) return 'bg-surface-3';
  if (mes.carteira >= mes.meta) return 'bg-green';
  if (mes.carteira / mes.meta >= 0.85) return 'bg-amber';
  return 'bg-red';
}

function nomeMes(mes: number): string {
  const nome = MESES_ABREV_PT[mes - 1] ?? '';
  return `${nome.slice(0, 1).toUpperCase()}${nome.slice(1)}`;
}
