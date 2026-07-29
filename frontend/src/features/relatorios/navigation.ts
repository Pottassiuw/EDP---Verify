import type { RelatoriosPage } from '@/types';

export interface RelatoriosTab {
  id: RelatoriosPage;
  rotulo: string;
}

export const RELATORIOS_TABS: RelatoriosTab[] = [
  { id: 'dashboard', rotulo: 'Dashboard geral' },
  { id: 'regional', rotulo: 'Carteira por regional' },
  { id: 'mensalizacao', rotulo: 'Mensalização' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'postergacoes', rotulo: 'Postergações' },
  { id: 'exportar', rotulo: 'Exportar' },
];

export const TITULOS_RELATORIOS: Record<RelatoriosPage, string> = {
  dashboard: 'Dashboard geral',
  regional: 'Carteira por regional',
  mensalizacao: 'Mensalização',
  financeiro: 'Financeiro',
  postergacoes: 'Postergações',
  exportar: 'Exportar relatórios',
};
