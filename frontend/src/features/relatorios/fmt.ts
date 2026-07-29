export { MESES_ABREV_PT } from '../input/lib';

export function fmtQtd(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function fmtPct(p: number | null): string {
  return p === null ? '—' : `${(p * 100).toFixed(0)}%`;
}

const rsCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact',
});

export function fmtRS(v: number): string {
  return rsCompacto.format(v);
}

export type Farol = 'verde' | 'ambar' | 'vermelho';

/** Farol de %Disp: verde >= 1, âmbar >= 0.85, vermelho < 0.85; null quando meta = 0. */
export function farol(pct: number | null): Farol | null {
  if (pct === null) return null;
  if (pct >= 1) return 'verde';
  if (pct >= 0.85) return 'ambar';
  return 'vermelho';
}

export const FAROL_COR: Record<Farol, string> = {
  verde: 'var(--green)', ambar: 'var(--amber)', vermelho: 'var(--red)',
};
