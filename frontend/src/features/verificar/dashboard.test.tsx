import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../types';

vi.hoisted(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
  // dashboard.tsx (fila recolhida) e api.ts (BASE) leem localStorage no module
  // scope / mount; sem stub, o ambiente node do vitest não tem esse global.
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
  });
});

import { Dashboard } from './dashboard';

function nota(overrides: Partial<Note>): Note {
  return {
    id: overrides.id ?? '1',
    local_instalacao: 'ABC-10', poste: 'P1', referencia: 'REF-1', problema: 'Problema',
    tipo_nota: 'Poda', setor: 'Centro', uf: 'ES', prioridade: 3,
    latitude: null, longitude: null, colaborador: null,
    imagens_totais: null, imagens_recebidas: null,
    errors: [], status: 'ok', duplicates: [],
    raw: {
      id: overrides.id ?? '1', tipo_nota: 'Poda', referencia_fisica: 'REF-1', prioridade: 3,
      setor: 'Centro', uf: 'ES', local_instalacao: 'ABC-10', alimentador: '', colaborador: '',
      executor: '', imagens_totais: 0, imagens_recebidas: 0, latitude: '', longitude: '',
      id_sap: '', descricao: '', poste: 'P1',
    },
    ...overrides,
  };
}

const notes: Note[] = [
  nota({
    id: '100', gerador: { matricula: '204565', nome: 'Fabricio Dias', uf: 'ES', inspetor: true, cadastrado: true },
  }),
  nota({
    id: '200', gerador: { matricula: '111', nome: 'Outro Inspetor', uf: 'SP', inspetor: true, cadastrado: true },
  }),
  nota({
    id: '300', gerador: { matricula: '999999', nome: '999999', uf: '', inspetor: false, cadastrado: false },
  }),
];

const noop = (): void => {};

describe('Dashboard — filtro por inspetor', () => {
  // O mock de sessionStorage é um Map compartilhado por todo o arquivo (ver
  // vi.hoisted acima); sem limpar entre testes, o filtro persistido por um
  // teste (ex.: "com inspetor selecionado") vaza para os seguintes e filtra
  // a fila de forma inesperada.
  beforeEach(() => {
    sessionStorage.removeItem('edp_verify_gerador_insp');
  });

  it('sem seleção, mostra notas de todos os geradores', () => {
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    // Notas aparecem como <span ...>{id}</span> na fila; usamos os delimitadores
    // de tag (`>100<`) porque um bare `toContain('200')` também casa com o
    // `xmlns="http://www.w3.org/2000/svg"` de qualquer ícone lucide-react
    // renderizado na página, gerando falso positivo/negativo.
    expect(html).toContain('>100<');
    expect(html).toContain('>200<');
    expect(html).toContain('>300<');
  });

  it('com inspetor selecionado (via sessionStorage persistido), mostra só notas daquele inspetor', () => {
    sessionStorage.setItem('edp_verify_gerador_insp', JSON.stringify(['204565']));
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).toContain('>100<');
    expect(html).not.toContain('>200<');
    expect(html).not.toContain('>300<');
  });

  it('lista as opções de inspetor derivadas do lote, uma por matrícula distinta', () => {
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).toContain('aria-label="Filtrar por inspetor de planejamento ES/SP"');
    expect(html).toContain('Fabricio Dias');
    expect(html).toContain('Outro Inspetor');
  });

  it('mostra "Gerada por" na fila mesmo sem filtro de inspetor ativo, para nota não-inspetor', () => {
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).toContain('Gerada por 999999');
    expect(html).toContain('matrícula não cadastrada');
  });

  it('mostra "Gerada por" na fila para nota de inspetor, sem precisar do filtro ativo', () => {
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).toContain('Gerada por Fabricio Dias · ES');
  });
});
