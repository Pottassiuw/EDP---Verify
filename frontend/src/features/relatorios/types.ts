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
  // Camada base disponível (fonte carteira, Fase 4a). Opcionais: ausentes se
  // a carteira não estiver sincronizada; presentes via /api/carteira/dashboard.
  base_disponivel?: number;
  cobertura_pct?: number | null;
  suficiente?: boolean;
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
  // Camada base disponível (fonte carteira, Fase 4a) — opcionais.
  base_disponivel?: number;
  cobertura_pct?: number | null;
}

export interface LinhaBaseSemMeta {
  plano: string;
  nome_curto: string | null;
  area: string | null;
  base_disponivel: number;
}

export interface MetasInfo {
  atualizadas_em: string | null;
  arquivo_mtime: number | null;
  erro: string | null;
}

export interface DashboardRelatorios {
  ano: number;
  mes_referencia: number;
  regional: string | null;
  regionais_disponiveis: string[];
  hero: HeroMes;
  visao_anual: LinhaAnual[];
  mensalizacao: MesMensalizacao[];
  regionais: RegionalResumo[];
  financeiro_ano: { meta_rs: number; carteira_rs: number; gap_rs: number };
  avisos: { executadas_sem_data: number };
  metas_info: MetasInfo;
  // Extras do superset da carteira (Fase 4a) — Relatórios ignora, mas o
  // contrato reflete a resposta de /api/carteira/dashboard.
  base_por_plano_sem_meta?: LinhaBaseSemMeta[];
  versao?: string;
}
