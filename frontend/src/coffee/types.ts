export interface CoffeeNota {
  pk: number;
  id_sap: number;
  id_sap_anterior: number | null;
  arquivado: boolean | null;
  classificacao: string;
  dados_json: Record<string, unknown> | null;
  buscado_em: string;
  erro: string | null;
}

export interface CoffeeJob {
  estado: "rodando" | "concluido";
  total: number;
  feitas: number;
  erros: Array<{ pk: number | string; msg: string }>;
  iniciado_em: string;
}
