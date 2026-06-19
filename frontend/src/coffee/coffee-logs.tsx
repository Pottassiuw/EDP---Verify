import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable } from './coffee-log-table';

const TIPOS = [
  { value: "", label: "Todos" },
  { value: "api_call", label: "API" },
  { value: "transicao", label: "Transicao" },
  { value: "acao_usuario", label: "Usuario" },
] as const;

const LIMITES = [50, 100, 500] as const;

export function CoffeeLogs(): React.JSX.Element {
  const [tipo, setTipo] = React.useState("");
  const [notaPk, setNotaPk] = React.useState("");
  const [limit, setLimit] = React.useState<number>(100);

  const parsedPk = notaPk.trim() ? Number(notaPk) : undefined;
  const { logs, loading } = useCoffeeLogs({
    tipo: tipo || undefined,
    nota_pk: Number.isFinite(parsedPk) ? parsedPk : undefined,
    limit,
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* filter bar */}
      <div style={{ flexShrink: 0, padding: "14px 22px 10px", display: "flex", alignItems: "center",
                    gap: 14, flexWrap: "wrap" }}>
        <div className="edp-seg">
          {TIPOS.map((t) => (
            <button key={t.value} className={tipo === t.value ? "on" : ""}
                    onClick={() => setTipo(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--text-mute)" }}>Nota:</label>
          <input type="number" placeholder="PK" value={notaPk}
                 onChange={(e) => setNotaPk(e.target.value)}
                 style={{ width: 90, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--text)", fontSize: 12,
                          fontFamily: "var(--font-mono)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--text-mute)" }}>Limite:</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)",
                           background: "var(--surface-2)", color: "var(--text)", fontSize: 12 }}>
            {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <LogTable logs={logs} loading={loading} />
    </div>
  );
}
