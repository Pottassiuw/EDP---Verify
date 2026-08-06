import React from 'react';

import { Banner, Eyebrow } from '@/components/branded/section';

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
    return <Eyebrow>Carregando dashboard…</Eyebrow>;
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

  // Fase 4a: a base vive dentro de visao_anual; só planos com meta entram na
  // distribuição por plano (paridade com o antigo por_plano, filtrado meta>0).
  const planosComMeta = data.visao_anual.filter((l) => l.meta > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <KpisDashboard dados={data} />
      <HeatmapCobertura porRegional={data.regionais} onDrill={drillRegional} />
      <Evolucao meses={data.mensalizacao} />
      <DistribuicaoPlano linhas={planosComMeta} onDrill={drillPlano} />
      <DistribuicaoRegional linhas={data.regionais} onDrill={drillRegional} />
    </div>
  );
}
