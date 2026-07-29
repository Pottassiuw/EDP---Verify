# Relatórios · Plano de Recomposição Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the six high-fidelity Relatórios screens from the handoff with one shared filter model, live dashboard data, and an accessible plan inspector.

**Architecture:** Keep all view state inside `features/relatorios/`. A single `useRelatoriosData` adapter combines the existing dashboard endpoint with one cached dashboard query per regional, then exposes typed, derived records to every page. Coverage candidate notes are intentionally represented as unavailable until the backend provides plan-level COFFEE matching; the UI must make that limitation visible instead of fabricating coverage.

**Tech Stack:** React 18, TypeScript, React Query, Vite, Tailwind v4 tokens from `app.css`, shadcn/ui, Lucide, Sonner.

## Global Constraints

- Preserve the existing EDP dark/light token system; use token-backed Tailwind utilities only, never raw palette classes or literal hex values.
- Reuse `PageHeader`, `SegTabs`, `StatTile`, shadcn `Sheet`, `Select`, `Button`, `Checkbox`, and `Tooltip`; do not modify `components/ui`.
- Keep the six report pages in `features/relatorios/`; do not add a global reports store or a new dependency.
- Filters for reference month, regional, and search are global across report pages; region and month drill-downs update that same state.
- Treat COFFEE coverage as unavailable per plan with the current API. Never claim a note is eligible, move it automatically, or show mock coverage amounts.
- Keep every interactive row keyboard reachable and activate it with Enter or Space.

---

### Task 1: Report routing and persistent page selection

**Files:**
- Create: `frontend/src/features/relatorios/navigation.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/app-sidebar.tsx`

**Interfaces:**
- Produces `RelatoriosPage`, `RELATORIOS_TABS`, and `normalizeRelatoriosPage(value)`.
- Extends `RelatoriosSection` props with `page` and `setPage` so sidebar and `SegTabs` use the same source of truth.

- [ ] **Step 1: Add the page union and normalizer**

```ts
export type RelatoriosPage =
  | 'dashboard' | 'regional' | 'mensalizacao'
  | 'financeiro' | 'postergacoes' | 'exportar';

export function normalizeRelatoriosPage(value: string): RelatoriosPage {
  return RELATORIOS_TABS.some((tab) => tab.id === value) ? value as RelatoriosPage : 'dashboard';
}
```

- [ ] **Step 2: Persist `edp_relatorios_page` in `AppContent` and pass it to both `AppSidebar` and `RelatoriosSection`.**

- [ ] **Step 3: Render the six report entries as a collapsible Reports submenu in `AppSidebar`; selecting an entry activates `relatorios` and that page.**

- [ ] **Step 4: Run `cd frontend && npm run build`; expected result: TypeScript accepts the new shared props and the existing app still bundles.**

### Task 2: Typed data adapter and pure report derivations

**Files:**
- Create: `frontend/src/features/relatorios/use-relatorios-data.ts`
- Modify: `frontend/src/features/relatorios/types.ts`
- Modify: `frontend/src/features/relatorios/use-dashboard.ts`

**Interfaces:**
- Consumes `DashboardRelatorios`, `useDashboardRelatorios`, `useForaDoPlano`, and `InputApi.dashboardRelatorios`.
- Produces `RelatoriosViewData` with `planos`, `regionais`, `mensalizacao`, `financeiro`, `cobertura`, and `filtrarPlanos`.

- [ ] **Step 1: Define derived plan records without `any`.**

```ts
export interface PlanoRelatorio extends LinhaAnual {
  id: string;
  regional: string;
  deficit: number;
  gapFinanceiro: number;
  statusCobertura: 'meta-atendida' | 'sem-dados-coffee';
}
```

- [ ] **Step 2: Fetch the selected dashboard plus one cached `dashboardRelatorios(regional)` query per available regional using `useQueries`.**

- [ ] **Step 3: Export pure helpers that calculate `deficit = max(-saldo, 0)`, positive financial gap, per-area summaries, sort order, and search matching.**

- [ ] **Step 4: Map postergadas only where the current API reports them; use `null` for months without a reported postergation value.**

- [ ] **Step 5: Run `cd frontend && npm run build`; expected result: every derived selector is typed and no API contract is widened in the frontend.**

### Task 3: Shared filters, visual primitives, and plan inspector

**Files:**
- Create: `frontend/src/features/relatorios/filtros-globais.tsx`
- Create: `frontend/src/features/relatorios/relatorios-ui.tsx`
- Create: `frontend/src/features/relatorios/plano-inspector.tsx`
- Modify: `frontend/src/features/relatorios/fmt.ts`

**Interfaces:**
- `FiltrosGlobais` consumes/updates `{ mes, regional, busca }`.
- `DisponibilidadeChip`, `MetaCarteiraBar`, `RelatoriosPanel`, and `LinhaAcionavel` centralize repeated token-backed markup.
- `PlanoInspector` consumes `PlanoRelatorio | null` and open/close callbacks.

- [ ] **Step 1: Implement the global Month, Regional, Search, scope-chip, and clear controls with shadcn `Select`/`Input`.**

- [ ] **Step 2: Implement static semantic class maps for green, amber, red, blue, and neutral states; dynamic bar fill may set only a percentage custom value.**

- [ ] **Step 3: Build the 470px right `Sheet` with plan summary, existing portfolio amount, explicit COFFEE-unavailable callout, and review/view/open actions.**

- [ ] **Step 4: Run `cd frontend && npm run build`; manually verify Escape and overlay close the sheet and all controls show a green focus ring.**

### Task 4: Dashboard Geral

**Files:**
- Create: `frontend/src/features/relatorios/dashboard/resumo-decisao.tsx`
- Create: `frontend/src/features/relatorios/dashboard/acoes-criticas.tsx`
- Create: `frontend/src/features/relatorios/dashboard/saldo-regional-resumo.tsx`
- Create: `frontend/src/features/relatorios/dashboard/detalhamento-carteira.tsx`
- Modify: `frontend/src/features/relatorios/relatorios-section.tsx`

**Interfaces:**
- Consumes `RelatoriosViewData`, global filter callbacks, `PlanoRelatorio`, and `PlanoInspector` selection.
- Produces the Dashboard page in the handoff order: decision strip, critical actions, regional summary, grouped detail.

- [ ] **Step 1: Render the three decision cards using the real selected-scope values; calculate total deficit as the sum of plan deficits, separately from net balance.**

- [ ] **Step 2: Render the critical-actions table in `gapFinanceiro desc`, availability asc, deficit desc order; every row opens the inspector.**

- [ ] **Step 3: Render regional progress rows that select/toggle the global regional filter.**

- [ ] **Step 4: Render grouped, collapsible detail with sticky header, sort control, and optional Postergado/R$ gap columns.**

- [ ] **Step 5: Run `cd frontend && npm run build`; manually verify each dashboard ordering and state-empty behavior with a search that returns no plans.**

### Task 5: Regional and Mensalização pages

**Files:**
- Create: `frontend/src/features/relatorios/regional/regional-kpis.tsx`
- Create: `frontend/src/features/relatorios/regional/regional-ranking.tsx`
- Create: `frontend/src/features/relatorios/regional/regional-matriz.tsx`
- Create: `frontend/src/features/relatorios/mensalizacao/mensalizacao-chart.tsx`
- Create: `frontend/src/features/relatorios/mensalizacao/mensalizacao-tabela.tsx`

**Interfaces:**
- Consumes per-regional dashboard responses from `RelatoriosViewData` and the monthly series.
- Produces regional drill-down and reference-month selection callbacks.

- [ ] **Step 1: Render four regional KPI tiles, the availability-sorted ranking, and the regional-by-area matrix using dash cells where the scope has no area meta.**

- [ ] **Step 2: Render the 12-month paired meta/carteira bars with executed segment and optional postergation marker; clicking a month changes the shared reference.**

- [ ] **Step 3: Render the monthly detail table with a textual situation beside every availability chip.**

- [ ] **Step 4: Run `cd frontend && npm run build`; manually verify regional and month clicks update the shared controls.**

### Task 6: Financeiro, Postergações, and Exportar pages

**Files:**
- Create: `frontend/src/features/relatorios/financeiro/financeiro-kpis.tsx`
- Create: `frontend/src/features/relatorios/financeiro/financeiro-areas.tsx`
- Create: `frontend/src/features/relatorios/financeiro/financeiro-top-gap.tsx`
- Create: `frontend/src/features/relatorios/financeiro/financeiro-regionais.tsx`
- Create: `frontend/src/features/relatorios/postergacoes/postergacoes-kpis.tsx`
- Create: `frontend/src/features/relatorios/postergacoes/postergacoes-tabela.tsx`
- Create: `frontend/src/features/relatorios/postergacoes/postergacoes-por-mes.tsx`
- Create: `frontend/src/features/relatorios/exportar/exportar-form.tsx`
- Create: `frontend/src/features/relatorios/exportar/exportar-historico.tsx`

**Interfaces:**
- Reuse the typed adapter only; do not create unsupported report-export API calls.
- The export UI exposes selected blocks and format, but reports the missing server contract honestly when generation is requested.

- [ ] **Step 1: Render exact annual financial totals from `financeiro_ano`, area/top-gap summaries derived from rows, and per-regional rows from regional queries.**

- [ ] **Step 2: Render postergation cards and rows from the reported annual postergation fields; show unavailable values where destination/reincidence data is absent.**

- [ ] **Step 3: Render export scope, block toggles, format radios, recent history placeholder, and an informational toast explaining that the server endpoint is the remaining dependency.**

- [ ] **Step 4: Run `cd frontend && npm run build`; manually verify no page advertises invented COFFEE coverage or a completed server export.**

### Task 7: Integration, review, and documentation

**Files:**
- Modify: `frontend/src/features/relatorios/relatorios-section.tsx`
- Modify: `docs/dev/06-backend-input-module.md` only if the data contract description must explicitly record the frontend coverage limitation.

**Interfaces:**
- `RelatoriosSection` is the single shell that renders `PageHeader`, `SegTabs`, `FiltrosGlobais`, the selected page, and `PlanoInspector`.

- [ ] **Step 1: Remove superseded one-page components from the section imports without deleting reusable files until the new pages compile.**

- [ ] **Step 2: Perform a no-raw-palette scan.**

```powershell
rg -n "(?:bg|text|border)-(?:slate|gray|zinc|emerald|blue|amber|red)-" frontend/src/features/relatorios
```

Expected: no matches.

- [ ] **Step 3: Run `cd frontend && npm run build` and start `npm run dev -- --host 127.0.0.1` for visual inspection of all six tabs, filters, row drill-downs, and narrow layouts.**

- [ ] **Step 4: Review `git diff --check`, remove unused imports/dead old components, then commit the implementation.**
