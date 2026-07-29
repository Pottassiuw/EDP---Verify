import React from 'react';
import { Info } from 'lucide-react';

import { StatTile } from '@/components/branded/section';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { fmtQtd } from '../fmt';
import type { PlanoRelatorio } from '../relatorios-data';
import type { DashboardRelatorios } from '../types';
import { useRelatoriosPortalTheme } from '../use-relatorios-portal-theme';

export function PostergacoesKpis({
  dashboard,
  planos,
  mesSelecionado,
}: {
  dashboard: DashboardRelatorios;
  planos: PlanoRelatorio[];
  mesSelecionado: number;
}): React.JSX.Element {
  const portalTheme = useRelatoriosPortalTheme();
  const planosPostergados = planos.filter((plano) => plano.postergado > 0);
  const totalPostergado = planosPostergados.reduce((total, plano) => total + plano.postergado, 0);
  const postergadasNoMes = mesSelecionado === dashboard.mes_corrente
    ? dashboard.hero.postergadas
    : null;

  return (
    <TooltipProvider>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Postergadas (mês selecionado)" value={postergadasNoMes === null ? '—' : fmtQtd(postergadasNoMes)} />
        <StatTile label="Planos postergados" value={fmtQtd(planosPostergados.length)} />
        <StatTile label="Postergado na carteira" value={fmtQtd(totalPostergado)} />
        <StatTile
          label="R$ deslocado"
          value={(
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex items-center gap-2 text-text-mute focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                  —
                  <Info className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent {...portalTheme} sideOffset={6} className="edp">
                Não fornecido pelo contrato atual de Relatórios.
              </TooltipContent>
            </Tooltip>
          )}
        />
      </section>
    </TooltipProvider>
  );
}
