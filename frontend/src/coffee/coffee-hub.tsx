import React from 'react';
import type { Note, CoffeeSubPage } from '../types';

import { CoffeeAbrir } from './coffee-abrir';
import { CoffeeGeradas } from './coffee-geradas';
import { CoffeeCorrigidas } from './coffee-corrigidas';
import { CoffeePendentes } from './coffee-pendentes';
import { CoffeeVerificar, type TriageHandoff } from './coffee-verificar';
import { CoffeeLogs } from './coffee-logs';

const SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: "verificar", rotulo: "Verificar" },
  { id: "abrir", rotulo: "Abrir" },
  { id: "geradas", rotulo: "Gerar" },
  { id: "corrigidas", rotulo: "Corrigidas" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "logs", rotulo: "Logs" },
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
          {SUBS.map((s) => (
            <button key={s.id} className={sub === s.id ? "on" : ""} onClick={() => setSub(s.id)}>{s.rotulo}</button>
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
