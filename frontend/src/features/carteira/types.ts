export type SituacaoCarteira =
  | 'cancelada' | 'executada' | 'no_plano' | 'fora_do_plano';

export interface NotaCarteira {
  id_onr: number;
  id_sap: string | null;
  sap_real: number;
  conjunto: string | null;
  descricao_conjunto: string | null;
  regional: string | null;
  csd_origem: string | null;
  empresa: string | null;
  quantidade: number | null;
  quantidade_valida: number;
  prioridade: string | null;
  prioridade_sap: number | null;
  status_sap: string | null;
  data_encerramento_exec: string | null;
  local_instalacao: string | null;
  alimentador: string | null;
  executor: string | null;
  sintoma: string | null;
  situacao: SituacaoCarteira;
  ausente_na_origem_em: string | null;
}

export interface PaginaNotas {
  registros: NotaCarteira[];
  total: number;
  page: number;
  size: number;
  versao: string;
}

export interface ResumoCarteira {
  total: number;
  por_situacao: Record<string, number>;
  por_regional: Record<string, number>;
}

export interface ExecucaoSync {
  id?: number;
  estrategia: string;
  status: string;
  refresh_marker: string | null;
  iniciado_em?: string | null;
  finalizado_em?: string | null;
  novas: number;
  atualizadas: number;
  inalteradas: number;
  ausentes: number;
  erro: string | null;
  versao_resultante: string | null;
}

export interface EstadoSync {
  ultimo_refresh_marker: string | null;
  execucoes: ExecucaoSync[];
}

export interface FiltrosCarteira {
  regional?: string;
  conjunto?: string;
  status_sap?: string;
  situacao?: SituacaoCarteira;
  sap_real?: number;
  q?: string;
  incluir_ausentes?: boolean;
}
