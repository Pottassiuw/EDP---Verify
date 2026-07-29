# Carteira de Notas — Fase 4a (Frontend: convergência) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. REQUIRED: invoque a skill `frontend-design` para o passe visual (regra do projeto: toda mudança de front usa direção visual intencional).

**Goal:** Repointar os Relatórios para consumir `/api/carteira/dashboard` (agora superset) e **substituir os placeholders "cobertura não confirmável" por cobertura/base disponível reais**; migrar o dashboard da Carteira de `por_plano`/`por_regional` para `visao_anual`/`regionais` **sem regressão visual/numérica**.

**Architecture:** o backend (plano `2026-07-29-carteira-fase-4a-backend.md`) já entrega o superset. No front: (1) os types do dashboard convergem para um contrato único (base fundida em `visao_anual`/`regionais`); (2) `CarteiraApi.dashboard` passa a devolvê-lo; (3) o dashboard da Carteira lê `visao_anual` (filtrando `meta>0`) em vez de `por_plano`; (4) os hooks de Relatórios trocam `InputApi.dashboardRelatorios` por `CarteiraApi.dashboard`; (5) as telas de Relatórios exibem a camada base. Endpoint do Input segue vivo (compat), mas Relatórios não o usa mais.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, React Query, Recharts, shadcn.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-29-carteira-fase-4a-convergencia-relatorios-design.md`. **Pré-requisito:** backend 4a mergeado (superset no ar).
- **Zero-regressão do dashboard da Carteira (Fase 3b):** a validação visual da Fase 3b é o gabarito. Migrar de `por_plano`→`visao_anual` é troca de **fonte**, não de regra — os números e o visual devem ficar idênticos.
- **Mapeamento de campos** (`por_plano` → linha de `visao_anual` com `meta>0`):
  `planejado` → `carteira`; `gap` → `meta - carteira`; `base_disponivel`/`cobertura_pct`/`suficiente` → mesmos nomes. `por_regional` → `regionais` (mesmo mapeamento; regional usa `carteira`, não `planejado`).
- **Filtro meta>0:** `por_plano` já vinha filtrado no backend; `visao_anual` traz todas as linhas → o dashboard da Carteira aplica `.filter((l) => l.meta > 0)` para reproduzir `por_plano`.
- **CLAUDE.md:** sem `any` (campos base como opcionais tipados); componentes só renderizam; imports ordenados; sem cor arbitrária (tokens/farol existentes); docs na mesma entrega. Fora do escopo: NÃO fabricar Postergações-destino, Exportar-pacote nem "notas candidatas" (limites de outros contratos — manter a limitação honesta que já existe).
- **Comandos (de `frontend/`):** `npm run build` (tsc -b + vite), `npx vitest run`.

---

## File Structure

- `frontend/src/features/relatorios/types.ts` — `LinhaAnual`/`RegionalResumo`/`DashboardRelatorios` + campos base opcionais.
- `frontend/src/features/carteira/types.ts` — `DashboardCarteira` = superset.
- `frontend/src/features/carteira/dashboard/{dashboard,distribuicao,heatmap,kpis-dashboard}.tsx` — migração `por_plano`→`visao_anual`.
- `frontend/src/features/relatorios/{use-dashboard,use-relatorios-data}.ts` — repoint.
- `frontend/src/features/relatorios/dashboard/*`, `plano-inspector.tsx`, `regional/*` — camada base nas telas.
- `docs/dev/09-frontend-relatorios.md`, `docs/dev/11-frontend-carteira.md`.

---

### Task 1: Types — contrato único (base em visao_anual/regionais)

**Files:**
- Modify: `frontend/src/features/relatorios/types.ts`
- Modify: `frontend/src/features/carteira/types.ts`

- [ ] **Step 1: Estender os types de Relatórios**

Em `relatorios/types.ts`, adicione os campos base como **opcionais** (build resiliente antes do backend; sem `any`):
```ts
export interface LinhaAnual {
  // …campos atuais…
  base_disponivel?: number;
  cobertura_pct?: number | null;
  suficiente?: boolean;
}

export interface RegionalResumo {
  // …campos atuais…
  base_disponivel?: number;
  cobertura_pct?: number | null;
}
```
E, em `DashboardRelatorios`, os extras que o superset carrega (Relatórios ignora, mas o type reflete a resposta):
```ts
export interface DashboardRelatorios {
  // …campos atuais…
  base_por_plano_sem_meta?: LinhaBaseSemMeta[];
  versao?: string;
}
```
Importe/defina `LinhaBaseSemMeta` (pode reusar o de `carteira/types.ts` ou mover para cá — ver Step 2).

- [ ] **Step 2: `DashboardCarteira` = superset**

Em `carteira/types.ts`, o dashboard da Carteira passa a ser o superset. Reuse o contrato de Relatórios (fonte única):
```ts
import type { DashboardRelatorios } from '../relatorios/types';

export type DashboardCarteira = DashboardRelatorios & {
  base_por_plano_sem_meta: LinhaBaseSemMeta[];
  versao: string;
};
```
Remova `LinhaPlano`/`LinhaRegional` **se** nada mais os usar (o dashboard passa a ler `LinhaAnual`/`RegionalResumo`). Mantenha `LinhaBaseSemMeta`. Ajuste o import onde estava `DashboardCarteira`.

> Coupling `carteira → relatorios` (type) é intencional: um único endpoint, um único contrato (evita duplicar o shape — CLAUDE.md).

- [ ] **Step 3: Type-check**

Run (de `frontend/`): `npm run build`
Expected: pode falhar nos componentes que ainda usam `por_plano`/`planejado`/`gap` — corrigidos nas Tasks 3. Confirme que os **types** compilam isoladamente (os erros restantes são só nos consumidores).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/relatorios/types.ts frontend/src/features/carteira/types.ts
git commit -m "feat(carteira-fe): contrato unico do dashboard (base em visao_anual/regionais)"
```

---

### Task 2: `CarteiraApi.dashboard` → superset

**Files:**
- Modify: `frontend/src/features/carteira/api.ts`

- [ ] **Step 1: Ajustar o generic da resposta**

Em `carteira/api.ts`, `dashboard` já retorna `req<DashboardCarteira>(...)`. Com o `DashboardCarteira` = superset (Task 1), nada mais muda na assinatura. Confirme o path (`/dashboard`) e os params (`ano?`, `mes?`, `regional?`) inalterados.

- [ ] **Step 2: Commit (se houve ajuste)**

```bash
git add frontend/src/features/carteira/api.ts
git commit -m "chore(carteira-fe): dashboard api aponta para o contrato superset"
```

---

### Task 3: Migrar o dashboard da Carteira (`por_plano`→`visao_anual`)

**Files:**
- Modify: `frontend/src/features/carteira/dashboard/{dashboard,distribuicao,heatmap,kpis-dashboard}.tsx`

**Interfaces:** os componentes passam a receber `LinhaAnual[]` (filtrado `meta>0`) e `RegionalResumo[]`.

- [ ] **Step 1: `dashboard.tsx` — derivar as listas do superset**

Substitua o consumo de `data.por_plano`/`data.por_regional`:
```tsx
const planosComMeta = data.visao_anual.filter((l) => l.meta > 0);
// …
<HeatmapCobertura porRegional={data.regionais} onDrill={drillRegional} />
<DistribuicaoPlano linhas={planosComMeta} onDrill={drillPlano} />
<DistribuicaoRegional linhas={data.regionais} onDrill={drillRegional} />
```
`base_por_plano_sem_meta` continua igual.

- [ ] **Step 2: `distribuicao.tsx` — renomear campos**

Troque as props para `LinhaAnual`/`RegionalResumo` e os acessos:
- `l.planejado` → `l.carteira`
- `l.gap` → `l.meta - l.carteira`
- `l.base_disponivel`/`l.cobertura_pct`/`l.suficiente` → inalterados (agora opcionais: use `l.base_disponivel ?? 0`, `l.cobertura_pct ?? null`).

- [ ] **Step 3: `heatmap.tsx` — `RegionalResumo`**

`r.cobertura_pct` → `r.cobertura_pct ?? null`; tipo da prop `porRegional: RegionalResumo[]`. Atualize o comentário do topo (não fala mais em `por_regional`).

- [ ] **Step 4: `kpis-dashboard.tsx` — reduzir sobre `visao_anual` (meta>0)**

```tsx
const planos = dados.visao_anual.filter((l) => l.meta > 0);
const metaTotal = planos.reduce((s, p) => s + p.meta, 0);
const planejado = planos.reduce((s, p) => s + p.carteira, 0);
const base = planos.reduce((s, p) => s + (p.base_disponivel ?? 0), 0);
```

- [ ] **Step 5: Build + paridade visual**

Run (de `frontend/`): `npm run build` → verde.
Suba o backend (superset) e a carteira sincronizada; abra o dashboard da Carteira e confira contra o gabarito da Fase 3b: KPIs, distribuições, heatmap e drill-down **idênticos**. Registre a conferência.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/carteira/dashboard/
git commit -m "refactor(carteira-fe): dashboard le visao_anual/regionais (fonte unica), sem regressao"
```

---

### Task 4: Repointar os hooks de Relatórios → `CarteiraApi.dashboard`

**Files:**
- Modify: `frontend/src/features/relatorios/use-dashboard.ts`
- Modify: `frontend/src/features/relatorios/use-relatorios-data.ts`

- [ ] **Step 1: Trocar a fonte**

Nos dois hooks, importe `CarteiraApi` (`import { CarteiraApi } from '../carteira/api';`) e substitua:
- `use-dashboard.ts`: `queryFn: () => CarteiraApi.dashboard({ regional: regional ?? undefined })`.
- `use-relatorios-data.ts` (fan-out): `queryFn: () => CarteiraApi.dashboard({ regional })`.

O restante (`criarPlanosRelatorio`, ordenação, `useRelatoriosData`, fan-out por regional) **não muda** — o contrato é superset, os campos que já usavam continuam presentes. `regionais_disponiveis`/`hero`/`visao_anual`/`mensalizacao`/`financeiro_ano`/`metas_info` idênticos ao endpoint do Input.

- [ ] **Step 2: Regras de dados intactas (vitest)**

Run (de `frontend/`): `npx vitest run`
Expected: `relatorios-data.test.ts` PASS (4/4) — `criarPlanosRelatorio`/déficit/ordenação não dependem da fonte, só do shape.

- [ ] **Step 3: Build**

Run (de `frontend/`): `npm run build` → verde.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/relatorios/use-dashboard.ts frontend/src/features/relatorios/use-relatorios-data.ts
git commit -m "feat(relatorios): dashboard deriva da carteira (fonte unica /api/carteira/dashboard)"
```

---

### Task 5: Camada base nas telas de Relatórios (cobertura real)

**Files:**
- Modify: telas em `frontend/src/features/relatorios/dashboard/*`, `plano-inspector.tsx`, `regional/*` (conforme onde aparece "cobertura não confirmável" / colunas de plano).

**Objetivo:** trocar placeholders por dado real da camada base; sem telas novas.

- [ ] **Step 1: Localizar os placeholders**

Run (de `frontend/src`): busque `cobertura não confirmável` / `não confirmável` / `cobertura` nos componentes de Relatórios e liste os pontos a substituir.

- [ ] **Step 2: Substituir por cobertura/base reais**

Onde havia "não confirmável", usar `linha.cobertura_pct` (com `fmt.farol`/`FAROL_COR`) e exibir `linha.base_disponivel` (coluna/rótulo "Base disponível"); badge `suficiente` quando aplicável. Regional: usar `regional.cobertura_pct`/`base_disponivel`. Guardas de nulo: `?? null`/`?? 0` (carteira sem sync ⇒ base 0, cobertura só do planejado — degradação graciosa, sem inventar número).

- [ ] **Step 3: Drill-down (opcional, se couber no esforço)**

Clicar um plano/regional abre o Explorador da Carteira filtrado (situação=fora_do_plano + regional/conjunto), reusando o handoff da Carteira. Se o handoff não aceitar filtro composto, estender no molde do drill-down do dashboard da Carteira (Fase 3b). Se não couber, deixar explicitamente como follow-up (não deixar meio-feito).

- [ ] **Step 4: Passe visual (skill frontend-design)**

Invoque `frontend-design`; alinhe farol/tokens ao restante dos Relatórios; sem cor arbitrária.

- [ ] **Step 5: Build + vitest verdes**

Run (de `frontend/`): `npm run build` e `npx vitest run` → verdes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/relatorios/
git commit -m "feat(relatorios): cobertura e base disponivel reais (camada carteira) nas telas"
```

---

### Task 6: Documentação + verificação final

**Files:**
- Modify: `docs/dev/09-frontend-relatorios.md`, `docs/dev/11-frontend-carteira.md`

- [ ] **Step 1: Atualizar docs**

- `09-frontend-relatorios.md`: remover/ajustar a seção "Limites expostos" no que se refere a **cobertura** (agora deriva da carteira via `/api/carteira/dashboard`); manter os limites reais que continuam (Postergações-destino, Exportar-pacote). Registrar que a fonte do dashboard passou a ser `CarteiraApi.dashboard`.
- `11-frontend-carteira.md`: registrar que o dashboard da Carteira lê `visao_anual`/`regionais` do contrato superset (fonte única compartilhada com Relatórios).

- [ ] **Step 2: Verificação final**

Run (de `frontend/`): `npm run build` e `npx vitest run` → verdes.
Suba o backend e valide manualmente: (a) dashboard da Carteira idêntico à Fase 3b; (b) Relatórios com cobertura/base reais; (c) carteira sem sync ⇒ Relatórios com base 0, sem erro.

- [ ] **Step 3: Commit**

```bash
git add docs/dev/09-frontend-relatorios.md docs/dev/11-frontend-carteira.md
git commit -m "docs: Relatorios deriva da carteira; dashboard da Carteira le contrato superset (Fase 4a)"
```

---

## Self-Review

**Spec coverage (Fase 4a frontend, §5):**
- Contrato único (base em `visao_anual`/`regionais`) → Task 1. ✓
- `CarteiraApi.dashboard` = superset → Task 2. ✓
- Dashboard da Carteira migrado sem regressão (`por_plano`→`visao_anual` meta>0) → Task 3. ✓
- Hooks de Relatórios repontados p/ a carteira → Task 4. ✓
- Cobertura/base reais nas telas (fim de "não confirmável") + drill-down opcional → Task 5. ✓
- Docs 09/11 → Task 6. ✓
- Fora de escopo (Postergações-destino, Exportar-pacote, notas candidatas) → **não** fabricado. ✓

**Zero-regressão:** dashboard da Carteira validado contra gabarito 3b (Task 3 Step 5); `relatorios-data.test.ts` verde (Task 4 Step 2); degradação graciosa com carteira vazia (Task 5 Step 2, Task 6 Step 2).

**Type consistency:** campos base opcionais em `LinhaAnual`/`RegionalResumo` (Task 1) → lidos com `?? 0`/`?? null` nos componentes (Tasks 3, 5). `DashboardCarteira = DashboardRelatorios & {...}` (Task 1) devolvido por `CarteiraApi.dashboard` (Task 2), consumido por `useCarteiraDashboard` (Carteira) e pelos hooks de Relatórios (Task 4). Sem `any`.

**Ordem de execução:** requer o backend 4a no ar (superset). Tasks 1→2→3 (Carteira, isolável) podem ir antes de 4→5 (Relatórios). Task 6 fecha.
