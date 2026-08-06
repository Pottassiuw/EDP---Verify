import React from 'react';
import { CircleAlert, ExternalLink } from 'lucide-react';

import { Eyebrow, StatNumber } from '@/components/branded/section';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { farol, FAROL_COR, fmtPct, fmtQtd, fmtRS } from './fmt';
import type { PlanoRelatorio } from './relatorios-data';
import { BadgeDisponibilidade } from './relatorios-ui';

/** Casca do tile de KPI. Não dá para usar `StatTile` aqui: o conteúdo varia
 *  entre badge, número com tamanho sobrescrito e valor colorido inline. */
const CLASSE_TILE = 'flex min-w-[120px] flex-col gap-[7px] rounded-app-md border border-line bg-surface px-4 py-[14px]';

function corCobertura(pct: number | null | undefined): string | undefined {
  const f = farol(pct ?? null);
  return f === null ? undefined : FAROL_COR[f];
}

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

  if (!plano) {
    return null;
  }

  return (
    <Sheet open onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <SheetContent className="w-full border-line bg-surface p-0 sm:max-w-[470px]">
        <SheetHeader className="border-b border-line px-5 py-5">
          <Eyebrow>Plano de recomposição</Eyebrow>
          <SheetTitle className="pr-8 text-lg text-text">{plano.nome_curto}</SheetTitle>
          <SheetDescription className="font-mono text-xs text-text-mute">
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
            <div className={CLASSE_TILE}>
              <Eyebrow>Disponibilidade</Eyebrow>
              <BadgeDisponibilidade pct={plano.pct_disp} />
            </div>
          </div>

          {plano.cobertura_pct == null ? (
            <div className="rounded-app border border-line bg-tint-amber p-4">
              <div className="flex gap-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-text">Cobertura sem base disponível</p>
                  <p className="text-xs leading-5 text-text-dim">
                    Sem meta no ano ou sem notas fora do plano na base COFFEE para este plano.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Valor label="Base disponível" valor={fmtQtd(plano.base_disponivel ?? 0)} />
              <div className={CLASSE_TILE}>
                <Eyebrow>Cobertura possível</Eyebrow>
                <span className="text-lg font-semibold" style={{ color: corCobertura(plano.cobertura_pct) }}>
                  {fmtPct(plano.cobertura_pct)}
                </span>
              </div>
            </div>
          )}

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
    <div className={CLASSE_TILE}>
      <Eyebrow>{label}</Eyebrow>
      <StatNumber className={`text-xl ${destaque === 'negativo' ? 'text-red' : ''}`}>{valor}</StatNumber>
    </div>
  );
}
