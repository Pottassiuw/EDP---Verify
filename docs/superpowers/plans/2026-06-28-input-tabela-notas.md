# Input — Tabela de notas (cabeçalho fixo + shadcn + Ordem SAP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o cabeçalho fixo da tabela de notas do Input, restilizá-la com o primitivo shadcn `Table` e destacar a coluna **Ordem SAP**, sem perder a virtualização nem nenhum comportamento atual.

**Architecture:** Sub-projeto A do overhaul do Input. A causa-raiz do cabeçalho que "desce" é a `<table>` virtualizada com `transform: translateY(...)` — um ancestral transformado quebra `position: sticky`. A correção troca o `transform` por **linhas-espaçadoras** (spacers) no `<tbody>`, deixando o `<thead>` grudar no topo via `position: sticky` + `box-shadow`. A tabela passa a usar um primitivo shadcn `Table` (wrappers finos de `<table>`/`<thead>`/…), mantendo o container de scroll/virtualização próprios.

**Tech Stack:** React 18 + TypeScript + Vite; shadcn (forwardRef + `cn` de `@/lib/utils`). Sem test runner no frontend → check = `cd frontend && npm run build` (`tsc -b && vite build`) + verificação manual.

## Global Constraints

- **Sem backend, sem rota nova, sem dependência nova.** `Ordem` já é servida por `GET /api/input/notas`. (spec §Não-objetivos)
- **Só estes três arquivos:** `frontend/src/components/ui/table.tsx` (novo), `frontend/src/input/notes-table.tsx`, `frontend/src/input/columns.ts`. Não tocar em `manage.tsx`, sidebar, navegação. (spec §Escopo)
- "ID SAP" do Input = a coluna **`Ordem`** existente, relabelada **"Ordem SAP"**, logo após `Numero_Nota`. Não é o `id_sap` do COFFEE.
- Virtualização **preservada** (só a fatia visível renderiza); a altura renderizada de cada linha **tem que ser exatamente** `ALTURA_LINHA` (32px) ou o cálculo dos spacers desalinha.
- Comportamento preservado: ordenação por clique, edição por duplo clique (input/select, Enter/Escape/blur), seleção por checkbox, `formatarNumero`, truncamento por `ellipsis`.
- shadcn no estilo do repo: `React.forwardRef`, `import { cn } from '@/lib/utils'`, `import * as React from 'react'`.
- Check de cada task: `cd frontend && npm run build` sem erros + verificação manual no dev server.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `frontend/src/components/ui/table.tsx` — **novo**. Primitivo shadcn `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`. Igual ao shadcn padrão, **menos** o `<div className="relative w-full overflow-auto">` que o `Table` embute (o container de scroll é da `notes-table`, por causa da virtualização).
- `frontend/src/input/columns.ts` — a entrada de `Ordem` vira `label: 'Ordem SAP'`, `largura: 120`, e sobe para logo após `Numero_Nota`.
- `frontend/src/input/notes-table.tsx` — reescrita: virtualização por spacers (corrige sticky) + render com o primitivo shadcn. Mantém estado/lógica de ordenação, edição e seleção.

---

### Task 1: Ordem SAP em destaque + primitivo shadcn `Table`

**Files:**
- Modify: `frontend/src/input/columns.ts`
- Create: `frontend/src/components/ui/table.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils` (existente); `ColunaDef` (existente).
- Produces: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (exports de `components/ui/table.tsx`); `COLUNAS` com `Ordem` (label "Ordem SAP") na 2ª posição. Consumido pela Task 2.

- [ ] **Step 1: Reposicionar e relabelar `Ordem` em `columns.ts`**

Em `frontend/src/input/columns.ts`, **remover** a linha atual de `Ordem` (hoje entre `Status_Sistema` e `Total_planejado_ordem`):

```ts
  { key: 'Ordem', label: 'Ordem' },
```

E **inserir** a versão destacada logo após a linha de `Numero_Nota` (que é a 2ª entrada do array `COLUNAS`):

```ts
  { key: 'Numero_Nota', label: 'Nº Nota (ID)', numeric: true, largura: 110 },
  { key: 'Ordem', label: 'Ordem SAP', largura: 120 },
  { key: 'Status_Obra', label: 'Status Obra', editavel: true },
```

(Não mudar mais nada no `COLUNAS`; as demais entradas seguem na ordem atual, agora sem o `Ordem` lá embaixo.)

- [ ] **Step 2: Criar o primitivo shadcn `Table`**

Criar `frontend/src/components/ui/table.tsx` com:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  ),
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  ),
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
  ),
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-9 px-2.5 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0', className)} {...props} />
  ),
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-2.5 align-middle [&:has([role=checkbox])]:pr-0', className)} {...props} />
  ),
);
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros (o primitivo ainda não é usado; a coluna Ordem SAP já passa a render na tabela atual).

- [ ] **Step 4: Verificação manual**

Run: `cd frontend && npm run dev` (backend rodando). Na seção Input → Gerenciar:
- A coluna **Ordem SAP** aparece como 2ª coluna (logo após Nº Nota), com os valores do SAP.
- A antiga coluna "Ordem" lá no fim sumiu (virou a Ordem SAP no início).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/input/columns.ts frontend/src/components/ui/table.tsx
git commit -m "feat(ui): Ordem SAP em destaque na tabela + primitivo shadcn Table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Reescrever `notes-table.tsx` (sticky por spacers + shadcn)

**Files:**
- Modify: `frontend/src/input/notes-table.tsx`

**Interfaces:**
- Consumes: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (Task 1); `Celula`/`NotaInput` (`./types`), `ColunaDef` (`./columns`), `compararDatas`/`formatarNumero` (`./lib`).
- Produces: `NotesTable` com a mesma assinatura de props (`NotesTableProps` inalterada) e mesmo comportamento, agora com cabeçalho fixo e visual shadcn.

- [ ] **Step 1: Substituir o arquivo inteiro**

Substituir todo o conteúdo de `frontend/src/input/notes-table.tsx` por:

```tsx
import React from "react";
import type { Celula, NotaInput } from "./types";
import type { ColunaDef } from "./columns";
import { compararDatas, formatarNumero } from "./lib";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const ALTURA_LINHA = 32;

export interface NotesTableProps {
  registros: NotaInput[];
  colunas: ColunaDef[];
  altura?: number;
  /** Seleção por checkbox (edição em lote / exclusão). Ausente = sem coluna de seleção. */
  selecionados?: Set<number>;
  onToggleSelecionado?: (numero: number) => void;
  onToggleTodos?: (numeros: number[], marcar: boolean) => void;
  /** Edições pendentes (sobrepõem o valor exibido). Presente = células editáveis. */
  edicoes?: Map<number, Partial<NotaInput>>;
  onEditar?: (numero: number, campo: string, valor: Celula) => void;
  statusOpcoes?: string[];
  prioridadeOpcoes?: string[];
}

interface CelulaEditando {
  numero: number;
  campo: string;
}

const HEADER_STICKY: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "var(--surface)",
  boxShadow: "inset 0 -1px 0 var(--line)",
};

export function NotesTable(props: NotesTableProps): React.JSX.Element {
  const {
    registros,
    colunas,
    altura = 520,
    selecionados,
    onToggleSelecionado,
    edicoes,
    onEditar,
    statusOpcoes = [],
    prioridadeOpcoes = [],
  } = props;
  const [scrollTop, setScrollTop] = React.useState(0);
  const [ordem, setOrdem] = React.useState<{
    campo: string;
    asc: boolean;
  } | null>(null);
  const [editando, setEditando] = React.useState<CelulaEditando | null>(null);

  const ordenados = React.useMemo(() => {
    if (!ordem) return registros;
    const fator = ordem.asc ? 1 : -1;
    const copia = [...registros];
    if (ordem.campo === "Mes_Execucao_Planejado") {
      copia.sort(
        (a, b) =>
          fator * compararDatas(a[ordem.campo] ?? null, b[ordem.campo] ?? null),
      );
    } else {
      copia.sort((a, b) => {
        const va = a[ordem.campo];
        const vb = b[ordem.campo];
        const na = Number(va);
        const nb = Number(vb);
        if (Number.isFinite(na) && Number.isFinite(nb))
          return fator * (na - nb);
        return (
          fator * String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR")
        );
      });
    }
    return copia;
  }, [registros, ordem]);

  const inicio = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - 5);
  const qtdVisiveis = Math.ceil(altura / ALTURA_LINHA) + 10;
  const fatia = ordenados.slice(inicio, inicio + qtdVisiveis);
  const espacoTopo = inicio * ALTURA_LINHA;
  const espacoFundo = Math.max(
    0,
    (ordenados.length - inicio - fatia.length) * ALTURA_LINHA,
  );
  const totalColunas = colunas.length + (selecionados ? 1 : 0);

  function valor(r: NotaInput, campo: string): Celula {
    const pendente = edicoes?.get(r.Numero_Nota);
    if (pendente && campo in pendente) return pendente[campo] ?? null;
    return r[campo] ?? null;
  }

  function cabecalho(c: ColunaDef): React.JSX.Element {
    const ativa = ordem?.campo === c.key;
    return (
      <TableHead
        key={c.key}
        onClick={() =>
          setOrdem({ campo: c.key, asc: ativa ? !ordem!.asc : true })
        }
        style={{
          ...HEADER_STICKY,
          cursor: "pointer",
          whiteSpace: "nowrap",
          minWidth: c.largura ?? 90,
          color: ativa ? "var(--accent)" : undefined,
        }}
      >
        {c.label}
        {ativa ? (ordem!.asc ? " ↑" : " ↓") : ""}
      </TableHead>
    );
  }

  function celula(r: NotaInput, c: ColunaDef): React.JSX.Element {
    const v = valor(r, c.key);
    const editavel = Boolean(onEditar && c.editavel);
    const emEdicao =
      editando && editando.numero === r.Numero_Nota && editando.campo === c.key;
    const alterada = Boolean(
      edicoes?.get(r.Numero_Nota) &&
      c.key in (edicoes.get(r.Numero_Nota) ?? {}),
    );

    if (emEdicao && onEditar) {
      const confirmar = (novo: string): void => {
        onEditar(r.Numero_Nota, c.key, novo);
        setEditando(null);
      };
      const opcoes =
        c.opcoes === "status"
          ? statusOpcoes
          : c.opcoes === "prioridade"
            ? prioridadeOpcoes
            : null;
      return (
        <TableCell key={c.key} style={{ padding: 0, height: ALTURA_LINHA }}>
          {opcoes ? (
            <select
              autoFocus
              defaultValue={String(v ?? "")}
              onChange={(e) => confirmar(e.target.value)}
              onBlur={() => setEditando(null)}
              style={{ width: "100%", height: ALTURA_LINHA - 4 }}
            >
              {opcoes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              defaultValue={String(v ?? "")}
              onBlur={(e) => confirmar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  confirmar((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditando(null);
              }}
              style={{
                width: "100%",
                height: ALTURA_LINHA - 4,
                boxSizing: "border-box",
              }}
            />
          )}
        </TableCell>
      );
    }
    return (
      <TableCell
        key={c.key}
        title={editavel ? "Duplo clique para editar" : undefined}
        onDoubleClick={
          editavel
            ? () => setEditando({ numero: r.Numero_Nota, campo: c.key })
            : undefined
        }
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 320,
          height: ALTURA_LINHA,
          fontSize: 12.5,
          cursor: editavel ? "cell" : "default",
          color: alterada ? "var(--accent)" : undefined,
          fontWeight: alterada ? 600 : undefined,
        }}
      >
        {c.numeric
          ? formatarNumero(
              v,
              c.key === "Numero_Nota" || c.key === "ranking" ? 0 : 2,
            )
          : String(v ?? "")}
      </TableCell>
    );
  }

  const numerosFatia = fatia.map((r) => r.Numero_Nota);
  return (
    <div
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{
        height: altura,
        overflow: "auto",
        border: "1px solid var(--line)",
        borderRadius: 8,
      }}
    >
      <Table style={{ borderCollapse: "collapse" }}>
        <TableHeader>
          <TableRow>
            {selecionados && (
              <TableHead style={{ ...HEADER_STICKY, width: 36, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={
                    numerosFatia.length > 0 &&
                    numerosFatia.every((n) => selecionados.has(n))
                  }
                  onChange={(e) =>
                    props.onToggleTodos?.(numerosFatia, e.target.checked)
                  }
                />
              </TableHead>
            )}
            {colunas.map(cabecalho)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {espacoTopo > 0 && (
            <tr style={{ height: espacoTopo }}>
              <td colSpan={totalColunas} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
          {fatia.map((r) => (
            <TableRow
              key={r.Numero_Nota}
              style={{
                background: selecionados?.has(r.Numero_Nota)
                  ? "var(--accent-tint)"
                  : undefined,
              }}
            >
              {selecionados && (
                <TableCell style={{ textAlign: "center", height: ALTURA_LINHA }}>
                  <input
                    type="checkbox"
                    checked={selecionados.has(r.Numero_Nota)}
                    onChange={() => onToggleSelecionado?.(r.Numero_Nota)}
                  />
                </TableCell>
              )}
              {colunas.map((c) => celula(r, c))}
            </TableRow>
          ))}
          {espacoFundo > 0 && (
            <tr style={{ height: espacoFundo }}>
              <td colSpan={totalColunas} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros. Conferir que não sobrou referência a `transform`/`translateY` nem ao `<div>` interno de altura calculada (foram removidos).

- [ ] **Step 3: Verificação manual (o ponto central)**

Run: `cd frontend && npm run dev` (backend rodando). Na seção Input → Gerenciar:
1. **Rolar a tabela → o cabeçalho gruda no topo** (não desce mais junto com o scroll). Este é o critério principal.
2. Ordenar clicando num cabeçalho (seta ↑/↓ e destaque accent), inclusive em **Ordem SAP**.
3. Modo "Edição Rápida": duplo clique numa célula editável → input/select; Enter salva, Escape cancela; célula alterada fica accent/negrito.
4. Modos "Edição em Lote"/"Exclusão": coluna de checkbox aparece; "marcar todos" da fatia funciona; linha marcada com fundo accent-tint.
5. Rolagem fluida com a base cheia (só a fatia renderiza); sem "saltos" na rolagem (altura de linha = 32px batendo com os spacers).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/input/notes-table.tsx
git commit -m "fix(ui): tabela de notas — cabecalho fixo (spacers no lugar do transform) + shadcn Table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Cabeçalho fixo de verdade (causa-raiz: `transform` quebra `sticky`) → Task 2 (spacers + `position: sticky` + box-shadow). ✓
- Ordem SAP destacada logo após Nº Nota → Task 1 (columns.ts). ✓
- Tabela com primitivo shadcn `Table` → Task 1 (cria `ui/table.tsx`) + Task 2 (usa). ✓
- Virtualização preservada, linha = 32px → Task 2 (`fatia`/spacers, `height: ALTURA_LINHA` nas células). ✓
- Comportamento preservado (ordenação, edição, seleção, formatarNumero, ellipsis) → Task 2 (lógica idêntica à original). ✓
- Sem backend, sem dep nova, só 3 arquivos → respeitado nas duas tasks. ✓

**Placeholder scan:** sem TBD/TODO; Task 1 e Task 2 têm o código completo; comandos com saída esperada.

**Type consistency:** `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` exportados na Task 1 e importados com os mesmos nomes na Task 2. `NotesTableProps` mantém a assinatura usada por `manage.tsx` (não alterado). `ALTURA_LINHA`/`HEADER_STICKY` internos da Task 2. `Ordem`/"Ordem SAP" coerentes entre columns.ts (Task 1) e o render (Task 2 usa `colunas` genérico, sem hardcode). ✓
