import React from 'react';

import { PageHeader, SegTabs } from '@/components/branded/section';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { AbaMensalizacao } from './aba-mensalizacao';
import { AbaMes } from './aba-mes';
import { AbaPlanos } from './aba-planos';
import { ResumoFixo } from './resumo-fixo';
import { useDashboardRelatorios, useForaDoPlano } from './use-dashboard';

const REGIONAL_TODAS = 'todas';

type AbaRelatorio = 'mes' | 'planos' | 'mensalizacao';

const ABAS: { id: AbaRelatorio; rotulo: string }[] = [
  { id: 'mes', rotulo: 'Mês' },
  { id: 'planos', rotulo: 'Planos' },
  { id: 'mensalizacao', rotulo: 'Mensalização' },
];

export interface RelatoriosSectionProps {
  onVerNotasDoMes: (mes: number, ano: number) => void;
  onVerPlano: (plano: string, regional: string | null) => void;
  onIrParaCoffee: () => void;
}

export function RelatoriosSection({
  onVerNotasDoMes, onVerPlano, onIrParaCoffee,
}: RelatoriosSectionProps): React.JSX.Element {
  const [regional, setRegional] = React.useState<string | null>(null);
  const [aba, setAba] = React.useState<AbaRelatorio>('mes');
  const { data, isLoading, error } = useDashboardRelatorios(regional);
  const foraDoPlano = useForaDoPlano();

  const totalAlertas = React.useMemo(
    () => (data?.visao_anual ?? []).filter((l) => l.pct_disp !== null && l.pct_disp < 1).length,
    [data],
  );

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
          <ResumoFixo
            hero={data.hero}
            financeiroAno={data.financeiro_ano}
            totalAlertas={totalAlertas}
            aoVerAlertas={() => setAba('mes')}
          />
          <SegTabs tabs={ABAS} value={aba} onChange={setAba} ariaLabel="Seções do dashboard" />

          {aba === 'mes' && (
            <>
              <AbaMes
                data={data}
                aoVerNotas={() => onVerNotasDoMes(data.mes_corrente, data.ano)}
                aoVerPlano={(plano) => onVerPlano(plano, regional)}
              />
              {!foraDoPlano.error && (foraDoPlano.data?.corrigidas_fora_do_plano ?? 0) > 0 && (
                <button type="button" onClick={onIrParaCoffee}
                        className="text-left edp-mono text-[13px] text-amber hover:underline">
                  {foraDoPlano.data?.corrigidas_fora_do_plano} corrigidas no COFFEE fora do plano →
                </button>
              )}
            </>
          )}
          {aba === 'planos' && (
            <AbaPlanos data={data} aoVerPlano={(plano) => onVerPlano(plano, regional)} />
          )}
          {aba === 'mensalizacao' && <AbaMensalizacao data={data} />}
        </>
      )}
    </div>
  );
}
