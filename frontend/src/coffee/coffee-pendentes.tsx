import React from 'react';
import type { CoffeeJob } from './types';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable, AbrirCoffeeBtn, LogsBtn } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { ConfirmModal } from './confirm-modal';
import { toast } from 'sonner';
import { BASE as API_BASE } from '../api';
import { Button } from '@/components/ui/button';
import { Archive } from 'lucide-react';

type BuscaEstado = "idle" | "rodando" | "concluido";

export function CoffeePendentes(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("pendente");
  const [buscaEstado, setBuscaEstado] = React.useState<BuscaEstado>("idle");
  const [buscaJob, setBuscaJob] = React.useState<CoffeeJob | null>(null);
  const [buscaErro, setBuscaErro] = React.useState<string | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);
  const [arquivarPk, setArquivarPk] = React.useState<number | null>(null);
  const [arquivarLoteOpen, setArquivarLoteOpen] = React.useState(false);
  const [modalBusy, setModalBusy] = React.useState(false);
  const [selecionadas, setSelecionadas] = React.useState<Set<number>>(() => new Set());

  const ordenadas = React.useMemo(
    () => [...notas].sort((a, b) =>
      (a.classificacao_em ?? "￿").localeCompare(b.classificacao_em ?? "￿")),
    [notas]);

  function toggleSelecionada(pk: number): void {
    setSelecionadas((prev) => { const s = new Set(prev); if (s.has(pk)) s.delete(pk); else s.add(pk); return s; });
  }
  function toggleTodas(): void {
    setSelecionadas((prev) => prev.size === ordenadas.length
      ? new Set() : new Set(ordenadas.map((n) => n.pk)));
  }

  React.useEffect(() => {
    return () => { if (timerRef.current !== null) clearInterval(timerRef.current); };
  }, []);

  async function arquivarLote(justificativa: string): Promise<void> {
    setModalBusy(true);
    const pks = [...selecionadas];
    const falhas: number[] = [];
    // ponytail: loop sequencial; endpoint de lote se passar de ~50 notas por vez
    for (const pk of pks) {
      try {
        const res = await fetch(`${API_BASE}/coffee/arquivar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pk, justificativa }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch { falhas.push(pk); }
    }
    setModalBusy(false);
    setArquivarLoteOpen(false);
    setSelecionadas(new Set());
    refetch();
    if (falhas.length) toast.error(`${falhas.length} de ${pks.length} falharam ao arquivar`, { description: falhas.join(", ") });
    else toast.success(`${pks.length} nota(s) arquivada(s)`);
  }

  function iniciarBusca(): void {
    const alvo = selecionadas.size > 0 ? [...selecionadas] : ordenadas.map((n) => n.pk);
    if (alvo.length === 0) return;
    setBuscaEstado("rodando");
    setBuscaJob(null);
    setBuscaErro(null);

    const ids = alvo.map(String);

    fetch(`${API_BASE}/coffee/buscar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`POST /buscar -> ${res.status}`);
        return res.json();
      })
      .then((data: { job_id: string }) => {
        const jobId = data.job_id;
        timerRef.current = window.setInterval(() => {
          fetch(`${API_BASE}/coffee/job/${encodeURIComponent(jobId)}`, {
            headers: { Accept: "application/json" },
          })
            .then((r) => {
              if (!r.ok) throw new Error(`GET /job -> ${r.status}`);
              return r.json();
            })
            .then((job: CoffeeJob) => {
              setBuscaJob(job);
              if (job.estado === "concluido") {
                if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
                setBuscaEstado("concluido");
                refetch();
                setSelecionadas(new Set());
                toast.success("Busca concluída");
                setTimeout(() => setBuscaEstado("idle"), 3000);
              }
            })
            .catch((err: unknown) => {
              if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
              setBuscaErro(err instanceof Error ? err.message : String(err));
              setBuscaEstado("idle");
            });
        }, 2000);
      })
      .catch((err: unknown) => {
        setBuscaErro(err instanceof Error ? err.message : String(err));
        setBuscaEstado("idle");
        toast.error("Falha na busca", { description: err instanceof Error ? err.message : String(err) });
      });
  }

  const pct = buscaJob && buscaJob.total > 0 ? Math.round((buscaJob.feitas / buscaJob.total) * 100) : 0;
  const concluido = buscaEstado === "concluido";

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-mute)" }}>
        <span style={{ color: "var(--red)" }}>Erro ao carregar notas: {error}</span>
        <Button variant="outline" size="sm" onClick={refetch}>Tentar de novo</Button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="edp-title" style={{ fontSize: 16 }}>Notas Pendentes</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
        {selecionadas.size > 0 && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--accent)" }}>
            {selecionadas.size} selecionada{selecionadas.size !== 1 ? "s" : ""}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {selecionadas.size > 0 && (
          <Button variant="destructive" size="sm" disabled={buscaEstado === "rodando"}
                  onClick={() => setArquivarLoteOpen(true)}>
            Arquivar selecionadas ({selecionadas.size})
          </Button>
        )}
        <Button size="sm"
                disabled={buscaEstado === "rodando" || isLoading || notas.length === 0}
                onClick={iniciarBusca}>
          {buscaEstado === "rodando" ? "Buscando..."
            : selecionadas.size > 0 ? `Atualizar selecionadas (${selecionadas.size})` : "Atualizar todas"}
        </Button>
      </div>

      {buscaEstado !== "idle" && buscaJob && (
        <div style={{ flexShrink: 0, padding: "0 22px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: pct + "%", borderRadius: 999,
                          background: concluido ? "var(--green)" : "var(--accent)",
                          transition: "width .3s ease, background .3s ease" }} />
          </div>
          <span className="edp-mono" style={{ fontSize: 11.5, color: concluido ? "var(--green)" : "var(--text-mute)" }}>
            {concluido
              ? "Concluido"
              : `${pct}% · Buscando nota ${buscaJob.feitas} de ${buscaJob.total}...`}
          </span>
          {concluido && buscaJob.erros.length > 0 && (
            <details style={{ fontSize: 12, color: "var(--text-dim)" }}>
              <summary style={{ cursor: "pointer", color: "var(--amber)" }}>
                {buscaJob.erros.length} erro{buscaJob.erros.length !== 1 ? "s" : ""} durante a busca
              </summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {buscaJob.erros.map((e, i) => (
                  <li key={i}><span className="edp-mono">{e.pk}</span>: {e.msg}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {buscaErro && (
        <div style={{ flexShrink: 0, padding: "8px 22px", fontSize: 12, color: "var(--red)" }}>
          Erro na busca: {buscaErro}
        </div>
      )}

      <CoffeeNotasTable
        notas={ordenadas}
        isLoading={isLoading}
        mostrarIdade
        selectable
        selectedPks={selecionadas}
        onToggleSelect={toggleSelecionada}
        onToggleAll={toggleTodas}
        emptyMessage="Nenhuma nota pendente encontrada. Notas aparecem aqui quando buscadas com SAP 10000000."
        actionColumn={(nota) => (
          <>
            <AbrirCoffeeBtn pk={nota.pk} />
            <Button variant="ghost" size="icon-sm" onClick={() => setArquivarPk(nota.pk)}
                    aria-label={`Arquivar nota ${nota.pk}`} title="Arquivar nota"
                    style={{ color: "var(--red)" }}>
              <Archive />
            </Button>
            <LogsBtn pk={nota.pk} onClick={() => setDrawerPk(nota.pk)} />
          </>
        )}
      />
      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}
      <ConfirmModal
        open={arquivarPk !== null}
        title="Arquivar nota"
        message="A nota sera arquivada e nao aparecera mais nas listagens."
        confirmLabel="Arquivar"
        tone="danger"
        requireJustification
        busy={modalBusy}
        onConfirm={(justificativa) => {
          if (arquivarPk === null) return;
          setModalBusy(true);
          fetch(`${API_BASE}/coffee/arquivar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: arquivarPk, justificativa }),
          })
            .then((res) => { if (!res.ok) throw new Error(`POST /arquivar -> ${res.status}`); })
            .then(() => { refetch(); toast.success("Nota arquivada"); })
            .catch((e: unknown) => toast.error("Falha ao arquivar", { description: e instanceof Error ? e.message : String(e) }))
            .finally(() => { setModalBusy(false); setArquivarPk(null); });
        }}
        onCancel={() => setArquivarPk(null)}
      />
      <ConfirmModal
        open={arquivarLoteOpen}
        title={`Arquivar ${selecionadas.size} nota(s)`}
        message="As notas selecionadas serão arquivadas e não aparecerão mais nas listagens. A justificativa vale para todas."
        confirmLabel="Arquivar todas"
        tone="danger"
        requireJustification
        busy={modalBusy}
        onConfirm={(j) => { void arquivarLote(j); }}
        onCancel={() => setArquivarLoteOpen(false)}
      />
    </div>
  );
}
