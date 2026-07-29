# Refatoração SP1 — Limpeza + Estrutura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code (legacy Python panel, duplicate docs, demo mode), merge the two frontend CSS files into one `app.css` source of truth, and reorganize the frontend into a `features/` layout — with zero behavior change other than the deliberate removal of demo mode.

**Architecture:** Mechanical refactor executed as an ordered sequence of independently-verifiable blocks: deletions first (cheapest, proves nothing depends on the dead code), then demo-mode removal (touches App.tsx/types.ts/upload-screen.tsx while they're still at their original paths), then the CSS merge, then two directory-move blocks (`features/verificar/` first, then `features/coffee/` + `features/input/` + `features/configuracoes/`, in that order because the second block's `coffee-verificar.tsx` imports from the first block's new location), then documentation updates, then a final full-repo verification pass.

**Tech Stack:** No new dependencies. Frontend: React 18 + TypeScript + Vite (alias `@` → `./src`, already configured). Backend: FastAPI + pytest (untouched by this plan except for deletions with zero imports).

## Global Constraints

- Zero behavior change except: demo mode is removed entirely (approved in the spec).
- `src/components/ui/` (shadcn) is editable directly per project decision recorded in this plan's Task 5 (CLAUDE.md rewrite) — not exercised in this plan otherwise, since SP1 touches no `ui/` files.
- No new npm or pip dependencies.
- After every task: `cd backend && .venv/Scripts/python.exe -m pytest -q` must stay green (only touched by Task 1), and `cd frontend && npm run build` must pass (tsc -b + vite build) after every frontend-touching task.
- Commit after each task with a Conventional Commits message; small commits, no `--no-verify`.
- Branch: `refactor/sp1-limpeza-estrutura` off `develop` (created in Task 0), merged back at the end via the normal finishing-a-development-branch flow (not part of this plan — happens after Task 6).

---

### Task 0: Create the refactor branch

**Files:** none (git operation only).

- [ ] **Step 1: Confirm clean working tree and create branch**

Run:
```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify" && git status --short
```
Expected: only pre-existing untracked `.agents/` and `skills-lock.json` (not part of this work — leave untouched). No modified tracked files.

- [ ] **Step 2: Create and switch to the branch**

Run:
```bash
git checkout -b refactor/sp1-limpeza-estrutura
```
Expected: `Switched to a new branch 'refactor/sp1-limpeza-estrutura'`

---

### Task 1: Delete dead legacy code

**Files:**
- Delete: `Input/` (7 files: `Sap_Robot.py`, `app.py`, `config.py`, `database.py`, `executar_painel.py`, `import pyodbc.py`, `processamento.py`)
- Delete: `backend/new_input_modules/` (9 files including `notas_departamento.db`)
- Delete: `backend/SQL.py`
- Delete: `DESIGN-supabase.md`
- Delete: `backend/docs/` (1 file: `superpowers/plans/2026-06-18-coffee-foundation.md`, byte-identical to `docs/superpowers/plans/2026-06-18-coffee-foundation.md`)

**Interfaces:** none — verified zero importers of any of these paths (`grep -rn "new_input_modules\|from Input\|import Input"` and `grep -rn "import SQL\|from SQL"` across `backend/` returned nothing outside `.venv`/the folders themselves).

- [ ] **Step 1: Delete the legacy Python panel and dead docs**

Run:
```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify"
git rm -r Input backend/new_input_modules backend/SQL.py DESIGN-supabase.md backend/docs
```
Expected: output lists all removed files, no errors.

- [ ] **Step 2: Verify backend still passes**

Run:
```bash
cd backend && .venv/Scripts/python.exe -m pytest -q
```
Expected: all tests pass (same count as before deletion — these files had zero imports).

- [ ] **Step 3: Verify frontend still builds** (nothing here touches frontend, this just confirms baseline before further changes)

Run:
```bash
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify"
git add -A
git commit -m "chore: remove dead legacy code and duplicate docs

Input/ (root) and backend/new_input_modules/ are an old Streamlit
panel superseded by input_module/; backend/SQL.py, DESIGN-supabase.md
and backend/docs/ are unreferenced duplicates. Nothing imports any of
these — verified via grep before deletion."
```

---

### Task 2: Remove frontend demo mode

**Files:**
- Delete: `frontend/src/data.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/upload-screen.tsx`
- Modify: `frontend/src/coffee/coffee-verificar.tsx`
- Modify: `frontend/src/coffee/coffee-hub.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Source` type narrows to `"api"` only (still exported from `types.ts`, still used by `FetchResult.source`, `TriageHandoff.source`, `App.tsx`'s `source` state — all of which keep compiling since `"api" === "api"` is valid). `UploadScreenProps` and `TriageHandoff` no longer have `onDemo`.

- [ ] **Step 1: Delete the demo dataset**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify"
git rm frontend/src/data.ts
```

- [ ] **Step 2: Simplify `types.ts`**

In `frontend/src/types.ts`, change:
```ts
export type Source = "demo" | "api";
```
to:
```ts
export type Source = "api";
```

Then remove the `EdpDemo` interface (its only consumer was `data.ts`, just deleted):
```ts
export interface EdpDemo {
  notes: Note[];
  file: string;
  defaultDone: string[];
  defaultDup: string[];
}
```
(delete this whole block).

Then in `UploadScreenProps`, remove the `onDemo` line:
```ts
export interface UploadScreenProps {
  theme?: Theme;
  onUpload: (file: File) => Promise<void>;
  onDemo: (name?: string) => void;
}
```
becomes:
```ts
export interface UploadScreenProps {
  theme?: Theme;
  onUpload: (file: File) => Promise<void>;
}
```

- [ ] **Step 3: Remove the demo button and prop from `upload-screen.tsx`**

In `frontend/src/components/upload-screen.tsx`, change the component signature:
```tsx
export const UploadScreen: React.FC<UploadScreenProps> = ({
  theme = "dark",
  onUpload,
  onDemo,
}) => {
```
to:
```tsx
export const UploadScreen: React.FC<UploadScreenProps> = ({
  theme = "dark",
  onUpload,
}) => {
```

Fix the error message (it currently tells the user to fall back to a demo that will no longer exist):
```tsx
      setErr(
        "Não foi possível conectar ao backend (" +
          EDPApi.BASE +
          "). Verifique se o servidor FastAPI está rodando — ou use a demonstração abaixo.",
      );
```
to:
```tsx
      setErr(
        "Não foi possível conectar ao backend (" +
          EDPApi.BASE +
          "). Verifique se o servidor FastAPI está rodando.",
      );
```

Remove the demo button block entirely (it's the last element inside the outer `<div>`, right after the closing `</label>`):
```tsx
      </label>

      <button
        onClick={() => onDemo()}
        style={{
          zIndex: 1,
          background: "transparent",
          border: "none",
          color: "var(--text-mute)",
          fontSize: 12.5,
          cursor: "pointer",
          fontFamily: "var(--font-body)",
        }}
      >
        ou{" "}
        <span
          style={{
            color: "var(--accent)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          ver demonstração
        </span>{" "}
        com dados de exemplo
      </button>
    </div>
  );
};
```
becomes:
```tsx
      </label>
    </div>
  );
};
```

- [ ] **Step 4: Remove `onDemo` from `TriageHandoff` in `coffee-verificar.tsx`**

In `frontend/src/coffee/coffee-verificar.tsx`, remove this line from the `TriageHandoff` interface:
```ts
  onDemo: (name?: string) => void;
```

And remove the now-unused prop pass-through in the JSX:
```tsx
        <UploadScreen theme={triage.resolvedTheme} onDemo={triage.onDemo} onUpload={triage.onUpload} />
```
becomes:
```tsx
        <UploadScreen theme={triage.resolvedTheme} onUpload={triage.onUpload} />
```

- [ ] **Step 5: Simplify the API/Demo badge in `coffee-hub.tsx`**

In `frontend/src/coffee/coffee-hub.tsx`, replace:
```tsx
              <span title={triage.source === "api" ? "Conectado ao backend" : "Dados de demonstração (offline)"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5,
                             fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase",
                             padding: "4px 9px", borderRadius: 999,
                             color: triage.source === "api" ? "var(--green)" : "var(--amber)",
                             background: triage.source === "api" ? "var(--tint-green)" : "var(--tint-amber)",
                             border: "1px solid " + (triage.source === "api" ? "rgba(0,168,89,.3)" : "rgba(240,169,59,.3)") }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                {triage.source === "api" ? "API" : "Demo"}
              </span>
```
with:
```tsx
              <span title="Conectado ao backend"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5,
                             fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase",
                             padding: "4px 9px", borderRadius: 999,
                             color: "var(--green)", background: "var(--tint-green)",
                             border: "1px solid rgba(0,168,89,.3)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                API
              </span>
```

- [ ] **Step 6: Remove demo state and handlers from `App.tsx`**

In `frontend/src/App.tsx`:

Leave the type-only import line unchanged — `Source` is still needed by the
local `TriageSnapshot` interface (`source: Source;`), just further down in
this same file:
```tsx
import type { Note, Source, AppSection, CoffeeSubPage } from './types';
```
(no change to this line)

Remove the `EDP_DEMO` import entirely:
```tsx
import { EDP_DEMO } from './data';
```
(delete this line)

Change the `source` state initializer's fallback value only — keep the
explicit `<Source>` type argument:
```tsx
  const [source, setSource] = React.useState<Source>(_snap?.source ?? "demo");
```
becomes:
```tsx
  const [source, setSource] = React.useState<Source>(_snap?.source ?? "api");
```

Simplify the `apiData` effect condition (remove the dead `source === "demo"` branch):
```tsx
  React.useEffect(() => {
    if (_snap) return;
    if (!apiData?.notes?.length || screen !== "upload" || source === "demo") return;
    setNotes(apiData.notes);
    setCompleted(apiData.completed);
    setSource("api");
    setFile(localStorage.getItem("edp_file") ?? "planilha carregada");
    setScreen("dashboard");
  }, [apiData]); // eslint-disable-line react-hooks/exhaustive-deps
```
becomes:
```tsx
  React.useEffect(() => {
    if (_snap) return;
    if (!apiData?.notes?.length || screen !== "upload") return;
    setNotes(apiData.notes);
    setCompleted(apiData.completed);
    setSource("api");
    setFile(localStorage.getItem("edp_file") ?? "planilha carregada");
    setScreen("dashboard");
  }, [apiData]); // eslint-disable-line react-hooks/exhaustive-deps
```

Remove the `loadDemo` function entirely:
```tsx
  function loadDemo(name?: string): void {
    limparFiltrosVerify();
    limparSnapshot();
    const savedDone = JSON.parse(localStorage.getItem("edp_demo_done") ?? "null") as string[] | null;
    const savedDup = JSON.parse(localStorage.getItem("edp_demo_dup") ?? "null") as string[] | null;
    setNotes(EDP_DEMO.notes);
    setCompleted(new Set(savedDone ?? EDP_DEMO.defaultDone));
    setDupResolved(new Set(savedDup ?? EDP_DEMO.defaultDup));
    setSource("demo"); setFile(name ?? EDP_DEMO.file); setScreen("dashboard");
    toast("Dados de demonstração carregados");
  }

```
(delete this whole block, including the trailing blank line before `async function handleUpload`)

Remove the `persistDone`/`persistDup` functions:
```tsx
  function persistDone(set: Set<string>): void { if (source === "demo") localStorage.setItem("edp_demo_done", JSON.stringify([...set])); }
  function persistDup(set: Set<string>): void { if (source === "demo") localStorage.setItem("edp_demo_dup", JSON.stringify([...set])); }

```
(delete this whole block, including the trailing blank line before `function toggleComplete`)

Remove their call sites. In `toggleComplete`:
```tsx
    setCompleted((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); persistDone(s); return s; });
    if (reopening) setDupResolved((prev) => { const s = new Set(prev); s.delete(id); persistDup(s); return s; });
```
becomes:
```tsx
    setCompleted((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
    if (reopening) setDupResolved((prev) => { const s = new Set(prev); s.delete(id); return s; });
```

In `markMany`:
```tsx
    setCompleted((prev) => {
      const s = new Set(prev);
      targets.forEach((id) => { if (marking) s.add(id); else s.delete(id); });
      persistDone(s);
      return s;
    });
```
becomes:
```tsx
    setCompleted((prev) => {
      const s = new Set(prev);
      targets.forEach((id) => { if (marking) s.add(id); else s.delete(id); });
      return s;
    });
```

In `markDuplicate`:
```tsx
    setDupResolved((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); persistDup(s); return s; });
    setCompleted((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); persistDone(s); return s; });
```
becomes:
```tsx
    setDupResolved((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); return s; });
    setCompleted((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); return s; });
```

Finally, remove `onDemo: loadDemo,` from the `triage` object literal:
```tsx
    onUpload: handleUpload,
    onDemo: loadDemo,
    onReset: () => { setCoffeeReturn(null); limparSnapshot(); setScreen("upload"); },
```
becomes:
```tsx
    onUpload: handleUpload,
    onReset: () => { setCoffeeReturn(null); limparSnapshot(); setScreen("upload"); },
```

- [ ] **Step 7: Verify the frontend builds**

```bash
cd frontend && npm run build
```
Expected: `tsc -b` reports no errors (no type errors from the narrowed
`Source`, no unused-import errors — `Source` is still consumed by
`TriageSnapshot` in `App.tsx` and by `TriageHandoff` in
`coffee-verificar.tsx`), vite build succeeds.

- [ ] **Step 8: Manual smoke test**

```bash
cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000 &
cd frontend && npm run dev &
```
Open `http://localhost:5173`, confirm the upload screen no longer shows "ou ver demonstração com dados de exemplo", and that the COFFEE hub header badge always reads "API" (green) once a spreadsheet is loaded. Stop both dev servers when done.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify"
git add -A
git commit -m "refactor(frontend): remove demo mode

Demo mode (offline sample dataset) is no longer needed — the app
requires the backend. Removes data.ts, EdpDemo, onDemo prop chain,
the 'ver demonstração' button, and localStorage-based demo
persistence (edp_demo_done/edp_demo_dup). Source narrows to 'api'."
```

---

### Task 3: Merge index.css + tokens.css into app.css

**Files:**
- Create: `frontend/src/app.css` (concatenation of the two files below, in this order)
- Delete: `frontend/src/index.css`
- Delete: `frontend/src/tokens.css`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/components.json`

**Interfaces:** none — pure file consolidation, no selectors or custom properties change.

- [ ] **Step 1: Concatenate the two files into app.css**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend/src"
{ cat index.css; echo; echo; cat tokens.css; } > app.css
git rm index.css tokens.css
git add app.css
```

- [ ] **Step 2: Fix the two stale cross-file comments left over from the merge**

In `frontend/src/app.css`, find (originally from `index.css`):
```css
/* Bridge: expõe as vars semânticas (definidas em tokens.css, dentro de .edp)
   como cores/raios/fontes utilitárias do Tailwind. */
```
change to:
```css
/* Bridge: expõe as vars semânticas (definidas abaixo, dentro de .edp)
   como cores/raios/fontes utilitárias do Tailwind. */
```

And find (originally from `tokens.css`):
```css
/* ============================================================
   Reset "preflight-lite" escopado para superfícies shadcn
   (preflight global ainda OFF — ver index.css).

   CRÍTICO: este reset vai na layer `base`. O index.css declara
   `@layer theme, base, components, utilities`, então `base` PERDE
```
change to:
```css
/* ============================================================
   Reset "preflight-lite" escopado para superfícies shadcn
   (preflight global ainda OFF — ver topo deste arquivo).

   CRÍTICO: este reset vai na layer `base`. Este arquivo declara
   `@layer theme, base, components, utilities`, então `base` PERDE
```

- [ ] **Step 3: Update `main.tsx` to import the merged file**

In `frontend/src/main.tsx`, change:
```tsx
import './index.css';
import './tokens.css';
```
to:
```tsx
import './app.css';
```

- [ ] **Step 4: Point shadcn's CLI config at the merged file**

In `frontend/components.json`, change:
```json
    "css": "src/index.css",
```
to:
```json
    "css": "src/app.css",
```

- [ ] **Step 5: Verify the frontend builds and looks the same**

```bash
cd frontend && npm run build
```
Expected: build succeeds, same CSS output size as before (modulo the two comment edits).

- [ ] **Step 6: Manual visual smoke test**

```bash
cd frontend && npm run dev &
```
Open `http://localhost:5173`, confirm the app renders identically (fonts, colors, sidebar) in both light and dark theme (toggle via Configurações). Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify"
git add -A
git commit -m "refactor(frontend): merge index.css + tokens.css into app.css

CLAUDE.md already documents app.css as the styling source of truth;
this makes that true. Straight concatenation, same layer order, no
selector or token changes — only two stale self-referential comments
were reworded."
```

---

### Task 4: Move Verificar, Coffee, Input, and Configuracoes into `features/`

This is one atomic task, not two: `coffee-verificar.tsx` imports
`upload-screen.tsx`/`dashboard.tsx` (Part A's files), so Part A alone does
not produce a buildable state. Both parts move and get their imports fixed
before the single build/smoke/commit at the end.

**Files:**
- Move: `frontend/src/components/dashboard.tsx` → `frontend/src/features/verificar/dashboard.tsx`
- Move: `frontend/src/components/upload-screen.tsx` → `frontend/src/features/verificar/upload-screen.tsx`
- Move: `frontend/src/components/kpi-drawer.tsx` → `frontend/src/features/verificar/kpi-drawer.tsx`
- Move: `frontend/src/components/duplicate-compare.tsx` → `frontend/src/features/verificar/duplicate-compare.tsx`
- Move: `frontend/src/components/shared.tsx` → `frontend/src/features/verificar/shared.tsx`
- Move: `frontend/src/hooks/useTriageData.ts` → `frontend/src/features/verificar/useTriageData.ts`
- Move: `frontend/src/coffee/` (whole directory, 15 files) → `frontend/src/features/coffee/`
- Move: `frontend/src/input/` (whole directory, 19 files) → `frontend/src/features/input/`
- Move: `frontend/src/pages/configuracoes.tsx` → `frontend/src/features/configuracoes/configuracoes.tsx`
- Modify: `frontend/src/App.tsx` (import paths)
- Modify: `frontend/src/components/app-sidebar.tsx` (import paths)

**Interfaces:** none change — same exports throughout, only paths move.
`input/` has zero `../`-style relative imports reaching outside its own
directory (verified: every file uses same-directory relative imports or the
`@/` alias), so it needs no internal import fixes, just the move. `coffee/`
has 11 files with `../`-imports that need adjusting to `../../` (one level
deeper after the move), plus `coffee-verificar.tsx` needs its two component
imports repointed at `features/verificar/` (a sibling of `features/coffee/`
under `features/`, hence `../verificar/...`, not `../../verificar/...`).

#### Part A: Verificar

- [ ] **Step 1: Move the files**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend/src"
mkdir -p features/verificar
git mv components/dashboard.tsx features/verificar/dashboard.tsx
git mv components/upload-screen.tsx features/verificar/upload-screen.tsx
git mv components/kpi-drawer.tsx features/verificar/kpi-drawer.tsx
git mv components/duplicate-compare.tsx features/verificar/duplicate-compare.tsx
git mv components/shared.tsx features/verificar/shared.tsx
git mv hooks/useTriageData.ts features/verificar/useTriageData.ts
```

- [ ] **Step 2: Fix relative imports in the moved files**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend/src/features/verificar"
sed -i "s|from '\.\./types'|from '../../types'|" dashboard.tsx
sed -i "s|from '\.\./api'|from '../../api'|" dashboard.tsx
sed -i "s|from '\.\./hooks/use-persisted-state'|from '../../hooks/use-persisted-state'|" dashboard.tsx

sed -i 's|from "\.\./types"|from "../../types"|' upload-screen.tsx
sed -i 's|from "\.\./api"|from "../../api"|' upload-screen.tsx
sed -i 's|from "\.\./\.\./public/assets/logo_excel.svg"|from "../../../public/assets/logo_excel.svg"|' upload-screen.tsx

sed -i "s|from '\.\./types'|from '../../types'|" kpi-drawer.tsx

sed -i "s|from '\.\./types'|from '../../types'|" duplicate-compare.tsx
sed -i "s|from '\.\./api'|from '../../api'|" duplicate-compare.tsx

sed -i 's|from "\.\./types"|from "../../types"|' shared.tsx

sed -i "s|from '\.\./api'|from '../../api'|" useTriageData.ts
```

- [ ] **Step 3: Verify each file's imports landed correctly**

```bash
grep -n "^import" dashboard.tsx upload-screen.tsx kpi-drawer.tsx duplicate-compare.tsx shared.tsx useTriageData.ts
```
Expected: every relative import that used to point at `src/*` now reads `../../*`; imports of siblings (`./shared`, `./duplicate-compare`, `./kpi-drawer`) are unchanged; alias imports (`@/components/ui/button`, `sonner`, `lucide-react`, `@tanstack/react-query`) are unchanged.

- [ ] **Step 4: Update `App.tsx`'s import of `useTriageData`**

In `frontend/src/App.tsx`, change:
```tsx
import { useTriageData } from './hooks/useTriageData';
```
to:
```tsx
import { useTriageData } from './features/verificar/useTriageData';
```

Don't verify the build yet — `coffee-verificar.tsx` still points at the old
`../components/upload-screen` / `../components/dashboard` paths until Part B
fixes it. Continue straight to Part B.

#### Part B: Coffee, Input, Configuracoes

- [ ] **Step 5: Move the directories**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend/src"
git mv coffee features/coffee
git mv input features/input
mkdir -p features/configuracoes
git mv pages/configuracoes.tsx features/configuracoes/configuracoes.tsx
rmdir pages 2>/dev/null || true
```

- [ ] **Step 6: Fix relative imports in `features/coffee/`**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend/src/features/coffee"
sed -i "s|from '\.\./api'|from '../../api'|" use-coffee-notas.ts
sed -i "s|from '\.\./api'|from '../../api'|" coffee-logs.tsx
sed -i "s|from '\.\./api'|from '../../api'|" coffee-geradas.tsx
sed -i "s|from '\.\./api'|from '../../api'|" coffee-notas-table.tsx
sed -i "s|from '\.\./api'|from '../../api'|" use-coffee-logs.ts
sed -i "s|from '\.\./api'|from '../../api'|" coffee-abrir.tsx
sed -i "s|from '\.\./api'|from '../../api'|" coffee-gerar-modal.tsx
sed -i "s|from '\.\./api'|from '../../api'|" coffee-pendentes.tsx

sed -i "s|from '\.\./context/settings-context'|from '../../context/settings-context'|" coffee-log-table.tsx

sed -i "s|from '\.\./types'|from '../../types'|" coffee-abrir.tsx
sed -i "s|from '\.\./types'|from '../../types'|" coffee-hub.tsx

sed -i "s|from '\.\./types'|from '../../types'|" coffee-verificar.tsx
sed -i "s|from '\.\./components/upload-screen'|from '../verificar/upload-screen'|" coffee-verificar.tsx
sed -i "s|from '\.\./components/dashboard'|from '../verificar/dashboard'|" coffee-verificar.tsx
```

- [ ] **Step 7: Verify the coffee imports landed correctly**

```bash
grep -rn "^import" *.tsx *.ts | grep -E "from '\.\./"
```
Expected output — every line should read `../../api`, `../../types`, `../../context/settings-context`, `../verificar/upload-screen`, or `../verificar/dashboard`. No line should still read a bare `../api`, `../types`, `../context/...`, or `../components/...`.

- [ ] **Step 8: Fix the relative import in `features/configuracoes/configuracoes.tsx`**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend/src/features/configuracoes"
sed -i "s|from '\.\./context/settings-context'|from '../../context/settings-context'|" configuracoes.tsx
grep -n "^import" configuracoes.tsx
```
Expected: the `useSettings` import now reads `from '../../context/settings-context'`; the three `@/components/ui/*` imports are unchanged.

- [ ] **Step 9: Confirm `features/input/` needs no import fixes**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend/src/features/input"
grep -rn "from '\.\./" . || echo "no cross-boundary relative imports — nothing to fix"
```
Expected: `no cross-boundary relative imports — nothing to fix` (every input/ file uses `@/` alias or same-directory `./` imports, unaffected by the move).

- [ ] **Step 10: Update `App.tsx` import paths**

In `frontend/src/App.tsx`, change:
```tsx
import type { AbaInput } from './input/types';
import type { TriageHandoff } from './coffee/coffee-verificar';
```
to:
```tsx
import type { AbaInput } from './features/input/types';
import type { TriageHandoff } from './features/coffee/coffee-verificar';
```

And change:
```tsx
const InputSection = React.lazy(() =>
  import('./input/input-section').then((m) => ({ default: m.InputSection })));
const CoffeeHub = React.lazy(() =>
  import('./coffee/coffee-hub').then((m) => ({ default: m.CoffeeHub })));
const ConfiguracoesPage = React.lazy(() =>
  import('./pages/configuracoes').then((m) => ({ default: m.ConfiguracoesPage })));
```
to:
```tsx
const InputSection = React.lazy(() =>
  import('./features/input/input-section').then((m) => ({ default: m.InputSection })));
const CoffeeHub = React.lazy(() =>
  import('./features/coffee/coffee-hub').then((m) => ({ default: m.CoffeeHub })));
const ConfiguracoesPage = React.lazy(() =>
  import('./features/configuracoes/configuracoes').then((m) => ({ default: m.ConfiguracoesPage })));
```

- [ ] **Step 11: Update `app-sidebar.tsx` import paths**

In `frontend/src/components/app-sidebar.tsx`, change:
```tsx
import { COFFEE_SUBS } from '../coffee/coffee-hub';
// ponytail: import estático de INPUT_SUBS puxa input-section pro bundle do sidebar
// (mesmo tradeoff do COFFEE_SUBS acima); extrair input/subs.ts se o bundle pesar.
import { INPUT_SUBS } from '../input/input-section';
import type { AbaInput } from '../input/types';
```
to:
```tsx
import { COFFEE_SUBS } from '../features/coffee/coffee-hub';
// ponytail: import estático de INPUT_SUBS puxa input-section pro bundle do sidebar
// (mesmo tradeoff do COFFEE_SUBS acima); extrair input/subs.ts se o bundle pesar.
import { INPUT_SUBS } from '../features/input/input-section';
import type { AbaInput } from '../features/input/types';
```

#### Verify and commit (Parts A + B together)

- [ ] **Step 12: Verify the full frontend builds**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend" && npm run build
```
Expected: `tsc -b` reports zero errors, vite build succeeds. This is the
first build that exercises Part A and Part B together — it must be green
before continuing.

- [ ] **Step 13: Full manual smoke test**

```bash
cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000 &
cd frontend && npm run dev &
```
Open `http://localhost:5173` and click through every sidebar destination:
- Verificar (upload a real spreadsheet or use an existing one, confirm the dashboard table renders, KPI drawer opens, duplicate compare opens)
- COFFEE → Abrir, Gerar, Corrigidas, Pendentes, Logs (each sub-tab loads without console errors)
- Input → Visão Geral, Gerenciar, Ramal, Relatórios, Logs, Configurações (each sub-tab loads without console errors)
- Configurações (root page — theme toggle, density toggle, accent color)

Stop both dev servers when done. Fix anything broken before committing.

- [ ] **Step 14: Commit**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify"
git add -A
git commit -m "refactor(frontend): reorganize into features/

Moves dashboard, upload-screen, kpi-drawer, duplicate-compare, shared,
and useTriageData (the last feature-specific files still living in
the shared components/ and hooks/ folders) into features/verificar/,
and coffee/, input/, pages/configuracoes.tsx into features/coffee/,
features/input/, features/configuracoes/ respectively. Contents
unchanged, only import depth adjusted. App.tsx and app-sidebar.tsx
updated to the new paths. One commit because coffee-verificar.tsx
bridges both halves — neither builds without the other."
```

---

### Task 5: Update CLAUDE.md and README.md

**Files:**
- Modify: `C:\Users\Pottassiuw\Documents\EDP---Verify\CLAUDE.md`
- Modify: `C:\Users\Pottassiuw\Documents\EDP---Verify\README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Rewrite the shadcn/ui section of CLAUDE.md**

Find:
```markdown
# shadcn/ui

Never edit:

src/components/ui/

These files are vendored.

Customization belongs in:

src/components/branded/

Add components using:

npx shadcn@latest add

Never copy documentation code manually.

Preserve Radix structure.
```

Replace with:
```markdown
# shadcn/ui

src/components/ui/ is vendored, but it is project code — edit it
directly to theme, resize, or adjust a primitive's default behavior.

Add new components using:

npx shadcn@latest add

Re-running `add` on a component you've customized overwrites your
edits. Check `git diff` after re-adding and reapply anything lost.

Bigger compositions (multiple primitives wired together, feature-
specific behavior) still belong in:

src/components/branded/

Never copy documentation code manually — always use the CLI.

Preserve Radix structure and accessibility behavior when editing.
```

- [ ] **Step 2: Update the Architecture section's example to match the real layout**

Find:
```markdown
Good:

features/
    coffee/
        api/
        hooks/
        components/
        types/

Bad:
```

Replace with:
```markdown
Good:

features/
    coffee/       (components, hooks, types — flat today; split into
                   sub-folders if a single feature grows large enough
                   to need it)
    input/
    verificar/
    configuracoes/
components/
    ui/           (shadcn, vendored — editable, see the shadcn/ui
                   section below)
    branded/      (compositions built on top of ui/)

Bad:
```

- [ ] **Step 3: Update README.md's structure diagram and demo-mode references**

Find:
```markdown
## Estrutura

```
├── frontend/   React 18 + TypeScript + Vite + TanStack Query
│   └── src/
│       ├── components/   shared, dashboard, sidebar, upload-screen,
│       │                 duplicate-compare, coffee-section, tweaks-panel
│       ├── input/        módulo Input (gestão de notas do departamento)
│       ├── hooks/        useTriageData (TanStack Query)
│       ├── api.ts        integração com o backend + COFFEE/Maps
│       ├── data.ts       dataset de demonstração (offline)
│       └── types.ts      tipos compartilhados
├── backend/    FastAPI + pandas
│   ├── main.py           endpoints /api/* + parsing da planilha
│   ├── input_module/     módulo Input: banco SQLite local + motor de
│   │                     enriquecimento (Excels da rede EDP) + /api/input/*
│   └── test_upload.py / test_input_module.py    testes (pytest)
└── docs/       especificações de design
```
```

Replace with:
```markdown
## Estrutura

```
├── frontend/   React 18 + TypeScript + Vite + TanStack Query
│   └── src/
│       ├── features/
│       │   ├── verificar/      triagem de notas (dashboard, upload,
│       │   │                   KPIs, comparação de duplicatas)
│       │   ├── coffee/         hub COFFEE (gerar, corrigidas,
│       │   │                   pendentes, logs, abrir)
│       │   ├── input/          gestão de notas do departamento
│       │   └── configuracoes/  preferências (tema, densidade, cor)
│       ├── components/
│       │   ├── ui/             shadcn (vendored, editável)
│       │   ├── branded/        composições sobre ui/
│       │   └── app-sidebar.tsx navegação principal
│       ├── api.ts              integração com o backend + COFFEE/Maps
│       └── types.ts            tipos compartilhados
├── backend/    FastAPI + pandas
│   ├── main.py           endpoints /api/* + parsing da planilha
│   ├── coffee_module/    hub COFFEE: banco SQLite, jobs, cliente da API COFFEE
│   ├── input_module/     módulo Input: banco SQLite local + motor de
│   │                     enriquecimento (Excels da rede EDP) + /api/input/*
│   └── test_*.py         testes (pytest)
└── docs/       especificações e planos de design
```
```

Find:
```markdown
Sem backend, o app funciona em **modo demo** ("ver demonstração" na tela
inicial). A base da API é configurável via
`localStorage.setItem('edp_api', 'http://SEU_HOST:8000/api')`.
```

Replace with:
```markdown
O app exige o backend rodando — não há modo demo. A base da API é
configurável via `localStorage.setItem('edp_api', 'http://SEU_HOST:8000/api')`.
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify"
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md and README for SP1 changes

shadcn/ui section now reflects the decision to edit src/components/ui/
directly; architecture example matches the real features/ layout;
README structure diagram and demo-mode paragraph updated."
```

---

### Task 6: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Full backend test suite**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/backend" && .venv/Scripts/python.exe -m pytest -q
```
Expected: all tests pass (same total as the pre-refactor baseline — this plan touched zero backend logic beyond Task 1's deletions).

- [ ] **Step 2: Full frontend build**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify/frontend" && npm run build
```
Expected: `tsc -b` clean, vite build succeeds.

- [ ] **Step 3: Confirm no stray references to removed/moved paths remain**

```bash
cd "C:/Users/Pottassiuw/Documents/EDP---Verify"
grep -rn "new_input_modules\|EDP_DEMO\|edp_demo_\|from '\.\./components/upload-screen'\|from '\.\./components/dashboard'" frontend/src backend --include="*.ts" --include="*.tsx" --include="*.py"
```
Expected: no matches (empty output).

- [ ] **Step 4: Full manual smoke test (repeat of Task 4 Step 13, now against the fully-merged state)**

```bash
cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000 &
cd frontend && npm run dev &
```
Walk every sidebar destination once more (Verificar, all 5 COFFEE sub-tabs, all 6 Input sub-tabs, Configurações). Confirm:
- No demo button anywhere on the upload screen.
- COFFEE hub badge always shows "API" once data is loaded.
- Light/dark theme toggle still renders correctly (validates the CSS merge).

Stop both dev servers when done.

- [ ] **Step 5: Report final state**

```bash
git log --oneline develop..refactor/sp1-limpeza-estrutura
git status --short
```
Expected: 5 commits (Task 1 through Task 5), clean working tree. Branch is ready for the normal finishing-a-development-branch flow (merge/PR decision happens there, not in this plan).
