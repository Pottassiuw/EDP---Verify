# Relatórios v3 — Resumo fixo + abas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar a home Relatórios em faixa de resumo fixa + 3 abas (`Mês`, `Planos`, `Mensalização`), corrigindo gráfico de mensalização, cards regionais e tamanhos de texto — sem tocar no backend.

**Architecture:** `relatorios-section.tsx` vira orquestrador (header + `ResumoFixo` + `SegTabs` + render condicional da aba). Componentes presentacionais atuais (alertas, tabela-anual, regionais, chart, hero) viram filhos de wrappers finos por aba. Todo dado vem do payload já existente (`DashboardRelatorios`); nenhuma mudança de contrato.

**Tech Stack:** React 18 + TypeScript, Tailwind v4 (tokens EDP em `app.css`), shadcn (`Table`, `Select`, `ToggleGroup` via `SegTabs`), tokens/classes `edp-*`.

## Global Constraints

- **Sem mudança de backend nem de `types.ts`** — contrato do payload é imutável.
- **Sem novos tokens de cor** — usar `--accent`, `--green-2`, farol (`--green`/`--amber`/`--red`) e `--surface`/`--surface-2` já existentes.
- **Sem novas dependências** — o front não tem runner de teste; verificação é `npm run build` (typecheck `tsc -b` + `vite build`) + check runtime em `localhost:5173`.
- **Nunca usar `any`** (regra do CLAUDE.md); tipar props explicitamente.
- **Imports ordenados**: React → terceiros → alias `@/` → relativo.
- **Boldness num lugar só**: o `% Disp` grande da aba `Mês` é a única manchete; resto quieto.
- Comando de build canônico (a partir da raiz do repo): `cd frontend && npm run build`. Esperado: termina com `✓ built` e sem linha `error`.

---

### Task 1: `TabelaMensal` (tabela de apoio do gráfico)

**Files:**
- Create: `frontend/src/features/relatorios/tabela-mensal.tsx`

**Interfaces:**
- Consumes: `MesMensalizacao` de `./types`; `farol`, `FAROL_COR`, `fmtPct`, `fmtQtd`, `MESES_ABREV_PT` de `./fmt`.
- Produces: `TabelaMensal({ meses: MesMensalizacao[]; mesCorrente: number })`.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { FAROL_COR, farol, fmtPct, fmtQtd, MESES_ABREV_PT } from './fmt';
import type { MesMensalizacao } from './types';

export function TabelaMensal({ meses, mesCorrente }: {
  meses: MesMensalizacao[];
  mesCorrente: number;
}): React.JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mês</TableHead>
          <TableHead className="text-right">Meta</TableHead>
          <TableHead className="text-right">Carteira</TableHead>
          <TableHead className="text-right">Executado</TableHead>
          <TableHead className="text-right">%Exec</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {meses.map((m) => {
          const execPct = m.meta > 0 ? m.executado / m.meta : null;
          const f = farol(execPct);
          const futuro = m.mes > mesCorrente;
          return (
            <TableRow key={m.mes} className="hover:bg-transparent">
              <TableCell className="capitalize">{MESES_ABREV_PT[m.mes - 1]}</TableCell>
              <TableCell className="text-right edp-mono">{fmtQtd(m.meta)}</TableCell>
              <TableCell className="text-right edp-mono">{fmtQtd(m.carteira)}</TableCell>
              <TableCell className="text-right edp-mono">{futuro ? '' : fmtQtd(m.executado)}</TableCell>
              <TableCell className="text-right edp-mono"
                         style={{ color: f ? FAROL_COR[f] : 'var(--text-mute)' }}>
                {futuro ? '' : fmtPct(execPct)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, sem `error`. (O componente ainda não é importado; build passa.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/relatorios/tabela-mensal.tsx
git commit -m "feat(relatorios): tabela mensal de apoio (meta/carteira/executado/%exec)"
```

---

### Task 2: Refatorar `MensalizacaoChart` (maior, legenda 13px, rótulos de valor)

**Files:**
- Modify: `frontend/src/features/relatorios/mensalizacao-chart.tsx`

**Interfaces:**
- Consumes: `MesMensalizacao` de `./types`; `fmtQtd`, `MESES_ABREV_PT` de `./fmt`.
- Produces: `MensalizacaoChart({ meses: MesMensalizacao[]; mesCorrente: number })` (assinatura inalterada).

- [ ] **Step 1: Reescrever o arquivo**

```tsx
import React from 'react';

import { fmtQtd, MESES_ABREV_PT } from './fmt';
import type { MesMensalizacao } from './types';

const LARGURA = 620;
const ALTURA = 240;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const PAD_X = 6;
const GAP_GRUPO = 6;
const RAIO = 2;

export function MensalizacaoChart({ meses, mesCorrente }: {
  meses: MesMensalizacao[];
  mesCorrente: number;
}): React.JSX.Element {
  const escala = Math.max(1, ...meses.map((m) => Math.max(m.meta, m.carteira)));
  const alturaUtil = ALTURA - PAD_TOP - PAD_BOTTOM;
  const larguraGrupo = (LARGURA - PAD_X * 2) / meses.length;
  const larguraBarra = (larguraGrupo - GAP_GRUPO) / 2;

  function altura(v: number): number {
    return escala > 0 ? (v / escala) * alturaUtil : 0;
  }

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex gap-[16px] text-[13px] text-text-mute">
        <span><span className="inline-block w-[11px] h-[11px] rounded-[2px] mr-[5px] align-middle border border-[var(--line)] bg-[var(--surface-2)]" />Meta</span>
        <span><span className="inline-block w-[11px] h-[11px] rounded-[2px] mr-[5px] align-middle bg-[var(--accent)]" />Carteira</span>
        <span><span className="inline-block w-[11px] h-[11px] rounded-[2px] mr-[5px] align-middle bg-[var(--green-2)]" />Executado</span>
      </div>
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} width="100%" role="img"
           aria-label="Mensalização: meta, carteira e executado por mês">
        {meses.map((m, i) => {
          const x0 = PAD_X + i * larguraGrupo;
          const hMeta = altura(m.meta);
          const hCarteira = altura(m.carteira);
          const hExec = m.mes <= mesCorrente ? altura(m.executado) : 0;
          const baseY = ALTURA - PAD_BOTTOM;
          const atual = m.mes === mesCorrente;
          const xCarteira = x0 + larguraBarra + GAP_GRUPO;
          return (
            <g key={m.mes}>
              {atual && (
                <rect x={x0 - GAP_GRUPO / 2} y={PAD_TOP - 4} width={larguraGrupo}
                      height={ALTURA - PAD_TOP - PAD_BOTTOM + 8} rx={RAIO}
                      fill="var(--surface-2)" opacity={0.6} />
              )}
              <rect x={x0} y={baseY - hMeta} width={larguraBarra} height={hMeta}
                    rx={RAIO} fill="var(--surface-2)" stroke="var(--line)">
                <title>{`${MESES_ABREV_PT[m.mes - 1]} · Meta ${fmtQtd(m.meta)}`}</title>
              </rect>
              <rect x={xCarteira} y={baseY - hCarteira}
                    width={larguraBarra} height={hCarteira} rx={RAIO} fill="var(--accent)">
                <title>{`${MESES_ABREV_PT[m.mes - 1]} · Carteira ${fmtQtd(m.carteira)}`}</title>
              </rect>
              {hExec > 0 && (
                <rect x={xCarteira} y={baseY - hExec}
                      width={larguraBarra} height={hExec} rx={RAIO} fill="var(--green-2)">
                  <title>{`${MESES_ABREV_PT[m.mes - 1]} · Executado ${fmtQtd(m.executado)}`}</title>
                </rect>
              )}
              {m.carteira > 0 && (
                <text x={xCarteira + larguraBarra / 2} y={baseY - hCarteira - 5}
                      textAnchor="middle" className="edp-mono" fontSize="9"
                      fill="var(--text-mute)">
                  {fmtQtd(Math.round(m.carteira))}
                </text>
              )}
              <text x={x0 + larguraGrupo / 2 - GAP_GRUPO / 2} y={ALTURA - 7}
                    textAnchor="middle" className="edp-mono" fontSize="11"
                    fontWeight={atual ? 600 : 400}
                    fill={atual ? 'var(--text)' : 'var(--text-mute)'}>
                {MESES_ABREV_PT[m.mes - 1]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, sem `error`. (Props inalteradas; a home atual continua renderizando.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/relatorios/mensalizacao-chart.tsx
git commit -m "feat(relatorios): grafico de mensalizacao maior, legenda legivel e rotulos de carteira"
```

---

### Task 3: Refatorar `RegionaisCards` (tiles sem borda, texto maior)

**Files:**
- Modify: `frontend/src/features/relatorios/regionais-cards.tsx`

**Interfaces:**
- Consumes: `RegionalResumo` de `./types`; `farol`, `FAROL_COR`, `fmtPct`, `fmtQtd` de `./fmt`.
- Produces: `RegionaisCards({ regionais: RegionalResumo[] })` (assinatura inalterada).

- [ ] **Step 1: Reescrever o arquivo** (remove `Card`/`CardContent`; tile com fundo `--surface-2`, sem borda; captions 11→13px)

```tsx
import React from 'react';

import { FAROL_COR, farol, fmtPct, fmtQtd } from './fmt';
import type { RegionalResumo } from './types';

function corFarol(pct: number | null): string {
  const f = farol(pct);
  return f === null ? 'var(--text-mute)' : FAROL_COR[f];
}

export function RegionaisCards({ regionais }: { regionais: RegionalResumo[] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[10px]">
      <span className="edp-eyebrow">Saldo por regional (mês corrente)</span>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-[12px]">
        {regionais.map((r) => (
          <div key={r.regional}
               className="flex flex-col gap-[4px] p-[14px] rounded-[var(--r-md)] bg-[var(--surface-2)]">
            <span className="edp-eyebrow">{r.regional}</span>
            <span className="edp-num text-[22px]" style={{ color: corFarol(r.pct_disp) }}>
              {fmtPct(r.pct_disp)}
            </span>
            <span className="edp-mono text-[13px]"
                  style={{ color: r.saldo < 0 ? 'var(--red)' : 'var(--text-mute)' }}>
              Saldo {r.saldo > 0 ? '+' : ''}{fmtQtd(r.saldo)}
            </span>
            <span className="text-[13px] text-text-mute">
              Meta {fmtQtd(r.meta)} · Carteira {fmtQtd(r.carteira)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, sem `error`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/relatorios/regionais-cards.tsx
git commit -m "feat(relatorios): cards regionais sem borda, tiles limpos com texto maior"
```

---

### Task 4: `AbaMensalizacao` (compõe gráfico + tabela mensal)

**Files:**
- Create: `frontend/src/features/relatorios/aba-mensalizacao.tsx`

**Interfaces:**
- Consumes: `MensalizacaoChart` (Task 2), `TabelaMensal` (Task 1); `DashboardRelatorios` de `./types`.
- Produces: `AbaMensalizacao({ data: DashboardRelatorios })`.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';

import { MensalizacaoChart } from './mensalizacao-chart';
import { TabelaMensal } from './tabela-mensal';
import type { DashboardRelatorios } from './types';

export function AbaMensalizacao({ data }: { data: DashboardRelatorios }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[16px]">
      <MensalizacaoChart meses={data.mensalizacao} mesCorrente={data.mes_corrente} />
      <TabelaMensal meses={data.mensalizacao} mesCorrente={data.mes_corrente} />
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, sem `error`. (Ainda não importado.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/relatorios/aba-mensalizacao.tsx
git commit -m "feat(relatorios): aba Mensalizacao (grafico + tabela mensal)"
```

---

### Task 5: `AbaPlanos` (tabela anual + financeiro do ano)

**Files:**
- Create: `frontend/src/features/relatorios/aba-planos.tsx`

**Interfaces:**
- Consumes: `TabelaAnual` (existente, já com subtotais/total geral); `fmtRS` de `./fmt`; `DashboardRelatorios` de `./types`.
- Produces: `AbaPlanos({ data: DashboardRelatorios; aoVerPlano: (plano: string) => void })`.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';

import { fmtRS } from './fmt';
import { TabelaAnual } from './tabela-anual';
import type { DashboardRelatorios } from './types';

export function AbaPlanos({ data, aoVerPlano }: {
  data: DashboardRelatorios;
  aoVerPlano: (plano: string) => void;
}): React.JSX.Element {
  const fin = data.financeiro_ano;
  return (
    <div className="flex flex-col gap-[12px]">
      <TabelaAnual linhas={data.visao_anual} aoClicarPlano={aoVerPlano} />
      <span className="edp-mono text-[13px] text-text-mute">
        Financeiro do ano — Carteira {fmtRS(fin.carteira_rs)} · Meta {fmtRS(fin.meta_rs)} · Gap {fmtRS(fin.gap_rs)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, sem `error`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/relatorios/aba-planos.tsx
git commit -m "feat(relatorios): aba Planos (tabela anual + financeiro do ano)"
```

---

### Task 6: `ResumoFixo` (faixa sempre visível)

**Files:**
- Create: `frontend/src/features/relatorios/resumo-fixo.tsx`

**Interfaces:**
- Consumes: `farol`, `FAROL_COR`, `fmtPct`, `fmtRS` de `./fmt`; `DashboardRelatorios`, `HeroMes` de `./types`.
- Produces: `ResumoFixo({ hero: HeroMes; financeiroAno: DashboardRelatorios['financeiro_ano']; totalAlertas: number; aoVerAlertas: () => void })`.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';

import { FAROL_COR, farol, fmtPct, fmtRS } from './fmt';
import type { DashboardRelatorios, HeroMes } from './types';

function ResumoItem({ rotulo, valor, cor }: {
  rotulo: string;
  valor: string;
  cor?: string;
}): React.JSX.Element {
  return (
    <span className="flex items-baseline gap-[6px]">
      <span className="edp-eyebrow">{rotulo}</span>
      <span className="edp-mono text-[14px] font-semibold"
            style={cor ? { color: cor } : undefined}>
        {valor}
      </span>
    </span>
  );
}

export function ResumoFixo({ hero, financeiroAno, totalAlertas, aoVerAlertas }: {
  hero: HeroMes;
  financeiroAno: DashboardRelatorios['financeiro_ano'];
  totalAlertas: number;
  aoVerAlertas: () => void;
}): React.JSX.Element {
  const execPct = hero.meta > 0 ? hero.executado / hero.meta : null;
  const corDisp = farol(hero.pct_disp);
  return (
    <div className="flex flex-wrap items-center gap-x-[20px] gap-y-[6px] py-[10px] px-[14px] rounded-[var(--r-md)] bg-[var(--surface-2)]">
      <span className="edp-eyebrow">Resumo · <span className="capitalize">{hero.mes_nome}</span></span>
      <ResumoItem rotulo="%Disp" valor={fmtPct(hero.pct_disp)}
                  cor={corDisp ? FAROL_COR[corDisp] : undefined} />
      <ResumoItem rotulo="Exec" valor={fmtPct(execPct)} />
      <ResumoItem rotulo="Gap R$ (ano)" valor={fmtRS(financeiroAno.gap_rs)} />
      {totalAlertas > 0 && (
        <button type="button" onClick={aoVerAlertas}
                className="edp-mono text-[13px] text-amber hover:underline"
                aria-label={`Ver ${totalAlertas} planos com carteira abaixo da meta`}>
          ⚠ {totalAlertas} abaixo
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, sem `error`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/relatorios/resumo-fixo.tsx
git commit -m "feat(relatorios): faixa de resumo fixa (on-track do mes)"
```

---

### Task 7: Troca atômica — `HeroMes` enxuto + `AbaMes` + rewire de `relatorios-section`

Este é o passo que liga tudo: o app passa a renderizar o layout de abas. Toca três arquivos num commit só porque a mudança de assinatura do `HeroMes` (remoção de `financeiroAno`) e o consumo no orquestrador têm de ser atômicos para o build não quebrar.

**Files:**
- Modify: `frontend/src/features/relatorios/hero-mes.tsx`
- Create: `frontend/src/features/relatorios/aba-mes.tsx`
- Modify: `frontend/src/features/relatorios/relatorios-section.tsx`

**Interfaces:**
- `HeroMes({ hero: HeroMesData; aoVerNotas: () => void })` — **remove** a prop `financeiroAno` e a linha "Financeiro do ano" (rehospedada em `AbaPlanos`, Task 5).
- `AbaMes({ data: DashboardRelatorios; aoVerNotas: () => void; aoVerPlano: (plano: string) => void })` — compõe `HeroMes` + `AlertasCarteira` + `RegionaisCards`.
- `RelatoriosSection` — mesma `RelatoriosSectionProps` de antes (`onVerNotasDoMes`, `onVerPlano`, `onIrParaCoffee`); consome `ResumoFixo` (Task 6), `AbaMes`, `AbaPlanos` (Task 5), `AbaMensalizacao` (Task 4) e `SegTabs`.

- [ ] **Step 1: Enxugar `hero-mes.tsx`** (remove `financeiroAno` e a linha de financeiro; mantém featured %Disp + execução + tiles)

```tsx
import React from 'react';

import { StatTile } from '@/components/branded/section';
import { Button } from '@/components/ui/button';

import { FAROL_COR, farol, fmtPct, fmtQtd, fmtRS } from './fmt';
import type { HeroMes as HeroMesData } from './types';

export function HeroMes({ hero, aoVerNotas }: {
  hero: HeroMesData;
  aoVerNotas: () => void;
}): React.JSX.Element {
  const execPct = hero.meta > 0 ? hero.executado / hero.meta : null;
  const progresso = execPct === null ? 0 : Math.min(execPct, 1);
  const corDisp = farol(hero.pct_disp);

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-baseline justify-between">
        <span className="edp-title text-[16px] capitalize">{hero.mes_nome}</span>
        <Button variant="ghost" size="sm" onClick={aoVerNotas}>
          Ver notas do mês
        </Button>
      </div>

      <div className="edp-panel flex flex-col gap-[16px] md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-[2px]">
          <span className="edp-eyebrow">% Disponibilização</span>
          <span className="edp-num text-[40px]"
                style={{ color: corDisp ? FAROL_COR[corDisp] : 'var(--text)' }}>
            {fmtPct(hero.pct_disp)}
          </span>
          <span className="edp-mono text-[13px] text-text-mute">
            Carteira {fmtQtd(hero.carteira)} de Meta {fmtQtd(hero.meta)}
          </span>
        </div>

        <div className="flex flex-col gap-[6px] md:w-[300px]">
          <div className="flex items-baseline justify-between">
            <span className="edp-eyebrow">Execução</span>
            <span className="edp-mono text-[13px] text-text-mute">{fmtPct(execPct)} da meta</span>
          </div>
          <div className="h-[6px] w-full rounded-[999px] bg-[var(--surface-2)] overflow-hidden"
               role="progressbar" aria-valuenow={Math.round(progresso * 100)} aria-valuemin={0} aria-valuemax={100}
               aria-label="Executado em relação à meta do mês">
            <div className="h-full bg-green rounded-[999px] [transition:width_.3s_ease]"
                 style={{ width: `${progresso * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="flex gap-[10px] flex-wrap">
        <StatTile label="Meta do mês" value={fmtQtd(hero.meta)} />
        <StatTile label="Carteira" value={fmtQtd(hero.carteira)} />
        <StatTile label="Executado" value={fmtQtd(hero.executado)} />
        {hero.postergadas > 0 && (
          <StatTile label="Postergadas" value={fmtQtd(hero.postergadas)} />
        )}
        <StatTile label="R$ carteira/meta" value={`${fmtRS(hero.carteira_rs)} / ${fmtRS(hero.meta_rs)}`} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `aba-mes.tsx`**

```tsx
import React from 'react';

import { AlertasCarteira } from './alertas-carteira';
import { HeroMes } from './hero-mes';
import { RegionaisCards } from './regionais-cards';
import type { DashboardRelatorios } from './types';

export function AbaMes({ data, aoVerNotas, aoVerPlano }: {
  data: DashboardRelatorios;
  aoVerNotas: () => void;
  aoVerPlano: (plano: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[16px]">
      <HeroMes hero={data.hero} aoVerNotas={aoVerNotas} />
      <AlertasCarteira linhas={data.visao_anual} aoClicarPlano={aoVerPlano} />
      <RegionaisCards regionais={data.regionais} />
    </div>
  );
}
```

- [ ] **Step 3: Reescrever `relatorios-section.tsx`** (header + `ResumoFixo` + `SegTabs` + render condicional)

```tsx
import React from 'react';

import { PageHeader, SegTabs } from '@/components/branded/section';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { AbaMensalizacao } from './aba-mensalizacao';
import { AbaMes } from './aba-mes';
import { AbaPlanos } from './aba-planos';
import { ResumoFixo } from './resumo-fixo';
import { useDashboardRelatorios, useForaDoPlano } from './use-dashboard';

const REGIONAL_TODAS = 'todas';

type AbaRelatorio = 'mes' | 'planos' | 'mensalizacao';

const ABAS: { id: AbaRelatorio; rotulo: string }[] = [
  { id: 'mes', rotulo: 'Mês' },
  { id: 'planos', rotulo: 'Planos' },
  { id: 'mensalizacao', rotulo: 'Mensalização' },
];

export interface RelatoriosSectionProps {
  onVerNotasDoMes: (mes: number, ano: number) => void;
  onVerPlano: (plano: string, regional: string | null) => void;
  onIrParaCoffee: () => void;
}

export function RelatoriosSection({
  onVerNotasDoMes, onVerPlano, onIrParaCoffee,
}: RelatoriosSectionProps): React.JSX.Element {
  const [regional, setRegional] = React.useState<string | null>(null);
  const [aba, setAba] = React.useState<AbaRelatorio>('mes');
  const { data, isLoading, error } = useDashboardRelatorios(regional);
  const foraDoPlano = useForaDoPlano();

  const totalAlertas = React.useMemo(
    () => (data?.visao_anual ?? []).filter((l) => l.pct_disp !== null && l.pct_disp < 1).length,
    [data],
  );

  return (
    <div className="edp-page">
      <PageHeader
        eyebrow="Relatórios"
        title={`Plano de Recomposição ${data?.ano ?? new Date().getFullYear()}`}
        action={
          <Select
            value={regional ?? REGIONAL_TODAS}
            onValueChange={(v) => setRegional(v === REGIONAL_TODAS ? null : v)}
          >
            <SelectTrigger className="w-[220px]" aria-label="Filtrar por regional">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={REGIONAL_TODAS}>SP (todas)</SelectItem>
              {(data?.regionais_disponiveis ?? []).map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {data?.metas_info.erro && (
        <span className="edp-mono text-[12px] text-amber">
          Metas de {data.metas_info.atualizadas_em ?? '—'} (sync falhou: {data.metas_info.erro})
        </span>
      )}

      {isLoading && <span className="text-text-mute">Carregando…</span>}
      {error && (
        <span className="text-red">
          Erro ao carregar dashboard: {error instanceof Error ? error.message : String(error)}
        </span>
      )}

      {data && (
        <>
          <ResumoFixo
            hero={data.hero}
            financeiroAno={data.financeiro_ano}
            totalAlertas={totalAlertas}
            aoVerAlertas={() => setAba('mes')}
          />
          <SegTabs tabs={ABAS} value={aba} onChange={setAba} ariaLabel="Seções do dashboard" />

          {aba === 'mes' && (
            <>
              <AbaMes
                data={data}
                aoVerNotas={() => onVerNotasDoMes(data.mes_corrente, data.ano)}
                aoVerPlano={(plano) => onVerPlano(plano, regional)}
              />
              {!foraDoPlano.error && (foraDoPlano.data?.corrigidas_fora_do_plano ?? 0) > 0 && (
                <button type="button" onClick={onIrParaCoffee}
                        className="text-left edp-mono text-[13px] text-amber hover:underline">
                  {foraDoPlano.data?.corrigidas_fora_do_plano} corrigidas no COFFEE fora do plano →
                </button>
              )}
            </>
          )}
          {aba === 'planos' && (
            <AbaPlanos data={data} aoVerPlano={(plano) => onVerPlano(plano, regional)} />
          )}
          {aba === 'mensalizacao' && <AbaMensalizacao data={data} />}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, sem `error`.

- [ ] **Step 5: Verificação runtime**

Com backend na 8000 e dev server na 5173 (`cd frontend && npm run dev`), abrir `http://localhost:5173`:
- Faixa de resumo aparece com `%Disp` (cor farol), `Exec`, `Gap R$ (ano)` e `⚠ N abaixo`.
- Clicar `⚠ N abaixo` leva à aba `Mês` com a lista de alertas.
- `SegTabs` alterna Mês/Planos/Mensalização; setas do teclado navegam entre abas.
- Aba `Mês`: painel %Disp grande, tiles, alertas, regionais sem borda; `Postergadas` some quando 0.
- Aba `Planos`: tabela com subtotais + total geral + linha "Financeiro do ano".
- Aba `Mensalização`: gráfico maior com legenda 13px + rótulos de carteira + tabela mensal.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/relatorios/hero-mes.tsx frontend/src/features/relatorios/aba-mes.tsx frontend/src/features/relatorios/relatorios-section.tsx
git commit -m "feat(relatorios): layout em abas (resumo fixo + Mes/Planos/Mensalizacao)"
```

---

### Task 8: Atualizar o manual de dev

**Files:**
- Modify: `docs/dev/04-frontend-shared.md`

**Interfaces:** nenhuma (documentação).

- [ ] **Step 1: Atualizar a descrição da home Relatórios**

Localizar o parágrafo que descreve a home (`features/relatorios/relatorios-section.tsx` como dashboard empilhado) e substituir pela nova estrutura: faixa de resumo fixa (`resumo-fixo.tsx`) + `SegTabs` com 3 abas (`aba-mes.tsx`, `aba-planos.tsx`, `aba-mensalizacao.tsx`); citar `tabela-mensal.tsx` como tabela de apoio do gráfico e que o "Financeiro do ano" vive na aba Planos. Manter o estilo de prose com `arquivo:linha` do restante do arquivo.

- [ ] **Step 2: Verificar coerência**

Conferir que nenhuma outra parte de `04-frontend-shared.md` ainda descreve Relatórios como página única empilhada.

- [ ] **Step 3: Commit**

```bash
git add docs/dev/04-frontend-shared.md
git commit -m "docs(dev): home Relatorios agora e resumo fixo + 3 abas"
```

---

## Self-Review

**Spec coverage:**
- Faixa de resumo fixa → Task 6 + wiring Task 7. ✔
- 3 abas (Mês/Planos/Mensalização), default Mês → Task 7 (`ABAS`, `useState('mes')`). ✔
- Aba Mês = KPIs + Alertas + Regionais → Task 7 (`AbaMes`). ✔
- Aba Planos = tabela + financeiro → Task 5. ✔
- Aba Mensalização = gráfico + tabela mensal → Tasks 1,2,4. ✔
- Gráfico retrabalhado (legenda 13px, valores, maior) → Task 2. ✔
- Regionais sem borda + texto maior → Task 3. ✔
- Financeiro do ano movido do hero para Planos → Tasks 5 + 7. ✔
- Textos 11–12px → 13px → Tasks 2,3,5,6. ✔
- Sem backend/`types.ts`/dependências → Global Constraints. ✔
- Doc atualizado → Task 8. ✔

**Placeholder scan:** nenhum "TBD/TODO"; todo código está completo. Task 8 descreve edição de prose (não código) sem exigir bloco de código. ✔

**Type consistency:** `HeroMes` (Task 7) remove `financeiroAno` e só é consumido em `AbaMes` (Task 7) — nenhum outro consumidor. `AbaPlanos`/`AbaMes`/`AbaMensalizacao`/`ResumoFixo` recebem `data: DashboardRelatorios` ou fatias explícitas, todas presentes em `types.ts`. `SegTabs<AbaRelatorio>` casa com `value/onChange` de `useState<AbaRelatorio>`. `totalAlertas` usa o mesmo filtro (`pct_disp !== null && pct_disp < 1`) de `AlertasCarteira`. ✔
