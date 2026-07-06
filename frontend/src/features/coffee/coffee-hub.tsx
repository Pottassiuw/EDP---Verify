import React from 'react';
import type { Note, CoffeeSubPage } from '../../types';

import { CoffeeAbrir } from './coffee-abrir';
import { CoffeeGeradas } from './coffee-geradas';
import { CoffeeCorrigidas } from './coffee-corrigidas';
import { CoffeePendentes } from './coffee-pendentes';
import { CoffeeVerificar, type TriageHandoff } from './coffee-verificar';
import { CoffeeLogs } from './coffee-logs';
import { SegTabs } from '@/components/branded/section';
import { Button } from '@/components/ui/button';

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
  sub: CoffeeSubPage;
  setSub: (s: CoffeeSubPage) => void;
  triage: TriageHandoff;
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeHub({ notes, sub, setSub, triage, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeHubProps): React.JSX.Element {

  return (
    <div className="ui-reset" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ padding: "13px 22px 11px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="edp-eyebrow">Módulo COFFEE</span>
            <strong className="edp-title" style={{ fontSize: 16 }}>Geração de notas</strong>
          </div>
          {sub === "verificar" && triage.screen === "dashboard" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)", background: "var(--bg-2)",
                    padding: "5px 10px", borderRadius: 6, border: "1px solid var(--line)" }}>{triage.file}</span>
              <span title="Conectado ao backend"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5,
                             fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase",
                             padding: "4px 9px", borderRadius: 999,
                             color: "var(--green)", background: "var(--tint-green)",
                             border: "1px solid rgba(0,168,89,.3)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                API
              </span>
              <Button variant="ghost" size="sm" title="Nova planilha" onClick={triage.onReset}>↑ Nova</Button>
            </div>
          )}
        </div>
        <div style={{ padding: "0 22px", borderTop: "1px solid var(--line)" }}>
          <SegTabs tabs={COFFEE_SUBS.map((s) => ({ id: s.id, rotulo: s.label }))}
                   value={sub} onChange={setSub} ariaLabel="Seções do módulo COFFEE" />
        </div>
      </div>

      {sub === "abrir" ? (
        <CoffeeAbrir notes={notes}
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
