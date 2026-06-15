import React from 'react';
import type { Celula, InputDataset, NotaInput } from './types';
import { getUsuario, InputApi } from './api';
import { parseColagemTsv } from './lib';
import { COLUNAS, COLUNAS_COLAGEM, ROTULOS } from './columns';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';
import { filtrarRegistros } from './overview';
import { NotesTable } from './notes-table';
import { useRecarregarInput } from './use-input-data';
import { IdentityModal } from './identity-modal';

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
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
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
  const estiloCampo: React.CSSProperties = { padding: '7px 10px', borderRadius: 7,
    border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--text)' };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="edp-seg">
          {MODOS.map((m) => (
            <button key={m.id} className={modo === m.id ? 'on' : ''}
                    onClick={() => { setModo(m.id); setMsg(null); setSelecionados(new Set()); }}>{m.rotulo}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="edp-btn ghost sm" disabled={salvando} onClick={desfazer}>↩ Reverter último salvamento</button>
      </div>

      {msg && (
        <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13,
                      background: msg.tipo === 'ok' ? 'var(--tint-green)' : 'var(--tint-amber)' }}>
          {msg.texto}
        </div>
      )}

      {(modo === 'rapida' || comSelecao) && (
        <React.Fragment>
          <Filters registros={dados.registros} registrosFiltrados={filtrados}
                   estado={estadoFiltros} setEstado={setEstadoFiltros} />

          {modo === 'lote' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={loteStatus} onChange={(e) => setLoteStatus(e.target.value)} style={estiloCampo}>
                <option value="">Status: (manter atual)</option>
                {dados.meta.status_opcoes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={lotePrioridade} onChange={(e) => setLotePrioridade(e.target.value)} style={estiloCampo}>
                <option value="">Prioridade: (manter atual)</option>
                {dados.meta.prioridade_opcoes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input value={loteMes} placeholder="Novo mês execução (ex: jun-2026)"
                     onChange={(e) => setLoteMes(e.target.value)} style={estiloCampo} />
              <button className="edp-btn sm" disabled={salvando} onClick={aplicarLote}
                      style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                Aplicar e salvar lote ({selecionados.size})
              </button>
            </div>
          )}
          {modo === 'exclusao' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                Marque as notas e confirme a exclusão. {selecionados.size} selecionada(s).
              </span>
              <button className="edp-btn sm" disabled={salvando} onClick={excluirSelecionadas}>🗑 Excluir selecionadas</button>
            </div>
          )}
          {modo === 'rapida' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                Duplo clique numa célula para editar. {edicoes.size} nota(s) com alterações pendentes.
              </span>
              <button className="edp-btn sm" disabled={salvando || edicoes.size === 0} onClick={salvarRapida}
                      style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                💾 Salvar edições
              </button>
              <button className="edp-btn ghost sm" disabled={edicoes.size === 0}
                      onClick={() => setEdicoes(new Map())}>❌ Descartar</button>
            </div>
          )}

          <NotesTable registros={filtrados} colunas={COLUNAS}
                      selecionados={comSelecao ? selecionados : undefined}
                      onToggleSelecionado={comSelecao ? toggleSelecionado : undefined}
                      onToggleTodos={comSelecao ? toggleTodos : undefined}
                      edicoes={modo === 'rapida' ? edicoes : undefined}
                      onEditar={modo === 'rapida' ? onEditar : undefined}
                      statusOpcoes={dados.meta.status_opcoes}
                      prioridadeOpcoes={dados.meta.prioridade_opcoes} />
        </React.Fragment>
      )}

      {modo === 'cadastro' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 320px))', gap: 10 }}>
          {Object.keys(NOTA_VAZIA).map((campo) => (
            <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>{ROTULOS[campo] ?? campo}</span>
              {campo === 'Status_Nota' || campo === 'Prioridade_Nota' ? (
                <select value={novaNota[campo]} style={estiloCampo}
                        onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })}>
                  {(campo === 'Status_Nota' ? dados.meta.status_opcoes : dados.meta.prioridade_opcoes)
                    .map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={novaNota[campo]} style={estiloCampo}
                       onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
              )}
            </label>
          ))}
          <div style={{ alignSelf: 'end' }}>
            <button className="edp-btn sm" disabled={salvando} onClick={cadastrar}
                    style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
              💾 Salvar nova nota
            </button>
          </div>
        </div>
      )}

      {modo === 'colagem' && (
        <React.Fragment>
          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
            Cole aqui as linhas copiadas do Excel (sem cabeçalho). Ordem das colunas:{' '}
            {COLUNAS_COLAGEM.map((c) => ROTULOS[c] ?? c).join(' · ')}
          </p>
          <textarea value={textoColagem} rows={8} placeholder="Ctrl+V com as linhas do Excel…"
                    onChange={(e) => setTextoColagem(e.target.value)}
                    style={{ ...estiloCampo, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          {previewColagem.length > 0 && (
            <React.Fragment>
              <span style={{ fontSize: 12.5 }}>{previewColagem.length} linha(s) reconhecida(s) — confira antes de salvar:</span>
              <NotesTable colunas={COLUNAS.filter((c) => COLUNAS_COLAGEM.includes(c.key))}
                          registros={previewColagem.map((r, i) => ({ ...r, Numero_Nota: Number(r.Numero_Nota) || -(i + 1) })) as NotaInput[]}
                          altura={240} />
              <div>
                <button className="edp-btn sm" disabled={salvando} onClick={salvarColagem}
                        style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                  💾 Salvar lote ({previewColagem.length})
                </button>
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      <IdentityModal aberto={acaoPendente !== null}
                     onConfirmado={() => { const acao = acaoPendente; setAcaoPendente(null); acao?.(); }}
                     onCancelar={() => setAcaoPendente(null)} />
    </div>
  );
}
