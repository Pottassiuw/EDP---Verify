const LOCAL_INSTALACAO_RE = /^\d{3}[A-Z0-9]{2}\d{8}$/;
const REGRAS_LOCAL_INSTALACAO = new Set([
  'chk_local_instal',
  'chk_local_instalacao',
]);

export function regraLocalInstalacao(rule: string): boolean {
  return REGRAS_LOCAL_INSTALACAO.has(rule);
}

export function normalizarLocalInstalacao(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function formatarLocalInstalacao(value: string | null | undefined): string {
  const clean = normalizarLocalInstalacao(value ?? '');
  return [clean.slice(0, 3), clean.slice(3, 5), clean.slice(5)]
    .filter(Boolean)
    .join('-');
}

export function localInstalacaoValido(value: string): boolean {
  return LOCAL_INSTALACAO_RE.test(value);
}

interface EdicaoLocalEntrada {
  consultado: boolean;
  ocupado: boolean;
  atual: string;
  proposto: string;
}

export function analisarEdicaoLocal({
  consultado,
  ocupado,
  atual,
  proposto,
}: EdicaoLocalEntrada): { podeSalvar: boolean; confirmado: boolean } {
  const disponivel = consultado && !ocupado && localInstalacaoValido(proposto);
  return {
    podeSalvar: disponivel && proposto !== atual,
    confirmado: disponivel && proposto === atual,
  };
}
