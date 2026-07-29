import React from 'react';
import { ArrowRight, CircleAlert, WalletCards } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { calcularResumoCritico, type PlanoRelatorio } from '../relatorios-data';
import { BarraDisponibilidade, BadgeDisponibilidade, TituloPainel } from '../relatorios-ui';
import { farol, FAROL_COR, MESES_ABREV_PT, fmtPct, fmtQtd, fmtRS } from '../fmt';
import type { DashboardRelatorios } from '../types';

function corCobertura(pct: number | null): string | undefined {
  const f = farol(pct);
  return f === null ? undefined : FAROL_COR[f];
}

export function ResumoDecisao({
  dashboard,
  mes,
  planos,
  corrigidasForaDoPlano,
  onVerNotasDoMes,
  onIrParaCoffee,
}: {
  dashboard: DashboardRelatorios;
  mes: number;
  planos: PlanoRelatorio[];
  corrigidasForaDoPlano: number | undefined;
  onVerNotasDoMes: () => void;
  onIrParaCoffee: () => void;
}): React.JSX.Element {
  const dadosDoMes = dashboard.mensalizacao.find((item) => item.mes === mes) ?? dashboard.hero;
  const disponibilidade = dadosDoMes.meta > 0 ? dadosDoMes.carteira / dadosDoMes.meta : null;
  const resumoCritico = calcularResumoCritico(planos);
  const postergadas = mes === dashboard.mes_corrente ? dashboard.hero.postergadas : null;

  // Fase 4a: cobertura possível agregada a partir da camada base (carteira).
  const planosComMeta = planos.filter((plano) => plano.meta > 0);
  const baseDisponivel = planosComMeta.reduce((soma, p) => soma + (p.base_disponivel ?? 0), 0);
  const metaTotal = planosComMeta.reduce((soma, p) => soma + p.meta, 0);
  const carteiraTotal = planosComMeta.reduce((soma, p) => soma + p.carteira, 0);
  const coberturaPossivel = metaTotal > 0 ? (carteiraTotal + baseDisponivel) / metaTotal : null;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="edp-panel flex flex-col gap-4">
        <TituloPainel
          titulo="Carteira versus meta"
          detalhe={`Referência mensal: ${nomeMes(mes)}`}
          acao={<BadgeDisponibilidade pct={disponibilidade} />}
        />
        <div className="grid grid-cols-3 gap-3">
          <Resumo label="Meta" valor={fmtQtd(dadosDoMes.meta)} />
          <Resumo label="Carteira" valor={fmtQtd(dadosDoMes.carteira)} />
          <Resumo label="Executado" valor={fmtQtd(dadosDoMes.executado)} />
        </div>
        <BarraDisponibilidade pct={disponibilidade} label="Disponibilidade da carteira em relação à meta" />
        <div className="flex items-center justify-between gap-3 text-xs text-text-mute">
          <span>{postergadas === null ? 'Postergações disponíveis no mês corrente' : `${fmtQtd(postergadas)} postergadas`}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onVerNotasDoMes} className="text-text-dim">
            Ver notas
            <ArrowRight />
          </Button>
        </div>
      </section>

      <section className="edp-panel flex flex-col gap-4">
        <TituloPainel
          titulo="Déficit que exige ação"
          detalhe="Soma de faltas por plano; sobras não compensam déficits."
          acao={<CircleAlert className="size-4 text-red" aria-hidden="true" />}
        />
        <div className="grid grid-cols-3 gap-3">
          <Resumo label="Planos abaixo" valor={fmtQtd(resumoCritico.planosAbaixoMeta)} tom="text-red" />
          <Resumo label="Déficit" valor={fmtQtd(resumoCritico.deficitUnidades)} tom="text-red" />
          <Resumo label="Gap R$" valor={fmtRS(resumoCritico.gapFinanceiro)} tom="text-red" />
        </div>
        <p className="mt-auto text-xs leading-5 text-text-mute">
          A lista abaixo prioriza o maior impacto financeiro e a menor disponibilidade.
        </p>
      </section>

      <section className="edp-panel flex flex-col gap-4">
        <TituloPainel
          titulo="Cobertura possível"
          detalhe="Planejado + base fora do plano (COFFEE), sobre a meta."
          acao={<WalletCards className="size-4 text-text-dim" aria-hidden="true" />}
        />
        <div className="grid grid-cols-2 gap-3">
          <Resumo label="Base disponível" valor={fmtQtd(baseDisponivel)} />
          <div className="min-w-0">
            <p className="edp-eyebrow truncate">Cobertura possível</p>
            <p className="mt-1 truncate text-lg font-semibold tracking-display"
               style={{ color: corCobertura(coberturaPossivel) }}>
              {coberturaPossivel === null ? '—' : fmtPct(coberturaPossivel)}
            </p>
          </div>
        </div>
        {corrigidasForaDoPlano && corrigidasForaDoPlano > 0 ? (
          <Button type="button" variant="outline" className="mt-auto border-line-2 bg-bg-2" onClick={onIrParaCoffee}>
            Ver {fmtQtd(corrigidasForaDoPlano)} corrigidas fora do plano
          </Button>
        ) : null}
      </section>
    </div>
  );
}

function Resumo({
  label,
  valor,
  tom = 'text-text',
}: {
  label: string;
  valor: string;
  tom?: string;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <p className="edp-eyebrow truncate">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold tracking-display ${tom}`}>{valor}</p>
    </div>
  );
}

function nomeMes(mes: number): string {
  const nome = MESES_ABREV_PT[mes - 1] ?? '';
  return `${nome.slice(0, 1).toUpperCase()}${nome.slice(1)}`;
}
