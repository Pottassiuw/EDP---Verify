import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { InputApi } from './api';
import type { LogArquivo, LogRegistro } from './types';
import { SegTabs, type SegTab } from '@/components/branded/section';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type SubAba = 'notas' | 'arquivos' | 'timeline';

const LOG_TABS: SegTab<SubAba>[] = [
  { id: 'notas', rotulo: 'Alterações nas Notas' },
  { id: 'arquivos', rotulo: 'Bases de Apoio' },
  { id: 'timeline', rotulo: 'Linha do Tempo' },
];

export function formatarDataHora(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR');
}

export function Logs(): React.JSX.Element {
  const [sub, setSub] = React.useState<SubAba>('notas');
  const [filtroNota, setFiltroNota] = React.useState('');
  const [filtroUsuario, setFiltroUsuario] = React.useState('');
  const [notaTimeline, setNotaTimeline] = React.useState('');

  const logs = useQuery({ queryKey: ['input-logs'], queryFn: InputApi.logs });
  const logsArquivos = useQuery({ queryKey: ['input-logs-arquivos'], queryFn: InputApi.logsArquivos });
  const numeroTimeline = /^\d+$/.test(notaTimeline) ? Number(notaTimeline) : null;
  const timeline = useQuery({
    queryKey: ['input-timeline', numeroTimeline],
    queryFn: () => InputApi.timeline(numeroTimeline as number),
    enabled: numeroTimeline !== null,
  });

  const registros: LogRegistro[] = (logs.data?.registros ?? []).filter((r) =>
    (filtroNota === '' || String(r.Numero_Nota) === filtroNota.trim()) &&
    (filtroUsuario === '' || r.Usuario === filtroUsuario));
  const usuarios = [...new Set((logs.data?.registros ?? []).map((r) => r.Usuario))].sort();

  return (
    <div className="edp-page">
      <SegTabs tabs={LOG_TABS} value={sub} onChange={setSub} ariaLabel="Tipo de log" />

      {sub === 'notas' && (
        <React.Fragment>
          <div className="flex gap-[10px]">
            <input value={filtroNota} placeholder="Filtrar por nº da nota" className="edp-field"
                   onChange={(e) => setFiltroNota(e.target.value)} />
            <Select value={filtroUsuario || "__todos"} onValueChange={(v) => setFiltroUsuario(v === "__todos" ? "" : v)}>
              <SelectTrigger className="edp-field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos">Todos os usuários</SelectItem>
                {usuarios.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <table className="edp-table">
            <thead><tr>
              {['Nº Nota', 'Usuário', 'Data e Hora', 'Campo', 'Valor Antigo', 'Valor Novo']
                .map((h) => <th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {registros.slice(0, 500).map((r) => (
                <tr key={r.ID_Log}>
                  <td className="edp-mono">{r.Numero_Nota}</td>
                  <td>{r.Usuario}</td>
                  <td>{formatarDataHora(r.Data_Hora)}</td>
                  <td>{r.Campo_Alterado}</td>
                  <td>{r.Valor_Antigo}</td>
                  <td>{r.Valor_Novo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {registros.length === 0 && <span className="text-text-mute">Nenhum registro encontrado.</span>}
        </React.Fragment>
      )}

      {sub === 'arquivos' && (
        <table className="edp-table">
          <thead><tr>{['Arquivo', 'Usuário', 'Data e Hora', 'Ação'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {(logsArquivos.data?.registros ?? []).map((r: LogArquivo) => (
              <tr key={r.ID_Log}>
                <td>{r.Nome_Arquivo}</td>
                <td>{r.Usuario}</td>
                <td>{formatarDataHora(r.Data_Hora)}</td>
                <td>{r.Acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sub === 'timeline' && (
        <React.Fragment>
          <input value={notaTimeline} placeholder="Digite o nº da nota" className="edp-field w-[220px]"
                 onChange={(e) => setNotaTimeline(e.target.value)} />
          {(timeline.data?.registros ?? []).map((r) => (
            <div key={r.ID_Log} className="border border-line rounded-[8px] py-[10px] px-[14px]">
              <div className="text-[12px] text-text-dim">
                <strong>{formatarDataHora(r.Data_Hora)}</strong> · por <code>{r.Usuario}</code>
              </div>
              <div className="text-[13px]">
                Alterou <strong>{r.Campo_Alterado}</strong> de <code>{r.Valor_Antigo || '—'}</code> para <code>{r.Valor_Novo || '—'}</code>
              </div>
            </div>
          ))}
          {numeroTimeline !== null && timeline.data?.registros.length === 0 && (
            <span className="text-text-mute">Nenhum histórico para a nota {numeroTimeline}.</span>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
