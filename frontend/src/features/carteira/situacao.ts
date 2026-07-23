import type { SituacaoCarteira } from './types';

export const SITUACAO_INFO: Record<SituacaoCarteira,
  { rotulo: string; variant: 'situPlano' | 'situExec' | 'situFora' | 'situCancel' }> = {
  no_plano: { rotulo: 'No plano', variant: 'situPlano' },
  executada: { rotulo: 'Executada', variant: 'situExec' },
  fora_do_plano: { rotulo: 'Fora do plano', variant: 'situFora' },
  cancelada: { rotulo: 'Cancelada', variant: 'situCancel' },
};
