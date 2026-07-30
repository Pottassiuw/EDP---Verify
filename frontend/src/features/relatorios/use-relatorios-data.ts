import React from 'react';
import { useQueries } from '@tanstack/react-query';

import { CarteiraApi } from '../carteira/api';

import { criarPlanosRelatorio, type PlanoRelatorio } from './relatorios-data';
import type { DashboardRelatorios } from './types';
import { useDashboardRelatorios, useForaDoPlano } from './use-dashboard';

export interface ResumoRegionalDetalhado {
  regional: string;
  meta: number;
  carteira: number;
  saldo: number;
  pctDisp: number | null;
  executado: number;
  postergadas: number;
  metaRs: number | null;
  carteiraRs: number | null;
  gapRs: number | null;
}

export interface DadosRelatorios {
  dashboard: DashboardRelatorios | undefined;
  planos: PlanoRelatorio[];
  resumosRegionais: ResumoRegionalDetalhado[];
  isLoading: boolean;
  isDetalheRegionalLoading: boolean;
  error: Error | null;
  detalhesError: Error | null;
  corrigidasForaDoPlano: number | undefined;
}

export function useRelatoriosData(
  regionalSelecionada: string | null,
  mesSelecionado: number | null,
): DadosRelatorios {
  const principal = useDashboardRelatorios(regionalSelecionada);
  const foraDoPlano = useForaDoPlano();
  const mesReferencia = mesSelecionado ?? principal.data?.mes_referencia ?? new Date().getMonth() + 1;
  const nomesRegionais = principal.data?.regionais_disponiveis ?? [];
  const regionaisDoEscopo = regionalSelecionada ? [regionalSelecionada] : nomesRegionais;
  const nomesParaConsultar = regionalSelecionada ? [] : nomesRegionais;
  const consultasRegionais = useQueries({
    queries: nomesParaConsultar.map((regional) => ({
      queryKey: ['relatorios-dashboard', regional],
      queryFn: () => CarteiraApi.dashboard({ regional }),
      enabled: Boolean(principal.data),
      staleTime: 60_000,
    })),
  });

  const detalhesPorRegional = React.useMemo(() => {
    const detalhes = new Map<string, DashboardRelatorios>();
    if (regionalSelecionada && principal.data) {
      detalhes.set(regionalSelecionada, principal.data);
    }

    consultasRegionais.forEach((consulta, indice) => {
      const regional = nomesParaConsultar[indice];
      if (regional && consulta.data) {
        detalhes.set(regional, consulta.data);
      }
    });

    return detalhes;
  }, [consultasRegionais, nomesParaConsultar, principal.data, regionalSelecionada]);

  const planos = React.useMemo(() => {
    if (!principal.data) {
      return [];
    }

    if (regionalSelecionada) {
      return criarPlanosRelatorio(regionalSelecionada, principal.data.visao_anual);
    }

    const detalhesCompletos = nomesRegionais.length > 0
      && nomesRegionais.every((regional) => detalhesPorRegional.has(regional));
    if (detalhesCompletos) {
      return nomesRegionais.flatMap((regional) => {
        const detalhe = detalhesPorRegional.get(regional);
        return detalhe ? criarPlanosRelatorio(regional, detalhe.visao_anual) : [];
      });
    }

    return criarPlanosRelatorio(null, principal.data.visao_anual);
  }, [detalhesPorRegional, nomesRegionais, principal.data, regionalSelecionada]);

  const resumosRegionais = React.useMemo(() => {
    if (!principal.data) {
      return [];
    }

    return regionaisDoEscopo.flatMap((regional) => {
      const detalhe = detalhesPorRegional.get(regional);
      if (detalhe) {
        return [resumoDoDashboard(regional, detalhe, mesReferencia)];
      }

      if (mesReferencia !== principal.data.mes_referencia) {
        return [];
      }

      const resumo = principal.data.regionais.find((item) => item.regional === regional);
      return [{
        regional,
        meta: resumo?.meta ?? 0,
        carteira: resumo?.carteira ?? 0,
        saldo: resumo?.saldo ?? 0,
        pctDisp: resumo?.pct_disp ?? null,
        executado: 0,
        postergadas: 0,
        metaRs: null,
        carteiraRs: null,
        gapRs: null,
      }];
    });
  }, [detalhesPorRegional, mesReferencia, principal.data, regionaisDoEscopo]);

  return {
    dashboard: principal.data,
    planos,
    resumosRegionais,
    isLoading: principal.isLoading,
    isDetalheRegionalLoading: consultasRegionais.some((consulta) => consulta.isLoading),
    error: principal.error,
    detalhesError: consultasRegionais.find((consulta) => consulta.error)?.error ?? null,
    corrigidasForaDoPlano: foraDoPlano.data?.corrigidas_fora_do_plano,
  };
}

function resumoDoDashboard(
  regional: string,
  dashboard: DashboardRelatorios,
  mesReferencia: number,
): ResumoRegionalDetalhado {
  const mes = dashboard.mensalizacao.find((item) => item.mes === mesReferencia) ?? dashboard.hero;
  const { financeiro_ano: financeiro } = dashboard;

  return {
    regional,
    meta: mes.meta,
    carteira: mes.carteira,
    saldo: mes.carteira - mes.meta,
    pctDisp: mes.meta > 0 ? mes.carteira / mes.meta : null,
    executado: mes.executado,
    postergadas: mesReferencia === dashboard.mes_referencia ? dashboard.hero.postergadas : 0,
    metaRs: financeiro.meta_rs,
    carteiraRs: financeiro.carteira_rs,
    gapRs: financeiro.gap_rs,
  };
}
