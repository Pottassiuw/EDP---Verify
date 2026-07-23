import React from 'react';

import type { RelatoriosSubPage } from '../../types';
import { PageHeader, SegTabs } from '@/components/branded/section';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { AbaMensalizacao } from './aba-mensalizacao';
import { AbaMes } from './aba-mes';
import { AbaPlanos } from './aba-planos';
import { MESES_NOME_PT } from './fmt';
import { ResumoFixo } from './resumo-fixo';
import { RELATORIOS_SUBS } from './subs';
import { useDashboardRelatorios, useForaDoPlano } from './use-dashboard';

const REGIONAL_TODAS = 'todas';
const MES_ATUAL = 'atual';

// Capitaliza no texto (não via CSS): o SelectValue do trigger espelha só o
// ItemText do Radix, sem herdar className do item.
function capitalizar(nome: string): string {
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export interface RelatoriosSectionProps {
  sub: RelatoriosSubPage;
  setSub: (s: RelatoriosSubPage) => void;
  onVerNotasDoMes: (mes: number, ano: number) => void;
  onVerPlano: (plano: string, regional: string | null) => void;
  onIrParaCoffee: () => void;
  onVerForaDoPlano?: () => void;
}

export function RelatoriosSection({
  sub, setSub, onVerNotasDoMes, onVerPlano, onIrParaCoffee, onVerForaDoPlano,
}: RelatoriosSectionProps): React.JSX.Element {
  const [regional, setRegional] = React.useState<string | null>(null);
  const [mes, setMes] = React.useState<number | null>(null);
  const { data, isLoading, error } = useDashboardRelatorios(regional, mes);
  const foraDoPlano = useForaDoPlano();

  const totalAlertas = React.useMemo(
    () => (data?.visao_anual ?? []).filter((l) => l.pct_disp !== null && l.pct_disp < 1).length,
    [data],
  );

  return (
    <div className="edp-page">
      <PageHeader
        eyebrow="Relatórios"
        title="Dashboard Geral"
        subtitle={`Plano de Recomposição ${data?.ano ?? new Date().getFullYear()}`}
        action={
          <div className="flex items-center gap-[10px]">
            <Select
              value={mes === null ? MES_ATUAL : String(mes)}
              onValueChange={(v) => setMes(v === MES_ATUAL ? null : Number(v))}
            >
              <SelectTrigger className="w-[160px]" aria-label="Filtrar por mês">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MES_ATUAL}>Mês atual</SelectItem>
                {MESES_NOME_PT.map((nome, i) => (
                  <SelectItem key={nome} value={String(i + 1)}>{capitalizar(nome)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          </div>
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
            aoVerAlertas={() => setSub('mes')}
          />
          <SegTabs tabs={RELATORIOS_SUBS} value={sub} onChange={setSub}
                   ariaLabel="Seções do dashboard" />

          {sub === 'mes' && (
            <>
              <AbaMes
                data={data}
                aoVerNotas={() => onVerNotasDoMes(data.mes_referencia, data.ano)}
                aoVerPlano={(plano) => onVerPlano(plano, regional)}
              />
              {!foraDoPlano.error && (foraDoPlano.data?.corrigidas_fora_do_plano ?? 0) > 0 && (
                <div className="flex items-center gap-[10px]">
                  <button type="button" onClick={onIrParaCoffee}
                          className="text-left edp-mono text-[13px] text-amber hover:underline">
                    {foraDoPlano.data?.corrigidas_fora_do_plano} nota(s) fora do plano →
                  </button>
                  {onVerForaDoPlano && (
                    <Button variant="link" size="sm" onClick={onVerForaDoPlano}>
                      Ver na carteira
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          {sub === 'planos' && (
            <AbaPlanos data={data} aoVerPlano={(plano) => onVerPlano(plano, regional)} />
          )}
          {sub === 'mensalizacao' && <AbaMensalizacao data={data} />}
        </>
      )}
    </div>
  );
}
