import React from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '../confirm-modal';
import { formatRelativeTime } from '../format';
import { OperacaoBatchBar } from './components/operacao-batch-bar';
import { OperacaoComposer } from './components/operacao-composer';
import { OperacaoKanban } from './components/operacao-kanban';
import { useCoffeeOperacao } from './use-coffee-operacao';

export function CoffeeOperacao(): React.JSX.Element {
  const {
    quadro,
    consultar,
    gerar,
    atualizarSap,
    remover,
  } = useCoffeeOperacao();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [selectedPk, setSelectedPk] = React.useState<number | null>(null);
  const [pendingRemoval, setPendingRemoval] = React.useState<number[] | null>(null);
  const lastTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const itens = quadro.data?.itens ?? [];
  const selectedItems = itens.filter(
    (item) => selected.has(item.nota_pk ?? item.entrada_id),
  );
  const waitingSapIds = itens
    .filter((item) => item.etapa === 'aguardando_sap')
    .map((item) => item.nota_pk ?? item.entrada_id);
  const latestUpdate = itens.reduce<string | null>(
    (latest, item) => (
      latest === null || item.atualizado_em > latest
        ? item.atualizado_em
        : latest
    ),
    null,
  );

  function clearSelection(): void {
    setSelected(new Set());
  }

  function toggle(pk: number): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  }

  function openInspector(pk: number, trigger: HTMLButtonElement): void {
    lastTriggerRef.current = trigger;
    setSelectedPk(pk);
  }

  function mutationError(action: string, error: unknown): void {
    toast.error(`Não foi possível ${action}`, {
      description: error instanceof Error ? error.message : String(error),
    });
  }

  function consult(ids: number[]): void {
    consultar.mutate(ids, {
      onSuccess: () => {
        clearSelection();
        toast.success(`Consulta iniciada para ${ids.length} notas.`);
      },
      onError: (error) => mutationError('consultar as notas', error),
    });
  }

  function generate(ids: number[]): void {
    gerar.mutate(ids, {
      onSuccess: () => {
        clearSelection();
        toast.success(`Geração iniciada para ${ids.length} notas.`);
      },
      onError: (error) => mutationError('gerar as notas', error),
    });
  }

  function updateSap(ids: number[]): void {
    atualizarSap.mutate(ids, {
      onSuccess: () => {
        clearSelection();
        toast.success(`Atualização SAP iniciada para ${ids.length} notas.`);
      },
      onError: (error) => mutationError('atualizar o SAP', error),
    });
  }

  function confirmRemoval(justificativa: string): void {
    if (pendingRemoval === null) return;

    remover.mutate(
      { ids: pendingRemoval, justificativa },
      {
        onSuccess: () => {
          clearSelection();
          setPendingRemoval(null);
          toast.success(`${pendingRemoval.length} notas removidas da operação.`);
        },
        onError: (error) => mutationError('remover as notas', error),
      },
    );
  }

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      data-selected-pk={selectedPk ?? undefined}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-[22px] py-4">
        <div className="min-w-0 flex-1">
          <span className="edp-eyebrow">Fluxo ativo</span>
          <h1 className="edp-title text-lg">Geração de notas</h1>
        </div>
        <span className="edp-mono text-xs text-text-mute">
          {itens.length} em andamento
        </span>
        <span className="edp-mono text-xs text-text-mute">
          {latestUpdate
            ? `Atualizado ${formatRelativeTime(latestUpdate)}`
            : 'Sem atualizações'}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={waitingSapIds.length === 0 || atualizarSap.isPending}
          onClick={() => updateSap(waitingSapIds)}
        >
          <RefreshCw /> Atualizar pendentes
        </Button>
        <OperacaoComposer pending={consultar.isPending} onConsultar={consult} />
      </header>
      {quadro.isError && (
        <div className="border-b border-line px-[22px] py-3 text-sm text-red" role="alert">
          Não foi possível carregar a operação. Atualize a página para tentar novamente.
        </div>
      )}
      <OperacaoKanban
        itens={itens}
        jobs={quadro.data?.operacoes_ativas ?? []}
        selected={selected}
        onToggle={toggle}
        onOpen={openInspector}
      />
      <OperacaoBatchBar
        itens={selectedItems}
        allItems={itens}
        onClear={clearSelection}
        onSelectColumn={(ids) => setSelected(new Set(ids))}
        onGerar={generate}
        onAtualizar={updateSap}
        onReconsultar={consult}
        onRemover={setPendingRemoval}
      />
      <ConfirmModal
        open={pendingRemoval !== null}
        title="Remover notas da operação"
        message="As notas serão removidas da operação atual. Informe o motivo."
        confirmLabel="Remover"
        tone="danger"
        requireJustification
        busy={remover.isPending}
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
