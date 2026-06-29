import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { InputApi } from './api';
import type { LogArquivo, LogRegistro } from './types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type SubAba = 'notas' | 'arquivos' | 'timeline';

export function formatarDataHora(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR');
}

const estiloTh: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', fontSize: 11,
  textTransform: 'uppercase', color: 'var(--text-mute)', borderBottom: '1px solid var(--line)' };
const estiloTd: React.CSSProperties = { padding: '6px 10px', fontSize: 12.5,
  borderBottom: '1px solid var(--line)' };

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
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 18, overflow: 'auto' }}>
      <ToggleGroup type="single" value={sub} variant="outline" style={{ alignSelf: 'flex-start' }}
                   onValueChange={(v) => { if (v) setSub(v as SubAba); }}>
        <ToggleGroupItem value="notas">Alterações nas Notas</ToggleGroupItem>
        <ToggleGroupItem value="arquivos">Bases de Apoio</ToggleGroupItem>
        <ToggleGroupItem value="timeline">Linha do Tempo</ToggleGroupItem>
      </ToggleGroup>

      {sub === 'notas' && (
        <React.Fragment>
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={filtroNota} placeholder="Filtrar por nº da nota"
                   onChange={(e) => setFiltroNota(e.target.value)}
                   style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--line)',
                            background: 'var(--bg-2)', color: 'var(--text)' }} />
            <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}>
              <option value="">Todos os usuários</option>
              {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Nº Nota', 'Usuário', 'Data e Hora', 'Campo', 'Valor Antigo', 'Valor Novo']
                .map((h) => <th key={h} style={estiloTh}>{h}</th>)}
            </tr></thead>
            <tbody>
              {registros.slice(0, 500).map((r) => (
                <tr key={r.ID_Log}>
                  <td style={estiloTd} className="edp-mono">{r.Numero_Nota}</td>
                  <td style={estiloTd}>{r.Usuario}</td>
                  <td style={estiloTd}>{formatarDataHora(r.Data_Hora)}</td>
                  <td style={estiloTd}>{r.Campo_Alterado}</td>
                  <td style={estiloTd}>{r.Valor_Antigo}</td>
                  <td style={estiloTd}>{r.Valor_Novo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {registros.length === 0 && <span style={{ color: 'var(--text-mute)' }}>Nenhum registro encontrado.</span>}
        </React.Fragment>
      )}

      {sub === 'arquivos' && (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead><tr>{['Arquivo', 'Usuário', 'Data e Hora', 'Ação'].map((h) => <th key={h} style={estiloTh}>{h}</th>)}</tr></thead>
          <tbody>
            {(logsArquivos.data?.registros ?? []).map((r: LogArquivo) => (
              <tr key={r.ID_Log}>
                <td style={estiloTd}>{r.Nome_Arquivo}</td>
                <td style={estiloTd}>{r.Usuario}</td>
                <td style={estiloTd}>{formatarDataHora(r.Data_Hora)}</td>
                <td style={estiloTd}>{r.Acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sub === 'timeline' && (
        <React.Fragment>
          <input value={notaTimeline} placeholder="Digite o nº da nota"
                 onChange={(e) => setNotaTimeline(e.target.value)}
                 style={{ width: 220, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--line)',
                          background: 'var(--bg-2)', color: 'var(--text)' }} />
          {(timeline.data?.registros ?? []).map((r) => (
            <div key={r.ID_Log} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                <strong>{formatarDataHora(r.Data_Hora)}</strong> · por <code>{r.Usuario}</code>
              </div>
              <div style={{ fontSize: 13 }}>
                Alterou <strong>{r.Campo_Alterado}</strong> de <code>{r.Valor_Antigo || '—'}</code> para <code>{r.Valor_Novo || '—'}</code>
              </div>
            </div>
          ))}
          {numeroTimeline !== null && timeline.data?.registros.length === 0 && (
            <span style={{ color: 'var(--text-mute)' }}>Nenhum histórico para a nota {numeroTimeline}.</span>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
