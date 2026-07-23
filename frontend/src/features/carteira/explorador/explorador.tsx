import React from 'react';
import { usePersistedState } from '../../../hooks/use-persisted-state';
import { Banner } from '@/components/branded/section';
import { useCarteiraNotas } from '../use-carteira-notas';
import type { FiltrosCarteira } from '../types';
import { FiltrosCarteiraBar } from './filtros';
import { KpisCarteira } from './kpis';
import { TabelaCarteira } from './tabela';
import { DetalheSheet } from './detalhe-sheet';

const SIZE = 50;

export function Explorador(): React.JSX.Element {
  const [filtros, setFiltros] = usePersistedState<FiltrosCarteira>('edp_carteira_filtros', {});
  const [page, setPage] = React.useState(1);
  const [aberta, setAberta] = React.useState<number | null>(null);

  function aplicarFiltros(f: FiltrosCarteira): void {
    setFiltros(f);
    setPage(1);
  }

  const { data, isLoading, error } = useCarteiraNotas({
    ...filtros, page, size: SIZE, ordenar_por: 'id_onr', ordem: 'asc',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <KpisCarteira />
      <FiltrosCarteiraBar filtros={filtros} onChange={aplicarFiltros} />
      {error && <Banner tipo="err">Não foi possível carregar a carteira: {error instanceof Error ? error.message : String(error)}</Banner>}
      {isLoading && !data
        ? <span className="edp-eyebrow">Carregando…</span>
        : (
          <TabelaCarteira
            registros={data?.registros ?? []}
            total={data?.total ?? 0}
            page={page} size={SIZE}
            onPagina={setPage}
            onAbrir={setAberta}
          />
        )}
      <DetalheSheet idOnr={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}
