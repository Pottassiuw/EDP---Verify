import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InputDataset } from './types';
import { getUsuario, InputApi, setUsuario } from './api';
import { toast } from 'sonner';
import { useRecarregarInput } from './use-input-data';
import { Button } from '@/components/ui/button';

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="edp-panel">
      <h4 className="edp-title" style={{ fontSize: 15, margin: '0 0 12px' }}>{titulo}</h4>
      {children}
    </section>
  );
}

export function Settings({ dados }: { dados: InputDataset }): React.JSX.Element {
  const recarregar = useRecarregarInput();
  const [msg, setMsg] = React.useState('');
  const [nome, setNome] = React.useState(getUsuario() ?? '');
  const [linhasResp, setLinhasResp] = React.useState<[string, string][] | null>(null);

  const responsaveis = useQuery({ queryKey: ['input-resp'], queryFn: InputApi.responsaveis });
  const backups = useQuery({ queryKey: ['input-backups'], queryFn: InputApi.backups });

  const linhas = linhasResp ?? Object.entries(responsaveis.data ?? {});

  async function agir(fn: () => Promise<unknown>, ok: string): Promise<void> {
    setMsg('');
    try { await fn(); setMsg(ok); toast.success(ok); }
    catch (e) { const t = e instanceof Error ? e.message : String(e); setMsg(`Erro: ${t}`); toast.error('Falha na operação', { description: t }); }
  }

  return (
    <div className="edp-page">
      {msg && <div className="edp-banner ok">{msg}</div>}

      <Cartao titulo="Seu nome (log de auditoria)">
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="edp-field" />
          <Button variant="outline" size="sm" disabled={!nome.trim()}
                  onClick={() => { setUsuario(nome); setMsg('Nome atualizado.'); toast.success('Nome atualizado.'); }}>Salvar</Button>
        </div>
      </Cartao>

      <Cartao titulo="Responsáveis por Conjunto">
        {linhas.map(([conjunto, pessoa], i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input value={conjunto} className="edp-field"
                   onChange={(e) => { const c = [...linhas] as [string, string][]; c[i] = [e.target.value, pessoa]; setLinhasResp(c); }} />
            <input value={pessoa} className="edp-field"
                   onChange={(e) => { const c = [...linhas] as [string, string][]; c[i] = [conjunto, e.target.value]; setLinhasResp(c); }} />
            <Button variant="ghost" size="sm" aria-label={`Remover responsável ${conjunto || i + 1}`}
                    onClick={() => setLinhasResp(linhas.filter((_, j) => j !== i) as [string, string][])}>×</Button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm"
                  onClick={() => setLinhasResp([...linhas, ['', '']] as [string, string][])}>+ Adicionar</Button>
          <Button variant="outline" size="sm" onClick={() => { void agir(async () => {
            await InputApi.salvarResponsaveis(Object.fromEntries(linhas.filter(([c]) => c.trim() !== '')));
            await responsaveis.refetch(); setLinhasResp(null);
          }, 'Responsáveis atualizados.'); }}>Salvar responsáveis</Button>
        </div>
      </Cartao>

      <Cartao titulo="Bases de Apoio (rede EDP)">
        {dados.meta.bases.map((b) => {
          const gerenciavel = !b.arquivo.startsWith('Gerada_');
          return (
            <div key={b.arquivo} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ minWidth: 280, fontSize: 13 }}>{b.nome}</span>
              <span style={{ fontSize: 11, color: b.encontrada ? 'var(--green)' : 'var(--red, #dc3545)' }}>
                {b.encontrada ? '● conectada' : '● indisponível'}
              </span>
              {gerenciavel && b.encontrada && (
                <Button asChild variant="ghost" size="sm"><a href={InputApi.urlDownloadBase(b.arquivo)} download>⬇ Baixar atual</a></Button>
              )}
              {gerenciavel && (
                <Button asChild variant="ghost" size="sm"><label style={{ cursor: 'pointer' }}>
                  ↑ Substituir…
                  <input type="file" accept=".xlsx" style={{ display: 'none' }}
                         onChange={(e) => {
                           const f = e.target.files?.[0];
                           if (!f) return;
                           if (!getUsuario()) { setMsg('Defina seu nome acima antes de substituir bases.'); return; }
                           if (!window.confirm(`Substituir "${b.arquivo}" na rede pelo arquivo "${f.name}"?`)) return;
                           void agir(async () => {
                             await InputApi.substituirBase(b.arquivo, f);
                             await recarregar();
                           }, `Base "${b.arquivo}" substituída.`);
                         }} />
                </label></Button>
              )}
            </div>
          );
        })}
        <p style={{ fontSize: 11.5, color: 'var(--text-mute)' }}>
          Não altere o nome das abas nem os cabeçalhos das planilhas — o sistema os procura exatamente como estão.
        </p>
      </Cartao>

      <Cartao titulo="Backups do banco (locais, rotativos)">
        {(backups.data?.backups ?? []).map((b) => (
          <div key={b.arquivo} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, fontSize: 12.5 }}>
            <span className="edp-mono" style={{ flex: 1 }}>{b.arquivo}</span>
            <span style={{ color: 'var(--text-dim)' }}>{new Date(b.modificado).toLocaleString('pt-BR')} · {b.tamanho_mb} MB</span>
            <Button asChild variant="ghost" size="sm"><a href={InputApi.urlDownloadBackup(b.arquivo)} download>⬇ Baixar</a></Button>
          </div>
        ))}
        {(backups.data?.backups ?? []).length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--text-mute)' }}>
            Nenhum backup ainda — o primeiro é criado automaticamente no próximo salvamento.
          </span>
        )}
      </Cartao>
    </div>
  );
}
