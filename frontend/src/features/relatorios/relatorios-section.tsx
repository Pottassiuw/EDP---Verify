import React from 'react';

import { PageHeader } from '@/components/branded/section';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { HeroMes } from './hero-mes';
import { TabelaAnual } from './tabela-anual';
import { useDashboardRelatorios, useForaDoPlano } from './use-dashboard';

const REGIONAL_TODAS = 'todas';

export interface RelatoriosSectionProps {
  onVerNotasDoMes: (mes: number, ano: number) => void;
  onVerPlano: (plano: string, regional: string | null) => void;
  onIrParaCoffee: () => void;
}

export function RelatoriosSection({
  onVerNotasDoMes, onVerPlano, onIrParaCoffee,
}: RelatoriosSectionProps): React.JSX.Element {
  const [regional, setRegional] = React.useState<string | null>(null);
  const { data, isLoading, error } = useDashboardRelatorios(regional);
  useForaDoPlano();
  void onIrParaCoffee;

  return (
    <div className="edp-page">
      <PageHeader
        eyebrow="Relatórios"
        title={`Plano de Recomposição ${data?.ano ?? new Date().getFullYear()}`}
        action={
          <Select
            value={regional ?? REGIONAL_TODAS}
            onValueChange={(v) => setRegional(v === REGIONAL_TODAS ? null : v)}
          >
            <SelectTrigger className="w-[220px]" aria-label="Filtrar por regional">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={REGIONAL_TODAS}>SP (todas)</SelectItem>
              {(data?.regionais_disponiveis ?? []).map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {data?.metas_info.erro && (
        <span className="edp-mono text-[12px] text-amber">
          Metas de {data.metas_info.atualizadas_em ?? '—'} (sync falhou: {data.metas_info.erro})
        </span>
      )}

      {isLoading && <span className="text-text-mute">Carregando…</span>}
      {error && (
        <span className="text-red">
          Erro ao carregar dashboard: {error instanceof Error ? error.message : String(error)}
        </span>
      )}

      {data && (
        <>
          <HeroMes
            hero={data.hero}
            financeiroAno={data.financeiro_ano}
            aoVerNotas={() => onVerNotasDoMes(data.mes_corrente, data.ano)}
          />
          <TabelaAnual
            linhas={data.visao_anual}
            aoClicarPlano={(plano) => onVerPlano(plano, regional)}
          />
        </>
      )}
    </div>
  );
}
