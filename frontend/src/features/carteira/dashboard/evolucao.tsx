import React from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis,
} from 'recharts';

import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

import { fmtQtd, MESES_ABREV_PT } from '../../relatorios/fmt';
import type { MesMensalizacao } from '../types';

const CHART_CONFIG = {
  meta: { label: 'Meta', color: 'var(--surface-2)' },
  carteira: { label: 'Planejado', color: 'var(--accent)' },
  executado: { label: 'Executado', color: 'var(--green-2)' },
  acumulado: { label: 'Executado acumulado', color: 'var(--blue)' },
} satisfies ChartConfig;

interface PontoEvolucao {
  mes: number;
  mesAbrev: string;
  meta: number;
  carteira: number;
  executado: number;
  acumulado: number;
}

export function Evolucao({ meses }: { meses: MesMensalizacao[] }): React.JSX.Element {
  let acumulado = 0;
  const dados: PontoEvolucao[] = meses.map((m) => {
    acumulado += m.executado;
    return {
      mes: m.mes,
      mesAbrev: MESES_ABREV_PT[m.mes - 1],
      meta: m.meta,
      carteira: m.carteira,
      executado: m.executado,
      acumulado,
    };
  });

  return (
    <div className="flex flex-col gap-[10px]">
      <p className="text-[12px] text-text-mute">Evolução mensal (meta × planejado × executado)</p>
      <ChartContainer
        config={CHART_CONFIG}
        className="aspect-auto h-[280px] w-full"
        aria-label="Evolução mensal: meta, planejado e executado por mês, com executado acumulado"
      >
        <ComposedChart data={dados} barCategoryGap="24%" barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="mesAbrev" tickLine={false} axisLine={false}
                 tick={{ fontSize: 11, fill: 'var(--text-mute)' }} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={fmtQtd}
                 tick={{ fontSize: 11, fill: 'var(--text-mute)' }} />
          <ChartTooltip
            content={(
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const mes = payload[0]?.payload as PontoEvolucao | undefined;
                  return mes ? MESES_ABREV_PT[mes.mes - 1] : '';
                }}
                formatter={(value, name, item) => (
                  <div className="flex w-full items-center gap-2">
                    <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                         style={{ backgroundColor: item.color }} />
                    <div className="flex flex-1 justify-between gap-2">
                      <span className="text-text-mute">
                        {CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? String(name)}
                      </span>
                      <span className="edp-mono font-medium">{fmtQtd(Number(value))}</span>
                    </div>
                  </div>
                )}
              />
            )}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="meta" fill="var(--surface-2)" stroke="var(--line)" radius={2} />
          <Bar dataKey="carteira" fill="var(--accent)" radius={2} />
          <Bar dataKey="executado" fill="var(--green-2)" radius={2} />
          <Line dataKey="acumulado" stroke="var(--blue)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
