import React from 'react';
import type { AbaInput } from './types';
import { toast } from 'sonner';
import { getUsuario, setUsuario, InputApi } from './api';
import { useSincronizacaoAutomatica, useInputData, useRecarregarInput, useNetworkSync } from './use-input-data';
import { Loader2 } from 'lucide-react';
import { Overview } from './overview';
import { Manage } from './manage';
import { Ramal } from './ramal';
import { Reports } from './reports';
import { Logs } from './logs';
import { Settings } from './settings';
import { Button } from '@/components/ui/button';
import { SegTabs } from '@/components/branded/section';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';

export const INPUT_SUBS: { id: AbaInput; rotulo: string }[] = [
  { id: 'visao', rotulo: 'Visão Geral' },
  { id: 'gerenciar', rotulo: 'Gerenciar' },
  { id: 'ramal', rotulo: 'Ramal' },
  { id: 'relatorios', rotulo: 'Relatórios' },
  { id: 'logs', rotulo: 'Logs' },
  { id: 'config', rotulo: 'Configurações' },
];

interface InputSectionProps {
  sub: AbaInput;
  setSub: (s: AbaInput) => void;
}

export function InputSection({ sub, setSub }: InputSectionProps): React.JSX.Element {
  const { data: dados, isLoading, error } = useInputData();
  const recarregar = useRecarregarInput();
  const [estadoFiltros, setEstadoFiltros] = React.useState<FiltersState>(() => {
    try {
      const salvas = localStorage.getItem('input_estado_filtros');
      if (salvas) {
        const parsed = JSON.parse(salvas);
        if (typeof parsed.busca === 'string' && typeof parsed.somente2026 === 'boolean' && Array.isArray(parsed.filtros)) {
          return parsed;
        }
      }
    } catch (e) {
      // Silencia
    }
    return FILTROS_INICIAIS;
  });
  const { sincronizando } = useNetworkSync();

  React.useEffect(() => {
    try {
      localStorage.setItem('input_estado_filtros', JSON.stringify(estadoFiltros));
    } catch (e) {
      // Silencia
    }
  }, [estadoFiltros]);

  React.useEffect(() => {
    if (!getUsuario()) {
      InputApi.me()
        .then(({ usuario }) => setUsuario(usuario))
        .catch(() => setUsuario('sistema'));
    }
  }, []);
  useSincronizacaoAutomatica(dados?.meta.versao);
  const basesAusentes = dados?.meta.bases.filter((b) => !b.encontrada) ?? [];

  return (
    <div className="input-scope flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="shrink-0 bg-surface border-b-[1px] border-b-line">
        <div className="pt-[13px] px-[22px] pb-[11px] flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-[2px]">
            <span className="edp-eyebrow">Módulo Input</span>
            <strong className="edp-title text-[16px]">Gestão de Notas</strong>
          </div>
          {sincronizando ? (
            <div className="flex items-center gap-[6px] px-[12px] py-[5px] rounded-full bg-amber-500/10 border border-amber-500/30 text-amber text-[12px] font-medium animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber" />
              <span>Sincronizando com a rede... (Não feche)</span>
            </div>
          ) : (
            <div className="flex items-center gap-[6px] px-[12px] py-[5px] rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[12px] font-medium">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sincronizado com a rede</span>
            </div>
          )}
        </div>
        <div className="py-[0px] px-[22px] border-t-[1px] border-t-line">
          <SegTabs tabs={INPUT_SUBS} value={sub} onChange={setSub} ariaLabel="Seções do módulo Input" />
        </div>
      </div>

      {dados && (sub === 'visao' || sub === 'gerenciar' || sub === 'ramal' || sub === 'relatorios') && (
        <div className="shrink-0 bg-surface border-b-[1px] border-b-line px-[22px] py-[12px]">
          <Filters registros={dados.registros} estado={estadoFiltros} setEstado={setEstadoFiltros} />
        </div>
      )}

      {dados && dados.meta.migracao === 'rede-indisponivel' && dados.registros.length === 0 && (
        <div className="py-[8px] px-[18px] bg-tint-amber text-[13px]">
          Importação inicial pendente: a rede da EDP estava indisponível.{' '}
          <Button variant="outline" size="sm" onClick={() => { void (async () => {
            const { InputApi } = await import('./api');
            try { await InputApi.migrar(); await recarregar(); toast.success('Importação reprocessada'); }
            catch (e) { toast.error('Falha na importação', { description: e instanceof Error ? e.message : String(e) }); }
          })(); }}>Tentar importar de novo</Button>
        </div>
      )}
      {basesAusentes.length > 0 && (
        <div className="py-[6px] px-[18px] text-[12px] text-amber">
          {basesAusentes.length} de {dados!.meta.bases.length} bases da rede indisponíveis — indicadores parciais.
        </div>
      )}

      {isLoading && <div className="p-[24px] text-text-dim">Carregando notas…</div>}
      {error != null && (
        <div className="p-[24px] text-red">
          Backend indisponível. O módulo Input exige o backend rodando (porta 8000). Detalhe: {String((error as Error).message)}
        </div>
      )}

      {dados && sub === 'visao' && <Overview dados={dados} estado={estadoFiltros} />}
      {dados && sub === 'gerenciar' && <Manage dados={dados} estadoFiltros={estadoFiltros} />}
      {dados && sub === 'ramal' && <Ramal dadosPrincipais={dados} estadoFiltros={estadoFiltros} />}
      {dados && sub === 'relatorios' && <Reports dados={dados} estadoFiltros={estadoFiltros} />}
      {dados && sub === 'logs' && <Logs />}
      {dados && sub === 'config' && <Settings dados={dados} />}
    </div>
  );
}
