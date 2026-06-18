import React from 'react';
import type { Note, CoffeeSubPage } from '../types';
import { usePersistedState } from '../hooks/use-persisted-state';
import { CoffeeAbrir } from './coffee-abrir';
import { CoffeePlaceholder } from './placeholder';

const SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: "abrir", rotulo: "Abrir" },
  { id: "geradas", rotulo: "Geradas" },
  { id: "corrigidas", rotulo: "Corrigidas" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "verificar", rotulo: "Verificar" },
];

const PLACEHOLDERS: Record<string, { titulo: string; descricao: string }> = {
  geradas: { titulo: "Notas Geradas", descricao: "Notas com SAP real ja geradas pelo COFFEE. Em breve voce podera visualiza-las e move-las para o Input." },
  corrigidas: { titulo: "Notas Corrigidas", descricao: "Notas que transitaram de pendente para SAP real. Em breve voce podera acompanhar as correcoes." },
  pendentes: { titulo: "Notas Pendentes", descricao: "Notas aguardando geracao (SAP 10000000). Em breve voce podera disparar buscas e acompanhar o progresso." },
  verificar: { titulo: "Verificar Notas", descricao: "Verificacao de notas COFFEE com interface amigavel. Em breve." },
};

interface CoffeeHubProps {
  notes: Note[];
  layout: "composer" | "split";
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeHub({ notes, layout, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeHubProps): React.JSX.Element {
  const [sub, setSub] = usePersistedState<CoffeeSubPage>("edp_coffee_sub", "abrir");

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
      ) : (
        <CoffeePlaceholder
          titulo={PLACEHOLDERS[sub]?.titulo ?? sub}
          descricao={PLACEHOLDERS[sub]?.descricao ?? ""} />
      )}
    </div>
  );
}
