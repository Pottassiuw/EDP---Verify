import React from 'react';
import type { Note, CoffeeSubPage } from '../types';

import { CoffeeAbrir } from './coffee-abrir';
import { CoffeeGeradas } from './coffee-geradas';
import { CoffeeCorrigidas } from './coffee-corrigidas';
import { CoffeePendentes } from './coffee-pendentes';
import { CoffeeVerificar, type TriageHandoff } from './coffee-verificar';
import { CoffeeLogs } from './coffee-logs';

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
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 16,
                    padding: "0 22px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <strong style={{ fontSize: 14 }}>COFFEE</strong>
        <div className="edp-seg">
          {COFFEE_SUBS.map((s) => (
            <button key={s.id} className={sub === s.id ? "on" : ""} onClick={() => setSub(s.id)}>{s.label}</button>
          ))}
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
