# Input — Aba Ramal + Nota_Mae Overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `Nota_Mae` à visão geral e construir aba Ramal completa (7 modos CRUD + hierarquia) no módulo Input frontend.

**Architecture:** Feature-first em `frontend/src/input/`. Novos arquivos `columns-ramal.ts`, `use-ramal-data.ts`, `ramal.tsx`. Modificações em `columns.ts`, `types.ts`, `api.ts`, `input-section.tsx`. DataGrid para leitura, NotesTable para edição/seleção.

**Tech Stack:** React 18, TypeScript, react-datasheet-grid, @tanstack/react-query, sonner, Tailwind v4.

## Global Constraints

- Nunca editar `src/components/ui/` (vendored shadcn)
- Nunca usar `any` — tipos próprios ou `unknown`
- Reutilizar `DataGrid`, `NotesTable`, `Filters`, `IdentityModal` sem modificar
- `Nota_Mae` só via `/api/input/hierarquia` — nunca via salvar_em_massa
- Sem botão "Reverter" no Ramal (backend não suporta)

---

### Task 1: Nota_Mae em columns.ts + types/api para Ramal

**Files:**
- Modify: `frontend/src/input/columns.ts`
- Modify: `frontend/src/input/types.ts`
- Modify: `frontend/src/input/api.ts`

**Interfaces:**
- Produces: `NotaRamal`, `RamalDataset`, `AbaInput` com `'ramal'`, `InputApi.ramal()`, `InputApi.importarRamal()`, `InputApi.excluirRamal()`, `InputApi.vincularHierarquia()`, `InputApi.obterHierarquia()`

- [ ] **Step 1: Adicionar Nota_Mae a COLUNAS e FILTROS_FAIXA em columns.ts**

Em `frontend/src/input/columns.ts`, após `{ key: 'Medida_vs_Planejado', label: 'Medida vs Planejado' }`, adicionar:

```ts
  { key: 'Nota_Mae', label: 'Nota Mãe', numeric: true },
```

E em `FILTROS_FAIXA`, adicionar `'Nota_Mae'` ao array.

- [ ] **Step 2: Adicionar tipos Ramal em types.ts**

Em `frontend/src/input/types.ts`, adicionar antes do `export type AbaInput`:

```ts
export interface NotaRamal {
  Numero_Nota: number;
  Status_Obra: string;
  Conjunto: string;
  Circuito: string;
  Local_Instalacao: string;
  Planejado_DDPM: number;
  Mes_Execucao_Planejado: string;
  CenTrab_Respon: string;
  Prioridade_Nota: string;
  Observacao: string;
  Extracao_Antiga: string;
  Status_Nota: string;
  Status_Anterior: string;
  Check_Btzero: string;
  Plano: string;
  ID_Cronologia: number;
}

export interface RamalDataset {
  registros: NotaRamal[];
}

export interface HierarquiaInfo {
  nota_mae: string;
  filhas: Array<{ Numero_Nota: number; Status_Nota: string; Conjunto: string }>;
}
```

Alterar a linha do `AbaInput`:
```ts
export type AbaInput = "visao" | "gerenciar" | "relatorios" | "logs" | "config" | "ramal";
```

- [ ] **Step 3: Adicionar métodos Ramal em api.ts**

Em `frontend/src/input/api.ts`, adicionar import de `RamalDataset` e `HierarquiaInfo` no import existente de types, e adicionar ao objeto `InputApi`:

```ts
  ramal: () => req<RamalDataset>('/ramal'),

  importarRamal: (notas: Partial<NotaRamal>[]) =>
    req<{ inseridas: number }>('/ramal/bulk', escrita('POST', { notas })),

  excluirRamal: (numeros: number[]) =>
    req<{ excluidas: number }>('/ramal', escrita('DELETE', { numeros })),

  vincularHierarquia: (dados: Record<string, number[]>) =>
    req<{ atualizadas: number }>('/hierarquia', escrita('POST', { dados })),

  obterHierarquia: (numero: number) =>
    req<HierarquiaInfo>(`/hierarquia/${numero}`),
```

Adicionar `NotaRamal` ao import de types no topo do api.ts.

- [ ] **Step 4: Verificar build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Esperado: `✓ built in` sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/input/columns.ts frontend/src/input/types.ts frontend/src/input/api.ts
git commit -m "feat(input): Nota_Mae em columns + tipos e API ramal"
```

---

### Task 2: use-ramal-data.ts + columns-ramal.ts

**Files:**
- Create: `frontend/src/input/use-ramal-data.ts`
- Create: `frontend/src/input/columns-ramal.ts`

**Interfaces:**
- Consumes: `RamalDataset` (Task 1), `InputApi.ramal()` (Task 1)
- Produces: `useRamalData()`, `useRecarregarRamal()`, `COLUNAS_RAMAL: ColunaDef[]`, `COLUNAS_COLAGEM_RAMAL: string[]`

- [ ] **Step 1: Criar use-ramal-data.ts**

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';

export const RAMAL_KEY = ['input', 'ramal'] as const;

export function useRamalData() {
  return useQuery({ queryKey: RAMAL_KEY, queryFn: InputApi.ramal });
}

export function useRecarregarRamal() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: RAMAL_KEY });
}
```

- [ ] **Step 2: Criar columns-ramal.ts**

```ts
import type { ColunaDef } from './columns';

export const COLUNAS_RAMAL: ColunaDef[] = [
  { key: 'Numero_Nota',           label: 'Nº Nota (ID)',            numeric: true, largura: 110 },
  { key: 'Status_Nota',           label: 'Status Nota',             editavel: true, opcoes: 'status', largura: 180 },
  { key: 'Status_Obra',           label: 'Status Obra',             editavel: true },
  { key: 'Conjunto',              label: 'Conjunto',                editavel: true },
  { key: 'Circuito',              label: 'Circuito',                editavel: true },
  { key: 'Local_Instalacao',      label: 'Local Instalação',        editavel: true, largura: 170 },
  { key: 'Planejado_DDPM',        label: 'Planejado',               numeric: true, editavel: true },
  { key: 'Mes_Execucao_Planejado',label: 'Mês Execução Planejado',  editavel: true },
  { key: 'CenTrab_Respon',        label: 'Centro Trab. Responsável' },
  { key: 'Prioridade_Nota',       label: 'Prioridade Nota',         editavel: true, opcoes: 'prioridade' },
  { key: 'Observacao',            label: 'Observação',              editavel: true, largura: 220 },
  { key: 'Extracao_Antiga',       label: 'Extração Antiga' },
  { key: 'Status_Anterior',       label: 'Status Anterior' },
  { key: 'Check_Btzero',          label: 'Check BtzeroO',            editavel: true },
  { key: 'Plano',                 label: 'Plano',                   editavel: true },
];

export const ROTULOS_RAMAL: Record<string, string> =
  Object.fromEntries(COLUNAS_RAMAL.map((c) => [c.key, c.label]));

export const COLUNAS_COLAGEM_RAMAL = [
  'Numero_Nota', 'Status_Nota', 'Prioridade_Nota', 'Planejado_DDPM',
  'Status_Obra', 'Conjunto', 'Circuito', 'Local_Instalacao',
  'Mes_Execucao_Planejado', 'Observacao', 'Check_Btzero', 'Plano',
];
```

- [ ] **Step 3: Verificar build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Esperado: `✓ built in` sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/input/use-ramal-data.ts frontend/src/input/columns-ramal.ts
git commit -m "feat(input): use-ramal-data e columns-ramal"
```

---

### Task 3: ramal.tsx — componente principal

**Files:**
- Create: `frontend/src/input/ramal.tsx`

**Interfaces:**
- Consumes: todos os artefatos de Task 1 e Task 2
- Produces: `export function Ramal({ dadosPrincipais }: { dadosPrincipais: InputDataset }): React.JSX.Element`

- [ ] **Step 1: Criar ramal.tsx**

```tsx
import React from 'react';
import type { InputDataset, NotaRamal } from './types';
import { getUsuario, InputApi } from './api';
import { toast } from 'sonner';
import { parseColagemTsv } from './lib';
import { COLUNAS_RAMAL, COLUNAS_COLAGEM_RAMAL, ROTULOS_RAMAL } from './columns-ramal';
import { useRamalData, useRecarregarRamal } from './use-ramal-data';
import { DataGrid } from './data-grid';
import { NotesTable } from './notes-table';
import { IdentityModal } from './identity-modal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ModoRamal = 'visao' | 'rapida' | 'lote' | 'exclusao' | 'cadastro' | 'colagem' | 'hierarquia';

const MODOS: { id: ModoRamal; rotulo: string }[] = [
  { id: 'visao',       rotulo: 'Visão Geral' },
  { id: 'rapida',      rotulo: 'Edição Rápida' },
  { id: 'lote',        rotulo: 'Edição em Lote' },
  { id: 'exclusao',    rotulo: 'Exclusão' },
  { id: 'cadastro',    rotulo: 'Cadastrar Nota' },
  { id: 'colagem',     rotulo: 'Colar Planilha' },
  { id: 'hierarquia',  rotulo: 'Hierarquia' },
];

const NOTA_RAMAL_VAZIA: Record<string, string> = {
  Numero_Nota: '', Status_Nota: '-', Prioridade_Nota: '-',
  Planejado_DDPM: '0', Status_Obra: '-', Conjunto: '-', Circuito: '-',
  Local_Instalacao: '-', Mes_Execucao_Planejado: '-',
  CenTrab_Respon: '-', Observacao: '', Extracao_Antiga: '-',
  Status_Anterior: '-', Check_Btzero: '-', Plano: '-',
};

interface Mensagem { tipo: 'ok' | 'erro'; texto: string; }

export function Ramal({ dadosPrincipais }: { dadosPrincipais: InputDataset }): React.JSX.Element {
  const { data: dadosRamal, isLoading, error } = useRamalData();
  const recarregar = useRecarregarRamal();

  const [modo, setModo] = React.useState<ModoRamal>('visao');
  const [edicoes, setEdicoes] = React.useState<Map<number, Partial<NotaRamal>>>(new Map());
  const [selecionados, setSelecionados] = React.useState<Set<number>>(new Set());
  const [msg, setMsg] = React.useState<Mensagem | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [acaoPendente, setAcaoPendente] = React.useState<(() => void) | null>(null);
  const [loteStatus, setLoteStatus] = React.useState('');
  const [lotePrioridade, setLotePrioridade] = React.useState('');
  const [loteMes, setLoteMes] = React.useState('');
  const [novaNota, setNovaNota] = React.useState<Record<string, string>>({ ...NOTA_RAMAL_VAZIA });
  const [textoColagem, setTextoColagem] = React.useState('');
  const [maeSelecionada, setMaeSelecionada] = React.useState('');
  const [filhasSelecionadas, setFilhasSelecionadas] = React.useState<Set<number>>(new Set());

  const registros = dadosRamal?.registros ?? [];

  const previewColagem = React.useMemo(
    () => parseColagemTsv(textoColagem, COLUNAS_COLAGEM_RAMAL),
    [textoColagem],
  );

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

  function onEditar(numero: number, campo: string, valor: string | number | null): void {
    setEdicoes((prev) => {
      const m = new Map(prev);
      m.set(numero, { ...(m.get(numero) ?? {}), [campo]: valor } as Partial<NotaRamal>);
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

  function toggleFilha(numero: number): void {
    setFilhasSelecionadas((prev) => {
      const s = new Set(prev);
      if (s.has(numero)) s.delete(numero); else s.add(numero);
      return s;
    });
  }

  const salvarRapida = (): void => comIdentidade(() => {
    void executar(`${edicoes.size} nota(s) ramal atualizada(s).`, async () => {
      const notas = [...edicoes.entries()].map(([n, campos]) => ({ Numero_Nota: n, ...campos }));
      await InputApi.importarRamal(notas);
      setEdicoes(new Map());
    });
  });

  const aplicarLote = (): void => comIdentidade(() => {
    const notas = [...selecionados].map((n) => {
      const nota: Partial<NotaRamal> = { Numero_Nota: n };
      if (loteStatus) nota.Status_Nota = loteStatus;
      if (lotePrioridade) nota.Prioridade_Nota = lotePrioridade;
      if (loteMes.trim()) nota.Mes_Execucao_Planejado = loteMes.trim();
      return nota;
    });
    if (notas.length === 0 || (!loteStatus && !lotePrioridade && !loteMes.trim())) {
      setMsg({ tipo: 'erro', texto: 'Selecione notas e escolha pelo menos um novo valor.' });
      return;
    }
    void executar(`Lote aplicado em ${notas.length} nota(s) ramal.`, async () => {
      await InputApi.importarRamal(notas);
      setSelecionados(new Set());
    });
  });

  const excluirSelecionadas = (): void => comIdentidade(() => {
    if (selecionados.size === 0) { setMsg({ tipo: 'erro', texto: 'Nenhuma nota selecionada.' }); return; }
    if (!window.confirm(`Excluir ${selecionados.size} nota(s) ramal do banco?`)) return;
    void executar(`${selecionados.size} nota(s) ramal excluída(s).`, async () => {
      await InputApi.excluirRamal([...selecionados]);
      setSelecionados(new Set());
    });
  });

  const cadastrar = (): void => comIdentidade(() => {
    if (!/^\d+$/.test(novaNota.Numero_Nota)) { setMsg({ tipo: 'erro', texto: 'Nº da Nota inválido.' }); return; }
    void executar(`Nota ramal ${novaNota.Numero_Nota} cadastrada.`, async () => {
      await InputApi.importarRamal([{
        ...novaNota as unknown as Partial<NotaRamal>,
        Numero_Nota: Number(novaNota.Numero_Nota),
        Planejado_DDPM: Number(novaNota.Planejado_DDPM) || 0,
      }]);
      setNovaNota({ ...NOTA_RAMAL_VAZIA });
    });
  });

  const salvarColagem = (): void => comIdentidade(() => {
    if (previewColagem.length === 0) { setMsg({ tipo: 'erro', texto: 'Cole os dados antes de salvar.' }); return; }
    void executar(`${previewColagem.length} nota(s) ramal integradas.`, async () => {
      await InputApi.importarRamal(previewColagem.map((r) => ({
        ...r as unknown as Partial<NotaRamal>,
        Numero_Nota: Number(r.Numero_Nota),
        Planejado_DDPM: Number(r.Planejado_DDPM) || 0,
      })));
      setTextoColagem('');
    });
  });

  const vincularHierarquia = (): void => comIdentidade(() => {
    const mae = Number(maeSelecionada);
    if (!mae || filhasSelecionadas.size === 0) {
      setMsg({ tipo: 'erro', texto: 'Informe a nota mãe e selecione ao menos uma filha.' });
      return;
    }
    void executar(`Hierarquia vinculada: ${filhasSelecionadas.size} nota(s) filha(s).`, async () => {
      await InputApi.vincularHierarquia({ [String(mae)]: [...filhasSelecionadas] });
      setMaeSelecionada('');
      setFilhasSelecionadas(new Set());
    });
  });

  function trocarModo(m: ModoRamal): void {
    setModo(m); setMsg(null); setSelecionados(new Set()); setEdicoes(new Map());
  }

  const comSelecao = modo === 'lote' || modo === 'exclusao';
  const registrosComoNotaInput = registros as unknown as import('./types').NotaInput[];

  return (
    <div className="ui-reset" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <ToggleGroup type="single" value={modo} variant="outline"
                     onValueChange={(v) => { if (v) trocarModo(v as ModoRamal); }}>
          {MODOS.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id}>{m.rotulo}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isLoading && <div style={{ padding: 24, color: 'var(--text-dim)' }}>Carregando notas ramal…</div>}
      {error != null && (
        <div style={{ padding: 24, color: 'var(--red, #dc3545)' }}>
          Erro ao carregar ramal: {String((error as Error).message)}
        </div>
      )}

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13,
                      borderLeft: `3px solid ${msg.tipo === 'ok' ? 'var(--green)' : 'var(--amber)'}`,
                      background: msg.tipo === 'ok' ? 'var(--tint-green)' : 'var(--tint-amber)' }}>
          {msg.texto}
        </div>
      )}

      {/* VISÃO GERAL — DataGrid com keyboard nav, resize, soma/média */}
      {modo === 'visao' && dadosRamal && (
        <React.Fragment>
          <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
            Total: <strong className="edp-mono">{registros.length}</strong> notas ramal
          </span>
          <DataGrid registros={registrosComoNotaInput} colunas={COLUNAS_RAMAL} />
        </React.Fragment>
      )}

      {/* EDIÇÃO RÁPIDA */}
      {modo === 'rapida' && dadosRamal && (
        <React.Fragment>
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
          <Card>
            <CardContent className="pt-6">
              <NotesTable registros={registrosComoNotaInput} colunas={COLUNAS_RAMAL}
                          edicoes={edicoes as unknown as Map<number, Partial<import('./types').NotaInput>>}
                          onEditar={onEditar}
                          statusOpcoes={dadosPrincipais.meta.status_opcoes}
                          prioridadeOpcoes={dadosPrincipais.meta.prioridade_opcoes} />
            </CardContent>
          </Card>
        </React.Fragment>
      )}

      {/* EDIÇÃO EM LOTE / EXCLUSÃO */}
      {comSelecao && dadosRamal && (
        <React.Fragment>
          {modo === 'lote' && (
            <Card>
              <CardHeader><CardTitle>Edição em lote — Ramal</CardTitle></CardHeader>
              <CardContent>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Select value={loteStatus || undefined}
                          onValueChange={(v) => setLoteStatus(v === '__manter' ? '' : v)}>
                    <SelectTrigger style={{ width: 220 }}>
                      <SelectValue placeholder="Status: (manter atual)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manter">Status: (manter atual)</SelectItem>
                      {dadosPrincipais.meta.status_opcoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={lotePrioridade || undefined}
                          onValueChange={(v) => setLotePrioridade(v === '__manter' ? '' : v)}>
                    <SelectTrigger style={{ width: 220 }}>
                      <SelectValue placeholder="Prioridade: (manter atual)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manter">Prioridade: (manter atual)</SelectItem>
                      {dadosPrincipais.meta.prioridade_opcoes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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
                    Marque as notas ramal e confirme a exclusão. {selecionados.size} selecionada(s).
                  </span>
                  <Button variant="destructive" size="sm" disabled={salvando} onClick={excluirSelecionadas}>
                    🗑 Excluir selecionadas
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-6">
              <NotesTable registros={registrosComoNotaInput} colunas={COLUNAS_RAMAL}
                          selecionados={selecionados}
                          onToggleSelecionado={toggleSelecionado}
                          onToggleTodos={toggleTodos}
                          statusOpcoes={dadosPrincipais.meta.status_opcoes}
                          prioridadeOpcoes={dadosPrincipais.meta.prioridade_opcoes} />
            </CardContent>
          </Card>
        </React.Fragment>
      )}

      {/* CADASTRAR NOTA RAMAL */}
      {modo === 'cadastro' && (
        <Card>
          <CardHeader><CardTitle>Cadastrar nota ramal</CardTitle></CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 14 }}>
              {Object.keys(NOTA_RAMAL_VAZIA).map((campo) => (
                <div key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Label htmlFor={`nova-ramal-${campo}`} className="text-muted-foreground">
                    {ROTULOS_RAMAL[campo] ?? campo}
                  </Label>
                  {campo === 'Status_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-ramal-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dadosPrincipais.meta.status_opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : campo === 'Prioridade_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-ramal-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dadosPrincipais.meta.prioridade_opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={`nova-ramal-${campo}`} value={novaNota[campo]}
                           onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <Button disabled={salvando} onClick={cadastrar}>💾 Salvar nota ramal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* COLAR PLANILHA */}
      {modo === 'colagem' && (
        <Card>
          <CardHeader><CardTitle>Colar planilha ramal</CardTitle></CardHeader>
          <CardContent>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '0 0 10px' }}>
              Cole as linhas copiadas do Excel (sem cabeçalho). Ordem das colunas:{' '}
              {COLUNAS_COLAGEM_RAMAL.map((c) => ROTULOS_RAMAL[c] ?? c).join(' · ')}
            </p>
            <Textarea value={textoColagem} rows={8} placeholder="Ctrl+V com as linhas do Excel…"
                      onChange={(e) => setTextoColagem(e.target.value)}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
            {previewColagem.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 12.5 }}>{previewColagem.length} linha(s) reconhecida(s):</span>
                <NotesTable
                  colunas={COLUNAS_RAMAL.filter((c) => COLUNAS_COLAGEM_RAMAL.includes(c.key))}
                  registros={previewColagem.map((r, i) => ({
                    ...r, Numero_Nota: Number(r.Numero_Nota) || -(i + 1),
                  })) as unknown as import('./types').NotaInput[]}
                  altura={240} />
                <Button disabled={salvando} onClick={salvarColagem}>
                  💾 Salvar lote ramal ({previewColagem.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* HIERARQUIA */}
      {modo === 'hierarquia' && dadosRamal && (
        <React.Fragment>
          <Card>
            <CardHeader><CardTitle>Vincular Hierarquia (Nota Mãe → Filhas)</CardTitle></CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Label>Nota Mãe (Nº da nota principal)</Label>
                    <Input value={maeSelecionada} placeholder="ex: 100123456"
                           onChange={(e) => setMaeSelecionada(e.target.value)}
                           style={{ width: 200 }} />
                  </div>
                  <Button disabled={salvando || !maeSelecionada || filhasSelecionadas.size === 0}
                          onClick={vincularHierarquia}>
                    🔗 Vincular ({filhasSelecionadas.size} filha(s))
                  </Button>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
                  Selecione as notas ramal filhas na tabela abaixo:
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <NotesTable registros={registrosComoNotaInput} colunas={COLUNAS_RAMAL}
                          selecionados={filhasSelecionadas}
                          onToggleSelecionado={toggleFilha}
                          onToggleTodos={(nums, marcar) => {
                            setFilhasSelecionadas((prev) => {
                              const s = new Set(prev);
                              nums.forEach((n) => { if (marcar) s.add(n); else s.delete(n); });
                              return s;
                            });
                          }}
                          statusOpcoes={dadosPrincipais.meta.status_opcoes}
                          prioridadeOpcoes={dadosPrincipais.meta.prioridade_opcoes} />
            </CardContent>
          </Card>
        </React.Fragment>
      )}

      <IdentityModal aberto={acaoPendente !== null}
                     onConfirmado={() => { const acao = acaoPendente; setAcaoPendente(null); acao?.(); }}
                     onCancelar={() => setAcaoPendente(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Esperado: `✓ built in` sem erros TypeScript.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/input/ramal.tsx
git commit -m "feat(input): ramal.tsx — 7 modos CRUD + hierarquia"
```

---

### Task 4: Registrar aba Ramal em input-section.tsx

**Files:**
- Modify: `frontend/src/input/input-section.tsx`

**Interfaces:**
- Consumes: `Ramal` component (Task 3)

- [ ] **Step 1: Adicionar 'ramal' a INPUT_SUBS**

Em `input-section.tsx`, adicionar `{ id: 'ramal', rotulo: 'Ramal' }` ao array `INPUT_SUBS`.

- [ ] **Step 2: Adicionar import e render do Ramal**

Adicionar import:
```ts
import { Ramal } from './ramal';
```

Adicionar render após a linha do `config`:
```tsx
{dados && sub === 'ramal' && <Ramal dadosPrincipais={dados} />}
```

- [ ] **Step 3: Build final + tsc check**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Esperado: `✓ built in` sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/input/input-section.tsx
git commit -m "feat(input): aba Ramal registrada em INPUT_SUBS"
```

---

### Task 5: Push

- [ ] **Step 1: Push para develop**

```bash
git push origin develop
```
