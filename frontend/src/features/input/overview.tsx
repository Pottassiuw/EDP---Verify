import React from 'react';
import { Loader2, Download, RefreshCw, CheckCircle2, GitMerge } from 'lucide-react';
import type { InputDataset, NotaInput } from './types';
import { InputApi, baixarBlob } from './api';
import { toast } from 'sonner';
import { aplicarFiltros, parseBuscaGlobal } from './lib';
import { COLUNAS } from './columns';
import { type FiltersState } from './filters';
import { DataGrid } from './data-grid';
import { HierarquiaCard } from './hierarquia-card';
import { InputNotaInspector } from './input-nota-inspector';
import { useRecarregarInput } from './use-input-data';
import { useAutoVinculos } from './use-auto-vinculos';
import { Button } from '@/components/ui/button';

export function filtrarRegistros(registros: NotaInput[], estado: FiltersState): NotaInput[] {
  let resultado = registros;
  const numeros = parseBuscaGlobal(estado.busca);
  if (estado.busca.trim() !== '') {
    resultado = numeros.length ? resultado.filter((r) => numeros.includes(r.Numero_Nota)) : [];
  }
  if (estado.somente2026) {
    const anoAtual = String(new Date().getFullYear());
    resultado = resultado.filter((r) => String(r.Mes_Execucao_Planejado ?? '').includes(anoAtual));
  }
  return aplicarFiltros(resultado, estado.filtros);
}

interface OverviewProps {
  dados: InputDataset;
  estado: FiltersState;
  onIrParaSincronizacao: () => void;
}

export function Overview({
  dados,
  estado,
  onIrParaSincronizacao,
}: OverviewProps): React.JSX.Element {
  const [exportando, setExportando] = React.useState(false);
  const [notaDetalhe, setNotaDetalhe] = React.useState<NotaInput | null>(null);
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
    <div className="p-6 flex flex-col gap-6 max-w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap bg-surface p-4 rounded-lg border border-line shadow-sm">
        <div className="flex items-baseline gap-3">
          <span className="edp-num text-2xl font-bold tracking-tight text-foreground">
            {filtrados.length.toLocaleString('pt-BR')}
          </span>
          <span className="edp-eyebrow text-xs text-text-mute uppercase tracking-wider font-mono">
            {filtrado ? `de ${dados.registros.length.toLocaleString('pt-BR')} notas encontradas` : 'notas cadastradas'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs"
            disabled={dados.meta.sincronizando}
            onClick={() => {
              toast.promise(
                (async () => {
                  await InputApi.syncSap();
                  recarregar();
                })(),
                {
                  loading: 'Iniciando extração do SAP...',
                  success: 'Sincronização SAP rodando em background!',
                  error: 'Erro ao iniciar SAP',
                }
              );
            }}
          >
            {dados.meta.sincronizando ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Sincronizar SAP
              </>
            )}
          </Button>
          <Button
            size="sm"
            className="h-9 px-3 text-xs"
            disabled={exportando || filtrados.length === 0}
            onClick={() => { void exportar(); }}
          >
            {exportando ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Exportar Excel
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface overflow-hidden shadow-sm">
        <DataGrid
          registros={filtrados}
          colunas={COLUNAS}
          onOpenDetails={setNotaDetalhe}
        />
      </div>
      <InputNotaInspector
        nota={notaDetalhe}
        onClose={() => setNotaDetalhe(null)}
        onIrParaSincronizacao={onIrParaSincronizacao}
      />

      <div className="flex items-center justify-between text-xs text-text-mute font-mono px-3 py-2 bg-surface-2/50 rounded-md border border-line">
        <div className="flex items-center gap-2">
          <GitMerge className="h-3.5 w-3.5 text-accent shrink-0" />
          <span>
            {vinculoStatus === null
              ? 'Verificando vínculos Nota_Mae...'
              : vinculoStatus.atualizadas > 0
                ? `${vinculoStatus.atualizadas} vínculo(s) Nota_Mae aplicados · ${vinculoStatus.hora}`
                : `Nenhum vínculo Nota_Mae pendente · ${vinculoStatus.hora}`}
          </span>
        </div>
        <CheckCircle2 className="h-3.5 w-3.5 text-green shrink-0" />
      </div>

      <HierarquiaCard registros={dados.registros} recarregar={recarregar} />
    </div>
  );
}
