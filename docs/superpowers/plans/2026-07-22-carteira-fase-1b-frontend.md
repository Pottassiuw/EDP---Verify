# Carteira de Notas — Fase 1b (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a seção **Carteira** no frontend — aba **Explorador** (tabela paginada com filtros, situação, detalhe em Sheet, KPIs) e aba **Sincronização** (estado, histórico, disparo) — consumindo a API `/api/carteira` já entregue na Fase 1a.

**Architecture:** Nova feature `features/carteira/` (flat, molde `relatorios`/`input`), servida por React Query sobre um `CarteiraApi` (fetch, padrão `InputApi.req<T>`). Tabela via `@tanstack/react-table` (paginação/ordenação server-side). Snapshot Dexie para resumo + primeira página via um hook compartilhado `useSeededQuery`. Nova `AppSection` `"carteira"` montada em `App.tsx` + grupo no sidebar.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, React Query, `@tanstack/react-table` (novo), Dexie, shadcn (Sheet/Badge/Table), Lucide, Sonner.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-22-carteira-fase-1-projecao-explorador-design.md`. Backend já pronto (`/api/carteira/notas|notas/{id_onr}|resumo|sincronizacao|sincronizar`).
- **Sem test runner no frontend:** o repo não tem vitest/jest (scripts: `dev`/`build`/`preview`). O **gate de cada task é `npm run build`** (de `frontend/`: `tsc -b && vite build`) — deve compilar sem erro de tipo. Lógica pura fica tipada para o tsc validar.
- **CLAUDE.md:** feature-first; componentes só renderizam UI (lógica em hooks); `<200` linhas por componente; nunca `any` (usar `unknown`/tipos); imports ordenados (React → libs → aliases → relativos); React Query é o estado de servidor (não duplicar em Context); derivar estado em vez de armazenar.
- **Tokens/cores:** proibido cor arbitrária/paleta Tailwind — só tokens de `app.css`. Variants de badge novos seguem o padrão tint existente (`bg-tint-*`/`text-*`).
- **Dexie sempre via biblioteca Dexie** (regra do projeto), reusando `features/input/cache.ts`.
- **Visual (DESIGN.md/Supabaze):** a estrutura é construída sobre os primitivos existentes (`PageHeader`/`StatTile`/`SegTabs`/`Badge`/`Sheet`) para consistência e compilação; o **refino visual Supabaze é a Task 9**, conduzida pela skill `frontend-design` no fluxo principal (não por subagente). Não reescrever primitivos compartilhados nesta fase.
- **Fora de escopo (Fase 2/3):** mover-para-plano em lote (seleção é só visual aqui), aba Divergências, dashboard completo, filtros salvos, command palette.
- **Dep nova:** `@tanstack/react-table` (headless; não há equivalente no app; decisão registrada na spec).

---

## File Structure

- `frontend/package.json` — adicionar `@tanstack/react-table`.
- `frontend/src/types.ts` — `AppSection` ganha `"carteira"`; adicionar `CarteiraSubPage`.
- `frontend/src/features/carteira/types.ts` — tipos da API.
- `frontend/src/features/carteira/api.ts` — `CarteiraApi` (fetch).
- `frontend/src/features/carteira/subs.ts` — abas (import-light).
- `frontend/src/features/input/cache.ts` — adicionar `SNAPSHOT_CARTEIRA`.
- `frontend/src/hooks/use-seeded-query.ts` — hook compartilhado seed→revalidate.
- `frontend/src/features/carteira/use-carteira-notas.ts` — página do explorador.
- `frontend/src/features/carteira/use-carteira-resumo.ts` — KPIs (seeded).
- `frontend/src/features/carteira/use-carteira-sync.ts` — estado + mutação.
- `frontend/src/features/carteira/situacao.ts` — mapa situação→rótulo/variant.
- `frontend/src/components/ui/badge.tsx` — variants de situação.
- `frontend/src/features/carteira/explorador/` — `filtros.tsx`, `tabela.tsx`, `colunas.tsx`, `detalhe-sheet.tsx`, `kpis.tsx`, `explorador.tsx`.
- `frontend/src/features/carteira/sincronizacao/sincronizacao.tsx`.
- `frontend/src/features/carteira/carteira-section.tsx` — shell.
- `frontend/src/components/app-sidebar.tsx` — grupo Carteira.
- `frontend/src/App.tsx` — montar a seção.
- `docs/dev/11-frontend-carteira.md` + `docs/dev/00-overview.md`.

---

### Task 1: Dep + tipos + api + AppSection

**Files:**
- Modify: `frontend/package.json`, `frontend/src/types.ts`
- Create: `frontend/src/features/carteira/types.ts`, `frontend/src/features/carteira/api.ts`, `frontend/src/features/carteira/subs.ts`
- Modify: `frontend/src/features/input/cache.ts`

**Interfaces:**
- Produces:
  - Tipos: `NotaCarteira`, `PaginaNotas`, `ResumoCarteira`, `ExecucaoSync`, `EstadoSync`, `FiltrosCarteira`, `SituacaoCarteira`.
  - `CarteiraApi.notas(params) -> Promise<PaginaNotas>`, `.detalhe(id) -> Promise<NotaCarteira>`, `.resumo() -> Promise<ResumoCarteira>`, `.sincronizacao() -> Promise<EstadoSync>`, `.sincronizar() -> Promise<ExecucaoSync>`.
  - `AppSection` inclui `"carteira"`; `CarteiraSubPage = "explorador" | "sincronizacao"`.
  - `SNAPSHOT_CARTEIRA_RESUMO` em `cache.ts`.

- [ ] **Step 1: Instalar a dependência**

Run (de `frontend/`): `npm install @tanstack/react-table`
Expected: instala sem erro; `package.json` ganha `@tanstack/react-table`.

- [ ] **Step 2: Adicionar AppSection e CarteiraSubPage**

Em `frontend/src/types.ts`, altere a linha do `AppSection` e adicione o subtipo:
```typescript
export type AppSection = "relatorios" | "coffee" | "input" | "carteira" | "configuracoes";
export type CoffeeSubPage = "abrir" | "geradas" | "corrigidas" | "pendentes" | "verificar" | "logs";
export type RelatoriosSubPage = "mes" | "planos" | "mensalizacao";
export type CarteiraSubPage = "explorador" | "sincronizacao";
```

- [ ] **Step 3: Tipos da API**

Create `frontend/src/features/carteira/types.ts`:
```typescript
export type SituacaoCarteira =
  | 'cancelada' | 'executada' | 'no_plano' | 'fora_do_plano';

export interface NotaCarteira {
  id_onr: number;
  id_sap: string | null;
  sap_real: number;
  conjunto: string | null;
  descricao_conjunto: string | null;
  regional: string | null;
  csd_origem: string | null;
  empresa: string | null;
  quantidade: number | null;
  quantidade_valida: number;
  prioridade: string | null;
  prioridade_sap: number | null;
  status_sap: string | null;
  data_encerramento_exec: string | null;
  local_instalacao: string | null;
  alimentador: string | null;
  executor: string | null;
  sintoma: string | null;
  situacao: SituacaoCarteira;
  ausente_na_origem_em: string | null;
}

export interface PaginaNotas {
  registros: NotaCarteira[];
  total: number;
  page: number;
  size: number;
  versao: string;
}

export interface ResumoCarteira {
  total: number;
  por_situacao: Record<string, number>;
  por_regional: Record<string, number>;
}

export interface ExecucaoSync {
  id?: number;
  estrategia: string;
  status: string;
  refresh_marker: string | null;
  iniciado_em?: string | null;
  finalizado_em?: string | null;
  novas: number;
  atualizadas: number;
  inalteradas: number;
  ausentes: number;
  erro: string | null;
  versao_resultante: string | null;
}

export interface EstadoSync {
  ultimo_refresh_marker: string | null;
  execucoes: ExecucaoSync[];
}

export interface FiltrosCarteira {
  regional?: string;
  conjunto?: string;
  status_sap?: string;
  situacao?: SituacaoCarteira;
  sap_real?: number;
  q?: string;
  incluir_ausentes?: boolean;
}
```

- [ ] **Step 4: Cliente da API**

Create `frontend/src/features/carteira/api.ts`:
```typescript
import type {
  EstadoSync, ExecucaoSync, FiltrosCarteira, NotaCarteira, PaginaNotas,
  ResumoCarteira,
} from './types';

const base = (): string => localStorage.getItem('edp_api') ?? '/api';

async function req<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base()}/carteira${caminho}`, init);
  if (!r.ok) {
    const corpo = await r.text();
    let detalhe = corpo;
    try { detalhe = (JSON.parse(corpo) as { detail?: string }).detail ?? corpo; } catch { /* texto */ }
    throw new Error(detalhe || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export interface ParamsNotas extends FiltrosCarteira {
  page: number;
  size: number;
  ordenar_por: string;
  ordem: 'asc' | 'desc';
}

function querystring(params: ParamsNotas): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== '' && valor !== null) {
      sp.set(chave, String(valor));
    }
  });
  return sp.toString();
}

export const CarteiraApi = {
  notas: (params: ParamsNotas) => req<PaginaNotas>(`/notas?${querystring(params)}`),
  detalhe: (idOnr: number) => req<NotaCarteira>(`/notas/${idOnr}`),
  resumo: () => req<ResumoCarteira>('/resumo'),
  sincronizacao: () => req<EstadoSync>('/sincronizacao'),
  sincronizar: () => req<ExecucaoSync>('/sincronizar', { method: 'POST' }),
};
```

- [ ] **Step 5: Abas (import-light)**

Create `frontend/src/features/carteira/subs.ts`:
```typescript
import type { CarteiraSubPage } from '../../types';

export const CARTEIRA_SUBS: { id: CarteiraSubPage; rotulo: string }[] = [
  { id: 'explorador', rotulo: 'Explorador' },
  { id: 'sincronizacao', rotulo: 'Sincronização' },
];
```

- [ ] **Step 6: Chave de snapshot Dexie**

Em `frontend/src/features/input/cache.ts`, após a linha `export const SNAPSHOT_RAMAL = 'ramal-dados';`, adicione:
```typescript
export const SNAPSHOT_CARTEIRA_RESUMO = 'carteira-resumo';
```

- [ ] **Step 7: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro de tipo (tsc) e build Vite conclui. (A seção ainda não é montada — só tipos/api/deps.)

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/types.ts frontend/src/features/carteira/types.ts frontend/src/features/carteira/api.ts frontend/src/features/carteira/subs.ts frontend/src/features/input/cache.ts
git commit -m "feat(carteira-fe): tipos, api client, AppSection e dep tanstack-table"
```

---

### Task 2: useSeededQuery (hook compartilhado seed→revalidate)

**Files:**
- Create: `frontend/src/hooks/use-seeded-query.ts`
- Test: (sem runner) gate por build + uso em Task 3.

**Interfaces:**
- Consumes: `lerSnapshot`/`gravarSnapshot` de `features/input/cache`.
- Produces: `useSeededQuery<T>({ queryKey, snapshotKey, versao, fetchFn, staleTime }) -> UseQueryResult<T>` — semeia o React Query com o snapshot Dexie (se a query ainda não tem dado), grava snapshot a cada fetch bem-sucedido.

Nota: é a 3ª ocorrência do padrão (Rule of Three) — extraído para reuso. Esta fase usa o hook só na Carteira; migrar `useInputData`/`useRamalData` para ele fica como limpeza posterior (sem runner de teste, refatorar os hooks em produção agora seria risco sem rede de segurança).

- [ ] **Step 1: Implementar o hook**

Create `frontend/src/hooks/use-seeded-query.ts`:
```typescript
import React from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { gravarSnapshot, lerSnapshot } from '../features/input/cache';

interface Opcoes<T> {
  queryKey: QueryKey;
  snapshotKey: string;
  versao: string | null;
  fetchFn: () => Promise<T>;
  staleTime?: number;
}

/** useQuery que semeia do snapshot Dexie e grava snapshot a cada sucesso. */
export function useSeededQuery<T>({
  queryKey, snapshotKey, versao, fetchFn, staleTime = 300_000,
}: Opcoes<T>) {
  const qc = useQueryClient();

  React.useEffect(() => {
    let cancelado = false;
    void lerSnapshot(snapshotKey).then((snap) => {
      if (cancelado || !snap) return;
      if (qc.getQueryData(queryKey) === undefined) {
        qc.setQueryData(queryKey, snap.dados as T,
                        { updatedAt: Date.parse(snap.salvoEm) });
      }
    });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, snapshotKey]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const dados = await fetchFn();
      await gravarSnapshot(snapshotKey, versao, dados);
      return dados;
    },
    staleTime,
    retry: 1,
  });
}
```

- [ ] **Step 2: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/use-seeded-query.ts
git commit -m "feat(carteira-fe): hook compartilhado useSeededQuery (seed Dexie -> revalidate)"
```

---

### Task 3: Hooks de dados da Carteira

**Files:**
- Create: `frontend/src/features/carteira/use-carteira-notas.ts`, `use-carteira-resumo.ts`, `use-carteira-sync.ts`

**Interfaces:**
- Consumes: `CarteiraApi`, `useSeededQuery`, `SNAPSHOT_CARTEIRA_RESUMO`.
- Produces:
  - `useCarteiraNotas(params: ParamsNotas) -> UseQueryResult<PaginaNotas>` (keepPreviousData).
  - `useCarteiraResumo() -> UseQueryResult<ResumoCarteira>` (seeded).
  - `useCarteiraSync() -> { estado, sincronizar, sincronizando }`.
  - `CARTEIRA_NOTAS_KEY`, `CARTEIRA_RESUMO_KEY`, `CARTEIRA_SYNC_KEY`.

- [ ] **Step 1: Implementar os hooks**

Create `frontend/src/features/carteira/use-carteira-notas.ts`:
```typescript
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CarteiraApi, type ParamsNotas } from './api';

export const CARTEIRA_NOTAS_KEY = (params: ParamsNotas) =>
  ['carteira', 'notas', params] as const;

export function useCarteiraNotas(params: ParamsNotas) {
  return useQuery({
    queryKey: CARTEIRA_NOTAS_KEY(params),
    queryFn: () => CarteiraApi.notas(params),
    placeholderData: keepPreviousData,
    staleTime: 300_000,
    retry: 1,
  });
}
```

Create `frontend/src/features/carteira/use-carteira-resumo.ts`:
```typescript
import { CarteiraApi } from './api';
import { SNAPSHOT_CARTEIRA_RESUMO } from '../input/cache';
import { useSeededQuery } from '../../hooks/use-seeded-query';
import type { ResumoCarteira } from './types';

export const CARTEIRA_RESUMO_KEY = ['carteira', 'resumo'] as const;

export function useCarteiraResumo() {
  return useSeededQuery<ResumoCarteira>({
    queryKey: CARTEIRA_RESUMO_KEY,
    snapshotKey: SNAPSHOT_CARTEIRA_RESUMO,
    versao: null,
    fetchFn: () => CarteiraApi.resumo(),
  });
}
```

Create `frontend/src/features/carteira/use-carteira-sync.ts`:
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CarteiraApi } from './api';

export const CARTEIRA_SYNC_KEY = ['carteira', 'sincronizacao'] as const;

export function useCarteiraSync() {
  const qc = useQueryClient();
  const estado = useQuery({
    queryKey: CARTEIRA_SYNC_KEY,
    queryFn: () => CarteiraApi.sincronizacao(),
    staleTime: 30_000,
    retry: 1,
  });

  const mut = useMutation({
    mutationFn: () => CarteiraApi.sincronizar(),
    onSuccess: (execucao) => {
      const msg = execucao.estrategia === 'skip'
        ? 'Nada novo na origem — projeção já atualizada.'
        : `Sincronizado: ${execucao.novas} novas, ${execucao.atualizadas} atualizadas.`;
      toast.success(msg);
      void qc.invalidateQueries({ queryKey: ['carteira'] });
    },
    onError: (e) => toast.error('Falha ao sincronizar', {
      description: e instanceof Error ? e.message : String(e),
    }),
  });

  return { estado, sincronizar: () => mut.mutate(), sincronizando: mut.isPending };
}
```

- [ ] **Step 2: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/carteira/use-carteira-notas.ts frontend/src/features/carteira/use-carteira-resumo.ts frontend/src/features/carteira/use-carteira-sync.ts
git commit -m "feat(carteira-fe): hooks de notas (paginado), resumo (seeded) e sync"
```

---

### Task 4: Situação (rótulo + badge variants)

**Files:**
- Create: `frontend/src/features/carteira/situacao.ts`
- Modify: `frontend/src/components/ui/badge.tsx`

**Interfaces:**
- Produces: `SITUACAO_INFO: Record<SituacaoCarteira, { rotulo: string; variant: string }>`; badge variants `situPlano`/`situFora`/`situExec`/`situCancel`.

- [ ] **Step 1: Adicionar variants de situação ao badge**

Em `frontend/src/components/ui/badge.tsx`, dentro de `variants.variant` (após `prioNone`), adicione:
```typescript
        situPlano: "inline-flex items-center gap-[5px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase py-[3px] px-[8px] rounded-[5px] whitespace-nowrap border-transparent bg-tint-green text-green",
        situExec: "inline-flex items-center gap-[5px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase py-[3px] px-[8px] rounded-[5px] whitespace-nowrap border-transparent bg-tint-indigo text-indigo",
        situFora: "inline-flex items-center gap-[5px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase py-[3px] px-[8px] rounded-[5px] whitespace-nowrap border-transparent bg-tint-amber text-amber",
        situCancel: "inline-flex items-center gap-[5px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase py-[3px] px-[8px] rounded-[5px] whitespace-nowrap border-transparent bg-tint-red text-red",
```

- [ ] **Step 2: Mapa de situação**

Create `frontend/src/features/carteira/situacao.ts`:
```typescript
import type { SituacaoCarteira } from './types';

export const SITUACAO_INFO: Record<SituacaoCarteira,
  { rotulo: string; variant: 'situPlano' | 'situExec' | 'situFora' | 'situCancel' }> = {
  no_plano: { rotulo: 'No plano', variant: 'situPlano' },
  executada: { rotulo: 'Executada', variant: 'situExec' },
  fora_do_plano: { rotulo: 'Fora do plano', variant: 'situFora' },
  cancelada: { rotulo: 'Cancelada', variant: 'situCancel' },
};
```

- [ ] **Step 3: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/badge.tsx frontend/src/features/carteira/situacao.ts
git commit -m "feat(carteira-fe): badges e mapa de situacao da carteira"
```

---

### Task 5: KPIs + Detalhe (Sheet)

**Files:**
- Create: `frontend/src/features/carteira/explorador/kpis.tsx`, `frontend/src/features/carteira/explorador/detalhe-sheet.tsx`

**Interfaces:**
- Consumes: `useCarteiraResumo`, `CarteiraApi.detalhe`, `SITUACAO_INFO`, `StatTile`, `Sheet`.
- Produces: `<KpisCarteira />`, `<DetalheSheet idOnr={number|null} onClose={()=>void} />`.

- [ ] **Step 1: KPIs**

Create `frontend/src/features/carteira/explorador/kpis.tsx`:
```typescript
import React from 'react';
import { StatTile } from '@/components/branded/section';
import { useCarteiraResumo } from '../use-carteira-resumo';

export function KpisCarteira(): React.JSX.Element {
  const { data } = useCarteiraResumo();
  const s = data?.por_situacao ?? {};
  return (
    <div className="edp-stats-row" style={{ display: 'flex', gap: 'var(--gap)', flexWrap: 'wrap' }}>
      <StatTile label="Total na carteira" value={data?.total ?? '—'} />
      <StatTile label="Fora do plano" value={s['fora_do_plano'] ?? '—'} />
      <StatTile label="No plano" value={s['no_plano'] ?? '—'} />
      <StatTile label="Executadas" value={s['executada'] ?? '—'} />
    </div>
  );
}
```

- [ ] **Step 2: Detalhe em Sheet**

Create `frontend/src/features/carteira/explorador/detalhe-sheet.tsx`:
```typescript
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { CarteiraApi } from '../api';
import { SITUACAO_INFO } from '../situacao';

const CAMPOS: { chave: keyof import('../types').NotaCarteira; rotulo: string }[] = [
  { chave: 'id_sap', rotulo: 'ID SAP' },
  { chave: 'conjunto', rotulo: 'Conjunto' },
  { chave: 'descricao_conjunto', rotulo: 'Descrição do conjunto' },
  { chave: 'regional', rotulo: 'Regional' },
  { chave: 'quantidade', rotulo: 'Quantidade' },
  { chave: 'status_sap', rotulo: 'Status SAP' },
  { chave: 'data_encerramento_exec', rotulo: 'Encerramento' },
  { chave: 'local_instalacao', rotulo: 'Local de instalação' },
  { chave: 'alimentador', rotulo: 'Alimentador' },
  { chave: 'executor', rotulo: 'Executor' },
];

export function DetalheSheet({ idOnr, onClose }: {
  idOnr: number | null;
  onClose: () => void;
}): React.JSX.Element {
  const { data } = useQuery({
    queryKey: ['carteira', 'detalhe', idOnr],
    queryFn: () => CarteiraApi.detalhe(idOnr as number),
    enabled: idOnr !== null,
  });
  const info = data ? SITUACAO_INFO[data.situacao] : null;
  return (
    <Sheet open={idOnr !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="edp">
        <SheetHeader>
          <SheetTitle>Nota ONR {idOnr}</SheetTitle>
        </SheetHeader>
        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
            {info && <Badge variant={info.variant}>{info.rotulo}</Badge>}
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
              {CAMPOS.map(({ chave, rotulo }) => (
                <React.Fragment key={chave}>
                  <dt className="edp-eyebrow">{rotulo}</dt>
                  <dd style={{ margin: 0 }}>{String(data[chave] ?? '—')}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/carteira/explorador/kpis.tsx frontend/src/features/carteira/explorador/detalhe-sheet.tsx
git commit -m "feat(carteira-fe): KPIs e detalhe da nota em Sheet"
```

---

### Task 6: Tabela (TanStack) + colunas

**Files:**
- Create: `frontend/src/features/carteira/explorador/colunas.tsx`, `frontend/src/features/carteira/explorador/tabela.tsx`

**Interfaces:**
- Consumes: `@tanstack/react-table`, `NotaCarteira`, `SITUACAO_INFO`, `Table` primitives, `Badge`.
- Produces:
  - `colunasCarteira: ColumnDef<NotaCarteira>[]`
  - `<TabelaCarteira registros total page size ordenarPor ordem onOrdenar onPagina onAbrir />`

- [ ] **Step 1: Colunas**

Create `frontend/src/features/carteira/explorador/colunas.tsx`:
```typescript
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { SITUACAO_INFO } from '../situacao';
import type { NotaCarteira } from '../types';

export const colunasCarteira: ColumnDef<NotaCarteira>[] = [
  { accessorKey: 'id_sap', header: 'ID SAP',
    cell: ({ row }) => row.original.id_sap ?? '—' },
  { accessorKey: 'conjunto', header: 'Conjunto',
    cell: ({ row }) => row.original.conjunto ?? '—' },
  { accessorKey: 'regional', header: 'Regional',
    cell: ({ row }) => row.original.regional ?? '—' },
  { accessorKey: 'quantidade', header: 'Qtd',
    cell: ({ row }) => (row.original.quantidade_valida
      ? row.original.quantidade : '—') },
  { accessorKey: 'status_sap', header: 'Status',
    cell: ({ row }) => row.original.status_sap ?? '—' },
  { id: 'situacao', header: 'Situação',
    cell: ({ row }) => {
      const info = SITUACAO_INFO[row.original.situacao];
      return <Badge variant={info.variant}>{info.rotulo}</Badge>;
    } },
];
```

- [ ] **Step 2: Tabela**

Create `frontend/src/features/carteira/explorador/tabela.tsx`:
```typescript
import React from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { colunasCarteira } from './colunas';
import type { NotaCarteira } from '../types';

export function TabelaCarteira({
  registros, total, page, size, onPagina, onAbrir,
}: {
  registros: NotaCarteira[];
  total: number;
  page: number;
  size: number;
  onPagina: (p: number) => void;
  onAbrir: (idOnr: number) => void;
}): React.JSX.Element {
  const tabela = useReactTable({
    data: registros,
    columns: colunasCarteira,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });
  const ultimaPagina = Math.max(1, Math.ceil(total / size));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ overflowX: 'auto' }}>
        <Table>
          <TableHeader>
            {tabela.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tabela.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer"
                        onClick={() => onAbrir(row.original.id_onr)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap)', justifyContent: 'flex-end' }}>
        <span className="edp-eyebrow">{total} nota(s) · pág. {page}/{ultimaPagina}</span>
        <Button variant="outline" size="sm" disabled={page <= 1}
                onClick={() => onPagina(page - 1)} aria-label="Página anterior">
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page >= ultimaPagina}
                onClick={() => onPagina(page + 1)} aria-label="Próxima página">
          Próxima
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro. Se `@/components/ui/button` não existir, verifique o caminho real do Button do shadcn no projeto e ajuste o import (ele é usado em outras features).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/carteira/explorador/colunas.tsx frontend/src/features/carteira/explorador/tabela.tsx
git commit -m "feat(carteira-fe): tabela TanStack + colunas do explorador"
```

---

### Task 7: Filtros + Explorador (composição)

**Files:**
- Create: `frontend/src/features/carteira/explorador/filtros.tsx`, `frontend/src/features/carteira/explorador/explorador.tsx`

**Interfaces:**
- Consumes: `useCarteiraNotas`, `FiltrosCarteira`, `usePersistedState`, `KpisCarteira`, `TabelaCarteira`, `DetalheSheet`, `SITUACAO_INFO`.
- Produces: `<Explorador />` (aba completa).

- [ ] **Step 1: Barra de filtros**

Create `frontend/src/features/carteira/explorador/filtros.tsx`:
```typescript
import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SITUACAO_INFO } from '../situacao';
import type { FiltrosCarteira, SituacaoCarteira } from '../types';

const REGIONAIS = ['GUARATINGUETÁ', 'SÃO JOSÉ DOS CAMPOS', 'GUARULHOS',
  'Poá-Suzano', 'MOGI DAS CRUZES', 'Litoral Norte'];
const TODOS = '__todos';

export function FiltrosCarteiraBar({ filtros, onChange }: {
  filtros: FiltrosCarteira;
  onChange: (f: FiltrosCarteira) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 'var(--gap)', flexWrap: 'wrap', alignItems: 'center' }}>
      <Input placeholder="Buscar (SAP, conjunto, local)…"
             defaultValue={filtros.q ?? ''}
             onChange={(e) => onChange({ ...filtros, q: e.target.value || undefined })}
             style={{ maxWidth: 280 }} />
      <Select value={filtros.regional ?? TODOS}
              onValueChange={(v) => onChange({ ...filtros, regional: v === TODOS ? undefined : v })}>
        <SelectTrigger className="edp" style={{ width: 200 }}>
          <SelectValue placeholder="Regional" />
        </SelectTrigger>
        <SelectContent className="edp">
          <SelectItem value={TODOS}>Todas as regionais</SelectItem>
          {REGIONAIS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filtros.situacao ?? TODOS}
              onValueChange={(v) => onChange({ ...filtros, situacao: v === TODOS ? undefined : (v as SituacaoCarteira) })}>
        <SelectTrigger className="edp" style={{ width: 180 }}>
          <SelectValue placeholder="Situação" />
        </SelectTrigger>
        <SelectContent className="edp">
          <SelectItem value={TODOS}>Todas as situações</SelectItem>
          {Object.entries(SITUACAO_INFO).map(([id, info]) =>
            <SelectItem key={id} value={id}>{info.rotulo}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Composição do Explorador**

Create `frontend/src/features/carteira/explorador/explorador.tsx`:
```typescript
import React from 'react';
import { usePersistedState } from '../../../hooks/use-persisted-state';
import { Banner } from '@/components/branded/section';
import { useCarteiraNotas } from '../use-carteira-notas';
import type { FiltrosCarteira } from '../types';
import { FiltrosCarteiraBar } from './filtros';
import { KpisCarteira } from './kpis';
import { TabelaCarteira } from './tabela';
import { DetalheSheet } from './detalhe-sheet';

const SIZE = 50;

export function Explorador(): React.JSX.Element {
  const [filtros, setFiltros] = usePersistedState<FiltrosCarteira>('edp_carteira_filtros', {});
  const [page, setPage] = React.useState(1);
  const [aberta, setAberta] = React.useState<number | null>(null);

  function aplicarFiltros(f: FiltrosCarteira): void {
    setFiltros(f);
    setPage(1);
  }

  const { data, isLoading, error } = useCarteiraNotas({
    ...filtros, page, size: SIZE, ordenar_por: 'id_onr', ordem: 'asc',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <KpisCarteira />
      <FiltrosCarteiraBar filtros={filtros} onChange={aplicarFiltros} />
      {error && <Banner tipo="err">Não foi possível carregar a carteira: {error instanceof Error ? error.message : String(error)}</Banner>}
      {isLoading && !data
        ? <span className="edp-eyebrow">Carregando…</span>
        : (
          <TabelaCarteira
            registros={data?.registros ?? []}
            total={data?.total ?? 0}
            page={page} size={SIZE}
            onPagina={setPage}
            onAbrir={setAberta}
          />
        )}
      <DetalheSheet idOnr={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}
```

- [ ] **Step 3: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro. Se `@/components/ui/input` ou `select` tiverem caminho diferente, confirme com um `ls frontend/src/components/ui/` e ajuste.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/carteira/explorador/filtros.tsx frontend/src/features/carteira/explorador/explorador.tsx
git commit -m "feat(carteira-fe): filtros compostos e composicao do explorador"
```

---

### Task 8: Sincronização + shell + montagem (sidebar/App)

**Files:**
- Create: `frontend/src/features/carteira/sincronizacao/sincronizacao.tsx`, `frontend/src/features/carteira/carteira-section.tsx`
- Modify: `frontend/src/components/app-sidebar.tsx`, `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useCarteiraSync`, `Explorador`, `PageHeader`, `SegTabs`, `CARTEIRA_SUBS`, `Button`.
- Produces: `<CarteiraSection sub setSub />`; grupo Carteira no sidebar; montagem em App.

- [ ] **Step 1: Aba Sincronização**

Create `frontend/src/features/carteira/sincronizacao/sincronizacao.tsx`:
```typescript
import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatTile } from '@/components/branded/section';
import { useCarteiraSync } from '../use-carteira-sync';

export function Sincronizacao(): React.JSX.Element {
  const { estado, sincronizar, sincronizando } = useCarteiraSync();
  const execucoes = estado.data?.execucoes ?? [];
  const ultima = execucoes[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <div style={{ display: 'flex', gap: 'var(--gap)', flexWrap: 'wrap', alignItems: 'center' }}>
        <StatTile label="Último refresh (origem)" value={estado.data?.ultimo_refresh_marker ?? '—'} />
        <StatTile label="Última estratégia" value={ultima?.estrategia ?? '—'} />
        <Button onClick={sincronizar} disabled={sincronizando}
                style={{ marginLeft: 'auto' }}>
          {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
        </Button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Início</TableHead><TableHead>Estratégia</TableHead>
              <TableHead>Status</TableHead><TableHead>Novas</TableHead>
              <TableHead>Atualizadas</TableHead><TableHead>Ausentes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {execucoes.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.iniciado_em ?? '—'}</TableCell>
                <TableCell>{e.estrategia}</TableCell>
                <TableCell>
                  <Badge variant={e.status === 'ok' ? 'situPlano' : e.status === 'erro' ? 'situCancel' : 'situFora'}>
                    {e.status}
                  </Badge>
                </TableCell>
                <TableCell>{e.novas}</TableCell>
                <TableCell>{e.atualizadas}</TableCell>
                <TableCell>{e.ausentes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Shell da seção**

Create `frontend/src/features/carteira/carteira-section.tsx`:
```typescript
import React from 'react';
import type { CarteiraSubPage } from '../../types';
import { PageHeader, SegTabs } from '@/components/branded/section';
import { CARTEIRA_SUBS } from './subs';
import { Explorador } from './explorador/explorador';
import { Sincronizacao } from './sincronizacao/sincronizacao';

export function CarteiraSection({ sub, setSub }: {
  sub: CarteiraSubPage;
  setSub: (s: CarteiraSubPage) => void;
}): React.JSX.Element {
  return (
    <div className="edp-page" style={{ height: '100%', overflow: 'auto' }}>
      <PageHeader
        eyebrow="Databricks · base COFFEE"
        title="Carteira de Notas"
        subtitle="Toda a carteira disponível — dentro ou fora do plano."
        action={<SegTabs tabs={CARTEIRA_SUBS} value={sub} onChange={setSub} ariaLabel="Abas da carteira" />}
      />
      {sub === 'explorador' ? <Explorador /> : <Sincronizacao />}
    </div>
  );
}
```

- [ ] **Step 3: Grupo no sidebar**

Em `frontend/src/components/app-sidebar.tsx`:
1. Importe as abas: após `import { RELATORIOS_SUBS } from '../features/relatorios/subs';` adicione
   `import { CARTEIRA_SUBS } from '../features/carteira/subs';`
   e `import type { CarteiraSubPage } from '../types';`
2. Adicione um ícone (após `IconBI`):
```typescript
const IconCarteira = (): React.JSX.Element => (
  <svg {...svgBase}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></svg>
);
```
3. Em `AppSidebarProps`, adicione:
```typescript
  carteiraSub: CarteiraSubPage;
  setCarteiraSub: (s: CarteiraSubPage) => void;
```
4. Na desestruturação de `AppSidebar(...)`, inclua `carteiraSub, setCarteiraSub`.
5. Após o `<SidebarNavGroup>` do Input, adicione (antes do item "De olho no BI"):
```tsx
            <SidebarNavGroup
              icon={<IconCarteira />}
              label="Carteira"
              active={section === "carteira"}
              onSelect={() => setSection("carteira")}
              subs={CARTEIRA_SUBS}
              activeSub={carteiraSub}
              onSelectSub={irPara(setCarteiraSub, "carteira")}
            />
```

- [ ] **Step 4: Montar em App.tsx**

Em `frontend/src/App.tsx`:
1. No import de tipos (linha 2), inclua `CarteiraSubPage`:
   `import type { Note, Source, AppSection, CoffeeSubPage, RelatoriosSubPage, CarteiraSubPage } from './types';`
2. Após o lazy de `RelatoriosSection`, adicione:
```typescript
const CarteiraSection = React.lazy(() =>
  import('./features/carteira/carteira-section').then((m) => ({ default: m.CarteiraSection })));
```
3. Junto dos outros `usePersistedState` de sub, adicione:
```typescript
  const [carteiraSub, setCarteiraSub] = usePersistedState<CarteiraSubPage>("edp_carteira_sub", "explorador");
```
4. Passe as props para `<AppSidebar ...>` (adicione ao JSX existente):
   `carteiraSub={carteiraSub} setCarteiraSub={setCarteiraSub}`
5. No bloco de render condicional das seções, adicione o ramo da Carteira antes de `configuracoes`:
```tsx
            ) : section === "carteira" ? (
              <CarteiraSection sub={carteiraSub} setSub={setCarteiraSub} />
```
   (Encaixe no encadeamento `? :` existente, mantendo a ordem: relatorios → input → carteira → configuracoes → coffee.)

- [ ] **Step 5: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro. A seção Carteira aparece no sidebar e monta as duas abas.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/carteira/sincronizacao/sincronizacao.tsx frontend/src/features/carteira/carteira-section.tsx frontend/src/components/app-sidebar.tsx frontend/src/App.tsx
git commit -m "feat(carteira-fe): aba sincronizacao, shell e montagem (sidebar + App)"
```

---

### Task 9: Passo visual (Supabaze) + documentação

**Files:**
- Modify: componentes da Carteira (ajuste visual), possivelmente `frontend/src/app.css` (tokens Supabaze escopados).
- Create: `docs/dev/11-frontend-carteira.md`
- Modify: `docs/dev/00-overview.md`

> **Este task é conduzido no fluxo principal pela skill `frontend-design`** (regra do projeto: toda mudança de front usa `frontend-design`), não por subagente. Ele alinha a Carteira à direção Supabaze do DESIGN.md sem reescrever primitivos compartilhados: espaçamento, hierarquia tipográfica, densidade da tabela, tratamento dos badges e do Sheet. Ajustes puramente visuais; a estrutura/behaviors das Tasks 1–8 não mudam.

- [ ] **Step 1: Passe visual com frontend-design**

No fluxo principal, invoque a skill `frontend-design` e refine a seção Carteira (KPIs, filtros, tabela, badges, Sheet, aba de sincronização) na direção do DESIGN.md, usando tokens de `app.css` (adicionando tokens Supabaze escopados se necessário — nunca cor arbitrária). Rode `npm run build` ao final.

- [ ] **Step 2: Documentação**

Create `docs/dev/11-frontend-carteira.md` documentando: estrutura de `features/carteira/`, hooks (notas paginado, resumo seeded, sync), `useSeededQuery`, situação/badges, e o que é Fase 2/3 (mover em lote, divergências, dashboard). Adicione a linha da feature ao mapa em `docs/dev/00-overview.md`:
```markdown
| Carteira | `frontend/src/features/carteira/` | Explorador da base COFFEE (Databricks): tabela paginada, filtros, situação, detalhe e sincronização | [11-frontend-carteira.md](./11-frontend-carteira.md) |
```

- [ ] **Step 3: Gate — build + servir**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro. Suba o backend (`uvicorn`) e sirva o front para validar visualmente a seção com dados reais.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/carteira frontend/src/app.css docs/dev/11-frontend-carteira.md docs/dev/00-overview.md
git commit -m "feat(carteira-fe): passe visual Supabaze e documentacao da secao Carteira"
```

---

## Self-Review

**Spec coverage (Fase 1 frontend):**
- Seção Carteira + abas Explorador/Sincronização → Tasks 7/8. ✓
- Estado servidor React Query (notas paginado keepPreviousData, resumo seeded, sync) → Task 3. ✓
- TanStack Table (paginação server-side, colunas) → Task 6. ✓
- Filtros compostos (sessionStorage via usePersistedState) → Task 7. ✓
- Situação em badges → Task 4. ✓
- Detalhe em Sheet → Task 5. ✓
- KPIs leves (StatTile de resumo) → Task 5/7. ✓
- Dexie snapshot (resumo) + useSeededQuery (Rule of Three) → Tasks 1/2/3. ✓
- Sidebar + AppSection + montagem → Tasks 1/8. ✓
- Visual Supabaze (frontend-design) + docs → Task 9. ✓
- Fora de escopo (mover em lote/divergências/dashboard) → seleção só visual, não implementado. ✓

**Placeholder scan:** sem TBD/TODO; todo código completo. Onde caminhos de UI shadcn podem variar (`Button`/`Input`/`Select`), a task instrui a confirmar com `ls components/ui/` — não é placeholder, é robustez.

**Type consistency:** `ParamsNotas` (Task 1) usado em `useCarteiraNotas`/`CARTEIRA_NOTAS_KEY` (Task 3). `NotaCarteira`/`SituacaoCarteira` (Task 1) em colunas/detalhe/situação (Tasks 4/5/6). `SITUACAO_INFO` variants (`situPlano`/`situExec`/`situFora`/`situCancel`) definidos no badge (Task 4) e usados igual em colunas/detalhe/sync (Tasks 5/6/8). `CarteiraSubPage` (Task 1) em subs/shell/sidebar/App (Tasks 1/8). `useSeededQuery` assinatura (Task 2) consumida por `useCarteiraResumo` (Task 3).

**Sem test runner:** frontend não tem vitest/jest — o gate é `npm run build` (tsc). Lógica é tipada para o compilador validar; validação visual/funcional final é manual (Task 9 Step 3).
