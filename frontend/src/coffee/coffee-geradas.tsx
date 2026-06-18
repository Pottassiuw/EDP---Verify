import React from 'react';
import type { CoffeeNota } from './types';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';

const API_BASE = localStorage.getItem("edp_api") || "/api";

export function CoffeeGeradas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const [arquivando, setArquivando] = React.useState<Set<number>>(() => new Set());
  const [arquivadas, setArquivadas] = React.useState<Set<number>>(() => new Set());
  const [errosArquivar, setErrosArquivar] = React.useState<Map<number, string>>(() => new Map());

  function arquivar(nota: CoffeeNota): void {
    setArquivando((prev) => new Set(prev).add(nota.pk));
    setErrosArquivar((prev) => { const m = new Map(prev); m.delete(nota.pk); return m; });

    fetch(`${API_BASE}/coffee/sap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: nota.pk, sap: nota.id_sap }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`POST /sap -> ${res.status}`);
        setArquivadas((prev) => new Set(prev).add(nota.pk));
        setTimeout(refetch, 1500);
      })
      .catch((err: unknown) => {
        setErrosArquivar((prev) => new Map(prev).set(nota.pk, err instanceof Error ? err.message : String(err)));
      })
      .finally(() => {
        setArquivando((prev) => { const s = new Set(prev); s.delete(nota.pk); return s; });
      });
  }

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
        <span style={{ fontSize: 15, fontWeight: 700 }}>Notas Geradas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota gerada encontrada. Notas aparecem aqui apos serem buscadas com SAP real."
        actionColumn={(nota) => {
          const busy = arquivando.has(nota.pk);
          const done = arquivadas.has(nota.pk);
          const errMsg = errosArquivar.get(nota.pk);
          if (done) {
            return <span className="cnt-tag gerada" style={{ opacity: 0.7 }}>Arquivada</span>;
          }
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="edp-btn sm" disabled={busy} onClick={() => arquivar(nota)}
                      style={{ fontWeight: 600, fontSize: 12 }}>
                {busy ? "Arquivando..." : "Arquivar"}
              </button>
              {errMsg && <span style={{ fontSize: 11, color: "var(--red)" }}>{errMsg}</span>}
            </div>
          );
        }}
      />
    </div>
  );
}
