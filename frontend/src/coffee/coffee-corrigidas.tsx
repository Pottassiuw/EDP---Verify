import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';

export function CoffeeCorrigidas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("corrigida");

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-mute)" }}>
        <span style={{ color: "var(--red)" }}>Erro ao carregar notas: {error}</span>
        <button className="edp-btn sm" onClick={refetch}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Notas Corrigidas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div style={{ flexShrink: 0, padding: "0 22px 10px", fontSize: 12, color: "var(--text-dim)" }}>
        Notas que transitaram de pendente para SAP real. Na proxima busca, passam para Geradas.
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota corrigida no momento. Notas aparecem aqui quando transitam de SAP pendente para SAP real."
      />
    </div>
  );
}
