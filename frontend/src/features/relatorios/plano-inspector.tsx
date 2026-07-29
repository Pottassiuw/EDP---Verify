import React from 'react';
import { CircleAlert, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { fmtQtd, fmtRS } from './fmt';
import type { PlanoRelatorio } from './relatorios-data';
import { BadgeDisponibilidade } from './relatorios-ui';
import { useRelatoriosPortalTheme } from './use-relatorios-portal-theme';

export interface PlanoInspectorProps {
  plano: PlanoRelatorio | null;
  corrigidasForaDoPlano: number | undefined;
  onFechar: () => void;
  onVerPlano: (plano: string, regional: string | null) => void;
  onIrParaCoffee: () => void;
}

export function PlanoInspector({
  plano,
  corrigidasForaDoPlano,
  onFechar,
  onVerPlano,
  onIrParaCoffee,
}: PlanoInspectorProps): React.JSX.Element | null {
  const portalTheme = useRelatoriosPortalTheme();

  if (!plano) {
    return null;
  }

  return (
    <Sheet open onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <SheetContent {...portalTheme} className="edp w-full border-line bg-surface p-0 sm:max-w-[470px]">
        <SheetHeader className="border-b border-line px-5 py-5">
          <span className="edp-eyebrow">Plano de recomposição</span>
          <SheetTitle className="pr-8 text-lg text-text">{plano.nome_curto}</SheetTitle>
          <SheetDescription className="edp-mono text-xs text-text-mute">
            {plano.plano} · {plano.regional ?? 'SP (todas)'} · {plano.area}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <Valor label="Meta" valor={fmtQtd(plano.meta)} />
            <Valor label="Carteira" valor={fmtQtd(plano.carteira)} />
            <Valor label="Saldo" valor={fmtQtd(plano.saldo)} destaque={plano.saldo < 0 ? 'negativo' : 'normal'} />
            <Valor label="Postergado" valor={fmtQtd(plano.postergado)} />
            <Valor label="Gap financeiro" valor={fmtRS(plano.gap_rs)} destaque={plano.gap_rs < 0 ? 'negativo' : 'normal'} />
            <div className="edp-stat">
              <span className="edp-eyebrow">Disponibilidade</span>
              <BadgeDisponibilidade pct={plano.pct_disp} />
            </div>
          </div>

          <div className="rounded-edp border border-line bg-tint-amber p-4">
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-text">Cobertura por notas ainda não confirmável</p>
                <p className="text-xs leading-5 text-text-dim">
                  O contrato atual de Relatórios não informa quais notas do COFFEE atendem este plano.
                  Nenhuma sugestão de cobertura foi inferida.
                </p>
              </div>
            </div>
          </div>

          {corrigidasForaDoPlano !== undefined && corrigidasForaDoPlano > 0 && (
            <Button type="button" variant="outline" className="border-line-2 bg-bg-2" onClick={onIrParaCoffee}>
              Ver {fmtQtd(corrigidasForaDoPlano)} corrigidas fora do plano
              <ExternalLink />
            </Button>
          )}
        </div>

        <SheetFooter className="border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="border-line-2 bg-bg-2" onClick={onFechar}>
            Fechar
          </Button>
          <Button type="button" onClick={() => onVerPlano(plano.plano, plano.regional)}>
            Ver notas do plano
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Valor({
  label,
  valor,
  destaque = 'normal',
}: {
  label: string;
  valor: string;
  destaque?: 'normal' | 'negativo';
}): React.JSX.Element {
  return (
    <div className="edp-stat">
      <span className="edp-eyebrow">{label}</span>
      <span className={`edp-num text-xl ${destaque === 'negativo' ? 'text-red' : ''}`}>{valor}</span>
    </div>
  );
}
