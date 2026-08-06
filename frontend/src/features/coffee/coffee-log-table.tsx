import React from 'react';
import type { CoffeeLog } from './types';
import { formatRelativeTime } from './format';
import { useSettings } from '../../context/settings-context';

const TIMELINE_STYLE = `
  .clog-timeline{flex:1;min-height:0;overflow:auto;padding:0 22px 24px}
  .clog-entry{position:relative;padding:0 0 0 28px;margin-bottom:2px}
  .clog-entry::before{content:'';position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--line)}
  .clog-entry:last-child::before{display:none}
  .clog-dot{position:absolute;left:4px;top:14px;width:10px;height:10px;border-radius:50%;border:2px solid var(--line);background:var(--surface);z-index:1}
  .clog-dot.ok{border-color:var(--green);background:var(--tint-green)}
  .clog-dot.fail{border-color:var(--red);background:var(--tint-red)}
  .clog-card{padding:10px 14px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line)}
  .clog-card:hover{border-color:var(--text-mute)}
  .clog-tag{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:.03em}
  .clog-tag.api{background:var(--tint-blue);color:var(--blue)}
  .clog-tag.trans{background:var(--tint-indigo);color:var(--indigo)}
  .clog-tag.user{background:var(--tint-green);color:var(--green)}
  .clog-compact .clog-card{padding:8px 10px}
  .clog-compact .clog-entry{padding-left:22px}
  .clog-compact .clog-dot{left:2px;top:12px;width:8px;height:8px}
  .clog-compact .clog-entry::before{left:6px}
  .clog-detail-row{display:flex;gap:6px;font-size:11.5px;line-height:1.5}
  .clog-detail-key{color:var(--text-mute);min-width:0;flex-shrink:0}
  .clog-detail-val{color:var(--text);word-break:break-all}
  .clog-root{display:flex;align-items:center;gap:8px;padding:4px 22px 10px;font-weight:700}
  .clog-group{margin-bottom:4px}
  .clog-filho{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0;font-size:12px}
  .clog-filho:hover{background:var(--surface-2)}
  .clog-conector{color:var(--text-mute)}
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

export interface Grupo {
  chave: string;
  cabecalho: CoffeeLog;
  filhos: CoffeeLog[];
  transicaoNova?: "corrigida" | "pendente";
}

const ACOES_GERAR = new Set([
  "geracao_lote", "regerar", "geracao_ignorada_sap_real", "geracao_ignorada_arquivada",
]);
const ACOES_CONSULTAR = new Set(["busca_lote", "consultar"]);

export const PASSOS = [
  { value: "todos", label: "Todos" },
  { value: "gerar", label: "Gerar" },
  { value: "consultar", label: "Consultar" },
  { value: "alterar_local", label: "Alterar local" },
  { value: "corrigidas", label: "Corrigidas" },
  { value: "pendentes", label: "Pendentes" },
] as const;

// Agrupa por trace_id. Cabeçalho = a acao_usuario de lote (nota_pk NULL) se houver,
// senão a 1ª acao_usuario, senão o 1º log. Demais acao_usuario viram filhos.
export function agruparLogs(logs: CoffeeLog[]): Grupo[] {
  const porTrace = new Map<string, CoffeeLog[]>();
  const ordem: string[] = [];
  for (const l of logs) {
    const chave = l.trace_id ?? `__${l.id}`;
    if (!porTrace.has(chave)) { porTrace.set(chave, []); ordem.push(chave); }
    porTrace.get(chave)!.push(l);
  }
  return ordem.map((chave) => {
    const itens = porTrace.get(chave)!;
    const acoes = itens.filter((l) => l.tipo === "acao_usuario");
    const cabecalho = acoes.find((l) => l.nota_pk === null) ?? acoes[0] ?? itens[0];
    const filhos = itens.filter((l) => l !== cabecalho);
    const trans = itens.find(
      (l) => l.tipo === "transicao" && l.acao === "classificar" &&
             (l.detalhes?.novo === "corrigida" || l.detalhes?.novo === "pendente"),
    );
    return {
      chave, cabecalho, filhos,
      transicaoNova: trans?.detalhes?.novo as "corrigida" | "pendente" | undefined,
    };
  });
}

// Classificação atual da nota = o classificar mais recente nos logs (que vêm DESC).
export function classeAtual(logs: CoffeeLog[]): string | undefined {
  const t = logs.find((l) => l.tipo === "transicao" && l.acao === "classificar");
  return t?.detalhes?.novo as string | undefined;
}

export function grupoNoPasso(g: Grupo, passo: string): boolean {
  switch (passo) {
    case "gerar": return ACOES_GERAR.has(g.cabecalho.acao);
    case "consultar": return ACOES_CONSULTAR.has(g.cabecalho.acao);
    case "alterar_local": return g.cabecalho.acao === "alterar_local";
    case "corrigidas": return g.transicaoNova === "corrigida";
    case "pendentes": return g.transicaoNova === "pendente";
    default: return true; // "todos" e qualquer valor desconhecido
  }
}

function StructuredDetails({ detalhes }: { detalhes: Record<string, unknown> | null }): React.JSX.Element | null {
  if (!detalhes) return null;
  const entries = Object.entries(detalhes).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return (
    <div className="mt-[6px] flex flex-col gap-[2px]">
      {entries.map(([k, v]) => (
        <div key={k} className="clog-detail-row">
          <span className="clog-detail-key">{DETAIL_LABELS[k] ?? k}:</span>
          <span className="clog-detail-val font-mono">{formatDetailValue(k, v)}</span>
        </div>
      ))}
    </div>
  );
}

function resumoFilho(l: CoffeeLog): string {
  const d = l.detalhes ?? {};
  if (l.tipo === "transicao" && l.acao === "classificar")
    return `${d.anterior ?? "?"} → ${d.novo ?? "?"}`;
  const partes: string[] = [];
  if (d.status_http != null) partes.push(String(d.status_http));
  if (d.tempo_ms != null) partes.push(`${d.tempo_ms}ms`);
  return partes.join(" · ");
}

interface LogTableProps {
  logs: CoffeeLog[];
  loading: boolean;
  compact?: boolean;
  onClickNota?: (pk: number) => void;
  passo?: string;
  notaRoot?: number;
}

export function LogTable({ logs, loading, compact, onClickNota, passo = "todos", notaRoot }: LogTableProps): React.JSX.Element {
  const { settings } = useSettings();
  const dev = settings.devLogs;
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set());

  function toggle(id: number): void {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-mute font-mono text-[13px]">
        Carregando logs...
      </div>
    );
  }

  const grupos = agruparLogs(logs).filter((g) => grupoNoPasso(g, passo));

  if (grupos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-mute text-[13px] text-center p-[32px]">
        Nenhum log encontrado.
      </div>
    );
  }

  const classe = notaRoot !== undefined ? classeAtual(logs) : undefined;

  return (
    <div className={`clog-timeline${compact ? " clog-compact" : ""}`}>
      <style>{TIMELINE_STYLE}</style>

      {notaRoot !== undefined && (
        <div className="clog-root">
          <span className="text-[14px]">Nota <span className="font-mono">#{notaRoot}</span></span>
          {classe && (
            <span className="clog-tag bg-surface-2 text-text">
              {classe}
            </span>
          )}
        </div>
      )}

      {grupos.map((g) => {
        const visiveis = [...g.filhos].reverse().filter((f) => dev || f.tipo === "acao_usuario");
        return (
          <div key={g.chave} className="clog-group"
               style={{ marginLeft: notaRoot !== undefined ? 16 : 0 }}>
            <div className="clog-entry">
              <div className={`clog-dot ${g.cabecalho.sucesso ? "ok" : "fail"}`} />
              <div className="clog-card" style={{ cursor: g.cabecalho.detalhes ? "pointer" : undefined }}
                   onClick={() => { if (g.cabecalho.detalhes) toggle(g.cabecalho.id); }}>
                <div className="flex items-center gap-[8px] flex-wrap">
                  <span className="font-mono text-text-mute" style={{ fontSize: compact ? 10.5 : 11.5 }}
                        title={g.cabecalho.timestamp}>
                    {formatRelativeTime(g.cabecalho.timestamp)}
                  </span>
                  <span className={`clog-tag ${TIPO_CLASS[g.cabecalho.tipo] ?? ""}`}>
                    {TIPO_LABEL[g.cabecalho.tipo] ?? g.cabecalho.tipo}
                  </span>
                  <span className="font-semibold" style={{ fontSize: compact ? 12 : 13 }}>{g.cabecalho.acao}</span>
                  {g.cabecalho.nota_pk !== null && (
                    <span className="font-mono text-[12px] font-semibold"
                      style={{
                        cursor: onClickNota ? "pointer" : undefined,
                        color: onClickNota ? "var(--accent)" : "var(--text)",
                        textDecoration: onClickNota ? "underline" : undefined }}
                      onClick={(e) => { if (onClickNota && g.cabecalho.nota_pk !== null) { e.stopPropagation(); onClickNota(g.cabecalho.nota_pk); } }}>
                      #{g.cabecalho.nota_pk}
                    </span>
                  )}
                  {g.transicaoNova && (
                    <span className="clog-tag" style={{
                      background: g.transicaoNova === "corrigida" ? "var(--tint-blue)" : "var(--tint-amber)",
                      color: g.transicaoNova === "corrigida" ? "var(--blue)" : "var(--amber)" }}>
                      → {g.transicaoNova}
                    </span>
                  )}
                  {g.cabecalho.usuario && (
                    <span className="font-mono text-[11px] text-text-dim">
                      {g.cabecalho.usuario}
                    </span>
                  )}
                  {!g.cabecalho.sucesso && (
                    <span className="text-red text-[11px] font-semibold">FALHA</span>
                  )}
                  {g.cabecalho.detalhes && (
                    <span className="ml-auto text-[10px] text-text-mute">
                      {expanded.has(g.cabecalho.id) ? "▲" : "▼"}
                    </span>
                  )}
                </div>
                {expanded.has(g.cabecalho.id) && <StructuredDetails detalhes={g.cabecalho.detalhes} />}
              </div>
            </div>

            {visiveis.map((f, i, arr) => (
              <div key={f.id} className="clog-filho pl-[30px]" style={{ cursor: f.detalhes ? "pointer" : undefined }}
                   onClick={() => { if (f.detalhes) toggle(f.id); }}>
                <span className="clog-conector font-mono">{i === arr.length - 1 ? "└──" : "├──"}</span>
                <span className={`clog-tag ${TIPO_CLASS[f.tipo] ?? ""}`}>{TIPO_LABEL[f.tipo] ?? f.tipo}</span>
                <span className="font-mono font-semibold">{f.acao}</span>
                {f.nota_pk !== null && (
                  <span className="font-mono text-text-mute">#{f.nota_pk}</span>
                )}
                <span className="font-mono text-text-mute">{resumoFilho(f)}</span>
                {!f.sucesso && <span className="text-red font-semibold">✗ FALHA</span>}
                {f.detalhes && (
                  <span className="ml-auto text-[10px] text-text-mute">
                    {expanded.has(f.id) ? "▲" : "▼"}
                  </span>
                )}
                {expanded.has(f.id) && (
                  <div className="basis-full"><StructuredDetails detalhes={f.detalhes} /></div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
