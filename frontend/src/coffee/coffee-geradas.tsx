import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { ConfirmModal } from './confirm-modal';
import { CoffeeGerarModal } from './coffee-gerar-modal';
import { coffeeUrl, BASE as API_BASE } from '../api';
import { toast } from 'sonner';

type PendingAction =
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

export function CoffeeGeradas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const aGerar = useCoffeeNotas("a_gerar");

  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalIds, setModalIds] = React.useState<number[] | undefined>(undefined);
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [modalBusy, setModalBusy] = React.useState(false);
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);

  function abrirModal(ids?: number[]): void { setModalIds(ids); setModalOpen(true); }

  function arquivar(pk: number, justificativa: string): Promise<void> {
    return fetch(`${API_BASE}/coffee/arquivar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pk, justificativa }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /arquivar -> ${res.status}`); })
      .then(() => { refetch(); toast.success("Nota arquivada"); })
      .catch((e: unknown) => void toast.error("Falha ao arquivar", { description: e instanceof Error ? e.message : String(e) }));
  }

  function remover(pk: number, justificativa: string): Promise<void> {
    return fetch(`${API_BASE}/coffee/marcar-gerar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pk, a_gerar: false, justificativa }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /marcar-gerar -> ${res.status}`); })
      .then(() => { aGerar.refetch(); toast.success("Nota desmarcada para geração"); })
      .catch((e: unknown) => void toast.error("Falha ao desmarcar", { description: e instanceof Error ? e.message : String(e) }));
  }

  function handleConfirm(justificativa: string): void {
    if (!pending) return;
    setModalBusy(true);
    const done = (): void => { setModalBusy(false); setPending(null); };
    if (pending.kind === "remover") remover(pending.pk, justificativa).finally(done);
    else arquivar(pending.pk, justificativa).finally(done);
  }

  const modalConfig: Record<PendingAction["kind"], { title: string; confirmLabel: string; message: string }> = {
    "remover": { title: "Remover da fila", confirmLabel: "Remover", message: "A nota sai da fila de geracao. Justifique o motivo." },
    "arquivar": { title: "Arquivar nota", confirmLabel: "Arquivar", message: "A nota sera arquivada e nao aparecera mais nas listagens." },
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
      {/* Cabeçalho: ação principal */}
      <div style={{ flexShrink: 0, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12,
                    borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Gerar Notas</span>
        <button className="edp-btn sm" style={{ fontWeight: 600 }} onClick={() => abrirModal(undefined)}>
          Gerar / Consultar notas
        </button>
      </div>

      {/* Zona: A gerar */}
      <div style={{ flexShrink: 0, padding: "14px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>A gerar</span>
        {!aGerar.isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {aGerar.notas.length} nota{aGerar.notas.length !== 1 ? "s" : ""}
          </span>
        )}
        {aGerar.notas.length > 0 && (
          <button className="edp-btn sm" style={{ fontWeight: 600 }}
                  onClick={() => abrirModal(aGerar.notas.map((n) => n.pk))}>
            Gerar fila ({aGerar.notas.length})
          </button>
        )}
      </div>
      {aGerar.notas.length > 0 && (
        <CoffeeNotasTable
          notas={aGerar.notas}
          isLoading={aGerar.isLoading}
          emptyMessage="Nenhuma nota marcada para gerar."
          actionColumn={(nota) => (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AbrirCoffeeBtn pk={nota.pk} />
              <button className="edp-btn sm"
                      onClick={() => setPending({ kind: "remover", pk: nota.pk })}
                      title="Remover da fila" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
                Remover
              </button>
              <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                      title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
                Logs
              </button>
            </div>
          )}
        />
      )}

      {/* Zona: Geradas */}
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
          : "Nenhuma nota gerada encontrada. Use o botao acima ou marque notas na Verificar."}
        actionColumn={(nota) => (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AbrirCoffeeBtn pk={nota.pk} />
            <button className="edp-btn sm"
                    onClick={() => setPending({ kind: "arquivar", pk: nota.pk })}
                    title="Arquivar nota" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
              Arquivar
            </button>
            <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                    title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
              Logs
            </button>
          </div>
        )}
      />

      <CoffeeGerarModal
        open={modalOpen}
        idsIniciais={modalIds}
        onClose={() => setModalOpen(false)}
        onChanged={() => { aGerar.refetch(); refetch(); }}
      />

      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}

      <ConfirmModal
        open={pending !== null && cfg !== null}
        title={cfg?.title ?? ""}
        message={cfg?.message}
        confirmLabel={cfg?.confirmLabel}
        tone="danger"
        requireJustification
        busy={modalBusy}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
