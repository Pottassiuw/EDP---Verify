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
