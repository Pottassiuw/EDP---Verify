import { describe, expect, it } from 'vitest';

import {
  calcularResumoCritico,
  criarPlanosRelatorio,
  ordenarPlanos,
} from './relatorios-data';
import type { LinhaAnual } from './types';

function criarLinha(overrides: Partial<LinhaAnual> = {}): LinhaAnual {
  return {
    plano: 'PL-001',
    nome_curto: 'Plano de teste',
    area: 'Outros',
    unidade: 'und',
    meta: 10,
    carteira: 10,
    saldo: 0,
    pct_disp: 1,
    gap_rs: 0,
    postergado: 0,
    ...overrides,
  };
}

describe('criarPlanosRelatorio', () => {
  it('mantém o déficit e o gap financeiro como valores positivos para ações críticas', () => {
    const [plano] = criarPlanosRelatorio('Bauru', [
      criarLinha({
        plano: 'PL-100',
        carteira: 7,
        saldo: -3,
        pct_disp: 0.7,
        gap_rs: -1200,
      }),
    ]);

    expect(plano).toMatchObject({
      id: 'Bauru:PL-100',
      regional: 'Bauru',
      deficit: 3,
      gapFinanceiro: 1200,
    });
  });

  it('preserva escopo agregado sem transformá-lo em uma regional filtrável', () => {
    const [plano] = criarPlanosRelatorio(null, [criarLinha({ plano: 'PL-TOTAL' })]);

    expect(plano).toMatchObject({
      id: 'todas:PL-TOTAL',
      regional: null,
    });
  });
});

describe('calcularResumoCritico', () => {
  it('soma apenas faltas de planos, sem compensá-las com saldos positivos', () => {
    const planos = criarPlanosRelatorio('Bauru', [
      criarLinha({ plano: 'PL-DEF', carteira: 5, saldo: -5, gap_rs: -5000 }),
      criarLinha({ plano: 'PL-SOBRA', carteira: 13, saldo: 3, gap_rs: 0 }),
    ]);

    expect(calcularResumoCritico(planos)).toEqual({
      deficitUnidades: 5,
      gapFinanceiro: 5000,
      planosAbaixoMeta: 1,
    });
  });
});

describe('ordenarPlanos', () => {
  it('prioriza maior gap financeiro, menor disponibilidade e depois maior déficit', () => {
    const planos = criarPlanosRelatorio('Bauru', [
      criarLinha({ plano: 'PL-A', carteira: 8, saldo: -2, pct_disp: 0.8, gap_rs: -900 }),
      criarLinha({ plano: 'PL-B', carteira: 6, saldo: -4, pct_disp: 0.6, gap_rs: -900 }),
      criarLinha({ plano: 'PL-C', carteira: 5, saldo: -5, pct_disp: 0.5, gap_rs: -1400 }),
    ]);

    expect(ordenarPlanos(planos, 'crit').map((plano) => plano.plano)).toEqual([
      'PL-C',
      'PL-B',
      'PL-A',
    ]);
  });
});
