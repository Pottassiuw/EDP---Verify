import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';

export function CoffeeVerificar(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas();

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
        <span style={{ fontSize: 15, fontWeight: 700 }}>Verificar Notas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "8px 22px 10px",
                    background: "var(--tint-amber)", borderBottom: "1px solid rgba(240,169,59,.3)", fontSize: 13 }}>
        <span style={{ fontSize: 15 }}>🚧</span>
        <span>Em breve: verificacao automatica de regras para notas COFFEE</span>
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota no banco COFFEE. Busque notas pela pagina Pendentes ou Abrir Notas."
      />
    </div>
  );
}
