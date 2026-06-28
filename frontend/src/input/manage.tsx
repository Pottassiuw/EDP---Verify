import React from 'react';
import type { Celula, InputDataset, NotaInput } from './types';
import { getUsuario, InputApi } from './api';
import { toast } from 'sonner';
import { parseColagemTsv } from './lib';
import { COLUNAS, COLUNAS_COLAGEM, ROTULOS } from './columns';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';
import { filtrarRegistros } from './overview';
import { NotesTable } from './notes-table';
import { useRecarregarInput } from './use-input-data';
import { IdentityModal } from './identity-modal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type Modo = 'rapida' | 'lote' | 'exclusao' | 'cadastro' | 'colagem';
const MODOS: { id: Modo; rotulo: string }[] = [
  { id: 'rapida', rotulo: 'Edição Rápida' },
  { id: 'lote', rotulo: 'Edição em Lote' },
  { id: 'exclusao', rotulo: 'Exclusão' },
  { id: 'cadastro', rotulo: 'Cadastrar Nota' },
  { id: 'colagem', rotulo: 'Colar Planilha' },
];

interface Mensagem { tipo: 'ok' | 'erro'; texto: string; }

const NOTA_VAZIA: Record<string, string> = {
  Numero_Nota: '', Status_Nota: '00 Pendente', Prioridade_Nota: 'Programável',
  Planejado_DDPM: '0', Status_Obra: '-', Conjunto: '-', Circuito: '-',
  Local_Instalacao: '-', Mes_Execucao_Planejado: '-',
  Data_Envio_Projeto: new Date().toLocaleDateString('pt-BR'), Observacao: '', Check: '-',
};

export function Manage({ dados }: { dados: InputDataset }): React.JSX.Element {
  const recarregar = useRecarregarInput();
  const [modo, setModo] = React.useState<Modo>('rapida');
  const [estadoFiltros, setEstadoFiltros] = React.useState<FiltersState>(FILTROS_INICIAIS);
  const [edicoes, setEdicoes] = React.useState<Map<number, Partial<NotaInput>>>(new Map());
  const [selecionados, setSelecionados] = React.useState<Set<number>>(new Set());
  const [msg, setMsg] = React.useState<Mensagem | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [acaoPendente, setAcaoPendente] = React.useState<(() => void) | null>(null);
  const [loteStatus, setLoteStatus] = React.useState('');
  const [lotePrioridade, setLotePrioridade] = React.useState('');
  const [loteMes, setLoteMes] = React.useState('');
  const [novaNota, setNovaNota] = React.useState<Record<string, string>>({ ...NOTA_VAZIA });
  const [textoColagem, setTextoColagem] = React.useState('');

  const filtrados = React.useMemo(
    () => filtrarRegistros(dados.registros, estadoFiltros), [dados.registros, estadoFiltros]);
  const previewColagem = React.useMemo(
    () => parseColagemTsv(textoColagem, COLUNAS_COLAGEM), [textoColagem]);

  function comIdentidade(acao: () => void): void {
    if (getUsuario()) acao();
    else setAcaoPendente(() => acao);
  }

  async function executar(rotuloOk: string, fn: () => Promise<unknown>): Promise<void> {
    setSalvando(true); setMsg(null);
    try {
      await fn();
      await recarregar();
      setMsg({ tipo: 'ok', texto: rotuloOk });
      toast.success(rotuloOk);
    } catch (e) {
      const txt = e instanceof Error ? e.message : String(e);
      setMsg({ tipo: 'erro', texto: txt });
      toast.error('Falha na operação', { description: txt });
    } finally {
      setSalvando(false);
    }
  }

  function onEditar(numero: number, campo: string, valor: Celula): void {
    setEdicoes((prev) => {
      const m = new Map(prev);
      m.set(numero, { ...(m.get(numero) ?? {}), [campo]: valor });
      return m;
    });
  }
  function toggleSelecionado(numero: number): void {
    setSelecionados((prev) => {
      const s = new Set(prev);
      if (s.has(numero)) s.delete(numero); else s.add(numero);
      return s;
    });
  }
  function toggleTodos(numeros: number[], marcar: boolean): void {
    setSelecionados((prev) => {
      const s = new Set(prev);
      numeros.forEach((n) => { if (marcar) s.add(n); else s.delete(n); });
      return s;
    });
  }

  const salvarRapida = (): void => comIdentidade(() => {
    void executar(`${edicoes.size} nota(s) atualizada(s).`, async () => {
      const linhas = [...edicoes.entries()].map(([n, campos]) => ({ Numero_Nota: n, ...campos }));
      await InputApi.editar(linhas);
      setEdicoes(new Map());
    });
  });

  const aplicarLote = (): void => comIdentidade(() => {
    const linhas = [...selecionados].map((n) => {
      const linha: Partial<NotaInput> = { Numero_Nota: n };
      if (loteStatus) linha.Status_Nota = loteStatus;
      if (lotePrioridade) linha.Prioridade_Nota = lotePrioridade;
      if (loteMes.trim()) linha.Mes_Execucao_Planejado = loteMes.trim();
      return linha;
    });
    if (linhas.length === 0 || (!loteStatus && !lotePrioridade && !loteMes.trim())) {
      setMsg({ tipo: 'erro', texto: 'Selecione notas e escolha pelo menos um novo valor.' });
      return;
    }
    void executar(`Lote aplicado em ${linhas.length} nota(s).`, async () => {
      await InputApi.editar(linhas);
      setSelecionados(new Set());
    });
  });

  const excluirSelecionadas = (): void => comIdentidade(() => {
    if (selecionados.size === 0) { setMsg({ tipo: 'erro', texto: 'Nenhuma nota selecionada.' }); return; }
    if (!window.confirm(`Excluir ${selecionados.size} nota(s) do banco? Esta ação não entra no desfazer.`)) return;
    void executar(`${selecionados.size} nota(s) excluída(s).`, async () => {
      await InputApi.excluir([...selecionados]);
      setSelecionados(new Set());
    });
  });

  const desfazer = (): void => comIdentidade(() => {
    if (!window.confirm('Desfazer a última alteração salva no banco de dados?')) return;
    void executar('Última alteração desfeita.', async () => {
      const r = await InputApi.desfazer();
      if (!r.ok) throw new Error(r.mensagem);
    });
  });

  const cadastrar = (): void => comIdentidade(() => {
    if (!/^\d+$/.test(novaNota.Numero_Nota)) { setMsg({ tipo: 'erro', texto: 'Nº da Nota inválido.' }); return; }
    void executar(`Nota ${novaNota.Numero_Nota} cadastrada.`, async () => {
      await InputApi.criar({ ...novaNota, Numero_Nota: Number(novaNota.Numero_Nota),
                             Planejado_DDPM: Number(novaNota.Planejado_DDPM) || 0 });
      setNovaNota({ ...NOTA_VAZIA });
    });
  });

  const salvarColagem = (): void => comIdentidade(() => {
    if (previewColagem.length === 0) { setMsg({ tipo: 'erro', texto: 'Cole os dados antes de salvar.' }); return; }
    void executar(`${previewColagem.length} nota(s) integradas ao banco.`, async () => {
      await InputApi.criarLote(previewColagem.map((r) => ({
        ...r, Numero_Nota: Number(r.Numero_Nota),
        Planejado_DDPM: Number(r.Planejado_DDPM) || 0,
      })));
      setTextoColagem('');
    });
  });

  const comSelecao = modo === 'lote' || modo === 'exclusao';

  function trocarModo(m: Modo): void {
    setModo(m); setMsg(null); setSelecionados(new Set());
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <ToggleGroup type="single" value={modo} variant="outline"
                     onValueChange={(v) => { if (v) trocarModo(v as Modo); }}>
          {MODOS.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id}>{m.rotulo}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" disabled={salvando} onClick={desfazer}>
          ↩ Reverter último salvamento
        </Button>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13,
                      borderLeft: `3px solid ${msg.tipo === 'ok' ? 'var(--green)' : 'var(--amber)'}`,
                      background: msg.tipo === 'ok' ? 'var(--tint-green)' : 'var(--tint-amber)' }}>
          {msg.texto}
        </div>
      )}

      {(modo === 'rapida' || comSelecao) && (
        <React.Fragment>
          <Card>
            <CardContent className="pt-6">
              <Filters registros={dados.registros} registrosFiltrados={filtrados}
                       estado={estadoFiltros} setEstado={setEstadoFiltros} />
            </CardContent>
          </Card>

          {modo === 'lote' && (
            <Card>
              <CardHeader><CardTitle>Edição em lote</CardTitle></CardHeader>
              <CardContent>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Select value={loteStatus || undefined}
                          onValueChange={(v) => setLoteStatus(v === '__manter' ? '' : v)}>
                    <SelectTrigger style={{ width: 220 }}>
                      <SelectValue placeholder="Status: (manter atual)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manter">Status: (manter atual)</SelectItem>
                      {dados.meta.status_opcoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={lotePrioridade || undefined}
                          onValueChange={(v) => setLotePrioridade(v === '__manter' ? '' : v)}>
                    <SelectTrigger style={{ width: 220 }}>
                      <SelectValue placeholder="Prioridade: (manter atual)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manter">Prioridade: (manter atual)</SelectItem>
                      {dados.meta.prioridade_opcoes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={loteMes} placeholder="Novo mês execução (ex: jun-2026)"
                         onChange={(e) => setLoteMes(e.target.value)} style={{ width: 240 }} />
                  <Button disabled={salvando} onClick={aplicarLote}>
                    Aplicar e salvar lote ({selecionados.size})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {modo === 'exclusao' && (
            <Card>
              <CardContent className="pt-6">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                    Marque as notas e confirme a exclusão. {selecionados.size} selecionada(s).
                  </span>
                  <Button variant="destructive" size="sm" disabled={salvando} onClick={excluirSelecionadas}>
                    🗑 Excluir selecionadas
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {modo === 'rapida' && (
            <Card>
              <CardContent className="pt-6">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                    Duplo clique numa célula para editar. {edicoes.size} nota(s) com alterações pendentes.
                  </span>
                  <Button size="sm" disabled={salvando || edicoes.size === 0} onClick={salvarRapida}>
                    💾 Salvar edições
                  </Button>
                  <Button variant="ghost" size="sm" disabled={edicoes.size === 0}
                          onClick={() => setEdicoes(new Map())}>❌ Descartar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <NotesTable registros={filtrados} colunas={COLUNAS}
                          selecionados={comSelecao ? selecionados : undefined}
                          onToggleSelecionado={comSelecao ? toggleSelecionado : undefined}
                          onToggleTodos={comSelecao ? toggleTodos : undefined}
                          edicoes={modo === 'rapida' ? edicoes : undefined}
                          onEditar={modo === 'rapida' ? onEditar : undefined}
                          statusOpcoes={dados.meta.status_opcoes}
                          prioridadeOpcoes={dados.meta.prioridade_opcoes} />
            </CardContent>
          </Card>
        </React.Fragment>
      )}

      {modo === 'cadastro' && (
        <Card>
          <CardHeader><CardTitle>Cadastrar nota</CardTitle></CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 14 }}>
              {Object.keys(NOTA_VAZIA).map((campo) => (
                <div key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Label htmlFor={`nova-${campo}`} className="text-muted-foreground">
                    {ROTULOS[campo] ?? campo}
                  </Label>
                  {campo === 'Status_Nota' || campo === 'Prioridade_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(campo === 'Status_Nota' ? dados.meta.status_opcoes : dados.meta.prioridade_opcoes)
                          .map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={`nova-${campo}`} value={novaNota[campo]}
                           onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <Button disabled={salvando} onClick={cadastrar}>💾 Salvar nova nota</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {modo === 'colagem' && (
        <Card>
          <CardHeader><CardTitle>Colar planilha</CardTitle></CardHeader>
          <CardContent>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '0 0 10px' }}>
              Cole aqui as linhas copiadas do Excel (sem cabeçalho). Ordem das colunas:{' '}
              {COLUNAS_COLAGEM.map((c) => ROTULOS[c] ?? c).join(' · ')}
            </p>
            <Textarea value={textoColagem} rows={8} placeholder="Ctrl+V com as linhas do Excel…"
                      onChange={(e) => setTextoColagem(e.target.value)}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
            {previewColagem.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 12.5 }}>{previewColagem.length} linha(s) reconhecida(s) — confira antes de salvar:</span>
                <NotesTable colunas={COLUNAS.filter((c) => COLUNAS_COLAGEM.includes(c.key))}
                            registros={previewColagem.map((r, i) => ({ ...r, Numero_Nota: Number(r.Numero_Nota) || -(i + 1) })) as NotaInput[]}
                            altura={240} />
                <div>
                  <Button disabled={salvando} onClick={salvarColagem}>
                    💾 Salvar lote ({previewColagem.length})
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <IdentityModal aberto={acaoPendente !== null}
                     onConfirmado={() => { const acao = acaoPendente; setAcaoPendente(null); acao?.(); }}
                     onCancelar={() => setAcaoPendente(null)} />
    </div>
  );
}
