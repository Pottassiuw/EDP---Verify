import React from 'react';
import type { InputDataset, NotaInput } from './types';
import { InputApi, baixarBlob } from './api';
import { aplicarFiltros, parseBuscaGlobal } from './lib';
import { COLUNAS } from './columns';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';
import { NotesTable } from './notes-table';

export function filtrarRegistros(registros: NotaInput[], estado: FiltersState): NotaInput[] {
  let resultado = registros;
  const numeros = parseBuscaGlobal(estado.busca);
  if (estado.busca.trim() !== '') {
    resultado = numeros.length ? resultado.filter((r) => numeros.includes(r.Numero_Nota)) : [];
  }
  return aplicarFiltros(resultado, estado.filtros);
}

export function Overview({ dados }: { dados: InputDataset }): React.JSX.Element {
  const [estado, setEstado] = React.useState<FiltersState>(FILTROS_INICIAIS);
  const [exportando, setExportando] = React.useState(false);
  const filtrados = React.useMemo(
    () => filtrarRegistros(dados.registros, estado), [dados.registros, estado]);

  async function exportar(): Promise<void> {
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        filtrados.map((r) => r.Numero_Nota), COLUNAS.map((c) => c.key));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      baixarBlob(blob, `export_notas_${stamp}.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
          Total de registros: <strong className="edp-mono">{filtrados.length}</strong>
          {filtrados.length !== dados.registros.length ? ` de ${dados.registros.length}` : ''}
        </span>
        <button className="edp-btn sm" disabled={exportando || filtrados.length === 0} onClick={() => { void exportar(); }}>
          {exportando ? 'Gerando…' : '⬇ Exportar Excel'}
        </button>
      </div>
      <Filters registros={dados.registros} registrosFiltrados={filtrados} estado={estado} setEstado={setEstado} />
      <NotesTable registros={filtrados} colunas={COLUNAS} />
    </div>
  );
}
