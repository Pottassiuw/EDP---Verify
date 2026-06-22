import React from 'react';
import type { CoffeeLog } from './types';
import { formatRelativeTime } from './coffee-notas-table';

const LOG_STYLE = `
  .clog-wrap{flex:1;min-height:0;overflow:auto;padding:0 22px 24px}
  .clog-tbl{width:100%;border-collapse:separate;border-spacing:0}
  .clog-tbl th{position:sticky;top:0;background:var(--surface);text-align:left;padding:8px 10px;
    font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mute);
    border-bottom:2px solid var(--line)}
  .clog-tbl td{padding:8px 10px;border-bottom:1px solid var(--line);color:var(--text)}
  .clog-tbl tr:hover td{background:var(--surface-2)}
  .clog-tag{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:.03em}
  .clog-tag.api{background:rgba(59,130,246,0.14);color:#3b82f6}
  .clog-tag.trans{background:rgba(139,92,246,0.14);color:#8b5cf6}
  .clog-tag.user{background:rgba(34,197,94,0.14);color:#22c55e}
  .clog-compact .clog-tbl{font-size:12px}
  .clog-compact .clog-tbl th{padding:6px 8px;font-size:10px}
  .clog-compact .clog-tbl td{padding:6px 8px}
`;

const TIPO_CLASS: Record<string, string> = {
  api_call: "api",
  transicao: "trans",
  acao_usuario: "user",
};
const TIPO_LABEL: Record<string, string> = {
  api_call: "API",
  transicao: "Transicao",
  acao_usuario: "Usuario",
};

function DetailsSummary({ detalhes }: { detalhes: Record<string, unknown> | null }): React.JSX.Element {
  if (!detalhes) return <span style={{ color: "var(--text-mute)" }}>—</span>;
  const json = JSON.stringify(detalhes);
  const preview = json.length > 40 ? json.slice(0, 40) + "..." : json;
  return (
    <details style={{ fontSize: "inherit" }}>
      <summary style={{ cursor: "pointer", color: "var(--text-mute)" }} className="edp-mono">{preview}</summary>
      <pre style={{ margin: "6px 0 0", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all",
                    color: "var(--text-dim)", lineHeight: 1.5 }}>{JSON.stringify(detalhes, null, 2)}</pre>
    </details>
  );
}

interface LogTableProps {
  logs: CoffeeLog[];
  loading: boolean;
  compact?: boolean;
}

export function LogTable({ logs, loading, compact }: LogTableProps): React.JSX.Element {
  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        Carregando logs...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontSize: 13, textAlign: "center", padding: 32 }}>
        Nenhum log encontrado.
      </div>
    );
  }

  return (
    <div className={`clog-wrap${compact ? " clog-compact" : ""}`}>
      <style>{LOG_STYLE}</style>
      <table className="clog-tbl">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Tipo</th>
            <th>Acao</th>
            {!compact && <th>Nota</th>}
            {!compact && <th>Usuario</th>}
            <th style={{ width: 50, textAlign: "center" }}>OK</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td title={l.timestamp}>
                <span className="edp-mono" style={{ fontSize: compact ? 11 : 12 }}>
                  {formatRelativeTime(l.timestamp)}
                </span>
              </td>
              <td>
                <span className={`clog-tag ${TIPO_CLASS[l.tipo] ?? ""}`}>
                  {TIPO_LABEL[l.tipo] ?? l.tipo}
                </span>
              </td>
              <td style={{ fontWeight: 500 }}>{l.acao}</td>
              {!compact && (
                <td>
                  {l.nota_pk !== null
                    ? <span className="edp-mono" style={{ fontWeight: 600 }}>{l.nota_pk}</span>
                    : <span style={{ color: "var(--text-mute)" }}>—</span>}
                </td>
              )}
              {!compact && (
                <td style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {l.usuario
                    ? <span className="edp-mono">{l.usuario}</span>
                    : <span style={{ color: "var(--text-mute)" }}>—</span>}
                </td>
              )}
              <td style={{ textAlign: "center" }}>
                {l.sucesso
                  ? <span style={{ color: "var(--green)" }} title="Sucesso">&#10003;</span>
                  : <span style={{ color: "var(--red)" }} title="Falha">&#10007;</span>}
              </td>
              <td><DetailsSummary detalhes={l.detalhes} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
