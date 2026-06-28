import React from 'react';
import type { CoffeeJob } from './types';
import { EDPApi, BASE } from '../api';
import { toast } from 'sonner';

// ponytail: máscara 3-2-resto; aperta a regra se o formato do local for fixo
function maskLocal(v: string): string {
  const c = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const a = c.slice(0, 3), b = c.slice(3, 5), rest = c.slice(5);
  return [a, b, rest].filter(Boolean).join("-");
}
function unmaskLocal(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

interface Row {
  id: number;
  estado: "consultando" | "ok" | "erro";
  pk?: number;
  idSap?: number | null;
  classificacao?: string;
  arquivado?: boolean | null;
  localAtual?: string;          // sem máscara (como veio do backend)
  localEditado?: string;        // mascarado, no input
  salvandoLocal?: boolean;
  erro?: string;
}

function parseIds(texto: string): number[] {
  return [...new Set(
    texto.split(/[\s,;]+/).map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  )];
}

const STATUS_COR: Record<string, string> = {
  gerada: "var(--green)", corrigida: "#1f9fd6",
  pendente: "var(--amber)", nao_gerada: "#94a3b8",
};

export function CoffeeGerarModal({ open, idsIniciais, onClose, onChanged }: {
  open: boolean;
  idsIniciais?: number[];
  onClose: () => void;
  onChanged: () => void;
}): React.JSX.Element | null {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [input, setInput] = React.useState("");
  const [gerando, setGerando] = React.useState<{ rodando: boolean; feitas: number; total: number }>(
    { rodando: false, feitas: 0, total: 0 });

  const consultar = React.useCallback((id: number): void => {
    setRows((rs) => rs.some((r) => r.id === id)
      ? rs.map((r) => r.id === id ? { ...r, estado: "consultando", erro: undefined } : r)
      : [...rs, { id, estado: "consultando" }]);
    EDPApi.consultarNota(id)
      .then((c) => setRows((rs) => rs.map((r) => r.id === id ? {
        ...r, estado: "ok", pk: c.pk, idSap: c.id_sap, classificacao: c.classificacao,
        arquivado: c.arquivado,
        localAtual: c.local_instalacao ?? "",
        localEditado: c.local_instalacao ? maskLocal(c.local_instalacao) : "",
      } : r)))
      .catch((e: unknown) => setRows((rs) => rs.map((r) => r.id === id ? {
        ...r, estado: "erro", erro: e instanceof Error ? e.message : String(e),
      } : r)));
  }, []);

  // Ao abrir: zera e consulta os ids iniciais.
  React.useEffect(() => {
    if (!open) return;
    setRows([]); setInput(""); setGerando({ rodando: false, feitas: 0, total: 0 });
    (idsIniciais ?? []).forEach(consultar);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function adicionar(): void {
    parseIds(input).forEach(consultar);
    setInput("");
  }

  function reconsultarTodas(): void {
    rows.forEach((r) => consultar(r.id));
    toast.info("Reconsultando notas…");
  }

  function salvarLocal(row: Row): void {
    const local = unmaskLocal(row.localEditado ?? "");
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, salvandoLocal: true } : r));
    fetch(`${BASE}/coffee/local-instalacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, local }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /local-instalacao -> ${res.status}`); })
      .then(() => {
        setRows((rs) => rs.map((r) => r.id === row.id
          ? { ...r, salvandoLocal: false, localAtual: local } : r));
        toast.success("Local de instalação atualizado");
      })
      .catch((e: unknown) => {
        setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, salvandoLocal: false } : r));
        toast.error("Falha ao salvar local", { description: e instanceof Error ? e.message : String(e) });
      });
  }

  function pollJob(jobId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let falhas = 0;
      const tick = (): void => {
        fetch(`${BASE}/coffee/job/${jobId}`, { headers: { Accept: "application/json" } })
          .then((r) => { if (!r.ok) throw new Error(`GET /job -> ${r.status}`); return r.json(); })
          .then((j: CoffeeJob) => {
            falhas = 0;
            setGerando({ rodando: true, feitas: j.feitas, total: j.total });
            if (j.estado === "concluido") resolve();
            else window.setTimeout(tick, 600);
          })
          .catch((e: unknown) => {
            if (++falhas >= 10) reject(e instanceof Error ? e : new Error(String(e)));
            else window.setTimeout(tick, 600);
          });
      };
      tick();
    });
  }

  function gerar(): void {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return;
    setGerando({ rodando: true, feitas: 0, total: ids.length });
    fetch(`${BASE}/coffee/gerar-lote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, justificativa: null }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /gerar-lote -> ${res.status}`); return res.json(); })
      .then((data: { job_id: string }) => pollJob(data.job_id))
      .then(() => {
        setGerando({ rodando: false, feitas: 0, total: 0 });
        rows.forEach((r) => consultar(r.id)); // atualiza status pós-geração
        onChanged();
        toast.success(`${ids.length} nota(s) processada(s)`);
      })
      .catch((e: unknown) => {
        setGerando({ rodando: false, feitas: 0, total: 0 });
        toast.error("Falha ao gerar", { description: e instanceof Error ? e.message : String(e) });
      });
  }

  return (
    <>
      <div onClick={gerando.rodando ? undefined : onClose}
           style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300 }} />
      <div role="dialog" aria-modal="true"
           style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                    width: 760, maxWidth: "94vw", maxHeight: "88vh", background: "var(--surface)",
                    border: "1px solid var(--line)", borderRadius: 12, zIndex: 301,
                    display: "flex", flexDirection: "column", gap: 12, padding: 20,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Gerar / Consultar notas</span>

        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
                 placeholder="Cole ids (espaço, vírgula ou linha)"
                 disabled={gerando.rodando}
                 style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--text)", fontSize: 13,
                          fontFamily: "var(--font-mono)" }} />
          <button className="edp-btn sm" onClick={adicionar} disabled={!input.trim() || gerando.rodando}
                  style={{ fontWeight: 600 }}>Adicionar</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid var(--line)",
                      borderRadius: 8 }}>
          <table className="cnt-tbl" style={{ width: "100%", borderCollapse: "separate",
                                              borderSpacing: 0, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>ID COFFEE</th>
                <th style={th}>ID SAP</th>
                <th style={th}>Local de instalação</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, color: "var(--text-mute)", textAlign: "center", padding: 24 }}>
                  Adicione ids para consultar.
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}><span className="edp-mono" style={{ fontWeight: 600 }}>{r.pk ?? r.id}</span></td>
                  <td style={td}>
                    {r.estado === "consultando" ? "…"
                     : r.estado === "erro" ? <span style={{ color: "var(--red)" }}>erro</span>
                     : <span className="edp-mono">{r.idSap ?? "—"}</span>}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input value={r.localEditado ?? ""} disabled={r.estado !== "ok"}
                             onChange={(e) => {
                               const m = maskLocal(e.target.value);
                               setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, localEditado: m } : x));
                             }}
                             style={{ width: 150, padding: "4px 8px", borderRadius: 6,
                                      border: "1px solid var(--line)", background: "var(--surface-2)",
                                      color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12 }} />
                      {r.estado === "ok" && unmaskLocal(r.localEditado ?? "") !== (r.localAtual ?? "") && (
                        <button className="edp-btn sm" disabled={r.salvandoLocal}
                                onClick={() => salvarLocal(r)} style={{ fontSize: 11, padding: "3px 6px" }}>
                          {r.salvandoLocal ? "…" : "Salvar"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={td}>
                    {r.classificacao && (
                      <span style={{ color: STATUS_COR[r.classificacao] ?? "var(--text-mute)", fontWeight: 600 }}>
                        {r.arquivado ? "arquivada" : r.classificacao}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {r.estado === "erro" && <span style={{ color: "var(--red)", fontSize: 11 }}>{r.erro}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {gerando.rodando && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            Gerando {gerando.feitas}/{gerando.total}…
          </span>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="edp-btn sm" onClick={onClose} disabled={gerando.rodando}>Fechar</button>
          <button className="edp-btn sm" onClick={reconsultarTodas}
                  disabled={rows.length === 0 || gerando.rodando}>Consultar</button>
          <button className="edp-btn sm" onClick={gerar}
                  disabled={rows.length === 0 || gerando.rodando}
                  style={{ fontWeight: 600, color: "var(--accent)", borderColor: "var(--accent)" }}>
            Gerar ({rows.length})
          </button>
        </div>
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  position: "sticky", top: 0, background: "var(--surface)", textAlign: "left",
  padding: "8px 10px", fontSize: 11, fontWeight: 600, letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-mute)", borderBottom: "2px solid var(--line)",
};
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--line)", color: "var(--text)" };
