# Input Visão Geral — Grade estilo Excel (react-datasheet-grid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tabela virtual-scroll artesanal da Visão Geral do Input por uma grade `react-datasheet-grid` com seleção de intervalo, cópia, navegação por teclado e uma barra de status que mostra soma/média/contagem da seleção — aposentando a Calculadora.

**Architecture:** Novo wrapper `input/data-grid.tsx` sobre o `DataSheetGrid` (modo **read-only**: todas as colunas `disabled`, mas selecionáveis/copiáveis). O `overview.tsx` troca `NotesTable` por `DataGrid`. Ordenação por clique no cabeçalho fica no wrapper (reaproveita `compararDatas`). A agregação vem de `onSelectionChange` via função pura `calcularSelecao` em `lib.ts`, exibida numa barra de status no rodapé da grade. A `notes-table.tsx` **continua** servindo o Gerenciar (até o Sub-B).

**Tech Stack:** React 18 + TypeScript + Vite; `react-datasheet-grid` v4.11.x (MIT); token system EDP (`tokens.css`).

## Global Constraints

- **Sem runner de testes JS no front** (confirmado: nenhum vitest/jest, nenhum script `test`). Verificação = `cd frontend && npm run build` (tsc + vite) **+ verificação manual** no app rodando. Não introduzir runner de testes (scope creep; fora do padrão do repo).
- **Não remover dependências** sem aprovação explícita (regra ponytail). Esta feature **adiciona** `react-datasheet-grid`; nenhuma outra lib sai.
- **`notes-table.tsx` NÃO é removida** nesta spec — o Gerenciar ainda usa.
- Escopo é **só a Visão Geral** (`overview.tsx`). O Gerenciar é o Sub-B.
- IDs (`Numero_Nota`, `ranking`) exibidos como inteiro **sem** separador de milhar (`formatarNumero(v, 0, false)` — já existe). Demais numéricos: 2 casas com agrupamento.
- Tema via tokens EDP; light/dark pelo seletor `.edp[data-theme]` existente.
- Fechamento de feature (regra do usuário): **auditoria ponytail** (/simplify + /code-review, sem remover libs) → **build + subir backend** → reportar.

---

### Task 1: Dependência + grade read-only na Visão Geral

**Files:**
- Modify: `frontend/package.json` (via `npm i`)
- Create: `frontend/src/input/data-grid.tsx`
- Modify: `frontend/src/input/overview.tsx:53` (troca `<NotesTable …>` por `<DataGrid …>`)

**Interfaces:**
- Produces: `DataGrid({ registros: NotaInput[]; colunas: ColunaDef[]; altura?: number }): JSX.Element` — grade read-only com seleção/cópia/teclado.
- Consumes: `formatarNumero` (lib.ts), `ColunaDef`/`COLUNAS` (columns.ts), `NotaInput`/`Celula` (types.ts).

- [ ] **Step 1: Instalar a dependência**

```bash
cd frontend && npm i react-datasheet-grid
```
Expected: `package.json` ganha `"react-datasheet-grid": "^4.11.6"`; sem erros de peer dep (React 18 é suportado).

- [ ] **Step 2: Criar `frontend/src/input/data-grid.tsx` (modo read-only)**

```tsx
import React from "react";
import { DataSheetGrid, keyColumn, type Column } from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";
import "./data-grid.css";
import type { Celula, NotaInput } from "./types";
import type { ColunaDef } from "./columns";
import { formatarNumero } from "./lib";

const ALTURA_LINHA = 32;

function textoCelula(v: Celula | undefined, c: ColunaDef): string {
  if (!c.numeric) return String(v ?? "");
  return c.key === "Numero_Nota" || c.key === "ranking"
    ? formatarNumero(v ?? null, 0, false)
    : formatarNumero(v ?? null, 2);
}

/** Célula só-leitura: exibe o valor formatado conforme a ColunaDef. */
function CelulaLeitura({ rowData, columnData }: {
  rowData: Celula | undefined;
  columnData: ColunaDef;
}): React.JSX.Element {
  const texto = textoCelula(rowData, columnData);
  return (
    <div className={"dsg-leitura" + (columnData.numeric ? " is-num" : "")} title={texto}>
      {texto}
    </div>
  );
}

function colunaLeitura(c: ColunaDef): Column<NotaInput> {
  return {
    // keyColumn liga a coluna à chave do registro; o componente recebe rowData = valor da célula.
    ...keyColumn<NotaInput, string>(c.key, {
      component: CelulaLeitura as never,
      columnData: c as never,
      disabled: true,
      // ponytail: copia o valor cru (Excel calcula em cima); o display é que é formatado.
      copyValue: ({ rowData }) => (rowData == null ? "" : String(rowData)),
    }),
    title: c.label,
    minWidth: c.largura ?? 90,
  };
}

export interface DataGridProps {
  registros: NotaInput[];
  colunas: ColunaDef[];
  altura?: number;
}

export function DataGrid({ registros, colunas, altura = 520 }: DataGridProps): React.JSX.Element {
  const cols = React.useMemo(() => colunas.map(colunaLeitura), [colunas]);
  return (
    <DataSheetGrid<NotaInput>
      value={registros}
      onChange={() => { /* read-only: todas as colunas disabled */ }}
      columns={cols}
      height={altura}
      rowHeight={ALTURA_LINHA}
      lockRows
      disableContextMenu
    />
  );
}
```

Nota de tipos: se o `tsc` reclamar das generics do `keyColumn`/`component`, tipar o componente com o tipo `CellComponent` exportado pelo DSG, ou manter o cast pontual `as never`. O Step 4 (build) revela.

- [ ] **Step 3: Criar `frontend/src/input/data-grid.css` (tema base via tokens)**

```css
/* react-datasheet-grid — tema EDP via tokens. Nomes de classe do DSG
   confirmados ao inspecionar o DOM na primeira execução; ajustar se preciso. */
.dsg-container { background: var(--surface); color: var(--text); font-family: var(--font-body); }
.dsg-cell { background: var(--surface); border-color: var(--line); color: var(--text); }
.dsg-cell-header { background: var(--surface-2); color: var(--text-dim); border-color: var(--line); }
.dsg-leitura {
  padding: 0 8px; line-height: 32px; height: 32px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 12.5px;
}
.dsg-leitura.is-num { font-family: var(--font-mono); }
```

- [ ] **Step 4: Trocar a tabela no `overview.tsx`**

Em `frontend/src/input/overview.tsx`, trocar o import e o uso:

```tsx
// import { NotesTable } from './notes-table';
import { DataGrid } from './data-grid';
```
```tsx
// <NotesTable registros={filtrados} colunas={COLUNAS} />
<DataGrid registros={filtrados} colunas={COLUNAS} />
```

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: PASS (tsc + vite sem erros). Se houver erro de tipo no `keyColumn`, ajustar conforme a nota do Step 2 e rebuildar.

- [ ] **Step 6: Verificação manual**

Subir front+back (`npm run dev` / backend já no ar) e abrir Input → Visão Geral. Confere:
- A grade mostra os registros; `Nº Nota` como inteiro sem pontos.
- Rolar a tabela é **estável** (sem tremor / sem reflow de largura) — resolve o #5.
- Arrastar seleciona um retângulo; `Ctrl+C` cola no Excel; setas/Shift+setas navegam — comportamentos nativos do DSG.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/input/data-grid.tsx frontend/src/input/data-grid.css frontend/src/input/overview.tsx
git commit -m "feat(input): Visão Geral em react-datasheet-grid (read-only, seleção/cópia/teclado)"
```

---

### Task 2: Ordenação por clique no cabeçalho

**Files:**
- Modify: `frontend/src/input/data-grid.tsx`

**Interfaces:**
- Consumes: `compararDatas` (lib.ts).
- Produces: estado de ordenação interno ao `DataGrid`; cabeçalho clicável com indicador ↑/↓.

- [ ] **Step 1: Reaproveitar o comparador e ordenar no wrapper**

Em `data-grid.tsx`, importar `compararDatas` e adicionar estado/ordenação (mesma lógica da `notes-table.tsx`):

```tsx
import { compararDatas, formatarNumero } from "./lib";
```
```tsx
type Ordem = { campo: string; asc: boolean };

function ordenar(registros: NotaInput[], ordem: Ordem | null): NotaInput[] {
  if (!ordem) return registros;
  const fator = ordem.asc ? 1 : -1;
  const copia = [...registros];
  if (ordem.campo === "Mes_Execucao_Planejado") {
    copia.sort((a, b) => fator * compararDatas(a[ordem.campo] ?? null, b[ordem.campo] ?? null));
  } else {
    copia.sort((a, b) => {
      const va = a[ordem.campo]; const vb = b[ordem.campo];
      const na = Number(va); const nb = Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb)) return fator * (na - nb);
      return fator * String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR");
    });
  }
  return copia;
}
```

- [ ] **Step 2: Cabeçalho clicável (title como ReactNode)**

Mudar `colunaLeitura` para receber a ordem atual + handler e renderizar um cabeçalho clicável:

```tsx
function colunaLeitura(c: ColunaDef, ordem: Ordem | null, alternar: (campo: string) => void): Column<NotaInput> {
  const ativa = ordem?.campo === c.key;
  return {
    ...keyColumn<NotaInput, string>(c.key, {
      component: CelulaLeitura as never,
      columnData: c as never,
      disabled: true,
      copyValue: ({ rowData }) => (rowData == null ? "" : String(rowData)),
    }),
    title: (
      <button type="button" className="dsg-th" onClick={() => alternar(c.key)}
              title="Ordenar">
        {c.label}{ativa ? (ordem!.asc ? " ↑" : " ↓") : ""}
      </button>
    ),
    minWidth: c.largura ?? 90,
  };
}
```

- [ ] **Step 3: Ligar ordem no componente `DataGrid`**

```tsx
export function DataGrid({ registros, colunas, altura = 520 }: DataGridProps): React.JSX.Element {
  const [ordem, setOrdem] = React.useState<Ordem | null>(null);
  const alternar = React.useCallback((campo: string) => {
    setOrdem((o) => (o && o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: true }));
  }, []);
  const ordenados = React.useMemo(() => ordenar(registros, ordem), [registros, ordem]);
  const cols = React.useMemo(
    () => colunas.map((c) => colunaLeitura(c, ordem, alternar)),
    [colunas, ordem, alternar],
  );
  return (
    <DataSheetGrid<NotaInput>
      value={ordenados}
      onChange={() => { /* read-only */ }}
      columns={cols}
      height={altura}
      rowHeight={ALTURA_LINHA}
      lockRows
      disableContextMenu
    />
  );
}
```

- [ ] **Step 4: Estilo do cabeçalho-botão**

Em `data-grid.css`:
```css
.dsg-th {
  all: unset; cursor: pointer; width: 100%; height: 100%;
  display: flex; align-items: center; padding: 0 8px;
  font-size: 11.5px; font-weight: 600; color: var(--text-dim);
}
.dsg-th:hover { color: var(--text); }
```

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 6: Verificação manual**

Na Visão Geral: clicar num cabeçalho ordena asc; clicar de novo inverte (↑/↓); `Mês Execução` ordena cronologicamente. Verificar que clicar no cabeçalho não dispara seleção de célula estranha (se houver conflito com resize, anotar `// ponytail:` e seguir).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/input/data-grid.tsx frontend/src/input/data-grid.css
git commit -m "feat(input): ordenação por clique no cabeçalho na grade da Visão Geral"
```

---

### Task 3: Barra de status com agregação da seleção

**Files:**
- Modify: `frontend/src/input/lib.ts` (adiciona `calcularSelecao` + tipo `ResumoSelecao`)
- Modify: `frontend/src/input/data-grid.tsx` (wire `onSelectionChange` + barra)
- Modify: `frontend/src/input/data-grid.css` (estilo da barra)

**Interfaces:**
- Produces: `calcularSelecao(registros: NotaInput[], colunas: ColunaDef[], sel: SelecaoRetangulo | null): ResumoSelecao | null` onde `SelecaoRetangulo = { min: { col: number; row: number }; max: { col: number; row: number } }` e `ResumoSelecao = { soma: number; media: number; contagem: number }`.
- Consumes: `formatarNumero`.

- [ ] **Step 1: Adicionar `calcularSelecao` em `lib.ts`**

No topo, importar `ColunaDef` (sem ciclo: `columns.ts` não importa `lib.ts`):
```ts
import type { ColunaDef } from './columns';
```
No fim do arquivo:
```ts
export interface SelecaoRetangulo {
  min: { col: number; row: number };
  max: { col: number; row: number };
}
export interface ResumoSelecao { soma: number; media: number; contagem: number; }

/** Agrega as células NUMÉRICAS do retângulo selecionado (estilo Excel). */
export function calcularSelecao(
  registros: NotaInput[],
  colunas: ColunaDef[],
  sel: SelecaoRetangulo | null,
): ResumoSelecao | null {
  if (!sel) return null;
  const nums: number[] = [];
  for (let r = sel.min.row; r <= sel.max.row; r++) {
    const reg = registros[r];
    if (!reg) continue;
    for (let ci = sel.min.col; ci <= sel.max.col; ci++) {
      const col = colunas[ci];
      if (!col || !col.numeric) continue;
      const bruto = reg[col.key];
      if (bruto === null || bruto === undefined || bruto === '') continue;
      const n = Number(bruto);
      if (Number.isFinite(n)) nums.push(n);
    }
  }
  if (nums.length === 0) return { soma: 0, media: 0, contagem: 0 };
  const soma = nums.reduce((a, b) => a + b, 0);
  return { soma, media: soma / nums.length, contagem: nums.length };
}
```

- [ ] **Step 2: Ligar `onSelectionChange` e renderizar a barra**

Em `data-grid.tsx`, importar e usar:
```tsx
import { calcularSelecao, compararDatas, formatarNumero, type ResumoSelecao, type SelecaoRetangulo } from "./lib";
```
Dentro de `DataGrid`:
```tsx
const [resumo, setResumo] = React.useState<ResumoSelecao | null>(null);
const aoSelecionar = React.useCallback(
  (opts: { selection: SelecaoRetangulo | null }) =>
    setResumo(calcularSelecao(ordenados, colunas, opts.selection)),
  [ordenados, colunas],
);
```
Envolver o grid + barra:
```tsx
return (
  <div className="dsg-wrap">
    <DataSheetGrid<NotaInput>
      value={ordenados}
      onChange={() => { /* read-only */ }}
      columns={cols}
      height={altura}
      rowHeight={ALTURA_LINHA}
      lockRows
      disableContextMenu
      onSelectionChange={aoSelecionar}
    />
    <div className="dsg-statusbar">
      {resumo && resumo.contagem > 0 ? (
        <span>
          Soma <b className="edp-mono">{formatarNumero(resumo.soma)}</b> ·{" "}
          Média <b className="edp-mono">{formatarNumero(resumo.media)}</b> ·{" "}
          Contagem <b className="edp-mono">{resumo.contagem}</b>
        </span>
      ) : (
        <span className="dsg-statusbar-dim">Selecione células numéricas para ver soma · média · contagem</span>
      )}
    </div>
  </div>
);
```
Nota: o nome exato do prop é `onSelectionChange` e o argumento é `{ selection: { min, max } | null }` (confirmado na doc de props). Se a assinatura divergir no `.d.ts` instalado, ajustar o tipo de `opts` conforme o `.d.ts` (o build acusa).

- [ ] **Step 3: Estilo da barra**

Em `data-grid.css`:
```css
.dsg-wrap { display: flex; flex-direction: column; }
.dsg-statusbar {
  flex-shrink: 0; padding: 5px 10px; font-size: 12px; color: var(--text-dim);
  background: var(--surface-2); border: 1px solid var(--line); border-top: 0;
  border-radius: 0 0 8px 8px;
}
.dsg-statusbar b { color: var(--text); font-weight: 600; }
.dsg-statusbar-dim { color: var(--text-mute); }
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 5: Verificação manual**

Selecionar um intervalo de células numéricas (ex.: coluna `Total Real Ordem`): a barra mostra Soma/Média/Contagem corretas. Selecionar células de texto → barra mostra o estado neutro. Comparar a Soma com a soma manual de 2-3 valores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/input/lib.ts frontend/src/input/data-grid.tsx frontend/src/input/data-grid.css
git commit -m "feat(input): barra de status com soma/média/contagem da seleção (estilo Excel)"
```

---

### Task 4: Remover a Calculadora (limpeza ponytail)

**Files:**
- Modify: `frontend/src/input/filters.tsx` (remove botão + painel + `calcColunas`)
- Modify: `frontend/src/input/lib.ts` (remove `calcular` + `ResultadoCalculo`)
- Modify: `frontend/src/input/columns.ts` (remove `COLUNAS_CALCULAVEIS` se sem uso)

**Interfaces:**
- `FiltersState` perde o campo `calcColunas`. Quem cria `FILTROS_INICIAIS` (overview.tsx, manage.tsx) não muda de chamada — só o shape interno encolhe.

- [ ] **Step 1: Tirar a Calculadora de `filters.tsx`**

- Remover de `FiltersState` o campo `calcColunas: string[]` e do `FILTROS_INICIAIS` a chave `calcColunas: []`.
- Remover `const [calcAberta, setCalcAberta] = React.useState(false);` e o `const resultados = …`.
- Remover o `<Button … onClick={() => setCalcAberta(!calcAberta)}>📊 Calculadora</Button>`.
- Remover o bloco inteiro `{calcAberta && ( … )}` (painel de resultados).
- Remover os imports agora órfãos: `calcular`, `ResultadoCalculo`, `COLUNAS_CALCULAVEIS`, `formatarNumero` (se não usado em outro ponto de filters), e `FILTROS_FAIXA`/etc. **não** — manter os que os filtros usam. Conferir compilação no Step 4.

- [ ] **Step 2: Remover `calcular` e `ResultadoCalculo` de `lib.ts`**

Apagar:
```ts
export interface ResultadoCalculo { coluna: string; soma: number; media: number; contagem: number; }
export function calcular(registros: NotaInput[], colunas: string[]): ResultadoCalculo[] { … }
```
(`calcularSelecao` continua.)

- [ ] **Step 3: Remover `COLUNAS_CALCULAVEIS` de `columns.ts` se órfão**

Run: `cd frontend && npx rg -n "COLUNAS_CALCULAVEIS|ResultadoCalculo|calcular\(" src`
Expected: nenhum uso restante (fora da própria definição). Então apagar a const `COLUNAS_CALCULAVEIS` de `columns.ts`.

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: PASS, sem imports/variáveis não usados (o tsc do projeto reclama de unused).

- [ ] **Step 5: Verificação manual**

Visão Geral e Gerenciar: o botão "📊 Calculadora" sumiu; os Filtros avançados continuam funcionando; a Visão Geral usa a barra de status; o Gerenciar segue sem Calculadora (consequência conhecida do Sub-A).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/input/filters.tsx frontend/src/input/lib.ts frontend/src/input/columns.ts
git commit -m "refactor(input): remover Calculadora (substituída pela barra de status da seleção)"
```

---

### Task 5: Tema light/dark + auditoria ponytail + build/serve

**Files:**
- Modify: `frontend/src/input/data-grid.css` (overrides do DSG nos 2 temas)
- Possível: `frontend/src/tokens.css` (só se precisar de token novo)

- [ ] **Step 1: Inspecionar as classes reais do DSG**

Com o app aberto (DevTools), confirmar os nomes das classes do `react-datasheet-grid` (container, célula, célula ativa, borda de seleção, cabeçalho). Ajustar os seletores do `data-grid.css` para os nomes reais.

- [ ] **Step 2: Mapear o DSG aos tokens (seleção + ativo + bordas), nos 2 temas**

Completar `data-grid.css` (exemplo; usar as classes confirmadas no Step 1):
```css
/* fundo/linhas/texto já cobertos na Task 1; aqui: célula ativa e borda da seleção */
.dsg-cell-active { box-shadow: inset 0 0 0 2px var(--accent); }
.dsg-selection-rect, .dsg-selection { border-color: var(--accent); background: var(--accent-tint); }
/* O seletor .edp[data-theme="light"] já troca os tokens, então o tema claro
   herda automaticamente. Validar contraste da grade no claro. */
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 4: Verificação manual — light e dark**

Alternar tema (Configurações): a grade, o cabeçalho, a borda de seleção e a barra de status ficam legíveis e coerentes com o resto do app nos **dois** temas. A scrollbar (corrigida no #4) aparece sobre a grade.

- [ ] **Step 5: Auditoria ponytail**

Rodar `/simplify` e `/code-review` sobre o diff do Sub-A. Aplicar limpezas de boilerplate/dead-code; anotar tradeoffs aceitos com `// ponytail:`. **Não remover nenhuma dependência** (incl. `react-datasheet-grid`); se a auditoria sugerir remoção de lib, **listar e perguntar antes**.

- [ ] **Step 6: Build + subir backend (definition of done)**

```bash
cd frontend && npm run build
```
Subir o backend (`../.venv/Scripts/uvicorn.exe main:app` em `backend/`, ou confirmar o já no ar respondendo em `/api/data`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/input/data-grid.css
git commit -m "style(input): tema light/dark da grade DSG + auditoria do Sub-A"
```

---

## Notas de execução

- **Ordem das tasks importa:** 1 → 2 → 3 entregam a feature incrementalmente (cada uma verificável). A 4 (remoção) só depois que a barra de status (Task 3) substituiu a função da Calculadora. A 5 fecha com tema + auditoria + build/serve.
- **Riscos conhecidos (resolver no build/manual):** generics do `keyColumn` (cast `as never` se preciso); nomes exatos das classes CSS do DSG (Step 1 da Task 5); assinatura exata de `onSelectionChange` no `.d.ts` instalado.
