import type { CoffeeSubPage } from '../../types';

// Módulo leve, sem imports de UI: o sidebar importa daqui sem puxar o
// coffee-hub para o bundle inicial.
export const COFFEE_SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: 'verificar', rotulo: 'Verificar' },
  { id: 'abrir', rotulo: 'Abrir' },
  { id: 'geradas', rotulo: 'Gerar' },
  { id: 'corrigidas', rotulo: 'Corrigidas' },
  { id: 'pendentes', rotulo: 'Pendentes' },
  { id: 'logs', rotulo: 'Logs' },
];
