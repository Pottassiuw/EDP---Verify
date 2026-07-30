import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InputNotaResumo } from './input-nota-inspector';
import type { NotaInput } from './types';

describe('InputNotaResumo', () => {
  it('mostra somente o resumo já existente da nota', () => {
    const nota: NotaInput = {
      Numero_Nota: 700500,
      Regional: 'Guarulhos',
      Status_Obra: 'Planejada',
      Conjunto: 'POSTE',
      Circuito: 'GUA-01',
      Local_Instalacao: 'ABC-10',
      Planejado_DDPM: 12,
      Mes_Execucao_Planejado: 'jul-2026',
      Prioridade_Nota: 'Alta',
      Status_Nota: 'Em aberto',
    };

    const html = renderToStaticMarkup(<InputNotaResumo nota={nota} />);

    expect(html).toContain('Resumo do Input');
    expect(html).toContain('700500');
    expect(html).toContain('Guarulhos');
    expect(html).toContain('ABC-10');
    expect(html).toContain('jul-2026');
    expect(html).not.toContain('Dados da base COFFEE');
  });
});
