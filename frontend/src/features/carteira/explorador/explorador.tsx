import React from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import { usePersistedState } from '../../../hooks/use-persisted-state';
import { Banner } from '@/components/branded/section';
import { Button } from '@/components/ui/button';
import { useCarteiraNotas } from '../use-carteira-notas';
import type { FiltrosCarteira } from '../types';
import { FiltrosCarteiraBar } from './filtros';
import { KpisCarteira } from './kpis';
import { TabelaCarteira } from './tabela';
import { DetalheSheet } from './detalhe-sheet';
import { MoverModal } from '../mover/mover-modal';

const SIZE = 50;

export function Explorador({ handoff }: {
  handoff?: { situacao: string; id: number } | null;
} = {}): React.JSX.Element {
  const [filtros, setFiltros] = usePersistedState<FiltrosCarteira>('edp_carteira_filtros', {});
  const [page, setPage] = React.useState(1);
  const [aberta, setAberta] = React.useState<number | null>(null);
  const [selecao, setSelecao] = React.useState<RowSelectionState>({});
  const [modalAberto, setModalAberto] = React.useState(false);

  function aplicarFiltros(f: FiltrosCarteira): void {
    setFiltros(f);
    setPage(1);
  }

  React.useEffect(() => {
    if (!handoff) return;
    setFiltros((f) => ({ ...f, situacao: handoff.situacao as FiltrosCarteira['situacao'] }));
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff?.id]);

  const { data, isLoading, error } = useCarteiraNotas({
    ...filtros, page, size: SIZE, ordenar_por: 'id_onr', ordem: 'asc',
  });

  const idsSelecionados = Object.keys(selecao).filter((k) => selecao[k]).map(Number);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <KpisCarteira />
      <FiltrosCarteiraBar filtros={filtros} onChange={aplicarFiltros} />
      {idsSelecionados.length > 0 && (
        <div className="edp-panel" style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap)', padding: '10px 14px' }}>
          <span className="edp-eyebrow">{idsSelecionados.length} selecionada(s)</span>
          <Button size="sm" style={{ marginLeft: 'auto' }} onClick={() => setModalAberto(true)}>
            Mover para o plano
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelecao({})}>Limpar</Button>
        </div>
      )}
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
            rowSelection={selecao}
            onRowSelectionChange={setSelecao}
          />
        )}
      <DetalheSheet idOnr={aberta} onClose={() => setAberta(null)} />
      <MoverModal aberto={modalAberto} idOnrs={idsSelecionados}
                  onClose={() => setModalAberto(false)}
                  onSucesso={() => setSelecao({})} />
    </div>
  );
}
