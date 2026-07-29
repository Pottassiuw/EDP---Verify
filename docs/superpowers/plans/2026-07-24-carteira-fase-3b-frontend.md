# Carteira de Notas — Fase 3b (Frontend Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba **Dashboard** na seção Carteira (landing): KPIs com farol de cobertura, evolução mensal/acumulada, distribuições por plano/regional, heatmap regional×plano e drill-down para o Explorador — consumindo `GET /api/carteira/dashboard` da Fase 3a.

**Architecture:** Nova sub-aba `dashboard` em `features/carteira/`, reusando os padrões visuais existentes (StatTile, Recharts via `ui/chart`, farol/`fmt` dos Relatórios) sob `.carteira-scope`. Drill-down é **interno à seção** (dashboard → troca para a aba Explorador com filtro), coordenado por `carteira-section.tsx` — **não** toca `App.tsx`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, React Query, Recharts, shadcn, Lucide.

## ⚠️ Pré-requisito de coordenação

O frontend tem um **refactor de coffee em progresso, não-commitado** (do usuário) que modifica `frontend/src/types.ts` e `frontend/src/App.tsx`. Este plano só toca **um** arquivo compartilhado: `frontend/src/types.ts` (adiciona `"dashboard"` a `CarteiraSubPage`, Task 5). Antes de executar a Task 5, o WIP de coffee em `types.ts` **deve estar commitado/stashed** — senão o commit da Task 5 empacota as mudanças de coffee do usuário junto. Tasks 1–4 e 6 não tocam arquivos do usuário.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-23-carteira-fase-3-dashboard-design.md`. Backend Fase 3a pronto: `GET /api/carteira/dashboard?ano=&mes=&regional=`.
- **Payload do dashboard:** `{hero, mensalizacao:[{mes,meta,carteira,executado}], por_plano:[{plano,nome_curto,area,meta,planejado,base_disponivel,gap,cobertura_pct,suficiente}], por_regional:[{regional,meta,planejado,base_disponivel,gap,cobertura_pct}], base_por_plano_sem_meta:[{plano,nome_curto,area,base_disponivel}], regionais_disponiveis, versao}`.
- **Sem test runner:** gate de cada task = `npm run build` (de `frontend/`; ~90s, tsc + vite). Sem erro de tipo.
- **Reuso visual:** `StatTile`/`PageHeader` (branded), `ui/chart` (Recharts wrapper), farol dos Relatórios (`features/relatorios/fmt`: `farol()`, `FAROL_COR`, `fmtQtd`, `fmtPct`, `MESES_ABREV_PT`).
- **CLAUDE.md:** feature-first; componentes `<200` linhas (lógica em hooks); sem `any`; React Query; tokens `app.css` (nunca cor arbitrária); imports ordenados.
- **Visual:** Supabaze (`.carteira-scope`); gráficos com tokens (`var(--accent)`, `var(--green-2)`…).
- **Fora de escopo:** filtros salvos, command palette (Fase 3b-plus futura).

---

## File Structure

- `frontend/src/features/carteira/types.ts` — tipos do dashboard.
- `frontend/src/features/carteira/api.ts` — `CarteiraApi.dashboard`.
- `frontend/src/features/carteira/use-carteira-dashboard.ts` — hook.
- `frontend/src/features/carteira/dashboard/kpis-dashboard.tsx` — KPIs + farol.
- `frontend/src/features/carteira/dashboard/evolucao.tsx` — evolução mensal/acumulada (Recharts).
- `frontend/src/features/carteira/dashboard/distribuicao.tsx` — tabela por plano/regional com farol.
- `frontend/src/features/carteira/dashboard/heatmap.tsx` — heatmap regional×plano (CSS grid).
- `frontend/src/features/carteira/dashboard/dashboard.tsx` — composição da aba + drill-down.
- `frontend/src/features/carteira/subs.ts` — aba `dashboard` (primeira).
- `frontend/src/types.ts` — `CarteiraSubPage += "dashboard"` (**compartilhado**).
- `frontend/src/features/carteira/carteira-section.tsx` — renderiza a aba + coordena drill-down.
- `docs/dev/11-frontend-carteira.md`.

---

### Task 1: API + tipos + hook do dashboard

**Files:**
- Modify: `frontend/src/features/carteira/types.ts`, `frontend/src/features/carteira/api.ts`
- Create: `frontend/src/features/carteira/use-carteira-dashboard.ts`

**Interfaces:**
- Produces: tipos `DashboardCarteira`, `LinhaPlano`, `LinhaRegional`, `MesMensalizacao`, `LinhaBaseSemMeta`; `CarteiraApi.dashboard(ano?,mes?,regional?) -> Promise<DashboardCarteira>`; `useCarteiraDashboard(mes?,regional?) -> UseQueryResult<DashboardCarteira>`.

- [ ] **Step 1: Tipos**

Em `frontend/src/features/carteira/types.ts`, adicione ao final:
```typescript
export interface MesMensalizacao {
  mes: number;
  meta: number;
  carteira: number;
  executado: number;
}

export interface LinhaPlano {
  plano: string;
  nome_curto: string | null;
  area: string | null;
  meta: number;
  planejado: number;
  base_disponivel: number;
  gap: number;
  cobertura_pct: number | null;
  suficiente: boolean;
}

export interface LinhaRegional {
  regional: string;
  meta: number;
  planejado: number;
  base_disponivel: number;
  gap: number;
  cobertura_pct: number | null;
}

export interface LinhaBaseSemMeta {
  plano: string;
  nome_curto: string | null;
  area: string | null;
  base_disponivel: number;
}

export interface DashboardCarteira {
  hero: { meta: number; carteira: number; executado: number };
  mensalizacao: MesMensalizacao[];
  por_plano: LinhaPlano[];
  por_regional: LinhaRegional[];
  base_por_plano_sem_meta: LinhaBaseSemMeta[];
  regionais_disponiveis: string[];
  versao: string;
}
```

- [ ] **Step 2: Método da API**

Em `frontend/src/features/carteira/api.ts`, importe o tipo e adicione o método
ao objeto `CarteiraApi` (mantendo os existentes):
```typescript
import type { DashboardCarteira } from './types';
```
```typescript
  dashboard: (params: { ano?: number; mes?: number; regional?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.ano) sp.set('ano', String(params.ano));
    if (params.mes) sp.set('mes', String(params.mes));
    if (params.regional) sp.set('regional', params.regional);
    const qs = sp.toString();
    return req<DashboardCarteira>(`/dashboard${qs ? `?${qs}` : ''}`);
  },
```

- [ ] **Step 3: Hook**

Create `frontend/src/features/carteira/use-carteira-dashboard.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { CarteiraApi } from './api';

export function useCarteiraDashboard(mes?: number, regional?: string) {
  return useQuery({
    queryKey: ['carteira', 'dashboard', mes ?? null, regional ?? null],
    queryFn: () => CarteiraApi.dashboard({ mes, regional }),
    staleTime: 60_000,
    retry: 1,
  });
}
```

- [ ] **Step 4: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/carteira/types.ts frontend/src/features/carteira/api.ts frontend/src/features/carteira/use-carteira-dashboard.ts
git commit -m "feat(carteira-fe): api, tipos e hook do dashboard"
```

---

### Task 2: KPIs do dashboard (com farol)

**Files:**
- Create: `frontend/src/features/carteira/dashboard/kpis-dashboard.tsx`

**Interfaces:**
- Consumes: `DashboardCarteira`, `StatTile`, farol dos Relatórios.
- Produces: `<KpisDashboard dados={DashboardCarteira} />`.

- [ ] **Step 1: Implementar KPIs**

Create `frontend/src/features/carteira/dashboard/kpis-dashboard.tsx`:
```typescript
import React from 'react';
import { StatTile } from '@/components/branded/section';
import { farol, FAROL_COR, fmtQtd, fmtPct } from '../../relatorios/fmt';
import type { DashboardCarteira } from '../types';

export function KpisDashboard({ dados }: { dados: DashboardCarteira }): React.JSX.Element {
  const metaTotal = dados.por_plano.reduce((s, p) => s + p.meta, 0);
  const planejado = dados.por_plano.reduce((s, p) => s + p.planejado, 0);
  const base = dados.por_plano.reduce((s, p) => s + p.base_disponivel, 0);
  const gap = Math.max(0, metaTotal - planejado);
  const cobertura = metaTotal === 0 ? null : (planejado + base) / metaTotal;
  const cor = cobertura === null ? undefined : FAROL_COR[farol(cobertura)];

  return (
    <div style={{ display: 'flex', gap: 'var(--gap)', flexWrap: 'wrap' }}>
      <StatTile label="Meta (planos)" value={fmtQtd(metaTotal)} />
      <StatTile label="Planejado" value={fmtQtd(planejado)} />
      <StatTile label="Base disponível" value={fmtQtd(base)} />
      <StatTile label="Gap" value={fmtQtd(gap)} />
      <StatTile label="Cobertura"
                value={<span style={{ color: cor }}>{cobertura === null ? '—' : fmtPct(cobertura)}</span>} />
    </div>
  );
}
```

Nota: confirme os nomes reais exportados por `features/relatorios/fmt.ts`
(`farol`, `FAROL_COR`, `fmtQtd`, `fmtPct`). Se algum diferir, ajuste o import
lendo o arquivo antes.

- [ ] **Step 2: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/carteira/dashboard/kpis-dashboard.tsx
git commit -m "feat(carteira-fe): KPIs do dashboard com farol de cobertura"
```

---

### Task 3: Evolução mensal e acumulada (Recharts)

**Files:**
- Create: `frontend/src/features/carteira/dashboard/evolucao.tsx`

**Interfaces:**
- Consumes: `MesMensalizacao[]`, `ui/chart` (ChartContainer/ChartTooltip/ChartLegend), Recharts, `MESES_ABREV_PT` dos Relatórios.
- Produces: `<Evolucao meses={MesMensalizacao[]} />` (barras mensais meta/planejado/executado + linha acumulada de executado).

- [ ] **Step 1: Implementar o gráfico**

Leia primeiro `frontend/src/features/relatorios/mensalizacao-chart.tsx` para
espelhar a API do `ChartContainer`/`ChartConfig` já usada no projeto. Depois
crie `frontend/src/features/carteira/dashboard/evolucao.tsx` seguindo esse
padrão: um `BarChart` com séries `meta`, `carteira` (planejado) e `executado`
por mês (eixo X = `MESES_ABREV_PT`), e uma série de **executado acumulado**
(soma corrente) como `Line` no mesmo `ComposedChart`. Use cores por token
via `ChartConfig` (`var(--accent)`, `var(--green-2)`, `var(--blue)`), como em
`mensalizacao-chart.tsx`. Envolva em `ChartContainer` com `ChartTooltip`/
`ChartLegend`. Título "Evolução mensal (meta × planejado × executado)".

O componente calcula o acumulado no cliente:
```typescript
let acc = 0;
const dados = meses.map((m) => { acc += m.executado; return { ...m, acumulado: acc }; });
```

- [ ] **Step 2: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro. Se `ui/chart` exportar nomes diferentes, confirme
lendo `frontend/src/components/ui/chart.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/carteira/dashboard/evolucao.tsx
git commit -m "feat(carteira-fe): evolucao mensal e acumulada (Recharts)"
```

---

### Task 4: Distribuição (por plano/regional) + heatmap

**Files:**
- Create: `frontend/src/features/carteira/dashboard/distribuicao.tsx`, `frontend/src/features/carteira/dashboard/heatmap.tsx`

**Interfaces:**
- Consumes: `LinhaPlano[]`/`LinhaRegional[]`, farol, `Table`, `Badge`.
- Produces:
  - `<DistribuicaoPlano linhas={LinhaPlano[]} onDrill={(plano)=>void} />` e
    `<DistribuicaoRegional linhas={LinhaRegional[]} onDrill={(regional)=>void} />`.
  - `<HeatmapCobertura porPlano={LinhaPlano[]} porRegional={LinhaRegional[]} onDrill={(plano,regional)=>void} />` — grade CSS regional×plano colorida por cobertura (farol).

- [ ] **Step 1: Distribuição (tabela com farol + drill)**

Create `frontend/src/features/carteira/dashboard/distribuicao.tsx`:
```typescript
import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { farol, FAROL_COR, fmtQtd, fmtPct } from '../../relatorios/fmt';
import type { LinhaPlano, LinhaRegional } from '../types';

function corCobertura(pct: number | null): string | undefined {
  return pct === null ? undefined : FAROL_COR[farol(pct)];
}

export function DistribuicaoPlano({ linhas, onDrill }: {
  linhas: LinhaPlano[];
  onDrill: (plano: string) => void;
}): React.JSX.Element {
  return (
    <div className="carteira-table" style={{ overflowX: 'auto' }}>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Plano</TableHead><TableHead>Meta</TableHead>
          <TableHead>Planejado</TableHead><TableHead>Base</TableHead>
          <TableHead>Gap</TableHead><TableHead>Cobertura</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.plano} className="cursor-pointer"
                      onClick={() => onDrill(l.plano)}>
              <TableCell>{l.nome_curto ?? l.plano}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.meta)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.planejado)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.base_disponivel)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.gap)}</TableCell>
              <TableCell className="num-cell" style={{ color: corCobertura(l.cobertura_pct) }}>
                {l.cobertura_pct === null ? '—' : fmtPct(l.cobertura_pct)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DistribuicaoRegional({ linhas, onDrill }: {
  linhas: LinhaRegional[];
  onDrill: (regional: string) => void;
}): React.JSX.Element {
  return (
    <div className="carteira-table" style={{ overflowX: 'auto' }}>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Regional</TableHead><TableHead>Meta</TableHead>
          <TableHead>Planejado</TableHead><TableHead>Base</TableHead>
          <TableHead>Cobertura</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.regional} className="cursor-pointer"
                      onClick={() => onDrill(l.regional)}>
              <TableCell>{l.regional}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.meta)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.planejado)}</TableCell>
              <TableCell className="num-cell">{fmtQtd(l.base_disponivel)}</TableCell>
              <TableCell className="num-cell" style={{ color: corCobertura(l.cobertura_pct) }}>
                {l.cobertura_pct === null ? '—' : fmtPct(l.cobertura_pct)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Heatmap (CSS grid regional×plano)**

Create `frontend/src/features/carteira/dashboard/heatmap.tsx`. O heatmap mostra
a cobertura por regional (linhas) × plano (colunas), colorida pelo farol. Como
o payload traz `por_plano` e `por_regional` agregados (não a matriz completa),
o MVP colore por **cobertura da regional** replicada por plano visível apenas
como grade de regionais × os planos com meta; a célula usa a cobertura da
regional (dado disponível) — documente essa simplificação. Estrutura:
```typescript
import React from 'react';
import { farol, FAROL_COR, fmtPct } from '../../relatorios/fmt';
import type { LinhaPlano, LinhaRegional } from '../types';

export function HeatmapCobertura({ porRegional, onDrill }: {
  porRegional: LinhaRegional[];
  onDrill: (regional: string) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${porRegional.length}, 1fr)`, gap: 6 }}>
      {porRegional.map((r) => {
        const cor = r.cobertura_pct === null ? 'var(--surface-2)' : FAROL_COR[farol(r.cobertura_pct)];
        return (
          <button key={r.regional} onClick={() => onDrill(r.regional)}
                  className="edp-panel" style={{ borderLeft: `3px solid ${cor}`, cursor: 'pointer', textAlign: 'left' }}>
            <span className="edp-eyebrow">{r.regional}</span>
            <div className="edp-num" style={{ fontSize: 20, color: cor }}>
              {r.cobertura_pct === null ? '—' : fmtPct(r.cobertura_pct)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

> Nota: a matriz completa regional×plano exigiria o backend devolver a grade
> cruzada; o MVP usa a cobertura por regional. Se a engenharia quiser a matriz
> real, é uma extensão do `dashboard.py` (agrupar base + meta por
> regional×plano) — registrar como follow-up, não implementar agora.

- [ ] **Step 3: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/carteira/dashboard/distribuicao.tsx frontend/src/features/carteira/dashboard/heatmap.tsx
git commit -m "feat(carteira-fe): distribuicao por plano/regional + heatmap de cobertura"
```

---

### Task 5: Aba Dashboard (composição + wiring + drill-down interno)

**Files:**
- Create: `frontend/src/features/carteira/dashboard/dashboard.tsx`
- Modify: `frontend/src/types.ts` (**compartilhado** — ver pré-requisito), `frontend/src/features/carteira/subs.ts`, `frontend/src/features/carteira/carteira-section.tsx`

**Interfaces:**
- Consumes: `useCarteiraDashboard`, componentes das Tasks 2–4, `MesExecucaoPicker` (opcional p/ mês).
- Produces: `<DashboardCarteiraView onDrill={(f)=>void} />`; `CarteiraSubPage` inclui `"dashboard"`; drill-down troca para a aba Explorador com filtro (coordenado por `carteira-section`).

- [ ] **Step 0 (pré-requisito): garantir árvore limpa em `types.ts`**

Run (de `frontend/`): `git status --porcelain frontend/src/types.ts`
Expected: **vazio**. Se aparecer `M frontend/src/types.ts`, PARE — há WIP de
coffee não-commitado; peça para o usuário commitar/stashar antes de prosseguir
(commitar `types.ts` aqui empacotaria o trabalho de coffee dele).

- [ ] **Step 1: Subtipo + aba**

Em `frontend/src/types.ts`, altere a linha do `CarteiraSubPage`:
```typescript
export type CarteiraSubPage = "dashboard" | "explorador" | "sincronizacao" | "divergencias";
```

Substitua `frontend/src/features/carteira/subs.ts` por:
```typescript
import type { CarteiraSubPage } from '../../types';

export const CARTEIRA_SUBS: { id: CarteiraSubPage; rotulo: string }[] = [
  { id: 'dashboard', rotulo: 'Dashboard' },
  { id: 'explorador', rotulo: 'Explorador' },
  { id: 'divergencias', rotulo: 'Divergências' },
  { id: 'sincronizacao', rotulo: 'Sincronização' },
];
```

- [ ] **Step 2: Composição da aba Dashboard**

Create `frontend/src/features/carteira/dashboard/dashboard.tsx`:
```typescript
import React from 'react';
import { Banner } from '@/components/branded/section';
import type { FiltrosCarteira } from '../types';
import { useCarteiraDashboard } from '../use-carteira-dashboard';
import { KpisDashboard } from './kpis-dashboard';
import { Evolucao } from './evolucao';
import { DistribuicaoPlano, DistribuicaoRegional } from './distribuicao';
import { HeatmapCobertura } from './heatmap';

export function DashboardCarteiraView({ onDrill }: {
  onDrill: (filtro: Partial<FiltrosCarteira>) => void;
}): React.JSX.Element {
  const { data, isLoading, error } = useCarteiraDashboard();

  if (error) {
    return <Banner tipo="err">Não foi possível carregar o dashboard: {error instanceof Error ? error.message : String(error)}</Banner>;
  }
  if (isLoading || !data) {
    return <span className="edp-eyebrow">Carregando dashboard…</span>;
  }

  const drillPlano = (plano: string) => onDrill({ conjunto: plano, situacao: 'fora_do_plano' });
  const drillRegional = (regional: string) => onDrill({ regional, situacao: 'fora_do_plano' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <KpisDashboard dados={data} />
      <HeatmapCobertura porRegional={data.por_regional} onDrill={drillRegional} />
      <Evolucao meses={data.mensalizacao} />
      <DistribuicaoPlano linhas={data.por_plano} onDrill={drillPlano} />
      <DistribuicaoRegional linhas={data.por_regional} onDrill={drillRegional} />
    </div>
  );
}
```

Nota: o filtro do Explorador usa `conjunto` = `descricao_conjunto` do plano
(o Explorador filtra por `conjunto` — confirme se o filtro server-side casa
com o código `conjunto` ou com a descrição; se for o código, ajuste o drill
para passar o código, ou estenda o filtro. Ver Step 4.)

- [ ] **Step 3: Renderizar + coordenar drill-down em `carteira-section`**

Em `frontend/src/features/carteira/carteira-section.tsx`, importe o novo
componente e um estado de filtro-handoff para o Explorador; renderize o
Dashboard e, no drill, troque para a aba Explorador aplicando o filtro. Como
o Explorador já aceita `handoff?: {situacao,id}` (Fase 2b), estenda o handoff
para carregar também `regional`/`conjunto`:
```tsx
import { DashboardCarteiraView } from './dashboard/dashboard';
// ...
const [drill, setDrill] = React.useState<{ filtro: Partial<FiltrosCarteira>; id: number } | null>(null);
function aoDrill(filtro: Partial<FiltrosCarteira>): void {
  setDrill((p) => ({ filtro, id: (p?.id ?? 0) + 1 }));
  setSub('explorador');
}
// no corpo:
{sub === 'dashboard' ? <DashboardCarteiraView onDrill={aoDrill} />
  : sub === 'explorador' ? <Explorador drill={drill} />
  : sub === 'divergencias' ? <Divergencias />
  : <Sincronizacao />}
```
(Importe `FiltrosCarteira` de `./types`.)

- [ ] **Step 4: Estender o Explorador para aceitar o drill composto**

Em `frontend/src/features/carteira/explorador/explorador.tsx`, troque a prop
`handoff` por (ou adicione) `drill?: { filtro: Partial<FiltrosCarteira>; id: number } | null`
e, no `useEffect` que reagia ao handoff, aplique `filtro` completo:
```typescript
React.useEffect(() => {
  if (!drill) return;
  setFiltros((f) => ({ ...f, ...drill.filtro }));
  setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [drill?.id]);
```
Mantenha a compatibilidade com o atalho dos Relatórios (Fase 2b) — se o App
ainda passa `handoff={situacao}`, adapte para o novo formato `drill` OU aceite
ambos. Confirme lendo `App.tsx` como a Carteira é montada e ajuste sem quebrar
o atalho existente. **Filtro `conjunto`:** o Explorador filtra por `conjunto`
(código); o drill do dashboard passa `descricao_conjunto` (nome). Alinhe: ou o
drill passa o código correspondente, ou o filtro do Explorador passa a casar a
descrição. O caminho simples: no drill por plano, filtrar por `q` (texto) com o
nome do plano em vez de `conjunto`, OU registrar como refinamento e drill só
por regional nesta fase.

- [ ] **Step 5: Gate — build**

Run (de `frontend/`): `npm run build`
Expected: compila sem erro. A aba Dashboard vira a landing da Carteira.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/features/carteira/subs.ts frontend/src/features/carteira/carteira-section.tsx frontend/src/features/carteira/dashboard/dashboard.tsx frontend/src/features/carteira/explorador/explorador.tsx
git commit -m "feat(carteira-fe): aba Dashboard (landing) + drill-down para o Explorador"
```

---

### Task 6: Passo visual (Supabaze) + documentação

**Files:**
- Modify: componentes do dashboard, `frontend/src/app.css` se preciso.
- Modify: `docs/dev/11-frontend-carteira.md`.

> **Conduzido no fluxo principal pela skill `frontend-design`**, não por subagente. Valida com screenshot real (backend + dados reais: KPIs, farol, evolução, distribuições, heatmap, drill-down).

- [ ] **Step 1: Passe visual com frontend-design**

No fluxo principal, invoque `frontend-design` e refine o dashboard (hierarquia,
farol, gráficos com tokens, heatmap, densidade), servindo o app para validar
visualmente com dados reais. Rode `npm run build` ao final.

- [ ] **Step 2: Documentação**

Em `docs/dev/11-frontend-carteira.md`, adicione a seção "Dashboard (Fase 3b)":
aba Dashboard (landing), KPIs+farol, evolução mensal/acumulada, distribuições,
heatmap (com a simplificação por-regional documentada), drill-down interno para
o Explorador.

- [ ] **Step 3: Gate — build + servir**

Run (de `frontend/`): `npm run build`; suba backend + front e valide o fluxo.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/carteira frontend/src/app.css docs/dev/11-frontend-carteira.md
git commit -m "feat(carteira-fe): passe visual Supabaze do dashboard + docs"
```

---

## Self-Review

**Spec coverage (Fase 3 frontend, §7):**
- Aba Dashboard (landing) → Task 5. ✓
- KPIs + farol de cobertura → Task 2. ✓
- Evolução mensal e acumulada → Task 3. ✓
- Distribuição por plano/regional → Task 4. ✓
- Heatmap regional×plano → Task 4 (com simplificação documentada). ✓
- Drill-down → Explorador filtrado → Task 5 (interno à seção, sem App.tsx). ✓
- Comparativo planejado×executado → Task 3 (séries do mensalizacao). ✓
- Visual Supabaze → Task 6. ✓
- Docs → Task 6. ✓
- Fora de escopo (filtros salvos, palette) → não implementado. ✓

**Placeholder scan:** sem TBD/TODO de código; as notas "confirme nomes de
`fmt`/`ui/chart` antes de editar" e o alinhamento do filtro `conjunto` (Task 5
Step 4) são robustez/decisão pontual, com caminho simples indicado — não
placeholders.

**Type consistency:** `DashboardCarteira`/`LinhaPlano`/`LinhaRegional`/
`MesMensalizacao` (Task 1) usados em KPIs (2), Evolução (3), Distribuição/
Heatmap (4) e Dashboard (5). `useCarteiraDashboard` (Task 1) consumido no
Dashboard (5). `CarteiraSubPage += dashboard` (5) usado em subs/section.
`onDrill(Partial<FiltrosCarteira>)` (5) coordenado por carteira-section →
Explorador `drill` (5 Step 4).

**Coordenação:** único arquivo compartilhado com o WIP de coffee do usuário é
`types.ts` (Task 5 Step 0 tem guarda de árvore-limpa). Tasks 1–4/6 são
isoladas na feature carteira.

**Sem test runner:** gate é `npm run build`; validação funcional/visual manual
(Task 6 Step 3).
