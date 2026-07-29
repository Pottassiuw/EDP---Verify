import type { LinhaAnual } from './types';

export type OrdenacaoPlanos = 'crit' | 'saldo' | 'pct' | 'gap' | 'nome';

export interface PlanoRelatorio extends LinhaAnual {
  id: string;
  regional: string | null;
  deficit: number;
  gapFinanceiro: number;
}

export interface ResumoCritico {
  deficitUnidades: number;
  gapFinanceiro: number;
  planosAbaixoMeta: number;
}

export function criarAvisoExecutadasSemData(quantidade: number): string | null {
  if (quantidade <= 0) {
    return null;
  }

  if (quantidade === 1) {
    return 'Neste ano, 1 nota executada sem data de encerramento SAP foi contabilizada no mês planejado.';
  }

  return `Neste ano, ${quantidade} notas executadas sem data de encerramento SAP foram contabilizadas no mês planejado.`;
}

export function criarPlanosRelatorio(
  regional: string | null,
  linhas: LinhaAnual[],
): PlanoRelatorio[] {
  return linhas.map((linha) => ({
    ...linha,
    id: `${regional ?? 'todas'}:${linha.plano}`,
    regional,
    deficit: Math.max(0, -linha.saldo),
    gapFinanceiro: Math.max(0, -linha.gap_rs),
  }));
}

export function calcularResumoCritico(planos: PlanoRelatorio[]): ResumoCritico {
  return planos.reduce<ResumoCritico>(
    (resumo, plano) => {
      if (plano.deficit === 0) {
        return resumo;
      }

      return {
        deficitUnidades: resumo.deficitUnidades + plano.deficit,
        gapFinanceiro: resumo.gapFinanceiro + plano.gapFinanceiro,
        planosAbaixoMeta: resumo.planosAbaixoMeta + 1,
      };
    },
    { deficitUnidades: 0, gapFinanceiro: 0, planosAbaixoMeta: 0 },
  );
}

export function ordenarPlanos(
  planos: PlanoRelatorio[],
  ordenacao: OrdenacaoPlanos,
): PlanoRelatorio[] {
  return [...planos].sort((primeiro, segundo) => {
    const resultado = compararPlanos(primeiro, segundo, ordenacao);

    return resultado || primeiro.plano.localeCompare(segundo.plano, 'pt-BR');
  });
}

function compararPlanos(
  primeiro: PlanoRelatorio,
  segundo: PlanoRelatorio,
  ordenacao: OrdenacaoPlanos,
): number {
  if (ordenacao === 'saldo') {
    return primeiro.saldo - segundo.saldo;
  }

  if (ordenacao === 'pct') {
    return disponibilidade(primeiro) - disponibilidade(segundo);
  }

  if (ordenacao === 'gap') {
    return segundo.gapFinanceiro - primeiro.gapFinanceiro;
  }

  if (ordenacao === 'nome') {
    return primeiro.nome_curto.localeCompare(segundo.nome_curto, 'pt-BR');
  }

  return (
    segundo.gapFinanceiro - primeiro.gapFinanceiro ||
    disponibilidade(primeiro) - disponibilidade(segundo) ||
    segundo.deficit - primeiro.deficit
  );
}

function disponibilidade(plano: PlanoRelatorio): number {
  return plano.pct_disp ?? Number.POSITIVE_INFINITY;
}
