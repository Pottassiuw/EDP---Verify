export interface ColunaDef {
  key: string;
  label: string;
  numeric?: boolean;
  largura?: number;
  editavel?: boolean;
  opcoes?: 'status' | 'prioridade';
}

/** Colunas do painel na ordem original (Input/app.py:172-179) com os rótulos
 *  amigáveis do export (Input/app.py:67-84 / config.py MAP_FILTROS). */
export const COLUNAS: ColunaDef[] = [
  { key: 'Regional', label: 'Regional' },
  { key: 'Numero_Nota', label: 'Nº Nota (ID)', numeric: true, largura: 110 },
  { key: 'Ordem', label: 'Ordem SAP', largura: 120 },
  { key: 'Status_Obra', label: 'Status Obra', editavel: true },
  { key: 'Conjunto', label: 'Conjunto', editavel: true },
  { key: 'Circuito', label: 'Circuito', editavel: true },
  { key: 'Local_Instalacao', label: 'Local Instalação', editavel: true, largura: 170 },
  { key: 'Planejado_DDPM', label: 'Planejado', numeric: true, editavel: true },
  { key: 'Mes_Execucao_Planejado', label: 'Mês Execução Planejado', editavel: true },
  { key: 'Data_Envio_Projeto', label: 'Data Envio Projeto', editavel: true },
  { key: 'Centro_Responsavel', label: 'Centro Responsável' },
  { key: 'Prioridade_Nota', label: 'Prioridade Nota', editavel: true, opcoes: 'prioridade' },
  { key: 'Status_Nota', label: 'Status Nota', editavel: true, opcoes: 'status', largura: 180 },
  { key: 'Cidade', label: 'Cidade' },
  { key: 'Observacao', label: 'Observação', editavel: true, largura: 220 },
  { key: 'CJ_Aneel', label: 'Cj. Aneel' },
  { key: 'substacao_conjunto', label: 'Subestação Conj' },
  { key: 'Conj.critico', label: 'Conj. Crítico' },
  { key: 'ranking', label: 'Ranking', numeric: true },
  { key: 'Check', label: 'Check', editavel: true },
  { key: 'Export_status', label: 'Export Status' },
  { key: 'Status_Final', label: 'Status Final' },
  { key: 'Status_Anterior', label: 'Status Anterior' },
  { key: 'Status_Usuário_Ordem', label: 'Status Usuário Ordem' },
  { key: 'Status_Sistema', label: 'Status Sistema' },
  { key: 'Total_planejado_ordem', label: 'Total Planejado Ordem (R$)', numeric: true },
  { key: 'Total_real_ordem', label: 'Total Real Ordem (R$)', numeric: true },
  { key: 'Exec_percentagem_ordem', label: 'Exec %', numeric: true },
  { key: 'Ordem_Executada', label: 'Ordem Exec.' },
  { key: 'Modular', label: 'Modular (R$)', numeric: true },
  { key: 'Regional_CSD', label: 'Regional CSD' },
  { key: 'N_Clientes_Conjunto', label: 'Nº Clientes Conjunto', numeric: true },
  { key: 'CHI', label: 'CHI', numeric: true },
  { key: 'CI', label: 'CI', numeric: true },
  { key: 'Ocorrencia', label: 'Ocorrências', numeric: true },
  { key: 'DEC', label: 'DEC', numeric: true },
  { key: 'FEC', label: 'FEC', numeric: true },
  { key: 'CHI_Conj', label: 'CHI Conjunto', numeric: true },
  { key: 'Equipamento_Protecao', label: 'DIS Proteção' },
  { key: 'DEC_PROG_CHI', label: 'DEC Prog. CHI', numeric: true },
];

export const ROTULOS: Record<string, string> =
  Object.fromEntries(COLUNAS.map((c) => [c.key, c.label]));

/** Espelho de db.CAMPOS_EDITAVEIS no backend. */
export const CAMPOS_EDITAVEIS = COLUNAS.filter((c) => c.editavel).map((c) => c.key);

/** Calculadora (Input/app.py:199-204). */
export const COLUNAS_CALCULAVEIS: Record<string, string> = {
  'Planejado DDPM': 'Planejado_DDPM',
  'Total Planejado Ordem': 'Total_planejado_ordem',
  'Total Real Ordem': 'Total_real_ordem',
  'Nº Clientes Conjunto': 'N_Clientes_Conjunto',
  CHI: 'CHI',
  CIH: 'CI',
  'Ocorrências': 'Ocorrencia',
  DEC: 'DEC',
  FEC: 'FEC',
};

/** Campos oferecidos nos filtros avançados, por tipo (Input/app.py:216-217). */
export const FILTROS_TEXTO = ['Local_Instalacao', 'Observacao', 'Ordem',
  'Centro_Responsavel', 'Equipamento_Protecao'];
export const FILTROS_FAIXA = ['Planejado_DDPM', 'ranking', 'Total_planejado_ordem',
  'Total_real_ordem', 'Exec_percentagem_ordem', 'N_Clientes_Conjunto',
  'CHI', 'CI', 'Ocorrencia', 'DEC', 'FEC'];
export const FILTROS_MULTI = ['Status_Nota', 'Regional', 'Mes_Execucao_Planejado',
  'Prioridade_Nota', 'Conjunto', 'Cidade', 'CJ_Aneel', 'Conj.critico',
  'Export_status', 'Status_Final', 'Ordem_Executada', 'Regional_CSD'];

/** Colunas da colagem em massa, na ordem (Input/app.py:674-679). */
export const COLUNAS_COLAGEM = ['Numero_Nota', 'Status_Nota', 'Prioridade_Nota',
  'Planejado_DDPM', 'Status_Obra', 'Conjunto', 'Circuito', 'Local_Instalacao',
  'Mes_Execucao_Planejado', 'Data_Envio_Projeto', 'Observacao', 'Check'];
