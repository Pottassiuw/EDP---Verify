import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable, AbrirCoffeeBtn, LogsBtn, RevisarNotaBtn } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { ConfirmModal } from './confirm-modal';
import { CoffeeGerarModal } from './coffee-gerar-modal';
import { RevisarNotaSheet } from './revisar-nota-sheet';
import { MoverPlanoModal, type MoverAlvo } from './mover-plano-modal';
import { BASE as API_BASE, coffeeFetch } from '../../api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Archive, ListX } from 'lucide-react';

type PendingAction =
  | { kind: "remover"; pk: number }
  | { kind: "arquivar"; pk: number };

export function CoffeeGeradas({ onIrParaInput }: { onIrParaInput?: () => void }): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const aGerar = useCoffeeNotas("a_gerar");

  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalIds, setModalIds] = React.useState<number[] | undefined>(undefined);
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [modalBusy, setModalBusy] = React.useState(false);
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);
  const [revisaoPk, setRevisaoPk] = React.useState<number | null>(null);
  const [moverAlvo, setMoverAlvo] = React.useState<MoverAlvo | null>(null);

  function abrirModal(ids?: number[]): void { setModalIds(ids); setModalOpen(true); }

  function arquivar(pk: number, justificativa: string): Promise<void> {
    return coffeeFetch(`${API_BASE}/coffee/arquivar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pk, justificativa }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /arquivar -> ${res.status}`); })
      .then(() => { refetch(); toast.success("Nota arquivada"); })
      .catch((e: unknown) => void toast.error("Falha ao arquivar", { description: e instanceof Error ? e.message : String(e) }));
  }

  function remover(pk: number, justificativa: string): Promise<void> {
    return coffeeFetch(`${API_BASE}/coffee/marcar-gerar`, {
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
      <div className="p-[24px] flex flex-col items-center gap-[12px] text-text-mute">
        <span className="text-red">Erro ao carregar notas: {error}</span>
        <Button variant="outline" size="sm" onClick={refetch}>Tentar de novo</Button>
      </div>
    );
  }

  const cfg = pending ? modalConfig[pending.kind] : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Cabeçalho: ação principal */}
      <div className="shrink-0 py-[16px] px-[22px] flex items-center gap-[12px] border-b border-b-line">
        <span className="edp-title text-[16px]">Gerar Notas</span>
        <div className="flex-1" />
        <Button size="sm" onClick={() => abrirModal(undefined)}>
          Gerar / Consultar notas
        </Button>
      </div>

      {/* Zona: A gerar */}
      <div className="shrink-0 pt-[14px] px-[22px] pb-0 flex items-center gap-[12px]">
        <span className="edp-title text-[14px]">A gerar</span>
        {!aGerar.isLoading && (
          <span className="edp-mono text-[12px] text-text-mute">
            {aGerar.notas.length} nota{aGerar.notas.length !== 1 ? "s" : ""}
          </span>
        )}
        {aGerar.notas.length > 0 && (
          <Button variant="outline" size="sm"
                  onClick={() => abrirModal(aGerar.notas.map((n) => n.pk))}>
            Gerar fila ({aGerar.notas.length})
          </Button>
        )}
      </div>
      {aGerar.notas.length > 0 && (
        <CoffeeNotasTable
          notas={aGerar.notas}
          isLoading={aGerar.isLoading}
          emptyMessage="Nenhuma nota marcada para gerar."
          actionColumn={(nota) => (
            <div className="flex items-center gap-[6px]">
              <AbrirCoffeeBtn pk={nota.pk} />
              <Button variant="ghost" size="icon-sm"
                      onClick={() => setPending({ kind: "remover", pk: nota.pk })}
                      aria-label={`Remover nota ${nota.pk} da fila`} title="Remover da fila"
                      className="text-red">
                <ListX />
              </Button>
              <LogsBtn pk={nota.pk} onClick={() => setDrawerPk(nota.pk)} />
            </div>
          )}
        />
      )}

      {/* Zona: Geradas */}
      <div className="shrink-0 pt-[14px] px-[22px] pb-0 flex items-center gap-[12px]">
        <span className="edp-title text-[14px]">Notas Geradas</span>
        {!isLoading && (
          <span className="edp-mono text-[12px] text-text-mute">
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
          <div className="flex items-center gap-[6px]">
            <AbrirCoffeeBtn pk={nota.pk} />
            <RevisarNotaBtn pk={nota.pk} onClick={() => setRevisaoPk(nota.pk)} />
            <Button variant="ghost" size="icon-sm"
                    onClick={() => setPending({ kind: "arquivar", pk: nota.pk })}
                    aria-label={`Arquivar nota ${nota.pk}`} title="Arquivar nota"
                    className="text-red">
              <Archive />
            </Button>
            <LogsBtn pk={nota.pk} onClick={() => setDrawerPk(nota.pk)} />
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

      <RevisarNotaSheet pk={revisaoPk} onClose={() => setRevisaoPk(null)}
                        onMover={(revisao) => { setRevisaoPk(null); setMoverAlvo({ pks: [revisao.coffee.pk], revisao }); }} />
      <MoverPlanoModal alvo={moverAlvo} onClose={() => setMoverAlvo(null)}
                       onSucesso={() => { /* refetch nao necessario: lista de geradas nao muda */ }}
                       onIrParaInput={onIrParaInput} />
    </div>
  );
}
