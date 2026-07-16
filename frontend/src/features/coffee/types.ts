export interface CoffeeNota {
  pk: number;
  id_sap: number;
  id_sap_anterior: number | null;
  arquivado: boolean | null;
  classificacao: string;
  dados_json: Record<string, unknown> | null;
  buscado_em: string;
  classificacao_em?: string | null;
  erro: string | null;
  a_gerar?: boolean;
  origem?: string | null;
}

export interface CoffeeJob {
  estado: "rodando" | "concluido";
  total: number;
  feitas: number;
  erros: Array<{ pk: number | string; msg: string }>;
  arquivadas?: Array<{ pk: number; id_sap: number | null; local_instalacao: string | null }>;
  corrigidas?: number[];
  ja_corrigidas?: number[];
  geradas?: number[];
  divergentes?: Array<{ id: number; local_atual: string | null }>;
  iniciado_em: string;
}

export interface CoffeeLog {
  id: number;
  timestamp: string;
  tipo: "api_call" | "transicao" | "acao_usuario";
  acao: string;
  nota_pk: number | null;
  detalhes: Record<string, unknown> | null;
  sucesso: boolean;
  usuario: string | null;
  trace_id: string | null;
}

export interface CoffeeConsulta {
  pk: number;
  id_sap: number | null;
  local_instalacao: string | null;
  classificacao: string;
  arquivado: boolean | null;
}

export interface PropostaPlano {
  Numero_Nota: number;
  Local_Instalacao: string;
  Circuito: string;
  Prioridade_Nota: string;
  Status_Nota: string;
  Data_Envio_Projeto: string;
  Observacao: string;
  Planejado_DDPM: number;
  Planejado_Unidade: string | null;
}

export interface CamposManuais {
  Mes_Execucao_Planejado: string;
  Status_Obra: string;
  Observacao: string;
  Check: string;
}

export interface NotaRevisao {
  coffee: CoffeeNota;
  iw28: Record<string, string | number | null> | null;
  iw28_extraida_em: string | null;
  plano: Record<string, string | number | null> | null;
  ja_no_plano: boolean;
  proposta: PropostaPlano;
  avisos: string[];
  pode_mover: boolean;
  motivo_bloqueio: string | null;
}

export interface MoverResultado {
  inseridas: number;
  atualizadas: number;
}
