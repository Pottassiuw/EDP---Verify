import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  CarteiraEnriquecimentoContent,
} from './carteira-enriquecimento-card';
import type { CarteiraEnriquecimento } from './types';

const encontrada: CarteiraEnriquecimento = {
  numero_sap: 700500,
  estado: 'encontrada',
  dados: {
    descricao_conjunto: 'POSTES - CAPEX',
    conjunto: 'POSTE',
    sintoma: 'Queda',
    componente_novo: 'Rede primária',
    kit: 'KIT-01',
    n_trafo: 'TR-10',
    dispositivo_protecao: 'REL-2',
    status_sap: 'Pendente',
    prioridade_sap: 2,
  },
  ausente_na_origem_em: null,
  versao: '7',
};

function render(resultado: CarteiraEnriquecimento | undefined): string {
  return renderToStaticMarkup(
    <CarteiraEnriquecimentoContent
      resultado={resultado}
      carregando={false}
      erro={null}
      onRetry={vi.fn()}
      onIrParaSincronizacao={vi.fn()}
    />,
  );
}

describe('CarteiraEnriquecimentoContent', () => {
  it('renderiza a hierarquia e os nove campos sem PII', () => {
    const html = render(encontrada);

    expect(html).toContain('Dados da base COFFEE');
    expect(html).toContain('POSTES - CAPEX');
    expect(html).toContain('POSTE');
    expect(html).toContain('Sintoma');
    expect(html).toContain('Componente novo');
    expect(html).toContain('KIT-01');
    expect(html).toContain('TR-10');
    expect(html).toContain('REL-2');
    expect(html).toContain('Pendente');
    expect(html).toContain('Prioridade SAP');
    expect(html).not.toContain('Solicitante');
    expect(html).not.toContain('Colaborador');
  });

  it('mantém os dados e avisa quando a nota é tombstone', () => {
    const html = render({
      ...encontrada,
      estado: 'ausente_na_origem',
      ausente_na_origem_em: '2026-07-29T12:00:00',
    });

    expect(html).toContain('Ausente na origem desde');
    expect(html).toContain('POSTES - CAPEX');
  });

  it('diferencia ausência e base nunca sincronizada', () => {
    const semCorrespondencia = render({
      ...encontrada,
      estado: 'sem_correspondencia',
      dados: null,
    });
    const semSync = render({
      ...encontrada,
      estado: 'base_nao_sincronizada',
      dados: null,
    });

    expect(semCorrespondencia).toContain(
      'Sem correspondência na base COFFEE.',
    );
    expect(semSync).toContain('A Carteira ainda não foi sincronizada.');
    expect(semSync).toContain('Ir para Sincronização');
  });

  it('oferece retry somente para erro real', () => {
    const html = renderToStaticMarkup(
      <CarteiraEnriquecimentoContent
        resultado={undefined}
        carregando={false}
        erro={new Error('offline')}
        onRetry={vi.fn()}
        onIrParaSincronizacao={vi.fn()}
      />,
    );

    expect(html).toContain('Não foi possível consultar a base COFFEE.');
    expect(html).toContain('Tentar novamente');
  });

  it('marca o carregamento sem bloquear o inspector', () => {
    const html = renderToStaticMarkup(
      <CarteiraEnriquecimentoContent
        resultado={undefined}
        carregando
        erro={null}
        onRetry={vi.fn()}
        onIrParaSincronizacao={vi.fn()}
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Carregando dados da base COFFEE');
  });
});
