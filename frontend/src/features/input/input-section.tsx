import React from 'react';
import type { AbaInput } from './types';
import { toast } from 'sonner';
import { getUsuario, setUsuario, InputApi } from './api';
import { useAvisoSincronizacao, useInputData, useRecarregarInput } from './use-input-data';
import { Overview } from './overview';
import { Manage } from './manage';
import { Ramal } from './ramal';
import { Reports } from './reports';
import { Logs } from './logs';
import { Settings } from './settings';
import { Button } from '@/components/ui/button';
import { SegTabs } from '@/components/branded/section';

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

  React.useEffect(() => {
    if (!getUsuario()) {
      InputApi.me()
        .then(({ usuario }) => setUsuario(usuario))
        .catch(() => setUsuario('sistema'));
    }
  }, []);
  const { desatualizado, limpar } = useAvisoSincronizacao(dados?.meta.ultima_alteracao);
  const basesAusentes = dados?.meta.bases.filter((b) => !b.encontrada) ?? [];

  return (
    <div className="input-scope flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="shrink-0 bg-surface border-b-[1px] border-b-line">
        <div className="pt-[13px] px-[22px] pb-[11px] flex flex-col gap-[2px]">
          <span className="edp-eyebrow">Módulo Input</span>
          <strong className="edp-title text-[16px]">Gestão de Notas</strong>
        </div>
        <div className="py-[0px] px-[22px] border-t-[1px] border-t-line">
          <SegTabs tabs={INPUT_SUBS} value={sub} onChange={setSub} ariaLabel="Seções do módulo Input" />
        </div>
      </div>

      {desatualizado && (
        <div className="shrink-0 flex items-center gap-[12px] py-[8px] px-[18px] bg-tint-amber text-[13px]"
             style={{ borderBottom: '1px solid rgba(240,169,59,.3)' }}>
          <span className="flex-1">Os dados foram atualizados por outro usuário.</span>
          <Button variant="outline" size="sm" onClick={() => { limpar(); void recarregar(); }}>Recarregar dados</Button>
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

      {dados && sub === 'visao' && <Overview dados={dados} />}
      {dados && sub === 'gerenciar' && <Manage dados={dados} />}
      {dados && sub === 'ramal' && <Ramal dadosPrincipais={dados} />}
      {dados && sub === 'relatorios' && <Reports dados={dados} />}
      {dados && sub === 'logs' && <Logs />}
      {dados && sub === 'config' && <Settings dados={dados} />}
    </div>
  );
}
