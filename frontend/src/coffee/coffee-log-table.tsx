import React from 'react';
import type { CoffeeLog } from './types';
import { formatRelativeTime } from './coffee-notas-table';

const TIMELINE_STYLE = `
  .clog-timeline{flex:1;min-height:0;overflow:auto;padding:0 22px 24px}
  .clog-entry{position:relative;padding:0 0 0 28px;margin-bottom:2px}
  .clog-entry::before{content:'';position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--line)}
  .clog-entry:last-child::before{display:none}
  .clog-dot{position:absolute;left:4px;top:14px;width:10px;height:10px;border-radius:50%;border:2px solid var(--line);background:var(--surface);z-index:1}
  .clog-dot.ok{border-color:var(--green);background:var(--tint-green)}
  .clog-dot.fail{border-color:var(--red);background:rgba(239,68,68,0.15)}
  .clog-card{padding:10px 14px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line)}
  .clog-card:hover{border-color:var(--text-mute)}
  .clog-tag{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:.03em}
  .clog-tag.api{background:rgba(59,130,246,0.14);color:#3b82f6}
  .clog-tag.trans{background:rgba(139,92,246,0.14);color:#8b5cf6}
  .clog-tag.user{background:rgba(34,197,94,0.14);color:#22c55e}
  .clog-compact .clog-card{padding:8px 10px}
  .clog-compact .clog-entry{padding-left:22px}
  .clog-compact .clog-dot{left:2px;top:12px;width:8px;height:8px}
  .clog-compact .clog-entry::before{left:6px}
  .clog-detail-row{display:flex;gap:6px;font-size:11.5px;line-height:1.5}
  .clog-detail-key{color:var(--text-mute);min-width:0;flex-shrink:0}
  .clog-detail-val{color:var(--text);word-break:break-all}
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

const DETAIL_LABELS: Record<string, string> = {
  anterior: "Anterior",
  novo: "Novo",
  id_sap_anterior: "SAP anterior",
  id_sap_atual: "SAP atual",
  justificativa: "Justificativa",
  status_code: "HTTP status",
  tempo_ms: "Tempo resposta",
  erro: "Erro",
  url: "URL",
  total: "Total",
  ids: "IDs",
  id: "ID",
  a_gerar: "A gerar",
  origem: "Origem",
};

function formatDetailValue(key: string, val: unknown): string {
  if (key === "tempo_ms" && typeof val === "number") return `${val}ms`;
  if (key === "a_gerar" && typeof val === "boolean") return val ? "sim" : "nao";
  if (Array.isArray(val)) return val.join(", ");
  return String(val ?? "—");
}

function StructuredDetails({ detalhes }: { detalhes: Record<string, unknown> | null }): React.JSX.Element | null {
  if (!detalhes) return null;
  const entries = Object.entries(detalhes).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
      {entries.map(([k, v]) => (
        <div key={k} className="clog-detail-row">
          <span className="clog-detail-key">{DETAIL_LABELS[k] ?? k}:</span>
          <span className="clog-detail-val edp-mono">{formatDetailValue(k, v)}</span>
        </div>
      ))}
    </div>
  );
}

interface LogTableProps {
  logs: CoffeeLog[];
  loading: boolean;
  compact?: boolean;
  onClickNota?: (pk: number) => void;
}

export function LogTable({ logs, loading, compact, onClickNota }: LogTableProps): React.JSX.Element {
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set());

  function toggle(id: number): void {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

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
    <div className={`clog-timeline${compact ? " clog-compact" : ""}`}>
      <style>{TIMELINE_STYLE}</style>
      {logs.map((l) => {
        const isExpanded = expanded.has(l.id);
        return (
          <div key={l.id} className="clog-entry">
            <div className={`clog-dot ${l.sucesso ? "ok" : "fail"}`} />
            <div className="clog-card" style={{ cursor: l.detalhes ? "pointer" : undefined }}
                 onClick={() => { if (l.detalhes) toggle(l.id); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="edp-mono" style={{ fontSize: compact ? 10.5 : 11.5, color: "var(--text-mute)" }}
                      title={l.timestamp}>
                  {formatRelativeTime(l.timestamp)}
                </span>
                <span className={`clog-tag ${TIPO_CLASS[l.tipo] ?? ""}`}>
                  {TIPO_LABEL[l.tipo] ?? l.tipo}
                </span>
                <span style={{ fontWeight: 600, fontSize: compact ? 12 : 13 }}>{l.acao}</span>
                {!compact && l.nota_pk !== null && (
                  <span className="edp-mono" style={{ fontSize: 12, fontWeight: 600,
                    cursor: onClickNota ? "pointer" : undefined,
                    color: onClickNota ? "var(--accent)" : "var(--text)",
                    textDecoration: onClickNota ? "underline" : undefined }}
                    onClick={(e) => { if (onClickNota && l.nota_pk !== null) { e.stopPropagation(); onClickNota(l.nota_pk); } }}>
                    #{l.nota_pk}
                  </span>
                )}
                {!compact && l.usuario && (
                  <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {l.usuario}
                  </span>
                )}
                {!l.sucesso && (
                  <span style={{ color: "var(--red)", fontSize: 11, fontWeight: 600 }}>FALHA</span>
                )}
                {l.detalhes && (
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-mute)" }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                )}
              </div>
              {isExpanded && <StructuredDetails detalhes={l.detalhes} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
