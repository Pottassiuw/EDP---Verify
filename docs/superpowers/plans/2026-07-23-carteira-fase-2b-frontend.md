# Carteira de Notas — Fase 2b (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frontend da movimentação: seleção de linhas no Explorador, barra de ação, modal de mover-em-lote (preview + avisos + `MesExecucaoPicker`), aba Divergências e atalho dos Relatórios — consumindo a API `/api/carteira` da Fase 2a.

**Architecture:** Estende `features/carteira/` com seleção de linha do TanStack Table, um modal espelhado no `features/coffee/mover-plano-modal.tsx` (Dialog + `MesExecucaoPicker`, mutation → invalida `INPUT_DADOS_KEY`), e uma nova sub-aba Divergências. React Query em tudo; visual Supabaze via `.carteira-scope` (Dialog é portalizado → precisa da classe de escopo, como aprendido na Fase 1b).

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, React Query, `@tanstack/react-table`, shadcn (Dialog/Input/Label/Button/Badge), Lucide, Sonner.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-23-carteira-fase-2-movimentacao-design.md`. Backend Fase 2a pronto: `POST /api/carteira/mover/preview`, `POST /api/carteira/mover-para-plano` (X-User obrigatório), `GET /api/carteira/movimentacoes`, `GET /api/carteira/divergencias`.
- **Precedente a espelhar:** `frontend/src/features/coffee/mover-plano-modal.tsx` (Dialog + MesExecucaoPicker + mutation → `INPUT_DADOS_KEY`).
- **Sem test runner no frontend:** gate de cada task = `npm run build` (de `frontend/`: `tsc -b && vite build`), sem erro de tipo.
- **X-User na escrita:** `POST /mover-para-plano` exige header `X-User` — reusar `getUsuario()` de `features/input/api`.
- **All-or-nothing na UI:** se o preview marca qualquer selecionada como bloqueada, o botão "Mover" fica desabilitado (o backend também recusa).
- **Visual:** Supabaze (`.carteira-scope`). `DialogContent` e o `MesExecucaoPicker` (Select portalizado) recebem `className="edp carteira-scope"`. Badges seguem os variants existentes (`situPlano`/`situExec`/`situFora`/`situCancel`).
- **CLAUDE.md:** feature-first; componentes `<200` linhas (lógica em hooks); sem `any`; React Query para estado de servidor; tokens `app.css` (nunca cor arbitrária); imports ordenados.
- **Fora de escopo:** saída do plano; dashboard completo, filtros salvos, command palette (Fase 3). Banner de atalho no Input é opcional.

---

## File Structure

- `frontend/src/features/carteira/types.ts` — tipos de movimentação/divergência.
- `frontend/src/features/carteira/api.ts` — `CarteiraApi.moverPreview/mover/movimentacoes/divergencias`.
- `frontend/src/features/carteira/use-carteira-mover.ts` — preview (query) + mover (mutation).
- `frontend/src/features/carteira/use-carteira-divergencias.ts` — lista de divergências.
- `frontend/src/features/carteira/explorador/tabela.tsx` — coluna de seleção (checkbox).
- `frontend/src/features/carteira/explorador/explorador.tsx` — estado de seleção + barra de ação + modal.
- `frontend/src/features/carteira/mover/mover-modal.tsx` — modal de movimentação.
- `frontend/src/features/carteira/divergencias/divergencias.tsx` — aba Divergências.
- `frontend/src/features/carteira/subs.ts`, `frontend/src/types.ts` — aba `divergencias`.
- `frontend/src/features/carteira/carteira-section.tsx` — renderiza a aba + repassa handoff.
- `frontend/src/App.tsx`, `frontend/src/features/relatorios/relatorios-section.tsx` — atalho.
- `docs/dev/11-frontend-carteira.md`.

---

### Task 1: API + tipos de movimentação

**Files:**
- Modify: `frontend/src/features/carteira/types.ts`, `frontend/src/features/carteira/api.ts`

**Interfaces:**
- Produces:
  - Tipos: `PropostaPlano`, `PreviewItem`, `MoverPedido`, `MoverResultado`, `Movimentacao`, `Divergencia`.
  - `CarteiraApi.moverPreview(idOnrs: number[]) -> Promise<PreviewItem[]>`, `.mover(pedido: MoverPedido) -> Promise<MoverResultado>`, `.movimentacoes(idOnr?: number) -> Promise<Movimentacao[]>`, `.divergencias() -> Promise<Divergencia[]>`.

- [ ] **Step 1: Tipos**

Em `frontend/src/features/carteira/types.ts`, adicione ao final:
```typescript
export interface PropostaPlano {
  Numero_Nota: number;
  Conjunto: string;
  Local_Instalacao: string;
  Circuito: string;
  Prioridade_Nota: string;
  Planejado_DDPM: number;
  Status_Nota: string;
  Data_Envio_Projeto: string;
}

export interface PreviewItem {
  id_onr: number;
  numero_nota: string | null;
  movivel: boolean;
  motivo_bloqueio: string | null;
  proposta: PropostaPlano | null;
  avisos: string[];
}

export interface MoverPedido {
  id_onrs: number[];
  mes_execucao: string;
  status_obra?: string;
  observacao?: string;
  check?: string;
}

export interface MoverResultado {
  inseridas: number;
  lote_id: string;
}

export interface Movimentacao {
  id: number;
  id_onr: number;
  numero_nota: string;
  acao: string;
  usuario: string;
  lote_id: string;
  mes_execucao: string | null;
  status_obra: string | null;
  movido_em: string;
}

export type Divergencia = NotaCarteira & { tipo_divergencia: 'cancelada' | 'ausente_na_origem' };
```

- [ ] **Step 2: Métodos da API**

Em `frontend/src/features/carteira/api.ts`, adicione os imports no topo:
```typescript
import { getUsuario } from '../input/api';
import type {
  Divergencia, MoverPedido, MoverResultado, Movimentacao, PreviewItem,
} from './types';
```
E acrescente estes métodos dentro do objeto `CarteiraApi` exportado (mantendo os existentes `notas/detalhe/resumo/sincronizacao/sincronizar`):
```typescript
  moverPreview: (idOnrs: number[]) =>
    req<PreviewItem[]>('/mover/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_onrs: idOnrs }),
    }),
  mover: (pedido: MoverPedido) => {
    const usuario = getUsuario();
    return req<MoverResultado>('/mover-para-plano', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(usuario ? { 'X-User': usuario } : {}),
      },
      body: JSON.stringify(pedido),
    });
  },
  movimentacoes: (idOnr?: number) =>
    req<Movimentacao[]>(`/movimentacoes${idOnr ? `?id_onr=${idOnr}` : ''}`),
  divergencias: () => req<Divergencia[]>('/divergencias'),
```

- [ ] **Step 3: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/carteira/types.ts frontend/src/features/carteira/api.ts
git commit -m "feat(carteira-fe): api e tipos de movimentacao (preview/mover/movimentacoes/divergencias)"
```

---

### Task 2: Hooks de movimentação e divergências

**Files:**
- Create: `frontend/src/features/carteira/use-carteira-mover.ts`, `frontend/src/features/carteira/use-carteira-divergencias.ts`

**Interfaces:**
- Consumes: `CarteiraApi`, `INPUT_DADOS_KEY`, `MoverPedido`.
- Produces:
  - `useMoverPreview(idOnrs: number[], habilitado: boolean)` → query de `PreviewItem[]`.
  - `useMoverParaPlano()` → mutation `(MoverPedido) => MoverResultado`.
  - `useCarteiraDivergencias()` → query de `Divergencia[]`.

- [ ] **Step 1: Hooks**

Create `frontend/src/features/carteira/use-carteira-mover.ts`:
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CarteiraApi } from './api';
import { INPUT_DADOS_KEY } from '../input/use-input-data';
import type { MoverPedido } from './types';

export function useMoverPreview(idOnrs: number[], habilitado: boolean) {
  return useQuery({
    queryKey: ['carteira', 'mover-preview', idOnrs],
    queryFn: () => CarteiraApi.moverPreview(idOnrs),
    enabled: habilitado && idOnrs.length > 0,
    staleTime: 0,
  });
}

export function useMoverParaPlano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pedido: MoverPedido) => CarteiraApi.mover(pedido),
    onSuccess: (r) => {
      toast.success(`${r.inseridas} nota(s) movida(s) para o plano.`);
      void qc.invalidateQueries({ queryKey: ['carteira'] });
      void qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
    },
    onError: (e) => toast.error('Falha ao mover para o plano', {
      description: e instanceof Error ? e.message : String(e),
    }),
  });
}
```

Create `frontend/src/features/carteira/use-carteira-divergencias.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { CarteiraApi } from './api';

export function useCarteiraDivergencias() {
  return useQuery({
    queryKey: ['carteira', 'divergencias'],
    queryFn: () => CarteiraApi.divergencias(),
    staleTime: 60_000,
    retry: 1,
  });
}
```

- [ ] **Step 2: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/carteira/use-carteira-mover.ts frontend/src/features/carteira/use-carteira-divergencias.ts
git commit -m "feat(carteira-fe): hooks de mover (preview+mutation) e divergencias"
```

---

### Task 3: Seleção de linhas + barra de ação + modal de mover

**Files:**
- Create: `frontend/src/features/carteira/mover/mover-modal.tsx`
- Modify: `frontend/src/features/carteira/explorador/tabela.tsx`, `frontend/src/features/carteira/explorador/explorador.tsx`

> Task única (tabela + explorador + modal) porque a tabela passa a exigir props de seleção que só o Explorador fornece — separá-las deixaria um build intermediário quebrado.

**Interfaces:**
- Consumes: `@tanstack/react-table` row selection, `useMoverPreview`, `useMoverParaPlano`, `MesExecucaoPicker`.
- Produces:
  - `TabelaCarteira` com props `rowSelection: RowSelectionState` + `onRowSelectionChange: OnChangeFn<RowSelectionState>`; `getRowId=id_onr`; coluna de checkbox (clique no checkbox não abre o detalhe).
  - `MoverModal` (`aberto`, `idOnrs`, `onClose`, `onSucesso`).
  - Explorador com barra de ação quando há seleção.

- [ ] **Step 1: Modal de movimentação**

Create `frontend/src/features/carteira/mover/mover-modal.tsx`:
```typescript
import React from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MesExecucaoPicker } from '@/components/branded/mes-execucao-picker';
import { useMoverParaPlano, useMoverPreview } from '../use-carteira-mover';

export function MoverModal({ aberto, idOnrs, onClose, onSucesso }: {
  aberto: boolean;
  idOnrs: number[];
  onClose: () => void;
  onSucesso: () => void;
}): React.JSX.Element {
  const [mes, setMes] = React.useState('-');
  const [statusObra, setStatusObra] = React.useState('-');
  const preview = useMoverPreview(idOnrs, aberto);
  const mover = useMoverParaPlano();

  const itens = preview.data ?? [];
  const bloqueadas = itens.filter((i) => !i.movivel);
  const podeMover = itens.length > 0 && bloqueadas.length === 0
    && mes !== '-' && !mover.isPending;

  function confirmar(): void {
    mover.mutate(
      { id_onrs: idOnrs, mes_execucao: mes, status_obra: statusObra },
      { onSuccess: () => { onSucesso(); onClose(); } },
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !mover.isPending) onClose(); }}>
      <DialogContent className="edp carteira-scope w-[520px]">
        <DialogHeader>
          <DialogTitle>Mover {idOnrs.length} nota(s) para o plano</DialogTitle>
          <DialogDescription>
            Mês e status abaixo são aplicados a todas as selecionadas.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading && <span className="edp-eyebrow">Validando seleção…</span>}
        {bloqueadas.length > 0 && (
          <div className="edp-banner err">
            {bloqueadas.length} nota(s) não podem ser movidas — ajuste a seleção:
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              {bloqueadas.slice(0, 5).map((b) => (
                <li key={b.id_onr} className="edp-eyebrow" style={{ textTransform: 'none' }}>
                  {b.id_onr}: {b.motivo_bloqueio}
                </li>
              ))}
            </ul>
          </div>
        )}
        {itens.some((i) => i.avisos.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Array.from(new Set(itens.flatMap((i) => i.avisos))).slice(0, 4).map((a) => (
              <Badge key={a} variant="situFora">{a}</Badge>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="mv-mes">Mês de execução planejado</Label>
            <MesExecucaoPicker id="mv-mes" value={mes} onChange={setMes}
                               valorNeutro="-" rotuloNeutro="Escolha o mês"
                               className="edp carteira-scope" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="mv-obra">Status da obra</Label>
            <Input id="mv-obra" value={statusObra}
                   onChange={(e) => setStatusObra(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={mover.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!podeMover} onClick={confirmar}>
            {mover.isPending ? 'Movendo…' : 'Mover para o plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Seleção na tabela**

Substitua `frontend/src/features/carteira/explorador/tabela.tsx` por:
```typescript
import React from 'react';
import {
  flexRender, getCoreRowModel, useReactTable,
  type RowSelectionState, type OnChangeFn,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { colunasCarteira } from './colunas';
import type { NotaCarteira } from '../types';

export function TabelaCarteira({
  registros, total, page, size, onPagina, onAbrir,
  rowSelection, onRowSelectionChange,
}: {
  registros: NotaCarteira[];
  total: number;
  page: number;
  size: number;
  onPagina: (p: number) => void;
  onAbrir: (idOnr: number) => void;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
}): React.JSX.Element {
  const tabela = useReactTable({
    data: registros,
    columns: colunasCarteira,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    enableRowSelection: true,
    getRowId: (row) => String(row.id_onr),
    state: { rowSelection },
    onRowSelectionChange,
  });
  const ultimaPagina = Math.max(1, Math.ceil(total / size));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="carteira-table" style={{ overflowX: 'auto' }}>
        <Table>
          <TableHeader>
            {tabela.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                <TableHead style={{ width: 36 }}>
                  <input type="checkbox" aria-label="Selecionar página"
                         checked={tabela.getIsAllRowsSelected()}
                         ref={(el) => { if (el) el.indeterminate = tabela.getIsSomeRowsSelected(); }}
                         onChange={tabela.getToggleAllRowsSelectedHandler()}
                         style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </TableHead>
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
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        onClick={() => onAbrir(row.original.id_onr)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Selecionar nota ${row.original.id_onr}`}
                         checked={row.getIsSelected()}
                         onChange={row.getToggleSelectedHandler()}
                         style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </TableCell>
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

- [ ] **Step 3: Barra de ação + modal no Explorador**

Substitua `frontend/src/features/carteira/explorador/explorador.tsx` por:
```typescript
import React from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import { usePersistedState } from '../../../hooks/use-persisted-state';
import { Banner } from '@/components/branded/section';
import { Button } from '@/components/ui/button';
import { useCarteiraNotas } from '../use-carteira-notas';
import type { FiltrosCarteira } from '../types';
import { FiltrosCarteiraBar } from './filtros';
import { KpisCarteira } from './kpis';
import { TabelaCarteira } from './tabela';
import { DetalheSheet } from './detalhe-sheet';
import { MoverModal } from '../mover/mover-modal';

const SIZE = 50;

export function Explorador({ handoff }: {
  handoff?: { situacao: string; id: number } | null;
} = {}): React.JSX.Element {
  const [filtros, setFiltros] = usePersistedState<FiltrosCarteira>('edp_carteira_filtros', {});
  const [page, setPage] = React.useState(1);
  const [aberta, setAberta] = React.useState<number | null>(null);
  const [selecao, setSelecao] = React.useState<RowSelectionState>({});
  const [modalAberto, setModalAberto] = React.useState(false);

  function aplicarFiltros(f: FiltrosCarteira): void {
    setFiltros(f);
    setPage(1);
  }

  React.useEffect(() => {
    if (!handoff) return;
    setFiltros((f) => ({ ...f, situacao: handoff.situacao as FiltrosCarteira['situacao'] }));
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff?.id]);

  const { data, isLoading, error } = useCarteiraNotas({
    ...filtros, page, size: SIZE, ordenar_por: 'id_onr', ordem: 'asc',
  });

  const idsSelecionados = Object.keys(selecao).filter((k) => selecao[k]).map(Number);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <KpisCarteira />
      <FiltrosCarteiraBar filtros={filtros} onChange={aplicarFiltros} />
      {idsSelecionados.length > 0 && (
        <div className="edp-panel" style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap)', padding: '10px 14px' }}>
          <span className="edp-eyebrow">{idsSelecionados.length} selecionada(s)</span>
          <Button size="sm" style={{ marginLeft: 'auto' }} onClick={() => setModalAberto(true)}>
            Mover para o plano
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelecao({})}>Limpar</Button>
        </div>
      )}
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
            rowSelection={selecao}
            onRowSelectionChange={setSelecao}
          />
        )}
      <DetalheSheet idOnr={aberta} onClose={() => setAberta(null)} />
      <MoverModal aberto={modalAberto} idOnrs={idsSelecionados}
                  onClose={() => setModalAberto(false)}
                  onSucesso={() => setSelecao({})} />
    </div>
  );
}
```

(A prop `handoff` já é aceita aqui; ela só é passada de verdade na Task 5. Até
lá o Explorador funciona normalmente sem handoff.)

- [ ] **Step 4: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro (tabela + explorador + modal integrados).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/carteira/mover/mover-modal.tsx frontend/src/features/carteira/explorador/tabela.tsx frontend/src/features/carteira/explorador/explorador.tsx
git commit -m "feat(carteira-fe): selecao de linhas + barra de acao + modal de mover em lote"
```

---

### Task 4: Aba Divergências

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/features/carteira/subs.ts`, `frontend/src/features/carteira/carteira-section.tsx`
- Create: `frontend/src/features/carteira/divergencias/divergencias.tsx`

**Interfaces:**
- Consumes: `useCarteiraDivergencias`, `Divergencia`.
- Produces: `CarteiraSubPage` inclui `"divergencias"`; `<Divergencias />`.

- [ ] **Step 1: Subtipo + aba**

Em `frontend/src/types.ts`, altere a linha do `CarteiraSubPage`:
```typescript
export type CarteiraSubPage = "explorador" | "sincronizacao" | "divergencias";
```

Substitua `frontend/src/features/carteira/subs.ts` por:
```typescript
import type { CarteiraSubPage } from '../../types';

export const CARTEIRA_SUBS: { id: CarteiraSubPage; rotulo: string }[] = [
  { id: 'explorador', rotulo: 'Explorador' },
  { id: 'divergencias', rotulo: 'Divergências' },
  { id: 'sincronizacao', rotulo: 'Sincronização' },
];
```

- [ ] **Step 2: Componente da aba**

Create `frontend/src/features/carteira/divergencias/divergencias.tsx`:
```typescript
import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/branded/section';
import { useCarteiraDivergencias } from '../use-carteira-divergencias';

const TIPO_INFO: Record<string, { rotulo: string; variant: 'situCancel' | 'situFora' }> = {
  cancelada: { rotulo: 'Cancelada na origem', variant: 'situCancel' },
  ausente_na_origem: { rotulo: 'Ausente na origem', variant: 'situFora' },
};

export function Divergencias(): React.JSX.Element {
  const { data, isLoading, error } = useCarteiraDivergencias();
  const linhas = data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <p className="edp-sub" style={{ margin: 0 }}>
        Notas no plano que destoam da carteira — canceladas ou ausentes na origem.
        Apenas alerta; nada é alterado automaticamente.
      </p>
      {error && <Banner tipo="err">Não foi possível carregar as divergências: {error instanceof Error ? error.message : String(error)}</Banner>}
      {isLoading && !data && <span className="edp-eyebrow">Carregando…</span>}
      {!isLoading && linhas.length === 0 && (
        <Banner tipo="ok">Nenhuma divergência — plano e carteira estão coerentes.</Banner>
      )}
      {linhas.length > 0 && (
        <div className="carteira-table" style={{ overflowX: 'auto' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID SAP</TableHead><TableHead>Conjunto</TableHead>
                <TableHead>Regional</TableHead><TableHead>Divergência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((d) => {
                const info = TIPO_INFO[d.tipo_divergencia];
                return (
                  <TableRow key={d.id_onr}>
                    <TableCell>{d.id_sap ?? '—'}</TableCell>
                    <TableCell>{d.conjunto ?? '—'}</TableCell>
                    <TableCell>{d.regional ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={info.variant}>{info.rotulo}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Renderizar no shell**

Em `frontend/src/features/carteira/carteira-section.tsx`, importe o componente
(junto dos outros imports):
```typescript
import { Divergencias } from './divergencias/divergencias';
```
E troque a renderização condicional da aba por:
```tsx
      {sub === 'explorador' ? <Explorador />
        : sub === 'divergencias' ? <Divergencias />
        : <Sincronizacao />}
```

- [ ] **Step 4: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/features/carteira/subs.ts frontend/src/features/carteira/carteira-section.tsx frontend/src/features/carteira/divergencias/divergencias.tsx
git commit -m "feat(carteira-fe): aba Divergencias (cancelada/ausente na origem)"
```

---

### Task 5: Atalho dos Relatórios → Explorador filtrado

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/features/carteira/carteira-section.tsx`, `frontend/src/features/relatorios/relatorios-section.tsx`

**Interfaces:**
- Consumes: handoff via prop (padrão `filtrosHandoff` do App.tsx); `Explorador` já aceita `handoff` (Task 3).
- Produces: abrir a Carteira já filtrada por `situacao=fora_do_plano` a partir dos Relatórios.

- [ ] **Step 1: Handoff no App.tsx**

Em `frontend/src/App.tsx`, adicione estado + função junto de `irParaInputFiltrado`:
```typescript
  const [carteiraHandoff, setCarteiraHandoff] =
    React.useState<{ situacao: string; id: number } | null>(null);

  function irParaCarteiraForaDoPlano(): void {
    setCarteiraHandoff((prev) => ({ situacao: 'fora_do_plano', id: (prev?.id ?? 0) + 1 }));
    setCarteiraSub('explorador');
    changeSection('carteira');
  }
```
No ramo `section === "carteira"`, passe o handoff:
```tsx
            ) : section === "carteira" ? (
              <CarteiraSection sub={carteiraSub} setSub={setCarteiraSub}
                               handoff={carteiraHandoff} />
```
Na renderização de `RelatoriosSection`, ligue o callback:
```tsx
                onVerForaDoPlano={irParaCarteiraForaDoPlano}
```

- [ ] **Step 2: Repassar o handoff no shell da Carteira**

Em `frontend/src/features/carteira/carteira-section.tsx`, aceite a prop e
repasse ao Explorador:
```typescript
export function CarteiraSection({ sub, setSub, handoff }: {
  sub: CarteiraSubPage;
  setSub: (s: CarteiraSubPage) => void;
  handoff?: { situacao: string; id: number } | null;
}): React.JSX.Element {
```
E no ramo do Explorador: `sub === 'explorador' ? <Explorador handoff={handoff} />`.

- [ ] **Step 3: Prop e gesto no RelatoriosSection**

Leia `frontend/src/features/relatorios/relatorios-section.tsx` para localizar
onde a contagem de "fora do plano" (`useForaDoPlano`) é exibida. Adicione à
interface de props do componente:
```typescript
  onVerForaDoPlano?: () => void;
```
e ligue-a a um gesto claro no elemento de fora-do-plano — se já houver um
card/link clicável, adicione um botão "Ver na carteira" que chama
`onVerForaDoPlano?.()`; caso o handler existente aponte para outro destino,
NÃO o substitua, apenas acrescente o novo. Use `Button variant="link"` ou
`variant="outline" size="sm"` do shadcn para o gesto.

- [ ] **Step 4: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/features/carteira/carteira-section.tsx frontend/src/features/relatorios/relatorios-section.tsx
git commit -m "feat(carteira-fe): atalho Relatorios -> Explorador filtrado (fora do plano)"
```

---

### Task 6: Passo visual (Supabaze) + documentação

**Files:**
- Modify: componentes novos da Fase 2b (ajuste visual), `frontend/src/app.css` se preciso.
- Modify: `docs/dev/11-frontend-carteira.md`.

> **Conduzido no fluxo principal pela skill `frontend-design`** (regra do projeto), não por subagente. Valida com screenshot real (backend + dados reais). Garante que o `DialogContent` portalizado herda `.carteira-scope` (canvas branco), como corrigido na Fase 1b.

- [ ] **Step 1: Passe visual com frontend-design**

No fluxo principal, invoque `frontend-design` e refine as superfícies novas
(modal, barra de ação, checkboxes de seleção, aba Divergências), servindo o
app para validar visualmente com dados reais. Rode `npm run build` ao final.

- [ ] **Step 2: Documentação**

Em `docs/dev/11-frontend-carteira.md`, adicione a seção "Movimentação
(Fase 2b)": seleção de linhas (TanStack `rowSelection`, `getRowId=id_onr`),
barra de ação, `mover/mover-modal.tsx` (preview + avisos + `MesExecucaoPicker`,
all-or-nothing na UI, `DialogContent` com `.carteira-scope`), aba Divergências,
e o atalho dos Relatórios.

- [ ] **Step 3: Gate — build + servir**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro. Suba backend (`uvicorn`) + front e valide o fluxo:
selecionar notas → mover → some do `fora_do_plano`, entra em `no_plano`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/carteira frontend/src/app.css docs/dev/11-frontend-carteira.md
git commit -m "feat(carteira-fe): passe visual Supabaze da movimentacao + docs"
```

---

## Self-Review

**Spec coverage (Fase 2 frontend, §8):**
- Seleção de linhas no Explorador → Task 3. ✓
- Barra de ação → Task 3. ✓
- Modal (preview + avisos + MesExecucaoPicker, um mês p/ lote) → Tasks 1/2/3. ✓
- All-or-nothing na UI (bloqueadas desabilitam mover) → Task 3. ✓
- Aba Divergências → Tasks 1/2/4. ✓
- Atalho Relatórios → Explorador filtrado → Task 5. ✓
- Invalida INPUT_DADOS_KEY + keys da carteira ao mover → Task 2. ✓
- Visual Supabaze (Dialog portalizado com .carteira-scope) → Tasks 3/6. ✓
- Docs → Task 6. ✓
- Fora de escopo (banner Input, dashboard) → não implementado. ✓

**Placeholder scan:** sem TBD/TODO; código completo. As instruções "leia/confirme
o handler antes de editar" (Task 5 Step 3) são robustez (o arquivo de Relatórios
pode variar), não placeholders.

**Type consistency:** `PreviewItem`/`MoverPedido`/`MoverResultado`/`Divergencia`
(Task 1) usados nos hooks (Task 2), modal (Task 3) e aba (Task 4). `CarteiraApi`
métodos (Task 1) consumidos pelos hooks (Task 2). `TabelaCarteira` props
`rowSelection`/`onRowSelectionChange` e `MoverModal` (Task 3) — ambos criados e
consumidos dentro da própria Task 3 (build verde). `Explorador({handoff})`
(Task 3) recebe o handoff de verdade só na Task 5, mas já aceita a prop opcional
desde a Task 3 (compila). `CarteiraSubPage` (Task 4) usado em subs/shell.

**Sem test runner:** gate é `npm run build` (tsc); validação funcional/visual é
manual (Task 6 Step 3).
