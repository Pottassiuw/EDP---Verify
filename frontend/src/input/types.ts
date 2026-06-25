export type Celula = string | number | null;

/** Uma nota enriquecida vinda de GET /api/input/notas (colunas dinâmicas). */
export interface NotaInput {
  Numero_Nota: number;
  [coluna: string]: Celula | undefined;
}

export interface BaseStatus {
  nome: string;
  arquivo: string;
  encontrada: boolean;
  modificada: string | null;
}

export interface InputMeta {
  status_opcoes: string[];
  prioridade_opcoes: string[];
  bases: BaseStatus[];
  ultima_alteracao: string | null;
  migracao: "ja-existe" | "migrado" | "rede-indisponivel";
  colunas: string[];
}

export interface InputDataset {
  registros: NotaInput[];
  meta: InputMeta;
}

export interface LogRegistro {
  ID_Log: number;
  Numero_Nota: number;
  Usuario: string;
  Data_Hora: string | number | null;
  Campo_Alterado: string;
  Valor_Antigo: string;
  Valor_Novo: string;
}

export interface LogArquivo {
  ID_Log: number;
  Nome_Arquivo: string;
  Usuario: string;
  Data_Hora: string | number | null;
  Acao: string;
}

export interface BackupInfo {
  arquivo: string;
  tamanho_mb: number;
  modificado: string;
}

export interface EdicaoResultado {
  alteradas: number;
  campos: number;
  ultima_alteracao: string | null;
}

export type AbaInput = "visao" | "gerenciar" | "relatorios" | "logs" | "config";
