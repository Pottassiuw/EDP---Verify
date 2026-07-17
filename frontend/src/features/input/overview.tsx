import React from 'react';
import type { InputDataset, NotaInput } from './types';
import { InputApi, baixarBlob } from './api';
import { toast } from 'sonner';
import { aplicarFiltros, parseBuscaGlobal } from './lib';
import { COLUNAS } from './columns';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';
import { DataGrid } from './data-grid';
import { HierarquiaCard } from './hierarquia-card';
import { useRecarregarInput } from './use-input-data';
import { useAutoVinculos } from './use-auto-vinculos';
import { Button } from '@/components/ui/button';

export function filtrarRegistros(registros: NotaInput[], estado: FiltersState): NotaInput[] {
  let resultado = registros;
  const numeros = parseBuscaGlobal(estado.busca);
  if (estado.busca.trim() !== '') {
    resultado = numeros.length ? resultado.filter((r) => numeros.includes(r.Numero_Nota)) : [];
  }
  return aplicarFiltros(resultado, estado.filtros);
}

interface OverviewProps {
  dados: InputDataset;
  estado: FiltersState;
  setEstado: React.Dispatch<React.SetStateAction<FiltersState>>;
}

export function Overview({ dados, estado, setEstado }: OverviewProps): React.JSX.Element {
  const [exportando, setExportando] = React.useState(false);
  const recarregar = useRecarregarInput();
  const { status: vinculoStatus } = useAutoVinculos(dados.registros);
  const filtrados = React.useMemo(
    () => filtrarRegistros(dados.registros, estado), [dados.registros, estado]);

  async function exportar(): Promise<void> {
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        filtrados.map((r) => r.Numero_Nota), COLUNAS.map((c) => c.key));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      baixarBlob(blob, `export_notas_${stamp}.xlsx`);
      toast.success('Exportação concluída');
    } catch (e) {
      toast.error('Falha na exportação', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExportando(false);
    }
  }

  const filtrado = filtrados.length !== dados.registros.length;

  return (
    <div className="edp-page">
      <div className="flex items-end justify-between gap-[16px] flex-wrap">
        <div className="flex items-baseline gap-[9px]">
          <span className="edp-num">{filtrados.length.toLocaleString('pt-BR')}</span>
          <span className="edp-eyebrow">
            {filtrado ? `de ${dados.registros.length.toLocaleString('pt-BR')} registros` : 'registros'}
          </span>
        </div>
        <div className="flex gap-[8px]">
          <Button variant="outline" onClick={() => {
            toast.promise(InputApi.syncSap(), {
              loading: 'Iniciando extração do SAP...',
              success: 'Sincronização SAP rodando em background!',
              error: 'Erro ao iniciar SAP',
            });
          }}>
            Sincronizar SAP
          </Button>
          <Button disabled={exportando || filtrados.length === 0}
                  onClick={() => { void exportar(); }}>
            {exportando ? 'Gerando…' : 'Exportar Excel'}
          </Button>
        </div>
      </div>

      <Filters registros={dados.registros} estado={estado} setEstado={setEstado} />
      <DataGrid registros={filtrados} colunas={COLUNAS} />

      <div className="edp-mono text-[11px] text-text-mute py-[2px] px-[0px]">
        {vinculoStatus === null
          ? 'verificando vínculos Nota_Mae…'
          : vinculoStatus.atualizadas > 0
            ? `${vinculoStatus.atualizadas} vínculo(s) Nota_Mae aplicados · ${vinculoStatus.hora}`
            : `✓ nenhum vínculo Nota_Mae pendente · ${vinculoStatus.hora}`}
      </div>

      <HierarquiaCard registros={dados.registros} recarregar={recarregar} />
    </div>
  );
}
