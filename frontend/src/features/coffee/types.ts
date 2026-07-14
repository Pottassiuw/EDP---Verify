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
  divergentes?: Array<{ pk: number; local_atual: string | null }>;
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
