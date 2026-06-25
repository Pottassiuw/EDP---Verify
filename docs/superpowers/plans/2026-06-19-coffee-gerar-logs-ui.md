# Coffee Gerar + Logs UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the rewritten "Gerar" sub-page (regerar with lifecycle card), a logs visualization system (sub-page + contextual drawer), and rename the CoffeeHub header label from "Geradas" to "Gerar".

**Architecture:** All changes are frontend-only. New hook `useCoffeeLogs` follows the existing `useCoffeeNotas` pattern (manual fetch + useState). A reusable `LogTable` component feeds both the Logs sub-page and the `LogDrawer` (fixed right panel). The Gerar rewrite adds an input+button zone that calls `POST /api/coffee/regerar`, then fetches transition logs to build the lifecycle card. Existing sub-pages (Corrigidas, Pendentes) gain a per-row log button that opens the drawer.

**Tech Stack:** React 18, TypeScript, Vite. No test framework — verification via `npm run build` (tsc + vite). Inline styles with CSS custom properties (`var(--surface)`, `var(--accent)`, etc.). Manual fetch (no react-query).

## Global Constraints

- No test framework in frontend. Every task verifies with `cd frontend && npm run build`.
- Follow existing patterns: inline styles, CSS custom properties, `edp-btn`/`edp-seg`/`edp-mono`/`cnt-tag` utility classes.
- `API_BASE = localStorage.getItem("edp_api") || "/api"` for all fetch URLs (same pattern as other COFFEE components).
- `CoffeeSubPage` type lives in `frontend/src/types.ts`. COFFEE-specific types in `frontend/src/coffee/types.ts`.
- All new COFFEE files go in `frontend/src/coffee/`.
- The `id` value `"geradas"` MUST NOT change anywhere — only the visible label changes to "Gerar".
- The `formatRelativeTime` function lives in `frontend/src/coffee/coffee-notas-table.tsx` and is NOT currently exported. Tasks that need it must export it first.

---

### Task 1: Types + `useCoffeeLogs` hook + export `formatRelativeTime`

**Files:**
- Modify: `frontend/src/types.ts` (add `"logs"` to `CoffeeSubPage`)
- Modify: `frontend/src/coffee/types.ts` (add `CoffeeLog` interface)
- Create: `frontend/src/coffee/use-coffee-logs.ts`
- Modify: `frontend/src/coffee/coffee-notas-table.tsx` (export `formatRelativeTime`)

**Interfaces:**
- Consumes: `GET /api/coffee/logs?nota_pk=X&tipo=Y&limit=N` → `{ logs: CoffeeLog[] }` (backend already exists from Sub-projeto 1)
- Produces:
  - Type `CoffeeLog` = `{ id: number; timestamp: string; tipo: "api_call" | "transicao" | "acao_usuario"; acao: string; nota_pk: number | null; detalhes: Record<string, unknown> | null; sucesso: boolean }`
  - `CoffeeSubPage` now includes `"logs"`
  - `useCoffeeLogs(params?: { nota_pk?: number; tipo?: string; limit?: number }): { logs: CoffeeLog[]; loading: boolean; refresh: () => void }`
  - `formatRelativeTime(iso: string): string` exported from `coffee-notas-table.tsx`

- [ ] **Step 1: Add `"logs"` to `CoffeeSubPage`**

In `frontend/src/types.ts`, change:

```ts
export type CoffeeSubPage = "abrir" | "geradas" | "corrigidas" | "pendentes" | "verificar";
```

to:

```ts
export type CoffeeSubPage = "abrir" | "geradas" | "corrigidas" | "pendentes" | "verificar" | "logs";
```

- [ ] **Step 2: Add `CoffeeLog` interface**

In `frontend/src/coffee/types.ts`, append after the `CoffeeJob` interface:

```ts
export interface CoffeeLog {
  id: number;
  timestamp: string;
  tipo: "api_call" | "transicao" | "acao_usuario";
  acao: string;
  nota_pk: number | null;
  detalhes: Record<string, unknown> | null;
  sucesso: boolean;
}
```

- [ ] **Step 3: Export `formatRelativeTime`**

In `frontend/src/coffee/coffee-notas-table.tsx`, change:

```ts
function formatRelativeTime(iso: string): string {
```

to:

```ts
export function formatRelativeTime(iso: string): string {
```

- [ ] **Step 4: Create `useCoffeeLogs` hook**

Create `frontend/src/coffee/use-coffee-logs.ts`:

```ts
import React from 'react';
import type { CoffeeLog } from './types';

const API_BASE = localStorage.getItem("edp_api") || "/api";

interface UseCoffeeLogsParams {
  nota_pk?: number;
  tipo?: string;
  limit?: number;
}

interface UseCoffeeLogsResult {
  logs: CoffeeLog[];
  loading: boolean;
  refresh: () => void;
}

export function useCoffeeLogs(params?: UseCoffeeLogsParams): UseCoffeeLogsResult {
  const [logs, setLogs] = React.useState<CoffeeLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  const key = JSON.stringify(params ?? {});

  const refresh = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const qs = new URLSearchParams();
    if (params?.nota_pk !== undefined) qs.set("nota_pk", String(params.nota_pk));
    if (params?.tipo) qs.set("tipo", params.tipo);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    fetch(`${API_BASE}/coffee/logs${suffix}`, { headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`GET /coffee/logs -> ${res.status}`);
        return res.json();
      })
      .then((data: { logs: CoffeeLog[] }) => {
        if (!cancelled) { setLogs(data.logs); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setLogs([]); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [key, tick]);

  return { logs, loading, refresh };
}
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS. The new type/hook compile but nothing uses them yet, and the exported function has no callers change.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/coffee/types.ts frontend/src/coffee/use-coffee-logs.ts frontend/src/coffee/coffee-notas-table.tsx
git commit -m "feat(coffee): CoffeeLog type + useCoffeeLogs hook + export formatRelativeTime"
```

---

### Task 2: LogTable component

**Files:**
- Create: `frontend/src/coffee/coffee-log-table.tsx`

**Interfaces:**
- Consumes: `CoffeeLog` (Task 1), `formatRelativeTime` (Task 1)
- Produces: `LogTable({ logs, loading, compact? }): React.JSX.Element` — reusable table component. Columns: Quando, Tipo (colored tag), Acao, Nota (hidden in compact), Status (icon), Detalhes (collapsible).

- [ ] **Step 1: Create `coffee-log-table.tsx`**

Create `frontend/src/coffee/coffee-log-table.tsx`:

```tsx
import React from 'react';
import type { CoffeeLog } from './types';
import { formatRelativeTime } from './coffee-notas-table';

const LOG_STYLE = `
  .clog-wrap{flex:1;min-height:0;overflow:auto;padding:0 22px 24px}
  .clog-tbl{width:100%;border-collapse:separate;border-spacing:0}
  .clog-tbl th{position:sticky;top:0;background:var(--surface);text-align:left;padding:8px 10px;
    font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mute);
    border-bottom:2px solid var(--line)}
  .clog-tbl td{padding:8px 10px;border-bottom:1px solid var(--line);color:var(--text)}
  .clog-tbl tr:hover td{background:var(--surface-2)}
  .clog-tag{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:.03em}
  .clog-tag.api{background:rgba(59,130,246,0.14);color:#3b82f6}
  .clog-tag.trans{background:rgba(139,92,246,0.14);color:#8b5cf6}
  .clog-tag.user{background:rgba(34,197,94,0.14);color:#22c55e}
  .clog-compact .clog-tbl{font-size:12px}
  .clog-compact .clog-tbl th{padding:6px 8px;font-size:10px}
  .clog-compact .clog-tbl td{padding:6px 8px}
`;

const TIPO_CLASS: Record<string, string> = {
  api_call: "api",
  transicao: "trans",
  acao_usuario: "user",
};
const TIPO_LABEL: Record<string, string> = {
  api_call: "API",
  transicao: "Transicao",
  acao_usuario: "Usuario",
};

function DetailsSummary({ detalhes }: { detalhes: Record<string, unknown> | null }): React.JSX.Element {
  if (!detalhes) return <span style={{ color: "var(--text-mute)" }}>—</span>;
  const json = JSON.stringify(detalhes);
  const preview = json.length > 40 ? json.slice(0, 40) + "..." : json;
  return (
    <details style={{ fontSize: "inherit" }}>
      <summary style={{ cursor: "pointer", color: "var(--text-mute)" }} className="edp-mono">{preview}</summary>
      <pre style={{ margin: "6px 0 0", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all",
                    color: "var(--text-dim)", lineHeight: 1.5 }}>{JSON.stringify(detalhes, null, 2)}</pre>
    </details>
  );
}

interface LogTableProps {
  logs: CoffeeLog[];
  loading: boolean;
  compact?: boolean;
}

export function LogTable({ logs, loading, compact }: LogTableProps): React.JSX.Element {
  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        Carregando logs...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontSize: 13, textAlign: "center", padding: 32 }}>
        Nenhum log encontrado.
      </div>
    );
  }

  return (
    <div className={`clog-wrap${compact ? " clog-compact" : ""}`}>
      <style>{LOG_STYLE}</style>
      <table className="clog-tbl">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Tipo</th>
            <th>Acao</th>
            {!compact && <th>Nota</th>}
            <th style={{ width: 50, textAlign: "center" }}>OK</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td title={l.timestamp}>
                <span className="edp-mono" style={{ fontSize: compact ? 11 : 12 }}>
                  {formatRelativeTime(l.timestamp)}
                </span>
              </td>
              <td>
                <span className={`clog-tag ${TIPO_CLASS[l.tipo] ?? ""}`}>
                  {TIPO_LABEL[l.tipo] ?? l.tipo}
                </span>
              </td>
              <td style={{ fontWeight: 500 }}>{l.acao}</td>
              {!compact && (
                <td>
                  {l.nota_pk !== null
                    ? <span className="edp-mono" style={{ fontWeight: 600 }}>{l.nota_pk}</span>
                    : <span style={{ color: "var(--text-mute)" }}>—</span>}
                </td>
              )}
              <td style={{ textAlign: "center" }}>
                {l.sucesso
                  ? <span style={{ color: "var(--green)" }} title="Sucesso">&#10003;</span>
                  : <span style={{ color: "var(--red)" }} title="Falha">&#10007;</span>}
              </td>
              <td><DetailsSummary detalhes={l.detalhes} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS. Component compiles but is not yet mounted anywhere.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/coffee-log-table.tsx
git commit -m "feat(coffee): LogTable component reutilizavel"
```

---

### Task 3: LogDrawer component

**Files:**
- Create: `frontend/src/coffee/coffee-log-drawer.tsx`

**Interfaces:**
- Consumes: `useCoffeeLogs` (Task 1), `LogTable` (Task 2)
- Produces: `LogDrawer({ notaPk, open, onClose }): React.JSX.Element` — fixed right panel, 360px, overlay, ESC/click-outside to close, slide animation, compact LogTable with tipo filter.

- [ ] **Step 1: Create `coffee-log-drawer.tsx`**

Create `frontend/src/coffee/coffee-log-drawer.tsx`:

```tsx
import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable } from './coffee-log-table';

const TIPOS = [
  { value: "", label: "Todos" },
  { value: "api_call", label: "API" },
  { value: "transicao", label: "Transicao" },
  { value: "acao_usuario", label: "Usuario" },
] as const;

interface LogDrawerProps {
  notaPk: number;
  open: boolean;
  onClose: () => void;
}

export function LogDrawer({ notaPk, open, onClose }: LogDrawerProps): React.JSX.Element | null {
  const [tipo, setTipo] = React.useState("");
  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: notaPk,
    tipo: tipo || undefined,
    limit: 50,
  });

  React.useEffect(() => {
    if (open) refresh();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* overlay */}
      <div onClick={onClose}
           style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 200 }} />

      {/* panel */}
      <div style={{ position: "fixed", top: 0, right: 0, width: 360, height: "100vh",
                    background: "var(--surface)", borderLeft: "1px solid var(--line)",
                    zIndex: 201, display: "flex", flexDirection: "column",
                    animation: "clog-slide-in 150ms ease" }}>
        <style>{`@keyframes clog-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* header */}
        <div style={{ height: 48, flexShrink: 0, display: "flex", alignItems: "center",
                      padding: "0 16px", borderBottom: "1px solid var(--line)", gap: 8 }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
            Logs — Nota <span className="edp-mono">#{notaPk}</span>
          </span>
          <button aria-label="Fechar" onClick={onClose}
                  style={{ width: 28, height: 28, border: 0, borderRadius: 6, cursor: "pointer",
                           background: "var(--surface-2)", color: "var(--text-mute)", fontSize: 14 }}>
            ✕
          </button>
        </div>

        {/* filtro tipo */}
        <div style={{ flexShrink: 0, padding: "10px 16px 6px", display: "flex", gap: 0 }}>
          <div className="edp-seg" style={{ fontSize: 11 }}>
            {TIPOS.map((t) => (
              <button key={t.value} className={tipo === t.value ? "on" : ""}
                      onClick={() => setTipo(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* table */}
        <LogTable logs={logs} loading={loading} compact />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/coffee-log-drawer.tsx
git commit -m "feat(coffee): LogDrawer painel lateral contextual"
```

---

### Task 4: Logs sub-page + CoffeeHub wiring + sidebar entry

**Files:**
- Create: `frontend/src/coffee/coffee-logs.tsx`
- Modify: `frontend/src/coffee/coffee-hub.tsx` (add Logs tab, rename Geradas->Gerar, import+render CoffeeLogs)
- Modify: `frontend/src/components/sidebar.tsx` (add `"logs"` to COFFEE_SUBS)

**Interfaces:**
- Consumes: `useCoffeeLogs` (Task 1), `LogTable` (Task 2), `CoffeeSubPage` with `"logs"` (Task 1)
- Produces: `CoffeeLogs` sub-page accessible from CoffeeHub header and sidebar. Header label "Geradas" renamed to "Gerar".

- [ ] **Step 1: Create `coffee-logs.tsx` sub-page**

Create `frontend/src/coffee/coffee-logs.tsx`:

```tsx
import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable } from './coffee-log-table';

const TIPOS = [
  { value: "", label: "Todos" },
  { value: "api_call", label: "API" },
  { value: "transicao", label: "Transicao" },
  { value: "acao_usuario", label: "Usuario" },
] as const;

const LIMITES = [50, 100, 500] as const;

export function CoffeeLogs(): React.JSX.Element {
  const [tipo, setTipo] = React.useState("");
  const [notaPk, setNotaPk] = React.useState("");
  const [limit, setLimit] = React.useState<number>(100);

  const parsedPk = notaPk.trim() ? Number(notaPk) : undefined;
  const { logs, loading } = useCoffeeLogs({
    tipo: tipo || undefined,
    nota_pk: Number.isFinite(parsedPk) ? parsedPk : undefined,
    limit,
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* filter bar */}
      <div style={{ flexShrink: 0, padding: "14px 22px 10px", display: "flex", alignItems: "center",
                    gap: 14, flexWrap: "wrap" }}>
        <div className="edp-seg">
          {TIPOS.map((t) => (
            <button key={t.value} className={tipo === t.value ? "on" : ""}
                    onClick={() => setTipo(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--text-mute)" }}>Nota:</label>
          <input type="number" placeholder="PK" value={notaPk}
                 onChange={(e) => setNotaPk(e.target.value)}
                 style={{ width: 90, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--text)", fontSize: 12,
                          fontFamily: "var(--font-mono)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--text-mute)" }}>Limite:</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)",
                           background: "var(--surface-2)", color: "var(--text)", fontSize: 12 }}>
            {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <LogTable logs={logs} loading={loading} />
    </div>
  );
}
```

- [ ] **Step 2: Wire up CoffeeHub — add Logs tab, rename Geradas, render CoffeeLogs**

In `frontend/src/coffee/coffee-hub.tsx`:

(a) Add import at top:

```ts
import { CoffeeLogs } from './coffee-logs';
```

(b) Change the `SUBS` array from:

```ts
const SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: "abrir", rotulo: "Abrir" },
  { id: "geradas", rotulo: "Geradas" },
  { id: "corrigidas", rotulo: "Corrigidas" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "verificar", rotulo: "Verificar" },
];
```

to:

```ts
const SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: "abrir", rotulo: "Abrir" },
  { id: "geradas", rotulo: "Gerar" },
  { id: "corrigidas", rotulo: "Corrigidas" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "verificar", rotulo: "Verificar" },
  { id: "logs", rotulo: "Logs" },
];
```

(c) Add `CoffeeLogs` to the render chain. Change:

```tsx
      ) : sub === "verificar" ? (
        <CoffeeVerificar />
      ) : null}
```

to:

```tsx
      ) : sub === "verificar" ? (
        <CoffeeVerificar />
      ) : sub === "logs" ? (
        <CoffeeLogs />
      ) : null}
```

- [ ] **Step 3: Add "Logs" to sidebar COFFEE_SUBS**

In `frontend/src/components/sidebar.tsx`, change the `COFFEE_SUBS` array from:

```ts
const COFFEE_SUBS: { id: CoffeeSubPage; label: string }[] = [
  { id: "abrir", label: "Abrir" },
  { id: "geradas", label: "Gerar" },
  { id: "corrigidas", label: "Corrigidas" },
  { id: "pendentes", label: "Pendentes" },
  { id: "verificar", label: "Verificar" },
];
```

to:

```ts
const COFFEE_SUBS: { id: CoffeeSubPage; label: string }[] = [
  { id: "abrir", label: "Abrir" },
  { id: "geradas", label: "Gerar" },
  { id: "corrigidas", label: "Corrigidas" },
  { id: "pendentes", label: "Pendentes" },
  { id: "verificar", label: "Verificar" },
  { id: "logs", label: "Logs" },
];
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS. The Logs sub-page is now accessible via header tab and sidebar.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/coffee/coffee-logs.tsx frontend/src/coffee/coffee-hub.tsx frontend/src/components/sidebar.tsx
git commit -m "feat(coffee): sub-pagina Logs + rename Geradas->Gerar no header"
```

---

### Task 5: Rewrite Gerar sub-page (`coffee-geradas.tsx`)

**Files:**
- Modify: `frontend/src/coffee/coffee-geradas.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useCoffeeNotas` (existing), `useCoffeeLogs` (Task 1), `CoffeeNotasTable` (existing), `LogDrawer` (Task 3), `CoffeeNota` (existing), `CoffeeLog` (Task 1), `formatRelativeTime` (Task 1 export)
- Produces: `CoffeeGeradas` component with two zones: regerar input + lifecycle card (top), notas geradas table with per-row regerar + logs buttons (bottom).

- [ ] **Step 1: Rewrite `coffee-geradas.tsx`**

Replace the entire content of `frontend/src/coffee/coffee-geradas.tsx` with:

```tsx
import React from 'react';
import type { CoffeeNota, CoffeeLog } from './types';
import { useCoffeeNotas } from './use-coffee-notas';
import { useCoffeeLogs } from './use-coffee-logs';
import { CoffeeNotasTable } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';

const API_BASE = localStorage.getItem("edp_api") || "/api";

type RegerarEstado = "idle" | "loading" | "ok" | "erro";

interface RegerarResult {
  nota: { pk: number; id_sap: number; arquivado: boolean; fields: Record<string, unknown> };
  transicoes: CoffeeLog[];
}

function TransicaoCard({ result, onVerLogs, onNova }: {
  result: RegerarResult;
  onVerLogs: () => void;
  onNova: () => void;
}): React.JSX.Element {
  const { nota, transicoes } = result;
  const classif = transicoes.find((t) => t.acao === "classificar");
  const arq = transicoes.find((t) => t.acao === "arquivar_estado");

  return (
    <div style={{ padding: 16, borderRadius: 10, background: "var(--surface-2)",
                  border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
        <div>
          <span style={{ color: "var(--text-mute)", fontSize: 11 }}>Classificacao</span>
          <div style={{ fontWeight: 600, marginTop: 2 }}>
            {classif
              ? <>{String(classif.detalhes?.anterior ?? "—")} <span style={{ color: "var(--text-mute)" }}>&rarr;</span> {String(classif.detalhes?.novo ?? "—")}</>
              : <span style={{ color: "var(--text-dim)" }}>{nota.fields?.classificacao as string ?? "sem transicao"}</span>}
          </div>
        </div>
        <div>
          <span style={{ color: "var(--text-mute)", fontSize: 11 }}>ID SAP</span>
          <div className="edp-mono" style={{ fontWeight: 600, marginTop: 2 }}>
            {classif?.detalhes?.id_sap_anterior != null
              ? <>{String(classif.detalhes.id_sap_anterior)} <span style={{ color: "var(--text-mute)" }}>&rarr;</span> {nota.id_sap}</>
              : nota.id_sap}
          </div>
        </div>
        <div>
          <span style={{ color: "var(--text-mute)", fontSize: 11 }}>Arquivado</span>
          <div style={{ fontWeight: 600, marginTop: 2 }}>
            {arq
              ? <>{arq.detalhes?.anterior ? "sim" : "nao"} <span style={{ color: "var(--text-mute)" }}>&rarr;</span> {arq.detalhes?.novo ? "sim" : "nao"}</>
              : (nota.arquivado ? "sim" : "nao")}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="edp-btn sm" onClick={onVerLogs} style={{ fontSize: 12 }}>Ver logs</button>
        <button className="edp-btn sm" onClick={onNova} style={{ fontSize: 12 }}>Regerar outra</button>
      </div>
    </div>
  );
}

export function CoffeeGeradas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // regerar state
  const [regerarId, setRegerarId] = React.useState("");
  const [regerarEstado, setRegerarEstado] = React.useState<RegerarEstado>("idle");
  const [regerarResult, setRegerarResult] = React.useState<RegerarResult | null>(null);
  const [regerarErro, setRegerarErro] = React.useState<string | null>(null);

  // per-row regerar state
  const [rowBusy, setRowBusy] = React.useState<Set<number>>(() => new Set());

  // drawer state
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);

  function regerar(id: number): Promise<void> {
    return fetch(`${API_BASE}/coffee/regerar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`POST /regerar -> ${res.status}`);
        return res.json();
      })
      .then((data: { ok: boolean; nota: RegerarResult["nota"] }) => {
        return fetch(`${API_BASE}/coffee/logs?nota_pk=${data.nota.pk}&tipo=transicao&limit=5`,
                     { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((logData: { logs: CoffeeLog[] }) => ({ nota: data.nota, transicoes: logData.logs }));
      });
  }

  function handleRegerar(): void {
    const id = Number(regerarId.trim());
    if (!Number.isFinite(id) || id <= 0) return;
    setRegerarEstado("loading");
    setRegerarErro(null);
    setRegerarResult(null);

    regerar(id)
      .then((result) => {
        setRegerarResult(result);
        setRegerarEstado("ok");
        refetch();
      })
      .catch((err: unknown) => {
        setRegerarErro(err instanceof Error ? err.message : String(err));
        setRegerarEstado("erro");
      });
  }

  function handleRowRegerar(pk: number): void {
    setRowBusy((s) => new Set(s).add(pk));
    regerar(pk)
      .then(() => refetch())
      .catch(() => {})
      .finally(() => setRowBusy((s) => { const n = new Set(s); n.delete(pk); return n; }));
  }

  function handleNova(): void {
    setRegerarEstado("idle");
    setRegerarResult(null);
    setRegerarErro(null);
    setRegerarId("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-mute)" }}>
        <span style={{ color: "var(--red)" }}>Erro ao carregar notas: {error}</span>
        <button className="edp-btn sm" onClick={refetch}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Zona 1: Regerar */}
      <div style={{ flexShrink: 0, padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12,
                    borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Regerar Nota</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input ref={inputRef} type="number" placeholder="ID da nota" value={regerarId}
                 onChange={(e) => setRegerarId(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") handleRegerar(); }}
                 style={{ width: 160, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--text)", fontSize: 13,
                          fontFamily: "var(--font-mono)" }} />
          <button className="edp-btn sm" style={{ fontWeight: 600, minWidth: 100 }}
                  disabled={!regerarId.trim() || regerarEstado === "loading"}
                  onClick={handleRegerar}>
            {regerarEstado === "loading" ? "Regenerando..." : "Regerar"}
          </button>
        </div>

        {regerarEstado === "erro" && regerarErro && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.12)",
                        color: "var(--red)", fontSize: 12 }}>
            {regerarErro}
          </div>
        )}

        {regerarEstado === "ok" && regerarResult && (
          <TransicaoCard result={regerarResult}
                         onVerLogs={() => setDrawerPk(regerarResult.nota.pk)}
                         onNova={handleNova} />
        )}
      </div>

      {/* Zona 2: Tabela de Geradas */}
      <div style={{ flexShrink: 0, padding: "14px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Notas Geradas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota gerada encontrada. Use o formulario acima para regerar uma nota."
        actionColumn={(nota) => {
          const busy = rowBusy.has(nota.pk);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="edp-btn sm" disabled={busy} onClick={() => handleRowRegerar(nota.pk)}
                      style={{ fontWeight: 600, fontSize: 12 }}>
                {busy ? "..." : "Regerar"}
              </button>
              <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                      title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
                Logs
              </button>
            </div>
          );
        }}
      />

      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/coffee-geradas.tsx
git commit -m "feat(coffee): sub-pagina Gerar com regerar + ciclo de vida + drawer"
```

---

### Task 6: Add LogDrawer to Corrigidas and Pendentes

**Files:**
- Modify: `frontend/src/coffee/coffee-corrigidas.tsx`
- Modify: `frontend/src/coffee/coffee-pendentes.tsx`

**Interfaces:**
- Consumes: `LogDrawer` (Task 3), `CoffeeNotasTable` `actionColumn` prop (existing)
- Produces: Both sub-pages gain a per-row "Logs" button that opens the LogDrawer.

- [ ] **Step 1: Add LogDrawer to `coffee-corrigidas.tsx`**

Replace the entire content of `frontend/src/coffee/coffee-corrigidas.tsx` with:

```tsx
import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';

export function CoffeeCorrigidas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("corrigida");
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-mute)" }}>
        <span style={{ color: "var(--red)" }}>Erro ao carregar notas: {error}</span>
        <button className="edp-btn sm" onClick={refetch}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Notas Corrigidas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div style={{ flexShrink: 0, padding: "0 22px 10px", fontSize: 12, color: "var(--text-dim)" }}>
        Notas que transitaram de pendente para SAP real. Na proxima busca, passam para Geradas.
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota corrigida no momento. Notas aparecem aqui quando transitam de SAP pendente para SAP real."
        actionColumn={(nota) => (
          <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                  title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
            Logs
          </button>
        )}
      />
      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add LogDrawer to `coffee-pendentes.tsx`**

In `frontend/src/coffee/coffee-pendentes.tsx`:

(a) Add import at the top alongside the others:

```ts
import { LogDrawer } from './coffee-log-drawer';
```

(b) Add drawer state inside the component, after the existing `timerRef`:

```ts
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);
```

(c) Add `actionColumn` to the `CoffeeNotasTable`. Change:

```tsx
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota pendente encontrada. Notas aparecem aqui quando buscadas com SAP 10000000."
      />
```

to:

```tsx
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota pendente encontrada. Notas aparecem aqui quando buscadas com SAP 10000000."
        actionColumn={(nota) => (
          <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                  title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
            Logs
          </button>
        )}
      />
      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}
```

Note: the `LogDrawer` must be placed right after the `CoffeeNotasTable` closing tag, still inside the outer `<div>` but outside the table.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/coffee-corrigidas.tsx frontend/src/coffee/coffee-pendentes.tsx
git commit -m "feat(coffee): botao de logs por linha em Corrigidas e Pendentes"
```

---

## Verificacao final (spec §9)

- [ ] Sub-pagina Logs aparece no header e sidebar do CoffeeHub. (Task 4)
- [ ] Filtros de tipo/nota/limite funcionam e atualizam imediatamente. (Task 4)
- [ ] LogDrawer abre e fecha com animacao suave, overlay funciona, ESC fecha. (Task 3)
- [ ] LogDrawer mostra logs filtrados por nota em modo compacto. (Task 3)
- [ ] Sub-pagina Gerar: input + regerar funciona, spinner durante request. (Task 5)
- [ ] Card de resultado mostra transicao (anterior -> novo) quando houver. (Task 5)
- [ ] Card mostra estado atual quando nao houver transicao. (Task 5)
- [ ] Erro de regerar mostra banner vermelho. (Task 5)
- [ ] Tabela de geradas tem botoes Regerar e Logs por linha. (Task 5)
- [ ] Regerar por linha atualiza a tabela automaticamente. (Task 5)
- [ ] Header do CoffeeHub mostra "Gerar" em vez de "Geradas". (Task 4)
- [ ] Corrigidas e Pendentes tem botao de logs por linha. (Task 6)
- [ ] `npm run build` sem erros. (every task)

## Fora de escopo

- Sub-pagina "Verificar" como triagem embutida (Sub-projeto 3)
- Paginacao com offset
- Filtro por range de data
- Regerar em lote
- Limpeza/retencao de logs
