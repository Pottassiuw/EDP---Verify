import React from 'react';

import { Banner } from '@/components/branded/section';

import type { FiltrosCarteira } from '../types';
import { useCarteiraDashboard } from '../use-carteira-dashboard';
import { KpisDashboard } from './kpis-dashboard';
import { Evolucao } from './evolucao';
import { DistribuicaoPlano, DistribuicaoRegional } from './distribuicao';
import { HeatmapCobertura } from './heatmap';

export function DashboardCarteiraView({ onDrill }: {
  onDrill: (filtro: Partial<FiltrosCarteira>) => void;
}): React.JSX.Element {
  const { data, isLoading, error } = useCarteiraDashboard();

  if (error) {
    return <Banner tipo="err">Não foi possível carregar o dashboard: {error instanceof Error ? error.message : String(error)}</Banner>;
  }
  if (isLoading || !data) {
    return <span className="edp-eyebrow">Carregando dashboard…</span>;
  }

  // Drill por plano: `LinhaPlano.plano` é a descrição do conjunto (o
  // repository agrega a base disponível por `descricao_conjunto`), enquanto
  // o Explorador filtra por `conjunto` (código) — não há um código
  // equivalente no payload do dashboard para casar os dois. Por isso o
  // drill por plano nesta fase aplica apenas a situação, levando o usuário
  // para o Explorador já filtrado por "fora do plano"; refinar por
  // conjunto/código fica como follow-up.
  const drillPlano = (_plano: string): void => onDrill({ situacao: 'fora_do_plano' });
  const drillRegional = (regional: string): void => onDrill({ regional, situacao: 'fora_do_plano' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <KpisDashboard dados={data} />
      <HeatmapCobertura porRegional={data.por_regional} onDrill={drillRegional} />
      <Evolucao meses={data.mensalizacao} />
      <DistribuicaoPlano linhas={data.por_plano} onDrill={drillPlano} />
      <DistribuicaoRegional linhas={data.por_regional} onDrill={drillRegional} />
    </div>
  );
}
