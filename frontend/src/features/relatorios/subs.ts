import type { RelatoriosSubPage } from '../../types';

// Módulo leve, sem imports de UI: o sidebar importa daqui sem puxar a
// seção (e o recharts) para o bundle inicial.
export const RELATORIOS_SUBS: { id: RelatoriosSubPage; rotulo: string }[] = [
  { id: 'mes', rotulo: 'Mês' },
  { id: 'planos', rotulo: 'Planos' },
  { id: 'mensalizacao', rotulo: 'Mensalização' },
];
