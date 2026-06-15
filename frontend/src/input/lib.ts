import type { Celula, NotaInput } from './types';

export const MESES_PT_REV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, maio: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const ANO_ATUAL = new Date().getFullYear();

/** Chave de ordenação cronológica de "mes-ano" (porte de Input/app.py:53-59). */
export function chaveOrdenacaoData(val: Celula): [number, number, number] {
  const partes = String(val ?? '').split('-');
  if (partes.length === 2) {
    const mes = MESES_PT_REV[partes[0].toLowerCase()];
    const ano = Number(partes[1]);
    if (mes && Number.isFinite(ano)) return ano > ANO_ATUAL ? [1, ano, mes] : [0, -ano, mes];
  }
  return [2, 0, 0];
}

export function compararDatas(a: Celula, b: Celula): number {
  const ka = chaveOrdenacaoData(a);
  const kb = chaveOrdenacaoData(b);
  for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
}

/** "12345, 678; 90" -> [12345, 678, 90] (porte de Input/app.py:136). */
export function parseBuscaGlobal(texto: string): number[] {
  return texto.split(/[ ,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

export interface Filtro {
  campo: string;
  tipo: 'texto' | 'multi' | 'faixa';
  texto?: string;
  valores?: string[];
  min?: number;
  max?: number;
}

/** Motor de filtragem (porte de Input/app.py:247-262, aplicado no cliente). */
export function aplicarFiltros(registros: NotaInput[], filtros: Filtro[]): NotaInput[] {
  const ativos = filtros.filter((f) =>
    (f.tipo === 'texto' && (f.texto ?? '').trim() !== '') ||
    (f.tipo === 'multi' && (f.valores?.length ?? 0) > 0) ||
    (f.tipo === 'faixa' && (f.min !== undefined || f.max !== undefined)));
  if (ativos.length === 0) return registros;
  return registros.filter((r) => ativos.every((f) => {
    const bruto = r[f.campo];
    if (f.tipo === 'texto') {
      return String(bruto ?? '').toUpperCase().includes((f.texto ?? '').trim().toUpperCase());
    }
    if (f.tipo === 'multi') {
      return (f.valores ?? []).includes(String(bruto ?? ''));
    }
    const n = Number(bruto);
    if (!Number.isFinite(n)) return false;
    if (f.min !== undefined && n < f.min) return false;
    if (f.max !== undefined && n > f.max) return false;
    return true;
  }));
}

export function valoresUnicos(registros: NotaInput[], campo: string): string[] {
  const valores = new Set<string>();
  for (const r of registros) {
    const v = r[campo];
    if (v !== null && v !== undefined && String(v).trim() !== '') valores.add(String(v));
  }
  return [...valores].sort((a, b) =>
    campo === 'Mes_Execucao_Planejado' ? compararDatas(a, b) : a.localeCompare(b, 'pt-BR'));
}

export interface ResultadoCalculo { coluna: string; soma: number; media: number; contagem: number; }

/** Calculadora de soma/média/contagem (porte de Input/app.py:267-285). */
export function calcular(registros: NotaInput[], colunas: string[]): ResultadoCalculo[] {
  return colunas.map((coluna) => {
    const nums = registros.map((r) => Number(r[coluna])).filter((n) => Number.isFinite(n));
    const soma = nums.reduce((a, b) => a + b, 0);
    return { coluna, soma, media: nums.length ? soma / nums.length : 0, contagem: nums.length };
  });
}

/** Cola TSV do Excel em registros na ordem fixa de colunas. */
export function parseColagemTsv(texto: string, colunas: string[]): Partial<NotaInput>[] {
  return texto.split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((linha) => {
      const celulas = linha.split('\t');
      const registro: Partial<NotaInput> = {};
      colunas.forEach((c, i) => { registro[c] = (celulas[i] ?? '').trim(); });
      return registro;
    });
}

export function formatarNumero(v: Celula, casas = 2): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '-');
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
