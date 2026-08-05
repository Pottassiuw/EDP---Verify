import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
  });
});

import type { DuplicateCandidate, Note } from '../../types';
import { ExternalCandidateCard, mergeConsultaCampos } from './duplicate-compare-externa';

function nota(overrides: Partial<Note>): Note {
  return {
    id: '100',
    local_instalacao: '718ET00026773', poste: 'P1', referencia: 'REF-1', problema: 'chave · queda',
    tipo_nota: 'Poda', setor: 'Centro', uf: 'ES', prioridade: 3,
    latitude: null, longitude: null, colaborador: null,
    imagens_totais: null, imagens_recebidas: null,
    errors: [], status: 'erro', duplicates: [],
    raw: {
      id: '100', tipo_nota: 'Poda', referencia_fisica: 'REF-1', prioridade: 3,
      setor: 'Centro', uf: 'ES', local_instalacao: 'ABC-10', alimentador: '', colaborador: '',
      executor: '', imagens_totais: 0, imagens_recebidas: 0, latitude: '', longitude: '',
      id_sap: '', descricao: '', poste: 'P1',
    },
    ...overrides,
  };
}

function candidataMatch(overrides: Partial<DuplicateCandidate>): DuplicateCandidate {
  return {
    id: '171153', in_sheet: false, match: [], latitude: null, longitude: null,
    local_instalacao: '718ET00026773', poste: '', referencia: '', problema: 'chave · queda',
    tipo_nota: '', setor: '', uf: '', prioridade: 0,
    carteira_match: true, status_sap: 'Pendente', prioridade_sap: 3,
    conjunto: 'POSTE DEMANDA', carteira_ausente_em: null,
    ...overrides,
  };
}

function renderCard(note: Note, candidate: DuplicateCandidate): string {
  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <ExternalCandidateCard note={note} candidate={candidate} />
    </QueryClientProvider>,
  );
}

describe('mergeConsultaCampos', () => {
  it('preenche poste/referencia buscados, sem mexer no resto da candidata', () => {
    const candidate = candidataMatch({ poste: '', referencia: '' });
    const resultado = mergeConsultaCampos(candidate, { poste: 'TR-088', referencia: 'SER-11' });
    expect(resultado.poste).toBe('TR-088');
    expect(resultado.referencia).toBe('SER-11');
    expect(resultado.local_instalacao).toBe('718ET00026773');
  });

  it('campos nulos da busca caem pro que já existia na candidata', () => {
    const candidate = candidataMatch({ poste: 'ja-tinha', referencia: '' });
    const resultado = mergeConsultaCampos(candidate, { poste: null, referencia: null });
    expect(resultado.poste).toBe('ja-tinha');
    expect(resultado.referencia).toBe('');
  });
});

describe('ExternalCandidateCard', () => {
  it('com match na Carteira, mostra grid de 2 campos-chave e contexto SAP', () => {
    const html = renderCard(nota({}), candidataMatch({}));
    expect(html).toContain('718ET00026773');
    expect(html).toContain('Pendente');
    expect(html).toContain('POSTE DEMANDA');
    expect(html).toContain('2/2 campos-chave');
    expect(html).toContain('Buscar poste/referência no COFFEE');
  });

  it('tombstoned mostra aviso de ausencia mas ainda mostra os dados', () => {
    const html = renderCard(nota({}), candidataMatch({ carteira_ausente_em: '2026-07-01T00:00:00' }));
    expect(html).toContain('Ausente da Carteira desde');
    expect(html).toContain('718ET00026773');
  });

  it('sem match na Carteira, mostra estado dedicado sem grid', () => {
    const html = renderCard(nota({}), candidataMatch({ carteira_match: false }));
    expect(html).toContain('Não encontrada na Carteira de Notas');
    expect(html).not.toContain('campos-chave');
  });
});
