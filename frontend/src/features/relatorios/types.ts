export interface HeroMes {
  mes_nome: string;
  meta: number;
  carteira: number;
  executado: number;
  pct_disp: number | null;
  meta_rs: number;
  carteira_rs: number;
  postergadas: number;
}

export interface LinhaAnual {
  plano: string;
  nome_curto: string;
  area: 'Construção' | 'CSD' | 'Outros';
  unidade: string;
  meta: number;
  carteira: number;
  saldo: number;
  pct_disp: number | null;
  gap_rs: number;
  postergado: number;
}

export interface MesMensalizacao {
  mes: number;
  meta: number;
  carteira: number;
  executado: number;
}

export interface RegionalResumo {
  regional: string;
  meta: number;
  carteira: number;
  saldo: number;
  pct_disp: number | null;
}

export interface MetasInfo {
  atualizadas_em: string | null;
  arquivo_mtime: number | null;
  erro: string | null;
}

export interface DashboardRelatorios {
  ano: number;
  mes_corrente: number;
  regional: string | null;
  regionais_disponiveis: string[];
  hero: HeroMes;
  visao_anual: LinhaAnual[];
  mensalizacao: MesMensalizacao[];
  regionais: RegionalResumo[];
  financeiro_ano: { meta_rs: number; carteira_rs: number; gap_rs: number };
  metas_info: MetasInfo;
}
