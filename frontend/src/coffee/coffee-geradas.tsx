import React from 'react';
import type { CoffeeLog } from './types';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';

const API_BASE = localStorage.getItem("edp_api") || "/api";

type RegerarEstado = "idle" | "loading" | "ok" | "erro";

interface RegerarResult {
  nota: { pk: number; id_sap: number; arquivado: boolean; fields: Record<string, unknown> };
  transicoes: CoffeeLog[];
}

function TransicaoCard({ result, onVerLogs, onNova }: {
  result: RegerarResult;
  onVerLogs: () => void;
  onNova: () => void;
}): React.JSX.Element {
  const { nota, transicoes } = result;
  const classif = transicoes.find((t) => t.acao === "classificar");
  const arq = transicoes.find((t) => t.acao === "arquivar_estado");

  return (
    <div style={{ padding: 16, borderRadius: 10, background: "var(--surface-2)",
                  border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
        <div>
          <span style={{ color: "var(--text-mute)", fontSize: 11 }}>Classificacao</span>
          <div style={{ fontWeight: 600, marginTop: 2 }}>
            {classif
              ? <>{String(classif.detalhes?.anterior ?? "—")} <span style={{ color: "var(--text-mute)" }}>&rarr;</span> {String(classif.detalhes?.novo ?? "—")}</>
              : <span style={{ color: "var(--text-dim)" }}>{nota.fields?.classificacao as string ?? "sem transicao"}</span>}
          </div>
        </div>
        <div>
          <span style={{ color: "var(--text-mute)", fontSize: 11 }}>ID SAP</span>
          <div className="edp-mono" style={{ fontWeight: 600, marginTop: 2 }}>
            {classif?.detalhes?.id_sap_anterior != null
              ? <>{String(classif.detalhes.id_sap_anterior)} <span style={{ color: "var(--text-mute)" }}>&rarr;</span> {nota.id_sap}</>
              : nota.id_sap}
          </div>
        </div>
        <div>
          <span style={{ color: "var(--text-mute)", fontSize: 11 }}>Arquivado</span>
          <div style={{ fontWeight: 600, marginTop: 2 }}>
            {arq
              ? <>{arq.detalhes?.anterior ? "sim" : "nao"} <span style={{ color: "var(--text-mute)" }}>&rarr;</span> {arq.detalhes?.novo ? "sim" : "nao"}</>
              : (nota.arquivado ? "sim" : "nao")}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="edp-btn sm" onClick={onVerLogs} style={{ fontSize: 12 }}>Ver logs</button>
        <button className="edp-btn sm" onClick={onNova} style={{ fontSize: 12 }}>Regerar outra</button>
      </div>
    </div>
  );
}

export function CoffeeGeradas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const aGerar = useCoffeeNotas("a_gerar");
  const [lote, setLote] = React.useState<{ rodando: boolean; feitas: number; total: number }>(
    { rodando: false, feitas: 0, total: 0 });
  const inputRef = React.useRef<HTMLInputElement>(null);

  // regerar state
  const [regerarId, setRegerarId] = React.useState("");
  const [regerarEstado, setRegerarEstado] = React.useState<RegerarEstado>("idle");
  const [regerarResult, setRegerarResult] = React.useState<RegerarResult | null>(null);
  const [regerarErro, setRegerarErro] = React.useState<string | null>(null);

  // per-row regerar state
  const [rowBusy, setRowBusy] = React.useState<Set<number>>(() => new Set());

  // drawer state
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);

  function regerar(id: number): Promise<RegerarResult> {
    return fetch(`${API_BASE}/coffee/regerar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`POST /regerar -> ${res.status}`);
        return res.json();
      })
      .then((data: { ok: boolean; nota: RegerarResult["nota"] }) => {
        return fetch(`${API_BASE}/coffee/logs?nota_pk=${data.nota.pk}&tipo=transicao&limit=5`,
                     { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((logData: { logs: CoffeeLog[] }) => ({ nota: data.nota, transicoes: logData.logs }));
      });
  }

  function regerarTodas(): void {
    const pks = aGerar.notas.map((n) => n.pk);
    if (pks.length === 0 || lote.rodando) return;
    setLote({ rodando: true, feitas: 0, total: pks.length });
    let chain = Promise.resolve();
    pks.forEach((pk) => {
      chain = chain.then(() => regerar(pk).then(() => {
        setLote((s) => ({ ...s, feitas: s.feitas + 1 }));
      }).catch(() => { setLote((s) => ({ ...s, feitas: s.feitas + 1 })); }));
    });
    chain.then(() => {
      setLote({ rodando: false, feitas: 0, total: 0 });
      aGerar.refetch();
      refetch();
    });
  }

  function handleRegerar(): void {
    const id = Number(regerarId.trim());
    if (!Number.isFinite(id) || id <= 0) return;
    setRegerarEstado("loading");
    setRegerarErro(null);
    setRegerarResult(null);

    regerar(id)
      .then((result) => {
        setRegerarResult(result);
        setRegerarEstado("ok");
        refetch();
      })
      .catch((err: unknown) => {
        setRegerarErro(err instanceof Error ? err.message : String(err));
        setRegerarEstado("erro");
      });
  }

  function handleRowRegerar(pk: number): void {
    setRowBusy((s) => new Set(s).add(pk));
    regerar(pk)
      .then(() => { refetch(); aGerar.refetch(); })
      .catch(() => {})
      .finally(() => setRowBusy((s) => { const n = new Set(s); n.delete(pk); return n; }));
  }

  function handleNova(): void {
    setRegerarEstado("idle");
    setRegerarResult(null);
    setRegerarErro(null);
    setRegerarId("");
    setTimeout(() => inputRef.current?.focus(), 50);
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
      {/* Zona 1: Regerar */}
      <div style={{ flexShrink: 0, padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12,
                    borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Regerar Nota</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input ref={inputRef} type="number" placeholder="ID da nota" value={regerarId}
                 onChange={(e) => setRegerarId(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") handleRegerar(); }}
                 style={{ width: 160, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--text)", fontSize: 13,
                          fontFamily: "var(--font-mono)" }} />
          <button className="edp-btn sm" style={{ fontWeight: 600, minWidth: 100 }}
                  disabled={!regerarId.trim() || regerarEstado === "loading"}
                  onClick={handleRegerar}>
            {regerarEstado === "loading" ? "Regenerando..." : "Regerar"}
          </button>
        </div>

        {regerarEstado === "erro" && regerarErro && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.12)",
                        color: "var(--red)", fontSize: 12 }}>
            {regerarErro}
          </div>
        )}

        {regerarEstado === "ok" && regerarResult && (
          <TransicaoCard result={regerarResult}
                         onVerLogs={() => setDrawerPk(regerarResult.nota.pk)}
                         onNova={handleNova} />
        )}
      </div>

      {/* Zona 1.5: A gerar */}
      <div style={{ flexShrink: 0, padding: "14px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>A gerar</span>
        {!aGerar.isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {aGerar.notas.length} nota{aGerar.notas.length !== 1 ? "s" : ""}
          </span>
        )}
        {aGerar.notas.length > 0 && (
          <button className="edp-btn sm" style={{ fontWeight: 600 }} disabled={lote.rodando}
                  onClick={regerarTodas}>
            {lote.rodando ? `Regenerando ${lote.feitas}/${lote.total}…` : "Regerar todas"}
          </button>
        )}
      </div>
      {aGerar.notas.length > 0 && (
        <CoffeeNotasTable
          notas={aGerar.notas}
          isLoading={aGerar.isLoading}
          emptyMessage="Nenhuma nota marcada para gerar."
          actionColumn={(nota) => {
            const busy = rowBusy.has(nota.pk);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="edp-btn sm" disabled={busy || lote.rodando} onClick={() => handleRowRegerar(nota.pk)}
                        style={{ fontWeight: 600, fontSize: 12 }}>
                  {busy ? "..." : "Regerar"}
                </button>
                <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                        title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
                  Logs
                </button>
              </div>
            );
          }}
        />
      )}

      {/* Zona 2: Tabela de Geradas */}
      <div style={{ flexShrink: 0, padding: "14px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Notas Geradas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage={aGerar.notas.length > 0
          ? "Nenhuma nota gerada ainda. As notas acima estao aguardando geracao."
          : "Nenhuma nota gerada encontrada. Use o formulario acima ou marque notas na Verificar."}
        actionColumn={(nota) => {
          const busy = rowBusy.has(nota.pk);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="edp-btn sm" disabled={busy} onClick={() => handleRowRegerar(nota.pk)}
                      style={{ fontWeight: 600, fontSize: 12 }}>
                {busy ? "..." : "Regerar"}
              </button>
              <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                      title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
                Logs
              </button>
            </div>
          );
        }}
      />

      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}
    </div>
  );
}
