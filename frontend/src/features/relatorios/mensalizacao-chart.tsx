import React from 'react';
import {
  Bar, BarChart, CartesianGrid, ReferenceArea, XAxis, YAxis,
} from 'recharts';
import type { XAxisTickContentProps } from 'recharts';

import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

import { fmtQtd, MESES_ABREV_PT, MESES_NOME_PT } from './fmt';
import type { MesMensalizacao } from './types';

const CHART_CONFIG = {
  meta: { label: 'Meta', color: 'var(--surface-2)' },
  carteira: { label: 'Carteira', color: 'var(--accent)' },
  executado: { label: 'Executado', color: 'var(--green-2)' },
} satisfies ChartConfig;

interface PontoMensalizacao {
  mes: number;
  mesAbrev: string;
  meta: number;
  carteira: number;
  executado: number | undefined;
}

function XAxisTick(props: XAxisTickContentProps & { mesAtualAbrev: string }): React.JSX.Element {
  const { x, y, payload, mesAtualAbrev } = props;
  const valor = String(payload.value);
  const atual = valor === mesAtualAbrev;
  return (
    <text x={x} y={Number(y) + 12} textAnchor="middle" className="edp-mono" fontSize={11}
          fontWeight={atual ? 600 : 400} fill={atual ? 'var(--text)' : 'var(--text-mute)'}>
      {valor}
    </text>
  );
}

export function MensalizacaoChart({ meses, mesCorrente }: {
  meses: MesMensalizacao[];
  mesCorrente: number;
}): React.JSX.Element {
  const dados: PontoMensalizacao[] = meses.map((m) => ({
    mes: m.mes,
    mesAbrev: MESES_ABREV_PT[m.mes - 1],
    meta: m.meta,
    carteira: m.carteira,
    executado: m.mes <= mesCorrente ? m.executado : undefined,
  }));
  const mesAtualAbrev = MESES_ABREV_PT[mesCorrente - 1];

  return (
    <div className="flex flex-col gap-[10px]">
      <p className="text-[12px] text-text-mute">Mensalização · qtd planejada (DDPM)</p>
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[260px] w-full"
                       aria-label="Mensalização: meta, carteira e executado por mês, em quantidade planejada (DDPM)">
        <BarChart data={dados} barCategoryGap="24%" barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          {mesAtualAbrev && (
            <ReferenceArea x1={mesAtualAbrev} x2={mesAtualAbrev}
                           fill="var(--surface-2)" fillOpacity={0.6} ifOverflow="extendDomain" />
          )}
          <XAxis dataKey="mesAbrev" tickLine={false} axisLine={false}
                 tick={(props) => <XAxisTick {...props} mesAtualAbrev={mesAtualAbrev} />} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={fmtQtd}
                 tick={{ fontSize: 11, fill: 'var(--text-mute)' }} />
          <ChartTooltip
            content={(
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const mes = payload[0]?.payload as PontoMensalizacao | undefined;
                  return mes ? MESES_NOME_PT[mes.mes - 1] : '';
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
        </BarChart>
      </ChartContainer>
    </div>
  );
}
