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
  // teste (ex.: "com inspetores selecionado") vaza para os seguintes e filtra
  // a fila de forma inesperada.
  beforeEach(() => {
    sessionStorage.removeItem('edp_verify_gerador');
    sessionStorage.removeItem('edp_verify_inspetor');
    sessionStorage.removeItem('edp_verify_situacao');
  });

  it('sem seleção, mostra notas de todos os geradores', () => {
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} encaminhamentos={{}} encaminhadasHoje={[]} dupResolved={new Set()}
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

  it('filtra as notas pelo estado de encaminhamento', () => {
    sessionStorage.setItem('edp_verify_situacao', JSON.stringify('falha_operacional'));
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set(['100', '200'])}
                 encaminhamentos={{
                   '100': { situacao: 'encaminhada', etapa: 'pronta', erro: null, encaminhada_em: null, encaminhada_por: 'ana' },
                   '200': { situacao: 'falha_operacional', etapa: 'pronta', erro: 'timeout', encaminhada_em: null, encaminhada_por: 'bruno' },
                 }} encaminhadasHoje={[]} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).not.toContain('>100<');
    expect(html).toContain('>200<');
    expect(html).not.toContain('>300<');
    expect(html).toContain('Falha operacional');
  });

  it('com inspetores ES/SP selecionado (via sessionStorage persistido), exclui notas de não inspetores', () => {
    sessionStorage.setItem('edp_verify_gerador', JSON.stringify('inspectors'));
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} encaminhamentos={{}} encaminhadasHoje={[]} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).toContain('>100<');
    expect(html).toContain('>200<');
    expect(html).not.toContain('>300<');
  });

  it('permite filtrar um inspetor após selecionar o escopo ES/SP', () => {
    sessionStorage.setItem('edp_verify_gerador', JSON.stringify('inspectors'));
    sessionStorage.setItem('edp_verify_inspetor', JSON.stringify('204565'));
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} encaminhamentos={{}} encaminhadasHoje={[]} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).toContain('aria-label="Filtrar por quem gerou a nota"');
    expect(html).toContain('aria-label="Filtrar por inspetor"');
    expect(html).toContain('Gerada por: Inspetores ES/SP');
    expect(html).toContain('Inspetor: Fabricio Dias');
    expect(html).toContain('>100<');
    expect(html).not.toContain('>200<');
    expect(html).not.toContain('>300<');
  });

  it('mostra "Gerada por" na fila mesmo sem filtro de inspetor ativo, para nota não-inspetor', () => {
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} encaminhamentos={{}} encaminhadasHoje={[]} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).toContain('Gerada por 999999');
    expect(html).toContain('matrícula não cadastrada');
  });

  it('mostra "Gerada por" na fila para nota de inspetor, sem precisar do filtro ativo', () => {
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} encaminhamentos={{}} encaminhadasHoje={[]} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html).toContain('Gerada por Fabricio Dias · ES');
  });

  it('nota cadastrada não recebe a marca de "matrícula não cadastrada" na fila', () => {
    const html = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={notes} completed={new Set()} encaminhamentos={{}} encaminhadasHoje={[]} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(html.includes('Fabricio Dias · ES (matrícula não cadastrada)')).toBe(false);
    expect(html.includes('Fabricio Dias · ES')).toBe(true);
  });

  it('painel de detalhe mostra "(não cadastrado)" só para a nota sem registro no De-Para', () => {
    // notes[0] é sempre a nota selecionada por padrão (selId cai para
    // notes[0].id quando não há valor persistido em sessionStorage), então
    // cada render abaixo usa um lote de uma nota só para controlar quem
    // aparece no painel de detalhe.
    const cadastrada = nota({
      id: '500', gerador: { matricula: '204565', nome: 'Fabricio Dias', uf: 'ES', inspetor: true, cadastrado: true },
    });
    const naoCadastrada = nota({
      id: '600', gerador: { matricula: '777777', nome: 'Sem Registro', uf: 'SP', inspetor: false, cadastrado: false },
    });

    const htmlCadastrada = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={[cadastrada]} completed={new Set()} encaminhamentos={{}} encaminhadasHoje={[]} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(htmlCadastrada).toContain('Fabricio Dias · 204565');
    expect(htmlCadastrada).not.toContain('Fabricio Dias · 204565 (não cadastrado)');

    const htmlNaoCadastrada = renderToStaticMarkup(
      <Dashboard showKpis={false} notes={[naoCadastrada]} completed={new Set()} encaminhamentos={{}} encaminhadasHoje={[]} dupResolved={new Set()}
                 onToggleComplete={noop} onMarkMany={noop} onMarkDuplicate={noop} onSendToCoffee={noop} />
    );
    expect(htmlNaoCadastrada).toContain('Sem Registro · 777777 (não cadastrado)');
  });
});
