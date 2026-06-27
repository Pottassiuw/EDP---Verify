import React from 'react';
import type { CoffeeLog, CoffeeJob } from './types';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { ConfirmModal } from './confirm-modal';
import { coffeeUrl } from '../api';
import { notify } from '../lib/notify';

const API_BASE = localStorage.getItem("edp_api") || "/api";

type RegerarEstado = "idle" | "loading" | "ok" | "erro";

interface RegerarResult {
  nota: { pk: number; id_sap: number; arquivado: boolean; fields: Record<string, unknown> };
  transicoes: CoffeeLog[];
}

type PendingAction =
  | { kind: "gerar"; pk: number }
  | { kind: "gerar-form"; id: number }
  | { kind: "gerar-lote"; pks: number[] }
  | { kind: "remover"; pk: number }
  | { kind: "arquivar"; pk: number };

function AbrirCoffeeBtn({ pk }: { pk: number }): React.JSX.Element {
  return (
    <a className="edp-btn coffee sm" target="_blank" rel="noopener"
       href={coffeeUrl(String(pk))} title="Abrir no COFFEE"
       style={{ fontSize: 12, padding: "4px 6px" }}>
      ☕
    </a>
  );
}

function TransicaoCard({ result, onVerLogs, onNova }: {
  result: RegerarResult;
  onVerLogs: () => void;
  onNova: () => void;
}): React.JSX.Element {
  const { nota, transicoes } = result;
  const classif = transicoes.find((t) => t.acao === "classificar");
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
          <div className="edp-mono" style={{ fontWeight: 600, marginTop: 2 }}>{nota.id_sap}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="edp-btn sm" onClick={onVerLogs} style={{ fontSize: 12 }}>Ver logs</button>
        <button className="edp-btn sm" onClick={onNova} style={{ fontSize: 12 }}>Gerar outra</button>
      </div>
    </div>
  );
}

export function CoffeeGeradas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const aGerar = useCoffeeNotas("a_gerar");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // single regerar (form) state
  const [regerarId, setRegerarId] = React.useState("");
  const [regerarEstado, setRegerarEstado] = React.useState<RegerarEstado>("idle");
  const [regerarResult, setRegerarResult] = React.useState<RegerarResult | null>(null);
  const [regerarErro, setRegerarErro] = React.useState<string | null>(null);

  // per-row + lote
  const [rowBusy, setRowBusy] = React.useState<Set<number>>(() => new Set());
  const [selected, setSelected] = React.useState<Set<number>>(() => new Set());
  const [lote, setLote] = React.useState<{ rodando: boolean; feitas: number; total: number }>(
    { rodando: false, feitas: 0, total: 0 });

  // modal + drawer
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [modalBusy, setModalBusy] = React.useState(false);
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);

  function toggleSelect(pk: number): void {
    setSelected((s) => { const n = new Set(s); n.has(pk) ? n.delete(pk) : n.add(pk); return n; });
  }
  function toggleAll(): void {
    setSelected((s) => s.size === aGerar.notas.length
      ? new Set()
      : new Set(aGerar.notas.map((n) => n.pk)));
  }

  function regerar(id: number, justificativa: string): Promise<RegerarResult> {
    return fetch(`${API_BASE}/coffee/regerar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, justificativa: justificativa || null }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /regerar -> ${res.status}`); return res.json(); })
      .then((data: { ok: boolean; nota: RegerarResult["nota"] }) =>
        fetch(`${API_BASE}/coffee/logs?nota_pk=${data.nota.pk}&tipo=transicao&limit=5`,
              { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((logData: { logs: CoffeeLog[] }) => ({ nota: data.nota, transicoes: logData.logs })));
  }

  function pollJob(jobId: string): Promise<void> {
    return new Promise((resolve) => {
      const tick = (): void => {
        fetch(`${API_BASE}/coffee/job/${jobId}`, { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((j: CoffeeJob) => {
            setLote({ rodando: true, feitas: j.feitas, total: j.total });
            if (j.estado === "concluido") resolve();
            else window.setTimeout(tick, 600);
          })
          .catch(() => window.setTimeout(tick, 600));
      };
      tick();
    });
  }

  function gerarLote(pks: number[], justificativa: string): Promise<void> {
    setLote({ rodando: true, feitas: 0, total: pks.length });
    return fetch(`${API_BASE}/coffee/gerar-lote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: pks, justificativa: justificativa || null }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /gerar-lote -> ${res.status}`); return res.json(); })
      .then((data: { job_id: string }) => pollJob(data.job_id))
      .then(() => {
        setLote({ rodando: false, feitas: 0, total: 0 });
        setSelected(new Set());
        aGerar.refetch();
        refetch();
        notify.success(`${pks.length} nota(s) enviada(s) para geração`);
      });
  }

  function arquivar(pk: number, justificativa: string): Promise<void> {
    return fetch(`${API_BASE}/coffee/arquivar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pk, justificativa }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /arquivar -> ${res.status}`); })
      .then(() => { refetch(); notify.success("Nota arquivada"); })
      .catch((e: unknown) => notify.error("Falha ao arquivar", e instanceof Error ? e.message : String(e)));
  }

  function remover(pk: number, justificativa: string): Promise<void> {
    return fetch(`${API_BASE}/coffee/marcar-gerar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pk, a_gerar: false, justificativa }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /marcar-gerar -> ${res.status}`); })
      .then(() => { aGerar.refetch(); notify.success("Nota desmarcada para geração"); })
      .catch((e: unknown) => notify.error("Falha ao desmarcar", e instanceof Error ? e.message : String(e)));
  }

  function handleConfirm(justificativa: string): void {
    if (!pending) return;
    setModalBusy(true);
    const done = (): void => { setModalBusy(false); setPending(null); };

    if (pending.kind === "gerar" || pending.kind === "gerar-form") {
      const id = pending.kind === "gerar" ? pending.pk : pending.id;
      setRowBusy((s) => new Set(s).add(id));
      regerar(id, justificativa)
        .then((result) => {
          if (pending.kind === "gerar-form") {
            setRegerarResult(result); setRegerarEstado("ok");
            notify.success("Nota gerada");
          }
          refetch(); aGerar.refetch();
        })
        .catch((err: unknown) => {
          if (pending.kind === "gerar-form") {
            setRegerarErro(err instanceof Error ? err.message : String(err));
            setRegerarEstado("erro");
            notify.error("Falha ao gerar", err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => { setRowBusy((s) => { const n = new Set(s); n.delete(id); return n; }); done(); });
    } else if (pending.kind === "gerar-lote") {
      gerarLote(pending.pks, justificativa).catch((e: unknown) => notify.error("Falha ao gerar em lote", e instanceof Error ? e.message : String(e))).finally(done);
    } else if (pending.kind === "remover") {
      remover(pending.pk, justificativa).finally(done);
    } else if (pending.kind === "arquivar") {
      arquivar(pending.pk, justificativa).finally(done);
    }
  }

  function handleRegerarForm(): void {
    const id = Number(regerarId.trim());
    if (!Number.isFinite(id) || id <= 0) return;
    setRegerarEstado("loading"); setRegerarErro(null); setRegerarResult(null);
    setPending({ kind: "gerar-form", id });
  }

  function handleNova(): void {
    setRegerarEstado("idle"); setRegerarResult(null); setRegerarErro(null); setRegerarId("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const modalConfig: Record<PendingAction["kind"], { title: string; confirmLabel: string; tone: "default" | "danger"; required: boolean; message: string }> = {
    "gerar": { title: "Gerar nota", confirmLabel: "Gerar", tone: "default", required: false, message: "Define o SAP placeholder 10000000 para esta nota entrar em geracao." },
    "gerar-form": { title: "Gerar nota", confirmLabel: "Gerar", tone: "default", required: false, message: "Define o SAP placeholder 10000000 para esta nota entrar em geracao." },
    "gerar-lote": { title: "Gerar em lote", confirmLabel: "Gerar selecionadas", tone: "default", required: false, message: "Cada nota selecionada recebe o SAP placeholder 10000000." },
    "remover": { title: "Remover da fila", confirmLabel: "Remover", tone: "danger", required: true, message: "A nota sai da fila de geracao. Justifique o motivo." },
    "arquivar": { title: "Arquivar nota", confirmLabel: "Arquivar", tone: "danger", required: true, message: "A nota sera arquivada e nao aparecera mais nas listagens." },
  };

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-mute)" }}>
        <span style={{ color: "var(--red)" }}>Erro ao carregar notas: {error}</span>
        <button className="edp-btn sm" onClick={refetch}>Tentar de novo</button>
      </div>
    );
  }

  const cfg = pending ? modalConfig[pending.kind] : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Zona 1: Gerar nota (form) */}
      <div style={{ flexShrink: 0, padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12,
                    borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Gerar Nota</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input ref={inputRef} type="number" placeholder="ID da nota" value={regerarId}
                 onChange={(e) => setRegerarId(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") handleRegerarForm(); }}
                 style={{ width: 160, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--text)", fontSize: 13,
                          fontFamily: "var(--font-mono)" }} />
          <button className="edp-btn sm" style={{ fontWeight: 600, minWidth: 100 }}
                  disabled={!regerarId.trim() || regerarEstado === "loading"}
                  onClick={handleRegerarForm}>
            {regerarEstado === "loading" ? "Gerando..." : "Gerar"}
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
        {selected.size > 0 && (
          <button className="edp-btn sm" style={{ fontWeight: 600 }} disabled={lote.rodando}
                  onClick={() => setPending({ kind: "gerar-lote", pks: [...selected] })}>
            {lote.rodando ? `Gerando ${lote.feitas}/${lote.total}…` : `Gerar selecionadas (${selected.size})`}
          </button>
        )}
      </div>
      {aGerar.notas.length > 0 && (
        <CoffeeNotasTable
          notas={aGerar.notas}
          isLoading={aGerar.isLoading}
          emptyMessage="Nenhuma nota marcada para gerar."
          selectable
          selectedPks={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          actionColumn={(nota) => {
            const busy = rowBusy.has(nota.pk);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="edp-btn sm" disabled={busy || lote.rodando}
                        onClick={() => setPending({ kind: "gerar", pk: nota.pk })}
                        style={{ fontWeight: 600, fontSize: 12 }}>
                  {busy ? "..." : "Gerar"}
                </button>
                <AbrirCoffeeBtn pk={nota.pk} />
                <button className="edp-btn sm" disabled={busy || lote.rodando}
                        onClick={() => setPending({ kind: "remover", pk: nota.pk })}
                        title="Remover da fila" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
                  Remover
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
              <button className="edp-btn sm" disabled={busy}
                      onClick={() => setPending({ kind: "gerar", pk: nota.pk })}
                      style={{ fontWeight: 600, fontSize: 12 }}>
                {busy ? "..." : "Regerar"}
              </button>
              <AbrirCoffeeBtn pk={nota.pk} />
              <button className="edp-btn sm" disabled={busy}
                      onClick={() => setPending({ kind: "arquivar", pk: nota.pk })}
                      title="Arquivar nota" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
                Arquivar
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

      <ConfirmModal
        open={pending !== null && cfg !== null}
        title={cfg?.title ?? ""}
        message={cfg?.message}
        confirmLabel={cfg?.confirmLabel}
        tone={cfg?.tone}
        requireJustification={cfg?.required}
        busy={modalBusy}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (pending?.kind === "gerar-form") setRegerarEstado("idle");
          setPending(null);
        }}
      />
    </div>
  );
}
