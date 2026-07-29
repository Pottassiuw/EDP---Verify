import type { CoffeeSubPage } from '../../types';

// Módulo leve, sem imports de UI: o sidebar importa daqui sem puxar o
// coffee-hub para o bundle inicial.
export const COFFEE_SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: 'verificar', rotulo: 'Verificar' },
  { id: 'abrir', rotulo: 'Abrir' },
  { id: 'operacao', rotulo: 'Operação' },
  { id: 'concluidas', rotulo: 'Concluídas' },
  { id: 'logs', rotulo: 'Logs' },
];
