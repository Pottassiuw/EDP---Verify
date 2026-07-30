import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Check,
  Coffee,
  Pencil,
  RefreshCw,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { coffeeUrl } from '../../../api';
import { OPERACAO_KEY } from '../operacao/use-coffee-operacao';
import { OperacaoApi } from '../operacao/operacao-api';
import type { NotaRevisao, OperacaoEtapa } from '../types';
import { REVISAO_KEY, useNotaRevisao } from '../use-nota-revisao';
import { useCoffeeNotaLogs } from '../use-coffee-logs';
import { useCoffeePortalTheme } from '../use-coffee-portal-theme';
import { CarteiraEnriquecimentoCard } from '../../carteira/carteira-enriquecimento-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { NotaActivity } from './nota-activity';
import { NotaSummary } from './nota-summary';

export type InspectorAction =
  | 'gerar'
  | 'atualizar'
  | 'remover'
  | 'mover'
  | 'arquivar';

interface CoffeeNotaInspectorProps {
  pk: number | null;
  etapa?: OperacaoEtapa;
  showArchive?: boolean;
  showMove?: boolean;
  open: boolean;
  onClose: () => void;
  onAction: (action: InspectorAction, revisao: NotaRevisao) => void;
  onIrParaSincronizacao: () => void;
}

function maskLocal(value: string): string {
  const clean = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return [clean.slice(0, 3), clean.slice(3, 5), clean.slice(5)]
    .filter(Boolean)
    .join('-');
}

function unmaskLocal(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function nextStep(etapa: OperacaoEtapa | undefined, classificacao: string): string {
  if (etapa === 'fila') return 'Aguarde a consulta ou tente novamente.';
  if (etapa === 'pronta') return 'Revise o local e gere a nota.';
  if (etapa === 'processando') return 'A geração está em andamento.';
  if (etapa === 'aguardando_sap') return 'Atualize para buscar o SAP real.';
  if (classificacao === 'corrigida') {
    return 'Revise os dados e mova a nota para o plano.';
  }
  return 'A nota está concluída e disponível para consulta.';
}

export function CoffeeNotaInspector({
  pk,
  etapa,
  showArchive = false,
  showMove = false,
  open,
  onClose,
  onAction,
  onIrParaSincronizacao,
}: CoffeeNotaInspectorProps): React.JSX.Element {
  const portalTheme = useCoffeePortalTheme();
  const queryClient = useQueryClient();
  const revisao = useNotaRevisao(pk);
  const logs = useCoffeeNotaLogs(pk);
  const [editingLocal, setEditingLocal] = React.useState(false);
  const [localValue, setLocalValue] = React.useState('');
  const persistedLocal = revisao.data?.proposta.Local_Instalacao ?? '';
  const localMutation = useMutation({
    mutationFn: async (local: string) => {
      if (pk === null) throw new Error('Nota não selecionada.');
      return OperacaoApi.alterarLocal(pk, local);
    },
    onSuccess: async () => {
      setEditingLocal(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: REVISAO_KEY(pk) }),
        queryClient.invalidateQueries({ queryKey: OPERACAO_KEY }),
      ]);
      toast.success('Local de instalação atualizado');
    },
    onError: (error: unknown) => {
      toast.error('Falha ao atualizar local', {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  React.useEffect(() => {
    setEditingLocal(false);
    setLocalValue(maskLocal(persistedLocal));
    localMutation.reset();
  }, [pk, persistedLocal, localMutation.reset]);

  const canSaveLocal = (
    unmaskLocal(localValue).length > 0
    && unmaskLocal(localValue) !== unmaskLocal(persistedLocal)
  );
  const canEditLocal = etapa === 'fila' || etapa === 'pronta';

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        {...portalTheme}
        className="edp flex w-full max-w-none flex-col gap-0 p-0 motion-reduce:duration-0 sm:max-w-none lg:max-w-[clamp(420px,38vw,620px)]"
      >
        <SheetHeader className="border-b border-line p-4">
          <SheetTitle>
            Ficha da nota <span className="edp-mono">#{pk}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {revisao.isLoading && <p className="text-text-mute">Carregando ficha…</p>}
          {revisao.error && (
            <div role="alert" className="text-red">
              {revisao.error instanceof Error
                ? revisao.error.message
                : String(revisao.error)}
            </div>
          )}
          {revisao.data && (
            <div className="flex flex-col gap-6">
              <section aria-labelledby="coffee-local-editor">
                <div className="mb-2 flex items-center gap-2">
                  <h2 id="coffee-local-editor" className="edp-eyebrow">
                    Local de instalação
                  </h2>
                  <div className="flex-1" />
                  {canEditLocal && !editingLocal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingLocal(true)}
                    >
                      <Pencil /> Editar local
                    </Button>
                  )}
                </div>
                {editingLocal ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={localValue}
                      onChange={(event) => setLocalValue(maskLocal(event.target.value))}
                      aria-label="Local de instalação"
                      className="edp-mono"
                      disabled={localMutation.isPending}
                    />
                    <Button
                      size="icon-sm"
                      aria-label="Salvar local"
                      disabled={!canSaveLocal || localMutation.isPending}
                      onClick={() => localMutation.mutate(unmaskLocal(localValue))}
                    >
                      <Check />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Cancelar edição do local"
                      disabled={localMutation.isPending}
                      onClick={() => {
                        setLocalValue(maskLocal(persistedLocal));
                        setEditingLocal(false);
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <p className="edp-mono text-sm">{maskLocal(persistedLocal) || '—'}</p>
                )}
                {Boolean(localMutation.error) && (
                  <p role="alert" className="mt-2 text-sm text-red">
                    {localMutation.error instanceof Error
                      ? localMutation.error.message
                      : String(localMutation.error)}
                  </p>
                )}
              </section>
              <NotaSummary revisao={revisao.data} />
              <CarteiraEnriquecimentoCard
                numeroSap={revisao.data.coffee.id_sap}
                enabled={open}
                onIrParaSincronizacao={onIrParaSincronizacao}
              />
              <section className="rounded-[11px] border border-line bg-surface-2 p-3">
                <h2 className="edp-eyebrow">Próximo passo</h2>
                <p className="mt-1 text-sm text-text-dim">
                  {nextStep(etapa, revisao.data.coffee.classificacao)}
                </p>
              </section>
              <section>
                <h2 className="edp-eyebrow mb-3">Atividade</h2>
                <NotaActivity logs={logs.data ?? []} loading={logs.isLoading} />
              </section>
            </div>
          )}
        </div>
        {pk !== null && revisao.data && (
          <footer className="flex flex-wrap gap-2 border-t border-line p-3">
            <Button asChild variant="outline" size="sm">
              <a href={coffeeUrl(String(pk))} target="_blank" rel="noopener">
                <Coffee /> Abrir COFFEE
              </a>
            </Button>
            {etapa === 'pronta' && (
              <Button size="sm" onClick={() => onAction('gerar', revisao.data)}>
                <WandSparkles /> Gerar
              </Button>
            )}
            {etapa === 'aguardando_sap' && (
              <Button size="sm" onClick={() => onAction('atualizar', revisao.data)}>
                <RefreshCw /> Atualizar SAP
              </Button>
            )}
            {etapa !== undefined && etapa !== 'processando' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAction('remover', revisao.data)}
              >
                <Trash2 /> Remover
              </Button>
            )}
            {showArchive
              && etapa === undefined
              && revisao.data.coffee.classificacao === 'gerada' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAction('arquivar', revisao.data)}
              >
                <Archive /> Arquivar
              </Button>
            )}
            {showMove
              && etapa === undefined
              && revisao.data.coffee.classificacao === 'corrigida' && (
              <Button
                size="sm"
                disabled={!revisao.data.pode_mover}
                onClick={() => onAction('mover', revisao.data)}
              >
                {revisao.data.ja_no_plano ? 'Atualizar plano' : 'Mover para plano'}
              </Button>
            )}
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}
