import React from 'react';
import type { CoffeeConclusaoFiltro, CoffeeSubPage, Note } from '../../types';

import { CoffeeAbrir } from './coffee-abrir';
import { CoffeeConcluidas } from './concluidas/coffee-concluidas';
import { CoffeeOperacao } from './operacao/coffee-operacao';
import { CoffeeVerificar, type TriageHandoff } from './coffee-verificar';
import { CoffeeLogs } from './coffee-logs';
import { COFFEE_SUBS } from './subs';
import { Eyebrow, SegTabs } from '@/components/branded/section';
import { Button } from '@/components/ui/button';


interface CoffeeHubProps {
  notes: Note[];
  sub: CoffeeSubPage;
  setSub: (s: CoffeeSubPage) => void;
  triage: TriageHandoff;
  coffeeReturn: { noteId: string; noteRef: string } | null;
  concluidasHandoff: { filtro: CoffeeConclusaoFiltro; id: number } | null;
  onIrParaInput?: () => void;
  onIrParaSincronizacao: () => void;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeHub({
  notes,
  sub,
  setSub,
  triage,
  coffeeReturn,
  concluidasHandoff,
  onIrParaInput,
  onIrParaSincronizacao,
  onClearReturn,
  onBackToTriagem,
}: CoffeeHubProps): React.JSX.Element {

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="shrink-0 bg-surface border-b border-b-line">
        <div className="pt-[13px] px-[22px] pb-[11px] flex items-center gap-[12px]">
          <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
            <Eyebrow>Módulo COFFEE</Eyebrow>
            <strong className="text-[16px] font-semibold leading-[1.15] tracking-display text-balance">
              Geração de notas
            </strong>
          </div>
          {sub === "verificar" && triage.screen === "dashboard" && (
            <div className="flex items-center gap-[12px] shrink-0">
              <span className="font-mono text-[11px] text-text-mute bg-bg-2
                    py-[5px] px-[10px] rounded-[6px] border border-line">{triage.file}</span>
              <span title="Conectado ao backend"
                    className="inline-flex items-center gap-[6px] text-[10.5px]
                             font-mono tracking-[.06em] uppercase
                             py-[4px] px-[9px] rounded-[999px]
                             text-green bg-tint-green"
                    style={{ border: "1px solid rgba(0,168,89,.3)" }}>
                <span className="w-[6px] h-[6px] rounded-[50%] bg-[currentColor]" />
                API
              </span>
              <Button variant="ghost" size="sm" title="Nova planilha" onClick={triage.onReset}>↑ Nova</Button>
            </div>
          )}
        </div>
        <div className="py-0 px-[22px] border-t border-t-line">
          <SegTabs tabs={COFFEE_SUBS} value={sub} onChange={setSub}
                   ariaLabel="Seções do módulo COFFEE" />
        </div>
      </div>

      {sub === "abrir" ? (
        <CoffeeAbrir notes={notes}
                     coffeeReturn={coffeeReturn} onClearReturn={onClearReturn}
                     onBackToTriagem={onBackToTriagem} />
      ) : sub === "operacao" ? (
        <CoffeeOperacao onIrParaSincronizacao={onIrParaSincronizacao} />
      ) : sub === "concluidas" ? (
        <CoffeeConcluidas
          concluidasHandoff={concluidasHandoff}
          onIrParaInput={onIrParaInput}
          onIrParaSincronizacao={onIrParaSincronizacao}
        />
      ) : sub === "verificar" ? (
        <CoffeeVerificar triage={triage} />
      ) : sub === "logs" ? (
        <CoffeeLogs />
      ) : null}
    </div>
  );
}
