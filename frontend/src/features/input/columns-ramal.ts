import type { ColunaDef } from './columns';

export const COLUNAS_RAMAL: ColunaDef[] = [
  { key: 'Numero_Nota',            label: 'Nº Nota (ID)',             numeric: true, largura: 110 },
  { key: 'Status_Nota',            label: 'Status Nota',              editavel: true, opcoes: 'status', largura: 180 },
  { key: 'Conjunto',               label: 'Conjunto',                 editavel: true },
  { key: 'Circuito',               label: 'Circuito',                 editavel: true },
  { key: 'Local_Instalacao',       label: 'Local Instalação',         editavel: true, largura: 170 },
  { key: 'Planejado_DDPM',         label: 'Planejado',                numeric: true, editavel: true },
  { key: 'Mes_Execucao_Planejado', label: 'Mês Execução Planejado',   editavel: true, opcoes: 'mes', largura: 170 },
  { key: 'CenTrab_Respon',         label: 'Centro Trab. Responsável' },
  { key: 'Prioridade_Nota',        label: 'Prioridade Nota',          editavel: true, opcoes: 'prioridade' },
  { key: 'Observacao',             label: 'Observação',               editavel: true, largura: 260 },
  { key: 'Extracao_Antiga',        label: 'Extração Antiga' },
  { key: 'Status_Anterior',        label: 'Status Anterior' },
  { key: 'Check_Btzero',           label: 'Check Btzero',             editavel: true },
  { key: 'Plano',                  label: 'Plano',                    editavel: true },
];

export const ROTULOS_RAMAL: Record<string, string> =
  Object.fromEntries(COLUNAS_RAMAL.map((c) => [c.key, c.label]));

export const COLUNAS_COLAGEM_RAMAL = [
  'Numero_Nota', 'Status_Nota', 'Prioridade_Nota', 'Planejado_DDPM',
  'Conjunto', 'Circuito', 'Local_Instalacao',
  'Mes_Execucao_Planejado', 'Observacao', 'Check_Btzero', 'Plano',
];
