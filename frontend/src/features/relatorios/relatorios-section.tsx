import React from 'react';

import { Banner, PageHeader, SegTabs } from '@/components/branded/section';

import { FiltrosGlobais } from './filtros-globais';
import { RELATORIOS_TABS, TITULOS_RELATORIOS } from './navigation';
import { RelatoriosPageContent } from './relatorios-page-content';
import { PlanoInspector } from './plano-inspector';
import type { PlanoRelatorio } from './relatorios-data';
import { useRelatoriosData } from './use-relatorios-data';
import type { RelatoriosPage } from '@/types';

export interface RelatoriosSectionProps {
  page: RelatoriosPage;
  setPage: (page: RelatoriosPage) => void;
  onVerNotasDoMes: (mes: number, ano: number) => void;
  onVerPlano: (plano: string, regional: string | null) => void;
  onIrParaCoffee: () => void;
}

export function RelatoriosSection({
  page,
  setPage,
  onVerNotasDoMes,
  onVerPlano,
  onIrParaCoffee,
}: RelatoriosSectionProps): React.JSX.Element {
  const [regional, setRegional] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState('');
  const [mesSelecionado, setMesSelecionado] = React.useState<number | null>(null);
  const [planoSelecionado, setPlanoSelecionado] = React.useState<PlanoRelatorio | null>(null);
  const dados = useRelatoriosData(regional, mesSelecionado);
  const dashboard = dados.dashboard;
  const mes = mesSelecionado ?? dashboard?.mes_corrente ?? new Date().getMonth() + 1;
  const planos = React.useMemo(
    () => filtrarPlanos(dados.planos, busca),
    [busca, dados.planos],
  );

  function mudarRegional(valor: string | null): void {
    setRegional(valor);
    setPlanoSelecionado(null);
  }

  return (
    <div className="edp-page">
      <PageHeader
        eyebrow="Relatórios"
        title={TITULOS_RELATORIOS[page]}
        subtitle={`Plano de Recomposição ${dashboard?.ano ?? new Date().getFullYear()}`}
      />
      <SegTabs
        tabs={RELATORIOS_TABS}
        value={page}
        onChange={setPage}
        ariaLabel="Navegação entre telas de Relatórios"
      />
      <FiltrosGlobais
        ano={dashboard?.ano ?? new Date().getFullYear()}
        mes={mes}
        regional={regional}
        busca={busca}
        regionais={dashboard?.regionais_disponiveis ?? []}
        onMesChange={setMesSelecionado}
        onRegionalChange={mudarRegional}
        onBuscaChange={setBusca}
      />

      {dashboard?.metas_info.erro && (
        <Banner tipo="err">
          Metas de {dashboard.metas_info.atualizadas_em ?? '—'}: {dashboard.metas_info.erro}
        </Banner>
      )}

      {dados.isLoading && <p className="edp-mono text-sm text-text-mute">Carregando relatórios…</p>}
      {dados.error && (
        <Banner tipo="err">
          Erro ao carregar relatórios: {mensagemErro(dados.error)}
        </Banner>
      )}
      {dados.detalhesError && (
        <Banner tipo="err">
          Parte do detalhamento regional não pôde ser carregada: {mensagemErro(dados.detalhesError)}
        </Banner>
      )}

      {dashboard && (
        <>
          {dados.isDetalheRegionalLoading && !regional && (
            <p className="edp-mono text-xs text-text-mute">Atualizando o detalhamento por regional…</p>
          )}
          <RelatoriosPageContent
            page={page}
            dashboard={dashboard}
            mes={mes}
            regional={regional}
            busca={busca}
            planos={planos}
            regionais={dados.resumosRegionais}
            corrigidasForaDoPlano={dados.corrigidasForaDoPlano}
            onSelecionarPlano={setPlanoSelecionado}
            onSelecionarRegional={mudarRegional}
            onSelecionarMes={setMesSelecionado}
            onVerNotasDoMes={() => onVerNotasDoMes(mes, dashboard.ano)}
            onIrParaCoffee={onIrParaCoffee}
          />
        </>
      )}

      <PlanoInspector
        plano={planoSelecionado}
        corrigidasForaDoPlano={dados.corrigidasForaDoPlano}
        onFechar={() => setPlanoSelecionado(null)}
        onVerPlano={onVerPlano}
        onIrParaCoffee={onIrParaCoffee}
      />
    </div>
  );
}

function filtrarPlanos(planos: PlanoRelatorio[], busca: string): PlanoRelatorio[] {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  if (!termo) {
    return planos;
  }

  return planos.filter((plano) => [
    plano.plano,
    plano.nome_curto,
    plano.area,
    plano.regional ?? '',
    plano.unidade,
  ].some((valor) => valor.toLocaleLowerCase('pt-BR').includes(termo)));
}

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
