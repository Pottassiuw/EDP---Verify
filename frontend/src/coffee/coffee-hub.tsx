import React from 'react';
import type { Note, CoffeeSubPage } from '../types';

import { CoffeeAbrir } from './coffee-abrir';
import { CoffeeGeradas } from './coffee-geradas';
import { CoffeeCorrigidas } from './coffee-corrigidas';
import { CoffeePendentes } from './coffee-pendentes';
import { CoffeeVerificar, type TriageHandoff } from './coffee-verificar';
import { CoffeeLogs } from './coffee-logs';
import { SegTabs } from '@/components/branded/section';

export const COFFEE_SUBS: { id: CoffeeSubPage; label: string }[] = [
  { id: "verificar", label: "Verificar" },
  { id: "abrir",     label: "Abrir" },
  { id: "geradas",   label: "Gerar" },
  { id: "corrigidas",label: "Corrigidas" },
  { id: "pendentes", label: "Pendentes" },
  { id: "logs",      label: "Logs" },
];

interface CoffeeHubProps {
  notes: Note[];
  layout: "composer" | "split";
  sub: CoffeeSubPage;
  setSub: (s: CoffeeSubPage) => void;
  triage: TriageHandoff;
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeHub({ notes, layout, sub, setSub, triage, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeHubProps): React.JSX.Element {

  return (
    <div className="ui-reset" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ padding: "13px 22px 11px", display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="edp-eyebrow">Módulo COFFEE</span>
          <strong className="edp-title" style={{ fontSize: 16 }}>Geração de notas</strong>
        </div>
        <div style={{ padding: "0 22px", borderTop: "1px solid var(--line)" }}>
          <SegTabs tabs={COFFEE_SUBS.map((s) => ({ id: s.id, rotulo: s.label }))}
                   value={sub} onChange={setSub} ariaLabel="Seções do módulo COFFEE" />
        </div>
      </div>

      {sub === "abrir" ? (
        <CoffeeAbrir notes={notes} layout={layout}
                     coffeeReturn={coffeeReturn} onClearReturn={onClearReturn}
                     onBackToTriagem={onBackToTriagem} />
      ) : sub === "geradas" ? (
        <CoffeeGeradas />
      ) : sub === "corrigidas" ? (
        <CoffeeCorrigidas />
      ) : sub === "pendentes" ? (
        <CoffeePendentes />
      ) : sub === "verificar" ? (
        <CoffeeVerificar triage={triage} />
      ) : sub === "logs" ? (
        <CoffeeLogs />
      ) : null}
    </div>
  );
}
