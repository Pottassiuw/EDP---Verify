import React from 'react';
import { ArrowRight, CircleAlert, WalletCards } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { calcularResumoCritico, type PlanoRelatorio } from '../relatorios-data';
import { BarraDisponibilidade, BadgeDisponibilidade, TituloPainel } from '../relatorios-ui';
import { MESES_ABREV_PT, fmtQtd, fmtRS } from '../fmt';
import type { DashboardRelatorios } from '../types';

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
  const postergadas = mes === dashboard.mes_referencia ? dashboard.hero.postergadas : null;

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
          titulo="Cobertura por notas"
          detalhe="Ligação entre planos e notas do COFFEE."
          acao={<WalletCards className="size-4 text-amber" aria-hidden="true" />}
        />
        <div className="rounded-edp border border-line bg-tint-amber p-3 text-xs leading-5 text-text-dim">
          O contrato atual não fornece notas candidatas por plano. A cobertura não é inferida automaticamente.
        </div>
        {corrigidasForaDoPlano && corrigidasForaDoPlano > 0 ? (
          <Button type="button" variant="outline" className="mt-auto border-line-2 bg-bg-2" onClick={onIrParaCoffee}>
            Ver {fmtQtd(corrigidasForaDoPlano)} corrigidas fora do plano
          </Button>
        ) : (
          <p className="mt-auto text-xs text-text-mute">Sem confirmação de cobertura disponível.</p>
        )}
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
