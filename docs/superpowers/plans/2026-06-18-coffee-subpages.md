# Sub-paginas COFFEE: Tabelas e Acoes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 placeholder COFFEE sub-pages (Geradas, Corrigidas, Pendentes, Verificar) with real tables consuming `GET /api/coffee/notas` and page-specific actions.

**Architecture:** A shared `useCoffeeNotas(status?)` hook fetches data from the backend. A reusable `CoffeeNotasTable` renders the standard 4-column table. Four thin wrapper components add page-specific headers, banners, and actions. The hub routes to these instead of the generic placeholder.

**Tech Stack:** React 18, TypeScript, Vite, native `fetch`

## Global Constraints

- All new files go in `frontend/src/coffee/`
- No backend changes — all endpoints already exist
- Native `fetch` for API calls (project standard — no axios/swr)
- CSS uses project design tokens: `var(--surface)`, `var(--line)`, `var(--text)`, `var(--accent)`, `var(--green)`, `var(--amber)`, `var(--bg-2)`, etc.
- Font classes: `edp-mono` for monospace, `edp-eyebrow` for small labels, `edp-btn` for buttons
- Build must pass: `cd frontend && npx tsc -b --noEmit && npx vite build`
- Code-splitting preserved (everything in the coffee chunk via existing lazy import in App.tsx)
- SAP_PENDENTE magic number is `10000000`
- Backend API base path is `/api` (from `localStorage.getItem("edp_api") || "/api"`)
- The COFFEE API key must NEVER appear in frontend code

---

### Task 1: Types + data hook

**Files:**
- Create: `frontend/src/coffee/types.ts`
- Create: `frontend/src/coffee/use-coffee-notas.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `CoffeeNota` interface (pk, id_sap, id_sap_anterior, arquivado, classificacao, dados_json, buscado_em, erro)
  - `CoffeeJob` interface (estado, total, feitas, erros, iniciado_em)
  - `useCoffeeNotas(status?: string)` hook returning `{ notas: CoffeeNota[]; isLoading: boolean; error: string | null; refetch: () => void }`

- [ ] **Step 1: Create `frontend/src/coffee/types.ts`**

```typescript
export interface CoffeeNota {
  pk: number;
  id_sap: number;
  id_sap_anterior: number | null;
  arquivado: boolean | null;
  classificacao: string;
  dados_json: Record<string, unknown> | null;
  buscado_em: string;
  erro: string | null;
}

export interface CoffeeJob {
  estado: "rodando" | "concluido";
  total: number;
  feitas: number;
  erros: Array<{ pk: number | string; msg: string }>;
  iniciado_em: string;
}
```

- [ ] **Step 2: Create `frontend/src/coffee/use-coffee-notas.ts`**

```typescript
import React from 'react';
import type { CoffeeNota } from './types';

const API_BASE = localStorage.getItem("edp_api") || "/api";

interface UseCoffeeNotasResult {
  notas: CoffeeNota[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCoffeeNotas(status?: string): UseCoffeeNotasResult {
  const [notas, setNotas] = React.useState<CoffeeNota[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  const refetch = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const url = status
      ? `${API_BASE}/coffee/notas?status=${encodeURIComponent(status)}`
      : `${API_BASE}/coffee/notas`;

    fetch(url, { headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
        return res.json();
      })
      .then((data: { registros: CoffeeNota[] }) => {
        if (!cancelled) {
          setNotas(data.registros);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [status, tick]);

  return { notas, isLoading, error, refetch };
}
```

- [ ] **Step 3: Verify build**

Run: `cd C:/Users/e713611/Documents/EDP---Verify/frontend && npx tsc -b --noEmit && npx vite build`
Expected: SUCCESS (new files are not yet imported by anything, but must be valid TypeScript)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/types.ts frontend/src/coffee/use-coffee-notas.ts
git commit -m "feat(coffee): tipos CoffeeNota/CoffeeJob e hook useCoffeeNotas"
```

---

### Task 2: Reusable table component

**Files:**
- Create: `frontend/src/coffee/coffee-notas-table.tsx`

**Interfaces:**
- Consumes: `CoffeeNota` from `./types`
- Produces: `CoffeeNotasTable` component with props `{ notas: CoffeeNota[]; isLoading: boolean; emptyMessage?: string; actionColumn?: (nota: CoffeeNota) => React.ReactNode }`

- [ ] **Step 1: Create `frontend/src/coffee/coffee-notas-table.tsx`**

```tsx
import React from 'react';
import type { CoffeeNota } from './types';

const SAP_PENDENTE = 10000000;

const TABLE_STYLE = `
  .cnt-wrap{flex:1;min-height:0;overflow:auto;padding:0 22px 24px}
  .cnt-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
  .cnt-tbl th{position:sticky;top:0;background:var(--surface);text-align:left;padding:10px 12px;
    font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mute);
    border-bottom:2px solid var(--line)}
  .cnt-tbl td{padding:10px 12px;border-bottom:1px solid var(--line);color:var(--text)}
  .cnt-tbl tr:hover td{background:var(--surface-2)}
  .cnt-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.03em}
  .cnt-tag.gerada{background:var(--tint-green);color:var(--green)}
  .cnt-tag.corrigida{background:rgba(31,159,214,0.14);color:#1f9fd6}
  .cnt-tag.pendente{background:var(--tint-amber);color:var(--amber)}
`;

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `ha ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `ha ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `ha ${days}d`;
  return d.toLocaleDateString("pt-BR");
}

interface CoffeeNotasTableProps {
  notas: CoffeeNota[];
  isLoading: boolean;
  emptyMessage?: string;
  actionColumn?: (nota: CoffeeNota) => React.ReactNode;
}

export function CoffeeNotasTable({ notas, isLoading, emptyMessage, actionColumn }: CoffeeNotasTableProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        Carregando notas...
      </div>
    );
  }

  if (notas.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontSize: 13, textAlign: "center", padding: 32 }}>
        {emptyMessage ?? "Nenhuma nota encontrada."}
      </div>
    );
  }

  return (
    <div className="cnt-wrap">
      <style>{TABLE_STYLE}</style>
      <table className="cnt-tbl">
        <thead>
          <tr>
            <th>ID</th>
            <th>SAP</th>
            <th>Status</th>
            <th>Ultima busca</th>
            {actionColumn && <th>Acoes</th>}
          </tr>
        </thead>
        <tbody>
          {notas.map((n) => (
            <tr key={n.pk}>
              <td><span className="edp-mono" style={{ fontWeight: 600 }}>{n.pk}</span></td>
              <td>
                <span className="edp-mono">{n.id_sap}</span>
                {n.id_sap === SAP_PENDENTE && (
                  <span className="cnt-tag pendente" style={{ marginLeft: 8 }}>Pendente</span>
                )}
              </td>
              <td><span className={`cnt-tag ${n.classificacao}`}>{n.classificacao}</span></td>
              <td style={{ color: "var(--text-mute)", fontSize: 12 }}>
                {n.buscado_em ? formatRelativeTime(n.buscado_em) : "—"}
              </td>
              {actionColumn && <td>{actionColumn(n)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd C:/Users/e713611/Documents/EDP---Verify/frontend && npx tsc -b --noEmit && npx vite build`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/coffee-notas-table.tsx
git commit -m "feat(coffee): componente de tabela reutilizavel CoffeeNotasTable"
```

---

### Task 3: Geradas, Corrigidas, and Verificar sub-pages

**Files:**
- Create: `frontend/src/coffee/coffee-geradas.tsx`
- Create: `frontend/src/coffee/coffee-corrigidas.tsx`
- Create: `frontend/src/coffee/coffee-verificar.tsx`

**Interfaces:**
- Consumes: `CoffeeNota` from `./types`, `useCoffeeNotas` from `./use-coffee-notas`, `CoffeeNotasTable` from `./coffee-notas-table`
- Produces: `CoffeeGeradas`, `CoffeeCorrigidas`, `CoffeeVerificar` — all named exports, zero props

- [ ] **Step 1: Create `frontend/src/coffee/coffee-geradas.tsx`**

```tsx
import React from 'react';
import type { CoffeeNota } from './types';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';

const API_BASE = localStorage.getItem("edp_api") || "/api";

export function CoffeeGeradas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const [arquivando, setArquivando] = React.useState<Set<number>>(() => new Set());
  const [arquivadas, setArquivadas] = React.useState<Set<number>>(() => new Set());
  const [errosArquivar, setErrosArquivar] = React.useState<Map<number, string>>(() => new Map());

  function arquivar(nota: CoffeeNota): void {
    setArquivando((prev) => new Set(prev).add(nota.pk));
    setErrosArquivar((prev) => { const m = new Map(prev); m.delete(nota.pk); return m; });

    fetch(`${API_BASE}/coffee/sap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: nota.pk, sap: nota.id_sap }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`POST /sap -> ${res.status}`);
        setArquivadas((prev) => new Set(prev).add(nota.pk));
        setTimeout(refetch, 1500);
      })
      .catch((err: unknown) => {
        setErrosArquivar((prev) => new Map(prev).set(nota.pk, err instanceof Error ? err.message : String(err)));
      })
      .finally(() => {
        setArquivando((prev) => { const s = new Set(prev); s.delete(nota.pk); return s; });
      });
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
      <div style={{ flexShrink: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Notas Geradas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota gerada encontrada. Notas aparecem aqui apos serem buscadas com SAP real."
        actionColumn={(nota) => {
          const busy = arquivando.has(nota.pk);
          const done = arquivadas.has(nota.pk);
          const errMsg = errosArquivar.get(nota.pk);
          if (done) {
            return <span className="cnt-tag gerada" style={{ opacity: 0.7 }}>Arquivada</span>;
          }
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="edp-btn sm" disabled={busy} onClick={() => arquivar(nota)}
                      style={{ fontWeight: 600, fontSize: 12 }}>
                {busy ? "Arquivando..." : "Arquivar"}
              </button>
              {errMsg && <span style={{ fontSize: 11, color: "var(--red)" }}>{errMsg}</span>}
            </div>
          );
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/coffee/coffee-corrigidas.tsx`**

```tsx
import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';

export function CoffeeCorrigidas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("corrigida");

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
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/coffee/coffee-verificar.tsx`**

```tsx
import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';

export function CoffeeVerificar(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas();

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
        <span style={{ fontSize: 15, fontWeight: 700 }}>Verificar Notas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "8px 22px 10px",
                    background: "var(--tint-amber)", borderBottom: "1px solid rgba(240,169,59,.3)", fontSize: 13 }}>
        <span style={{ fontSize: 15 }}>🚧</span>
        <span>Em breve: verificacao automatica de regras para notas COFFEE</span>
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota no banco COFFEE. Busque notas pela pagina Pendentes ou Abrir Notas."
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd C:/Users/e713611/Documents/EDP---Verify/frontend && npx tsc -b --noEmit && npx vite build`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/coffee/coffee-geradas.tsx frontend/src/coffee/coffee-corrigidas.tsx frontend/src/coffee/coffee-verificar.tsx
git commit -m "feat(coffee): sub-paginas Geradas, Corrigidas e Verificar"
```

---

### Task 4: Pendentes sub-page with batch fetch + progress

**Files:**
- Create: `frontend/src/coffee/coffee-pendentes.tsx`

**Interfaces:**
- Consumes: `CoffeeNota`, `CoffeeJob` from `./types`, `useCoffeeNotas` from `./use-coffee-notas`, `CoffeeNotasTable` from `./coffee-notas-table`
- Produces: `CoffeePendentes` — named export, zero props

- [ ] **Step 1: Create `frontend/src/coffee/coffee-pendentes.tsx`**

```tsx
import React from 'react';
import type { CoffeeJob } from './types';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';

const API_BASE = localStorage.getItem("edp_api") || "/api";

type BuscaEstado = "idle" | "rodando" | "concluido";

export function CoffeePendentes(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("pendente");
  const [buscaEstado, setBuscaEstado] = React.useState<BuscaEstado>("idle");
  const [buscaJob, setBuscaJob] = React.useState<CoffeeJob | null>(null);
  const [buscaErro, setBuscaErro] = React.useState<string | null>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => { if (timerRef.current !== null) clearInterval(timerRef.current); };
  }, []);

  function iniciarBusca(): void {
    if (notas.length === 0) return;
    setBuscaEstado("rodando");
    setBuscaJob(null);
    setBuscaErro(null);

    const ids = notas.map((n) => String(n.pk));

    fetch(`${API_BASE}/coffee/buscar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`POST /buscar -> ${res.status}`);
        return res.json();
      })
      .then((data: { job_id: string }) => {
        const jobId = data.job_id;
        timerRef.current = window.setInterval(() => {
          fetch(`${API_BASE}/coffee/job/${encodeURIComponent(jobId)}`, {
            headers: { Accept: "application/json" },
          })
            .then((r) => {
              if (!r.ok) throw new Error(`GET /job -> ${r.status}`);
              return r.json();
            })
            .then((job: CoffeeJob) => {
              setBuscaJob(job);
              if (job.estado === "concluido") {
                if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
                setBuscaEstado("concluido");
                refetch();
                setTimeout(() => setBuscaEstado("idle"), 3000);
              }
            })
            .catch((err: unknown) => {
              if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
              setBuscaErro(err instanceof Error ? err.message : String(err));
              setBuscaEstado("idle");
            });
        }, 2000);
      })
      .catch((err: unknown) => {
        setBuscaErro(err instanceof Error ? err.message : String(err));
        setBuscaEstado("idle");
      });
  }

  const pct = buscaJob && buscaJob.total > 0 ? Math.round((buscaJob.feitas / buscaJob.total) * 100) : 0;
  const concluido = buscaEstado === "concluido";

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
      <div style={{ flexShrink: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Notas Pendentes</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="edp-btn sm" style={{ fontWeight: 600 }}
                disabled={buscaEstado === "rodando" || isLoading || notas.length === 0}
                onClick={iniciarBusca}>
          {buscaEstado === "rodando" ? "Buscando..." : "Atualizar notas"}
        </button>
      </div>

      {buscaEstado !== "idle" && buscaJob && (
        <div style={{ flexShrink: 0, padding: "0 22px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: pct + "%", borderRadius: 999,
                          background: concluido ? "var(--green)" : "var(--accent)",
                          transition: "width .3s ease, background .3s ease" }} />
          </div>
          <span className="edp-mono" style={{ fontSize: 11.5, color: concluido ? "var(--green)" : "var(--text-mute)" }}>
            {concluido
              ? "Concluido"
              : `${pct}% · Buscando nota ${buscaJob.feitas} de ${buscaJob.total}...`}
          </span>
          {concluido && buscaJob.erros.length > 0 && (
            <details style={{ fontSize: 12, color: "var(--text-dim)" }}>
              <summary style={{ cursor: "pointer", color: "var(--amber)" }}>
                {buscaJob.erros.length} erro{buscaJob.erros.length !== 1 ? "s" : ""} durante a busca
              </summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {buscaJob.erros.map((e, i) => (
                  <li key={i}><span className="edp-mono">{e.pk}</span>: {e.msg}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {buscaErro && (
        <div style={{ flexShrink: 0, padding: "8px 22px", fontSize: 12, color: "var(--red)" }}>
          Erro na busca: {buscaErro}
        </div>
      )}

      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage="Nenhuma nota pendente encontrada. Notas aparecem aqui quando buscadas com SAP 10000000."
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd C:/Users/e713611/Documents/EDP---Verify/frontend && npx tsc -b --noEmit && npx vite build`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/coffee-pendentes.tsx
git commit -m "feat(coffee): sub-pagina Pendentes com busca em lote e progresso"
```

---

### Task 5: Wire sub-pages into CoffeeHub

**Files:**
- Modify: `frontend/src/coffee/coffee-hub.tsx`

**Interfaces:**
- Consumes: `CoffeeGeradas` from `./coffee-geradas`, `CoffeeCorrigidas` from `./coffee-corrigidas`, `CoffeePendentes` from `./coffee-pendentes`, `CoffeeVerificar` from `./coffee-verificar`
- Produces: updated `CoffeeHub` that routes to real sub-pages instead of placeholders

- [ ] **Step 1: Update `frontend/src/coffee/coffee-hub.tsx`**

Replace the full file content:

```tsx
import React from 'react';
import type { Note, CoffeeSubPage } from '../types';
import { usePersistedState } from '../hooks/use-persisted-state';
import { CoffeeAbrir } from './coffee-abrir';
import { CoffeeGeradas } from './coffee-geradas';
import { CoffeeCorrigidas } from './coffee-corrigidas';
import { CoffeePendentes } from './coffee-pendentes';
import { CoffeeVerificar } from './coffee-verificar';

const SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: "abrir", rotulo: "Abrir" },
  { id: "geradas", rotulo: "Geradas" },
  { id: "corrigidas", rotulo: "Corrigidas" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "verificar", rotulo: "Verificar" },
];

interface CoffeeHubProps {
  notes: Note[];
  layout: "composer" | "split";
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeHub({ notes, layout, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeHubProps): React.JSX.Element {
  const [sub, setSub] = usePersistedState<CoffeeSubPage>("edp_coffee_sub", "abrir");

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 16,
                    padding: "0 22px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <strong style={{ fontSize: 14 }}>COFFEE</strong>
        <div className="edp-seg">
          {SUBS.map((s) => (
            <button key={s.id} className={sub === s.id ? "on" : ""} onClick={() => setSub(s.id)}>{s.rotulo}</button>
          ))}
        </div>
      </div>

      {sub === "abrir" ? (
        <CoffeeAbrir notes={notes} layout={layout}
                     coffeeReturn={coffeeReturn} onClearReturn={onClearReturn}
                     onBackToTriagem={onBackToTriagem} />
      ) : sub === "geradas" ? (
        <CoffeeGeradas />
      ) : sub === "corrigidas" ? (
        <CoffeeCorrigidas />
      ) : sub === "pendentes" ? (
        <CoffeePendentes />
      ) : sub === "verificar" ? (
        <CoffeeVerificar />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd C:/Users/e713611/Documents/EDP---Verify/frontend && npx tsc -b --noEmit && npx vite build`
Expected: SUCCESS — 3 chunks (main, coffee, input). The coffee chunk now includes all sub-page components.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/coffee-hub.tsx
git commit -m "feat(coffee): hub roteia para sub-paginas reais em vez de placeholders"
```

---

## Verificacao final

- [ ] `cd frontend && npx tsc -b --noEmit && npx vite build` — SUCCESS, 3 chunks (main, coffee, input).
- [ ] Geradas: tabela carrega ao montar, botao "Arquivar" chama POST /sap e atualiza.
- [ ] Corrigidas: tabela read-only com banner informativo sobre estado transitorio.
- [ ] Pendentes: tabela + botao "Atualizar notas" com barra de progresso e polling.
- [ ] Verificar: tabela geral com banner "em breve".
- [ ] Estado vazio tratado em todas as paginas.
- [ ] Estado de erro com botao "Tentar de novo" em todas as paginas.
- [ ] Code-splitting preservado (tudo no chunk coffee).
