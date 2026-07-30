import React from 'react';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { CarteiraEnriquecimentoCard } from '../carteira/carteira-enriquecimento-card';
import { ROTULOS } from './columns';
import type { NotaInput } from './types';

const CAMPOS_RESUMO = [
  'Numero_Nota',
  'Regional',
  'Status_Obra',
  'Conjunto',
  'Circuito',
  'Local_Instalacao',
  'Planejado_DDPM',
  'Mes_Execucao_Planejado',
  'Prioridade_Nota',
  'Status_Nota',
] as const;

export function InputNotaResumo({
  nota,
}: {
  nota: NotaInput;
}): React.JSX.Element {
  return (
    <section aria-labelledby="input-nota-resumo">
      <h2 id="input-nota-resumo" className="edp-eyebrow mb-3">
        Resumo do Input
      </h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CAMPOS_RESUMO.map((campo) => (
          <div key={campo} className="min-w-0">
            <dt className="text-xs text-text-mute">
              {ROTULOS[campo] ?? campo}
            </dt>
            <dd className="edp-mono mt-1 break-words text-sm">
              {String(nota[campo] ?? '—')}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface InputNotaInspectorProps {
  nota: NotaInput | null;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onIrParaSincronizacao: () => void;
}

export function InputNotaInspector({
  nota,
  onClose,
  returnFocusRef,
  onIrParaSincronizacao,
}: InputNotaInspectorProps): React.JSX.Element {
  return (
    <Sheet open={nota !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="edp flex w-full max-w-none flex-col gap-0 p-0 sm:max-w-[560px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <SheetHeader className="border-b border-line p-4">
          <SheetTitle>
            Nota SAP <span className="edp-mono">#{nota?.Numero_Nota ?? '—'}</span>
          </SheetTitle>
        </SheetHeader>
        {nota !== null && (
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
            <InputNotaResumo nota={nota} />
            <CarteiraEnriquecimentoCard
              numeroSap={nota.Numero_Nota}
              enabled
              onIrParaSincronizacao={onIrParaSincronizacao}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
