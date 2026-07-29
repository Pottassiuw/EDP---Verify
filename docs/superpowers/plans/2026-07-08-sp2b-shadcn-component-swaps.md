# SP2b: Hand-rolled components → shadcn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 6 hand-rolled UI patterns (LogDrawer, badges, progress bars, native `<select>`, ConfirmModal, the "Gerar" modal) with shadcn/Radix primitives, pixel-preserving the current EDP visual design via customized `src/components/ui/` files and variants — no behavior/API change beyond the accessibility upgrades Radix provides for free (focus trap, ARIA, keyboard).

**Architecture:** Six independent tasks (no shared files between them), ordered simple/mechanical → large/risky: Sheet, Badge, Progress, Select sweep, AlertDialog, Dialog. Each task installs only the shadcn component(s) it needs via `npx shadcn@latest add <name>`, customizes that component's file in `src/components/ui/`, then swaps its call site(s).

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, Radix UI (via shadcn primitives in `src/components/ui/`), `cn()` (`clsx` + `tailwind-merge`) from `frontend/src/lib/utils.ts`.

## Global Constraints

- Never use raw Tailwind palette colors or arbitrary hex — only design tokens bridged in `frontend/src/app.css`'s `@theme inline`, or `white`/`black`/`transparent` (CLAUDE.md).
- **Raw literal colors (`rgba(...)`, `#hex`) must never become Tailwind arbitrary-value classNames** (e.g. `border-[rgba(...)]`). Only `var(--token)`-backed colors may use arbitrary-value syntax (`bg-[var(--accent)]` etc.). Where a raw literal must be preserved exactly (e.g. `.edp-prio`'s border colors, which are `rgba(...)` not tied to a bridged token), it stays as an inline `style` prop on the component instance, not baked into a shadcn variant's className.
- Never edit generated shadcn output to differ from what `npx shadcn@latest add` produces as a starting point — customize the file afterward (this is explicitly allowed and expected per CLAUDE.md's shadcn/ui section), don't hand-write a fake vendored file from memory.
- Re-running `npx shadcn@latest add <name>` on an already-customized component overwrites edits — each of the 4 new components (`badge`, `progress`, `alert-dialog`, `dialog`) is installed exactly once, in its own task, and never re-added afterward.
- Must build clean: `cd frontend && npm run build` exit 0 after every task.
- No browser this session — verify by build + diff/JSX review only. Radix's structural accessibility gains (focus trap, Escape/outside-click, ARIA roles) can't be visually confirmed; call this out in each task's report for the user's eventual click-through.
- `backend/` is untouched by this plan — run the backend suite once at the end as a sanity check only.

---

## Task 1: LogDrawer → Sheet

**Files:**
- Modify: `frontend/src/features/coffee/coffee-log-drawer.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetContent` from `frontend/src/components/ui/sheet.tsx` (already vendored, unmodified — its `side="right"` variant already renders `w-3/4 ... sm:max-w-sm` with slide animation built in).
- Produces: `LogDrawer` keeps its exact existing prop signature `{ notaPk: number; open: boolean; onClose: () => void }` — call sites in `coffee-pendentes.tsx:215`, `coffee-geradas.tsx:157`, `coffee-corrigidas.tsx:71` do not change.

Current file (for reference — replace in full):

```tsx
import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS } from './coffee-log-table';
import { SegTabs } from '@/components/branded/section';

interface LogDrawerProps {
  notaPk: number;
  open: boolean;
  onClose: () => void;
}

export function LogDrawer({ notaPk, open, onClose }: LogDrawerProps): React.JSX.Element | null {
  const [passo, setPasso] = React.useState("");
  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: notaPk,
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
           className="fixed inset-0 z-[200]" style={{ background: "rgba(0,0,0,0.3)" }} />

      {/* panel */}
      <div className="fixed top-0 right-0 w-[360px] h-[100vh] bg-surface border-l border-l-line
                      z-[201] flex flex-col [animation:clog-slide-in_150ms_ease]">
        <style>{`@keyframes clog-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* header */}
        <div className="h-[48px] shrink-0 flex items-center py-0 px-[16px] border-b border-b-line gap-[8px]">
          <span className="flex-1 font-bold text-[14px]">
            Logs — Nota <span className="edp-mono">#{notaPk}</span>
          </span>
          <button aria-label="Fechar" onClick={onClose}
                  className="w-[28px] h-[28px] border-0 rounded-[6px] cursor-pointer
                             bg-surface-2 text-text-mute text-[14px]">
            ✕
          </button>
        </div>

        {/* filtro de passo */}
        <div className="shrink-0 pt-[10px] px-[16px] pb-[6px] flex flex-wrap">
          <SegTabs tabs={PASSOS.map((p) => ({ id: p.value, rotulo: p.label }))}
                   value={passo} onChange={setPasso} ariaLabel="Filtrar por passo" />
        </div>

        {/* table */}
        <LogTable logs={logs} loading={loading} compact passo={passo} />
      </div>
    </>
  );
}
```

- [ ] **Step 1: Replace `frontend/src/features/coffee/coffee-log-drawer.tsx` in full**

```tsx
import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS } from './coffee-log-table';
import { SegTabs } from '@/components/branded/section';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface LogDrawerProps {
  notaPk: number;
  open: boolean;
  onClose: () => void;
}

export function LogDrawer({ notaPk, open, onClose }: LogDrawerProps): React.JSX.Element {
  const [passo, setPasso] = React.useState("");
  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: notaPk,
    limit: 50,
  });

  React.useEffect(() => {
    if (open) refresh();
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-[360px] sm:max-w-[360px] gap-0 p-0">
        {/* header */}
        <div className="h-[48px] shrink-0 flex items-center py-0 px-[16px] border-b border-b-line gap-[8px]">
          <span className="flex-1 font-bold text-[14px]">
            Logs — Nota <span className="edp-mono">#{notaPk}</span>
          </span>
        </div>

        {/* filtro de passo */}
        <div className="shrink-0 pt-[10px] px-[16px] pb-[6px] flex flex-wrap">
          <SegTabs tabs={PASSOS.map((p) => ({ id: p.value, rotulo: p.label }))}
                   value={passo} onChange={setPasso} ariaLabel="Filtrar por passo" />
        </div>

        {/* table */}
        <LogTable logs={logs} loading={loading} compact passo={passo} />
      </SheetContent>
    </Sheet>
  );
}
```

Notes on this rewrite:
- `if (!open) return null` is removed — `Sheet`/`SheetContent` handle mount/unmount and the open/closed animation themselves (Radix keeps the tree mounted during the closing transition, which the old `return null` didn't allow).
- The manual Escape-key `useEffect` is removed — Radix's `Dialog.Root` (which `Sheet` wraps) handles Escape natively via `onOpenChange`.
- The custom `✕` close button and its wrapping header row's button are removed — `SheetContent`'s `showCloseButton` (default `true`) already renders a close `X` in the top-right corner (see `frontend/src/components/ui/sheet.tsx:75-79`). If this default-positioned close button visually collides with the header text after Step 2's build, adjust the header's `pr-` padding to make room — don't re-add a duplicate manual close button.
- `className="w-[360px] sm:max-w-[360px] gap-0 p-0"` overrides `SheetContent`'s default `w-3/4 ... sm:max-w-sm` (which would be wider than the original 360px) and its default `gap-4 p-0` isn't actually applied by `SheetContent` itself (that's `SheetHeader`/`SheetFooter`'s job) — `gap-0` on the flex column avoids any unwanted gap between the header/filter/table rows, matching the original's tight layout.
- The return type changes from `React.JSX.Element | null` to `React.JSX.Element` since the component now always returns a `Sheet` (Radix internally handles not rendering when closed).

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/features/coffee/coffee-log-drawer.tsx
git commit -m "refactor(ui): replace hand-rolled LogDrawer overlay with shadcn Sheet

Sheet was already vendored (src/components/ui/sheet.tsx, unmodified).
Removes the manual overlay div, inline @keyframes slide-in, and manual
Escape-key listener in favor of Radix's built-in focus trap, Escape
handling, and slide animation. Same external LogDrawer props, same 3
call sites unchanged."
```

---

## Task 2: Badges → Badge

**Files:**
- Create (via CLI, then customize): `frontend/src/components/ui/badge.tsx`
- Modify: `frontend/src/features/verificar/shared.tsx`, `frontend/src/features/verificar/dashboard.tsx`, `frontend/src/app.css` (remove now-dead `.edp-tag`/`.edp-prio`/`.edp-dot` rules once nothing references them)

**Interfaces:**
- Produces: a `Badge` component with a `variant` prop accepting `"tagOk" | "tagErr" | "tagDone" | "tagDup" | "prioHigh" | "prioMed" | "prioLow" | "prioNone"` (in addition to shadcn's stock `default`/`secondary`/`destructive`/`outline` — keep those, don't remove them, other parts of the app or future work may use them).

Source values being ported (current `frontend/src/app.css:260-284`, delete these lines in Step 4 once Step 1-3 land and build green):

```css
.edp-tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-mono);
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 5px;
  white-space: nowrap;
}
.edp-tag.ok  { background: var(--tint-green); color: var(--green); }
.edp-tag.err { background: var(--tint-red);   color: var(--red); }
.edp-tag.done{ background: var(--tint-indigo); color: var(--indigo); }
.edp-tag.dup { background: var(--indigo); color: #fff; }
.edp-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.edp-prio {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 26px; padding: 0 7px;
  border-radius: 7px;
  font-family: var(--font-mono); font-size: 13px; font-weight: 600;
  border: 1px solid transparent;
}
.edp-prio.high { background: var(--tint-red);   color: var(--red);   border-color: rgba(240,85,92,0.3); }
.edp-prio.med  { background: var(--tint-amber); color: var(--amber); border-color: rgba(240,169,59,0.32); }
.edp-prio.low  { background: var(--tint-green); color: var(--green); border-color: rgba(0,168,89,0.3); }
.edp-prio.none { background: var(--surface-2);  color: var(--text-mute); border-color: var(--line); }
```

`.edp-prio.high/med/low`'s border colors are raw `rgba(...)` literals not backed by any `var(--token)` — per Global Constraints these must NOT become part of a Tailwind className. They stay as an inline `style={{ borderColor: ... }}` passed alongside the `Badge`, exactly reproducing the current value. `.edp-prio.none`'s border color (`var(--line)`) IS token-backed, so it converts freely to `border-line` in the variant className.

- [ ] **Step 1: Install shadcn Badge**

```bash
cd frontend && npx shadcn@latest add badge
```

This creates `frontend/src/components/ui/badge.tsx` with a `badgeVariants` `cva(...)` export and a `Badge` component. Read the generated file before editing it.

- [ ] **Step 2: Customize `frontend/src/components/ui/badge.tsx`**

Add 8 new entries to the `variant` key of the `badgeVariants` cva config (alongside the existing `default`/`secondary`/`destructive`/`outline` — do not remove those). The cva `base` string (shared by every variant) must stay geometry-free for these new variants to render correctly — if the generated `base` includes shadcn's stock padding/text-size/rounded classes (typically something like `inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ...`), that's fine to leave for the stock variants, because each new variant below fully re-specifies its own padding/font-size/rounded/gap — `cn()`'s `tailwind-merge` will correctly let the more specific classes in the variant win over the base's conflicting utility classes (padding, font-size, rounded, gap) since they're the same utility category. Verify this holds after Step 5's build — if any new variant renders with the stock badge's `text-xs`/`px-2.5`/`rounded-md` bleeding through instead of its own values, that means `cva`'s output isn't running through `cn()`/`twMerge` before reaching the DOM; in that case, make the `base` itself variant-conditional (Tailwind's `cva` supports per-variant full class replacement) — ask if this happens, don't guess at a `cva` restructure.

New variants (exact className values, matching the CSS above):

```ts
tagOk: "inline-flex items-center gap-[5px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase py-[3px] px-[8px] rounded-[5px] whitespace-nowrap border-transparent bg-tint-green text-green [&_svg]:size-[6px]",
tagErr: "inline-flex items-center gap-[5px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase py-[3px] px-[8px] rounded-[5px] whitespace-nowrap border-transparent bg-tint-red text-red [&_svg]:size-[6px]",
tagDone: "inline-flex items-center gap-[5px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase py-[3px] px-[8px] rounded-[5px] whitespace-nowrap border-transparent bg-tint-indigo text-indigo [&_svg]:size-[6px]",
tagDup: "inline-flex items-center gap-[5px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase py-[3px] px-[8px] rounded-[5px] whitespace-nowrap border-transparent bg-indigo text-white [&_svg]:size-[6px]",
prioHigh: "inline-flex items-center justify-center min-w-[26px] h-[26px] px-[7px] rounded-[7px] font-mono text-[13px] font-semibold border bg-tint-red text-red",
prioMed: "inline-flex items-center justify-center min-w-[26px] h-[26px] px-[7px] rounded-[7px] font-mono text-[13px] font-semibold border bg-tint-amber text-amber",
prioLow: "inline-flex items-center justify-center min-w-[26px] h-[26px] px-[7px] rounded-[7px] font-mono text-[13px] font-semibold border bg-tint-green text-green",
prioNone: "inline-flex items-center justify-center min-w-[26px] h-[26px] px-[7px] rounded-[7px] font-mono text-[13px] font-semibold border border-line bg-surface-2 text-text-mute",
```

`[&_svg]:size-[6px]` targets the `edp-dot` replacement (a small filled circle rendered via an inline `<span>` in the current markup — Step 3 below keeps it as a plain `<span className="w-[6px] h-[6px] rounded-full bg-current" />` child rather than an actual `<svg>`, so this selector is dead weight; **omit `[&_svg]:size-[6px]` from all 4 `tag*` variants above** — this was left in by mistake during plan authoring, exclude it).

`prioHigh`/`prioMed`/`prioLow` intentionally do NOT set a border color in the className (only `border` for width/style) — the color comes from the inline `style` prop at the call site (Step 3), per the raw-literal-color rule.

- [ ] **Step 3: Replace `frontend/src/features/verificar/shared.tsx`'s `PriorityChip` and `StatusTag`**

Current:

```tsx
function prioMeta(p: number): [string, string | number] {
  if (p >= 99) return ["none", "—"];
  if (p <= 2) return ["high", p];
  if (p <= 4) return ["med", p];
  return ["low", p];
}

export const PriorityChip: React.FC<{ p: number }> = ({ p }) => {
  const [cls, label] = prioMeta(p);
  return <span className={"edp-prio " + cls}>{label}</span>;
};

export const StatusTag: React.FC<{
  status: NoteStatus;
  done: boolean;
  dup?: boolean;
}> = ({ status, done, dup }) => {
  if (dup)
    return (
      <span className="edp-tag dup">
        <span className="edp-dot" />
        Duplicata
      </span>
    );
  if (done)
    return (
      <span className="edp-tag done">
        <span className="edp-dot" />
        Concluída
      </span>
    );
  return status === "ok" ? (
    <span className="edp-tag ok">
      <span className="edp-dot" />
      Conforme
    </span>
  ) : (
    <span className="edp-tag err">
      <span className="edp-dot" />
      Com erro
    </span>
  );
};
```

Replace with:

```tsx
import { Badge } from '@/components/ui/badge';

const PRIO_BORDER: Record<string, string> = {
  high: "rgba(240,85,92,0.3)",
  med: "rgba(240,169,59,0.32)",
  low: "rgba(0,168,89,0.3)",
};

function prioMeta(p: number): ["high" | "med" | "low" | "none", string | number] {
  if (p >= 99) return ["none", "—"];
  if (p <= 2) return ["high", p];
  if (p <= 4) return ["med", p];
  return ["low", p];
}

const PRIO_VARIANT = {
  high: "prioHigh", med: "prioMed", low: "prioLow", none: "prioNone",
} as const;

export const PriorityChip: React.FC<{ p: number }> = ({ p }) => {
  const [cls, label] = prioMeta(p);
  return (
    <Badge variant={PRIO_VARIANT[cls]} style={cls === "none" ? undefined : { borderColor: PRIO_BORDER[cls] }}>
      {label}
    </Badge>
  );
};

export const StatusTag: React.FC<{
  status: NoteStatus;
  done: boolean;
  dup?: boolean;
}> = ({ status, done, dup }) => {
  if (dup)
    return (
      <Badge variant="tagDup">
        <span className="w-[6px] h-[6px] rounded-full bg-current" />
        Duplicata
      </Badge>
    );
  if (done)
    return (
      <Badge variant="tagDone">
        <span className="w-[6px] h-[6px] rounded-full bg-current" />
        Concluída
      </Badge>
    );
  return status === "ok" ? (
    <Badge variant="tagOk">
      <span className="w-[6px] h-[6px] rounded-full bg-current" />
      Conforme
    </Badge>
  ) : (
    <Badge variant="tagErr">
      <span className="w-[6px] h-[6px] rounded-full bg-current" />
      Com erro
    </Badge>
  );
};
```

(`import type { FieldProps, NoteStatus } from "../../types";` at the top of the file stays unchanged — only add the new `Badge` import above/below it, following the file's existing import order.)

- [ ] **Step 4: Replace the 4 raw `.edp-tag`/`.edp-dot` sites in `frontend/src/features/verificar/dashboard.tsx`**

These render tags directly rather than through `StatusTag` (pre-existing minor duplication, not introduced by this task — keep the same structure, just swap the primitive):

At `dashboard.tsx:232-236`, current:

```tsx
{isDup ? <span className="edp-tag dup"><span className="edp-dot" />Dup.</span>
  : done ? <span className="edp-tag done"><span className="edp-dot" />OK</span>
  : n.errors.length ? <span className="edp-mono text-[11px] text-red font-semibold shrink-0">
      {n.errors.length} {n.errors.length > 1 ? "falhas" : "falha"}</span>
  : <span className="edp-tag ok"><span className="edp-dot" />OK</span>}
```

Replace with:

```tsx
{isDup ? <Badge variant="tagDup"><span className="w-[6px] h-[6px] rounded-full bg-current" />Dup.</Badge>
  : done ? <Badge variant="tagDone"><span className="w-[6px] h-[6px] rounded-full bg-current" />OK</Badge>
  : n.errors.length ? <span className="edp-mono text-[11px] text-red font-semibold shrink-0">
      {n.errors.length} {n.errors.length > 1 ? "falhas" : "falha"}</span>
  : <Badge variant="tagOk"><span className="w-[6px] h-[6px] rounded-full bg-current" />OK</Badge>}
```

At `dashboard.tsx:358` (search for `edp-tag ok` — the "Conforme — nenhuma falha…" banner), apply the same `edp-tag ok` → `Badge variant="tagOk"` swap, keeping its exact surrounding text/children unchanged, replacing only the tag element and its `edp-dot` child.

Add `import { Badge } from '@/components/ui/badge';` to `dashboard.tsx`'s import block (grouped with the other `@/components/ui/*` imports already present in the file, per CLAUDE.md's import order: React, third-party, internal aliases, relative).

- [ ] **Step 5: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors. If a `Badge` variant's className isn't winning over the stock base classes (see the note in Step 2), stop and report — don't guess at a fix.

- [ ] **Step 6: Grep-confirm no remaining `.edp-tag`/`.edp-prio`/`.edp-dot` usages, then delete the dead CSS**

```bash
cd frontend && grep -rn 'edp-tag\|edp-prio\|edp-dot' src/
```

Expected: zero matches in `.tsx` files (matches in `app.css`'s own rule definitions are what Step 6 removes next). If any `.tsx` match remains, find and convert it before proceeding.

Delete the CSS block quoted at the top of this task's section from `frontend/src/app.css` (currently lines 260-284, inside the `@layer components { ... }` wrapper from SP2a — delete only these rules, not the surrounding layer or any neighboring rule).

- [ ] **Step 7: Build again and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/components/ui/badge.tsx src/features/verificar/shared.tsx src/features/verificar/dashboard.tsx src/app.css
git commit -m "refactor(ui): replace .edp-tag/.edp-prio with shadcn Badge variants

Adds tagOk/tagErr/tagDone/tagDup and prioHigh/prioMed/prioLow/prioNone
variants to the vendored Badge component, matching the current tint/
color/geometry exactly. prio border colors are raw rgba literals (not
token-backed) so they stay as inline style per the project's no-
arbitrary-color rule. Removes the now-dead .edp-tag/.edp-prio/.edp-dot
CSS from app.css."
```

---

## Task 3: Progress bars → Progress

**Files:**
- Create (via CLI, then customize): `frontend/src/components/ui/progress.tsx`
- Modify: `frontend/src/features/verificar/upload-screen.tsx`, `frontend/src/features/verificar/kpi-drawer.tsx`, `frontend/src/features/coffee/coffee-abrir.tsx`, `frontend/src/features/coffee/coffee-pendentes.tsx`

**Interfaces:**
- Produces: `Progress` accepts a new `indicatorClassName?: string` prop (shadcn's stock `Progress` doesn't expose the inner indicator's className — this project's 4 call sites each need a different fill color, so the prop is added here rather than hard-coding one color).

- [ ] **Step 1: Install shadcn Progress**

```bash
cd frontend && npx shadcn@latest add progress
```

Read the generated `frontend/src/components/ui/progress.tsx` before editing.

- [ ] **Step 2: Add `indicatorClassName` prop**

The generated component wraps `ProgressPrimitive.Root` and `ProgressPrimitive.Indicator` (Radix), with the indicator's `style` translating by `100 - value`. Add a prop and thread it into the indicator's `className` via `cn()`:

```tsx
function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("bg-primary h-full w-full flex-1 transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
```

(This is a template of the expected shape — match it against what the CLI actually generated; the only required change is adding the `indicatorClassName` prop/parameter and threading it into the indicator's `className` via `cn()`. Keep whatever base classNames the CLI generated for `Root`/`Indicator` otherwise, since Step 3 below overrides `Root`'s height/rounded/background per call site via its own `className` prop anyway.)

- [ ] **Step 3: Replace the 4 call sites**

`frontend/src/features/verificar/upload-screen.tsx` — current (around line 156-166):

```tsx
{loading && (
  <div
    className="bg-bg-2 overflow-hidden mt-[22px] h-[3px] rounded-[3px]"
  >
    <div
      className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] [transition:width_.35s_ease]"
      style={{
        width: pct + "%",
      }}
    />
  </div>
)}
```

Replace with:

```tsx
{loading && (
  <Progress
    value={pct}
    className="bg-bg-2 mt-[22px] h-[3px] rounded-[3px]"
    indicatorClassName="bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] [transition:width_.35s_ease]"
  />
)}
```

Add `import { Progress } from '@/components/ui/progress';` to this file's imports.

`frontend/src/features/verificar/kpi-drawer.tsx` — current (line 65-66):

```tsx
<div className="bg-surface-3 overflow-hidden h-[6px] rounded-[999px] mt-[8px] mx-0 mb-[6px]">
  <div style={{ width: safePct + "%" }} className="h-full bg-[var(--accent)] rounded-[999px]" />
</div>
```

Replace with:

```tsx
<Progress
  value={safePct}
  className="bg-surface-3 h-[6px] rounded-[999px] mt-[8px] mx-0 mb-[6px]"
  indicatorClassName="bg-[var(--accent)] rounded-[999px]"
/>
```

Add `import { Progress } from '@/components/ui/progress';` to this file's imports.

`frontend/src/features/coffee/coffee-abrir.tsx` — current (line 159-161):

```tsx
<div className="coffee-bar">
  <div style={{ width: (ids.length ? (opened.size / ids.length) * 100 : 0) + "%" }} />
</div>
```

Replace with:

```tsx
<Progress
  value={ids.length ? (opened.size / ids.length) * 100 : 0}
  className="h-[6px] rounded-[999px] bg-surface-3"
  indicatorClassName="bg-green rounded-[999px]"
/>
```

Add `import { Progress } from '@/components/ui/progress';` to this file's imports. Then remove the now-dead `.coffee-bar{...}` and `.coffee-bar>div{...}` lines (currently lines 16-17) from this same file's `COFFEE_STYLE` template string (leave every other rule in `COFFEE_STYLE` untouched — `.coffee`, `.coffee-wrap`, `.coffee-input`, `.coffee-fb`, `.coffee-stepper` are still used elsewhere in this file).

`frontend/src/features/coffee/coffee-pendentes.tsx` — current (line 162-166):

```tsx
<div className="h-[6px] rounded-[999px] bg-surface-3 overflow-hidden">
  <div className="h-full rounded-[999px]"
       style={{ width: pct + "%", background: concluido ? "var(--green)" : "var(--accent)",
                transition: "width .3s ease, background .3s ease" }} />
</div>
```

Replace with:

```tsx
<Progress
  value={pct}
  className="h-[6px] rounded-[999px] bg-surface-3"
  indicatorClassName={
    (concluido ? "bg-green" : "bg-[var(--accent)]") + " rounded-[999px] [transition:width_.3s_ease,background_.3s_ease]"
  }
/>
```

Add `import { Progress } from '@/components/ui/progress';` to this file's imports.

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors.

- [ ] **Step 5: Grep-confirm no leftover hand-rolled progress divs**

```bash
cd frontend && grep -n 'coffee-bar\|width: pct\|width: safePct\|opened.size / ids.length' src/features/verificar/upload-screen.tsx src/features/verificar/kpi-drawer.tsx src/features/coffee/coffee-abrir.tsx src/features/coffee/coffee-pendentes.tsx
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/ui/progress.tsx src/features/verificar/upload-screen.tsx src/features/verificar/kpi-drawer.tsx src/features/coffee/coffee-abrir.tsx src/features/coffee/coffee-pendentes.tsx
git commit -m "refactor(ui): replace hand-rolled progress-bar divs with shadcn Progress

Adds an indicatorClassName prop to the vendored Progress component
(shadcn's stock version doesn't expose the inner indicator's
className, and this project's 4 call sites each need a different fill
color/gradient). Removes the now-dead .coffee-bar rules from
coffee-abrir.tsx's inline COFFEE_STYLE block."
```

---

## Task 4: Native `<select>` sweep → Select

**Files:**
- Modify: `frontend/src/features/verificar/dashboard.tsx`, `frontend/src/features/coffee/coffee-logs.tsx`, `frontend/src/features/input/filters.tsx`, `frontend/src/features/input/logs.tsx`, `frontend/src/features/input/notes-table.tsx`

**Interfaces:**
- Consumes: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `frontend/src/components/ui/select.tsx` (already vendored and already used elsewhere in the app — e.g. `frontend/src/features/input/manage.tsx:191-210` — follow that file's existing usage pattern, don't invent a new one).

**Scope correction from the design spec:** the spec listed `input/filters.tsx:77,153` as 2 sites. Reading the file shows `filters.tsx:153` is `<select multiple size={4} ...>` — a multi-select listbox, the exact same out-of-scope pattern as `reports.tsx:144` (Global scope decision: multi-selects stay native, shadcn `Select` doesn't support them). Only `filters.tsx:77` converts. This task covers **10 single-value `<select>` sites** across 5 files, not 12.

### Three conversion patterns — apply the matching one to each site below

**Pattern A — plain select, no empty/placeholder option** (the value is always one of the real options):

Before (`dashboard.tsx:145-147`, `status` filter):
```tsx
<select className="edp-field" value={status} onChange={(e) => setStatus(e.target.value)}>
  <option value="all">Todos</option><option value="erro">Com erro</option><option value="ok">Conforme</option></select>
```

After:
```tsx
<Select value={status} onValueChange={setStatus}>
  <SelectTrigger className="edp-field w-full">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Todos</SelectItem>
    <SelectItem value="erro">Com erro</SelectItem>
    <SelectItem value="ok">Conforme</SelectItem>
  </SelectContent>
</Select>
```

(`className="edp-field w-full"` on `SelectTrigger` reproduces the current `.edp-field` box styling — height, border, background, radius — while `w-full` fills the `<Field>` wrapper's flex slot the same way the raw `<select>` did. `onChange={(e) => setX(e.target.value)}` becomes `onValueChange={setX}` — same setter, Radix already passes the string value directly.)

Sites using Pattern A (already have a non-empty default value, no placeholder needed):
- `dashboard.tsx:134-135` (`uf`, options `"all"` + `ufOpts`)
- `dashboard.tsx:138-139` (`setor`, options `"all"` + `setorOpts`)
- `dashboard.tsx:142-143` (`urg`, options `"all"` + `URG` entries)
- `dashboard.tsx:145-147` (`status`, shown above)
- `dashboard.tsx:149-151` (`situacao`, options `"all"`/`"pending"`/`"done"`)
- `coffee-logs.tsx:86-89` (`limit`, options from `LIMITES` array — note `onChange` currently does `Number(e.target.value)`; `onValueChange` must do the same: `(v) => setLimit(Number(v))`)
- `coffee-logs.tsx:94-97` (`periodo`, options from `PERIODOS` array of `{id, rotulo}`)

For all `dashboard.tsx` sites, add `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';` to the imports (grouped with other `@/components/ui/*` imports already in the file).
For `coffee-logs.tsx`, add the same import.

**Pattern B — "reset to empty after pick" select** (value is always `""`, picking an option performs an action then the select shows its placeholder again — never displays a persisted selection):

Before (`input/filters.tsx:77-98`):
```tsx
<select
  value=""
  aria-label="Adicionar campo de filtro"
  className="edp-field mb-[10px]"
  onChange={(e) => {
    if (!e.target.value) return;
    setEstado({
      ...estado,
      filtros: [
        ...estado.filtros,
        { campo: e.target.value, tipo: tipoDoCampo(e.target.value) },
      ],
    });
  }}
>
  <option value="">+ Adicionar campo de filtro…</option>
  {camposDisponiveis.map((c) => (
    <option key={c} value={c}>
      {ROTULOS[c] ?? c}
    </option>
  ))}
</select>
```

After:
```tsx
<Select
  onValueChange={(v) => {
    setEstado({
      ...estado,
      filtros: [
        ...estado.filtros,
        { campo: v, tipo: tipoDoCampo(v) },
      ],
    });
  }}
>
  <SelectTrigger aria-label="Adicionar campo de filtro" className="edp-field mb-[10px] w-full">
    <SelectValue placeholder="+ Adicionar campo de filtro…" />
  </SelectTrigger>
  <SelectContent>
    {camposDisponiveis.map((c) => (
      <SelectItem key={c} value={c}>
        {ROTULOS[c] ?? c}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Radix `Select` forbids an item with `value=""`, so the `<option value="">+ Adicionar…</option>` placeholder becomes `SelectValue`'s `placeholder` prop instead of an item — and since no `value`/`defaultValue` prop is passed to `Select`, it's permanently uncontrolled-and-empty, which reproduces the "always shows the placeholder, picking an item just fires the action" behavior exactly (the old code's `value=""` always was doing the same thing). The `if (!e.target.value) return;` guard is dropped because `onValueChange` only fires when a real item is picked (Radix never calls it for the placeholder, since the placeholder isn't a selectable item).

Sites using Pattern B (same "always-empty, action-on-pick" structure — apply the same transformation):
- `input/filters.tsx:77-98` (shown above)
- `coffee-logs.tsx:77-81` (`usuario` filter — placeholder `"Todos"`, `onValueChange={setUsuario}`; note this one's current behavior actually persists `usuario` as a real filter value across renders, i.e. `value={usuario}` is NOT always `""` — re-check this site specifically: if `usuario` can be a real non-empty string that persists, this is actually Pattern A with an added always-available `""`/"Todos" reset option, which Radix Select can't represent as a real item. Use a sentinel: map `""` to a literal `"__todos"` value for the `SelectItem`/`Select value`, and translate at the boundary — `<Select value={usuario || "__todos"} onValueChange={(v) => setUsuario(v === "__todos" ? "" : v)}>`, with `<SelectItem value="__todos">Todos</SelectItem>` as the first item alongside the real `usuarios.map(...)` items. This is the same sentinel pattern already used in `frontend/src/features/input/manage.tsx:191-200` (`__manter`) — follow that exact precedent.)
- `input/logs.tsx:50-54` (`filtroUsuario` — same persisting-empty-means-"Todos" shape as `coffee-logs.tsx`'s `usuario` above; use the same `__todos`-sentinel approach, not the placeholder-only approach)

**Pattern C — uncontrolled inline table-cell editor** (`defaultValue`, not `value`):

Before (`input/notes-table.tsx:138-146` — read the full surrounding cell code before editing, only the `<select>` itself changes):
```tsx
<select
  autoFocus
  defaultValue={String(v ?? "")}
  aria-label={`Editar ${c.label}`}
  className="edp-field w-[100%] h-[28px] text-[12.5px]"
  onChange={(e) => confirmar(e.target.value)}
>
  {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
</select>
```

After:
```tsx
<Select defaultValue={String(v ?? "")} onValueChange={confirmar}>
  <SelectTrigger autoFocus aria-label={`Editar ${c.label}`} className="edp-field w-full h-[28px] text-[12.5px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
  </SelectContent>
</Select>
```

(`autoFocus` moves from the native `<select>` to `SelectTrigger`, which renders a `<button>` — `autoFocus` is a valid prop on any focusable element. `Select` itself supports `defaultValue` for uncontrolled usage, matching the original.)

- [ ] **Step 1: Convert the 5 `dashboard.tsx` sites (Pattern A)** — see the worked example and site list above.

- [ ] **Step 2: Convert `coffee-logs.tsx`'s `limit` and `periodo` (Pattern A) and `usuario` (Pattern B with `__todos` sentinel)** — see above.

- [ ] **Step 3: Convert `input/filters.tsx:77` (Pattern B)** — leave `filters.tsx:153` (the `multiple size={4}` select) untouched, out of scope.

- [ ] **Step 4: Convert `input/logs.tsx:50` (Pattern B with `__todos` sentinel)**

- [ ] **Step 5: Convert `input/notes-table.tsx:138` (Pattern C)**

- [ ] **Step 6: Grep-verify scope**

```bash
cd frontend && grep -n '<select' src/features/verificar/dashboard.tsx src/features/coffee/coffee-logs.tsx src/features/input/filters.tsx src/features/input/logs.tsx src/features/input/notes-table.tsx src/features/input/reports.tsx
```

Expected: zero matches in the first 5 files; exactly one match in `reports.tsx` (`multiple size={4}`, out of scope, correctly untouched) and one in `filters.tsx` line ~153 if `grep -n '<select'` shows it — re-check that this is the `multiple` one and not a missed conversion.

- [ ] **Step 7: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/features/verificar/dashboard.tsx src/features/coffee/coffee-logs.tsx src/features/input/filters.tsx src/features/input/logs.tsx src/features/input/notes-table.tsx
git commit -m "refactor(ui): sweep remaining native <select> elements to shadcn Select

10 single-value <select> sites across dashboard.tsx, coffee-logs.tsx,
filters.tsx, logs.tsx, notes-table.tsx converted, following the same
Select usage pattern already established in manage.tsx/ramal.tsx.
Multi-select listboxes (filters.tsx's tipo==='multi' field,
reports.tsx) stay native — shadcn Select doesn't support multi-select
and building a replacement is out of scope for this pass."
```

---

## Task 5: ConfirmModal → AlertDialog

**Files:**
- Create (via CLI, then use as-is or lightly customize): `frontend/src/components/ui/alert-dialog.tsx`
- Modify: `frontend/src/features/coffee/confirm-modal.tsx`

**Interfaces:**
- Produces: `ConfirmModal` keeps its exact existing prop signature — `{ open, title, message?, confirmLabel?, tone?: "default" | "danger", requireJustification?, busy?, onConfirm(justificativa), onCancel }`. Call sites in `coffee-geradas.tsx:160`, `coffee-pendentes.tsx:217`, `coffee-pendentes.tsx:240` do not change.

Current file (for reference — replace in full):

```tsx
import React from 'react';
import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireJustification?: boolean;
  busy?: boolean;
  onConfirm: (justificativa: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open, title, message, confirmLabel = "Confirmar", tone = "default",
  requireJustification = false, busy = false, onConfirm, onCancel,
}: ConfirmModalProps): React.JSX.Element | null {
  const [justificativa, setJustificativa] = React.useState("");

  React.useEffect(() => {
    if (open) setJustificativa("");
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const justOk = !requireJustification || justificativa.trim().length > 0;
  const confirmColor = tone === "danger" ? "var(--red)" : "var(--accent)";

  return (
    <>
      <div onClick={busy ? undefined : onCancel}
           className="fixed inset-0 z-[300]" style={{ background: "rgba(0,0,0,0.4)" }} />
      <div role="dialog" aria-modal="true"
           className="fixed top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw]
                      bg-surface border border-line rounded-[12px] z-[301] flex flex-col gap-[12px] p-[20px]"
           style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <span className="edp-title text-[17px]">{title}</span>
        {message && <div className="text-[13px] text-text-mute">{message}</div>}

        <label className="text-[12px] text-text-dim">
          Justificativa{requireJustification ? " (obrigatória)" : " (opcional)"}
        </label>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                  rows={3} autoFocus disabled={busy}
                  placeholder={requireJustification
                    ? "Explique o motivo desta acao..."
                    : "Opcional: registre um motivo..."}
                  className="resize-y py-[8px] px-[10px] rounded-[8px] border border-line bg-surface-2
                             text-text text-[13px] [font-family:inherit]" />

        <div className="flex justify-end gap-[8px] mt-[4px]">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="outline" size="sm" disabled={busy || !justOk}
                  onClick={() => onConfirm(justificativa.trim())}
                  className="font-semibold" style={{ color: confirmColor, borderColor: confirmColor }}>
            {busy ? "..." : confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 1: Install shadcn AlertDialog**

```bash
cd frontend && npx shadcn@latest add alert-dialog
```

- [ ] **Step 2: Replace `frontend/src/features/coffee/confirm-modal.tsx` in full**

```tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter,
} from '@/components/ui/alert-dialog';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireJustification?: boolean;
  busy?: boolean;
  onConfirm: (justificativa: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open, title, message, confirmLabel = "Confirmar", tone = "default",
  requireJustification = false, busy = false, onConfirm, onCancel,
}: ConfirmModalProps): React.JSX.Element {
  const [justificativa, setJustificativa] = React.useState("");

  React.useEffect(() => {
    if (open) setJustificativa("");
  }, [open]);

  const justOk = !requireJustification || justificativa.trim().length > 0;
  const confirmColor = tone === "danger" ? "var(--red)" : "var(--accent)";

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <AlertDialogContent className="w-[420px] max-w-[92vw] gap-[12px] p-[20px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="edp-title text-[17px] font-normal">{title}</AlertDialogTitle>
          {message && <div className="text-[13px] text-text-mute">{message}</div>}
        </AlertDialogHeader>

        <label className="text-[12px] text-text-dim">
          Justificativa{requireJustification ? " (obrigatória)" : " (opcional)"}
        </label>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                  rows={3} autoFocus disabled={busy}
                  placeholder={requireJustification
                    ? "Explique o motivo desta acao..."
                    : "Opcional: registre um motivo..."}
                  className="resize-y py-[8px] px-[10px] rounded-[8px] border border-line bg-surface-2
                             text-text text-[13px] [font-family:inherit]" />

        <AlertDialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="outline" size="sm" disabled={busy || !justOk}
                  onClick={() => onConfirm(justificativa.trim())}
                  className="font-semibold" style={{ color: confirmColor, borderColor: confirmColor }}>
            {busy ? "..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Notes on this rewrite:
- `AlertDialogTitle` is normally rendered semi-bold by the shadcn default — `font-normal` is added alongside `edp-title` (which already sets its own `font-weight: 600` per `app.css`) only if `AlertDialogTitle`'s own default className conflicts; read the generated `alert-dialog.tsx` first and drop `font-normal` if `edp-title`'s weight already wins via `cn()`/`twMerge`.
- The manual overlay div, manual Escape listener, and manual `role="dialog"`/`aria-modal` are all removed — `AlertDialog` provides all of this, plus a real focus trap the original didn't have.
- `onOpenChange={(next) => { if (!next && !busy) onCancel(); }}` reproduces the original's `busy`-guards-dismissal behavior (the overlay's `onClick={busy ? undefined : onCancel}`) — when `busy` is true, Escape/outside-click/close attempts are swallowed rather than calling `onCancel`.
- `AlertDialogContent`'s default shadcn styling (background, border, shadow, position) is overridden via `className` to keep the exact current box: `w-[420px] max-w-[92vw]` and the `12px`/`20px` gap/padding. Radix's own centering (`AlertDialogContent` is already fixed+centered by default) replaces the old manual `top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2` positioning — don't re-add those, they'd conflict with the primitive's own transform.
- The raw `rgba(0,0,0,0.3)` box-shadow and `rgba(0,0,0,0.4)` overlay background are dropped in favor of whatever `AlertDialogOverlay`/`AlertDialogContent` ship with by default (`bg-black/50` typically) — these are pre-existing raw-literal colors that CLAUDE.md's token-only rule would have flagged eventually anyway; accepting the shadcn default here (rather than re-injecting the raw rgba) is the intended cleanup, not a regression. If the visual difference is jarring once built, note it in the report rather than fighting to preserve the exact literal.

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/ui/alert-dialog.tsx src/features/coffee/confirm-modal.tsx
git commit -m "refactor(ui): replace hand-rolled ConfirmModal with shadcn AlertDialog

Removes the manual overlay, Escape listener, and role=dialog markup in
favor of Radix's focus-trapped AlertDialog. Same external ConfirmModal
props, same 3 call sites unchanged. busy-guards-dismissal behavior
preserved via onOpenChange."
```

---

## Task 6: "Gerar" modal → Dialog (largest, done last)

**Files:**
- Create (via CLI): `frontend/src/components/ui/dialog.tsx`
- Modify: `frontend/src/features/coffee/coffee-gerar-modal.tsx`

**Interfaces:**
- Produces: `CoffeeGerarModal` keeps its exact existing prop signature `{ open, idsIniciais?, onClose, onChanged }`. Call site `coffee-geradas.tsx:149` does not change.

**Scope:** only the modal chrome changes (overlay, positioning, Escape handling, the `role="dialog"` wrapper). Every line of business logic — the `useEffect`s that load/persist `rows` via `sessionStorage`, `consultar`/`adicionar`/`reconsultarTodas`/`removerLinha`/`limpar`, the batch-generation polling state (`gerando`), the table body starting after line 222 — is copy-pasted unchanged into the new wrapper. Do not touch anything inside the table/body markup or any function body in this file.

Current wrapper (for reference — this is what changes; everything from line 222's `<div className="flex items-center gap-[8px]">` onward, i.e. the header row through the closing tags, stays structurally the same, just re-parented under `DialogContent`):

```tsx
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // ...(functions: adicionar, reconsultarTodas, removerLinha, limpar, etc. — unchanged)...

  return (
    <>
      <div onClick={gerando.rodando ? undefined : onClose}
           className="fixed inset-0 z-[300]" style={{ background: "rgba(0,0,0,0.4)" }} />
      <div role="dialog" aria-modal="true" aria-label="Gerar ou consultar notas"
           className="fixed top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[760px] max-w-[94vw]
                      max-h-[88vh] bg-surface border border-line rounded-[12px] z-[301]
                      flex flex-col gap-[12px] p-[20px]"
           style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <div className="flex items-center gap-[8px]">
          <span className="edp-title text-[17px] flex-1">Gerar / Consultar notas</span>
          <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={gerando.rodando}
                  aria-label="Fechar" title="Fechar (Esc)">
            <X />
          </Button>
        </div>
        {/* ...rest of body unchanged (input row, table)... */}
      </div>
    </>
  );
}
```

- [ ] **Step 1: Install shadcn Dialog**

```bash
cd frontend && npx shadcn@latest add dialog
```

- [ ] **Step 2: Add the `Dialog`/`DialogContent` import**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
```

Add it grouped with the file's other `@/components/ui/*` imports. `DialogHeader`/`DialogTitle` are needed for Step 4's accessible-name fix (Radix's `Dialog.Content` requires a `Dialog.Title` in the tree, or it emits a console warning and screen readers get no accessible name for the panel — see the codebase's existing `sr-only` pattern at `frontend/src/components/ui/sidebar.tsx:198-201`, already applied to `LogDrawer` in Task 1).

- [ ] **Step 3: Remove the manual Escape-key `useEffect` and the `if (!open) return null;` guard**

Both are now handled by `Dialog`/`DialogContent` — delete these lines, keep every other `useEffect`/function in the file exactly as-is.

- [ ] **Step 4: Replace only the wrapper markup**

Change:
```tsx
  return (
    <>
      <div onClick={gerando.rodando ? undefined : onClose}
           className="fixed inset-0 z-[300]" style={{ background: "rgba(0,0,0,0.4)" }} />
      <div role="dialog" aria-modal="true" aria-label="Gerar ou consultar notas"
           className="fixed top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[760px] max-w-[94vw]
                      max-h-[88vh] bg-surface border border-line rounded-[12px] z-[301]
                      flex flex-col gap-[12px] p-[20px]"
           style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
```
to:
```tsx
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !gerando.rodando) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-label="Gerar ou consultar notas"
        className="w-[760px] max-w-[94vw] max-h-[88vh] gap-[12px] p-[20px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Gerar ou consultar notas</DialogTitle>
        </DialogHeader>
```

`DialogHeader`/`DialogTitle` above are visually hidden (`sr-only`) — they exist only to give Radix's `Dialog.Content` the accessible name it requires; the visible header row (`<div className="flex items-center gap-[8px]">...`, unchanged, immediately follows this block) keeps its own styling untouched.

And change the closing tags at the very end of the returned JSX from:
```tsx
      </div>
    </>
  );
}
```
to:
```tsx
      </DialogContent>
    </Dialog>
  );
}
```

Everything between the opening and closing tags (the header row with the `X` close button, the input row, the table) stays exactly as it is today — the existing `<Button variant="ghost" size="icon-sm" onClick={onClose} ...><X /></Button>` header close button is KEPT (pass `showCloseButton={false}` to `DialogContent` as shown above, so Radix's own default corner close button doesn't duplicate it — this file already has a custom-positioned, `disabled={gerando.rodando}`-aware close button that the default one can't replicate).

`onOpenChange={(next) => { if (!next && !gerando.rodando) onClose(); }}` reproduces the original overlay's `onClick={gerando.rodando ? undefined : onClose}` guard — Escape/outside-click/programmatic close attempts are swallowed while a batch generation is running, exactly as before.

- [ ] **Step 5: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors.

- [ ] **Step 6: Confirm the polling/session-persistence logic is untouched**

```bash
cd frontend && git diff src/features/coffee/coffee-gerar-modal.tsx
```

Read the full diff. Expected: only the wrapper (Steps 3-4) and the new import (Step 2) changed — every `useEffect` body, every handler function (`consultar`, `adicionar`, `reconsultarTodas`, `removerLinha`, `limpar`, the batch-generate logic), and the entire table markup should show as unchanged (no diff lines inside them). If anything inside those regions shows a diff, stop and report — that would mean something outside this task's scope got touched.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/components/ui/dialog.tsx src/features/coffee/coffee-gerar-modal.tsx
git commit -m "refactor(ui): replace hand-rolled Gerar-modal chrome with shadcn Dialog

Only the overlay/positioning/Escape-handling wrapper changes — the
query/edit/batch-generate/polling logic and table body are untouched.
Keeps the existing custom close button (disabled while a batch
generation is running) instead of Radix's default, via
showCloseButton={false}. Same external CoffeeGerarModal props, same
call site unchanged."
```

---

## Task 7: Final verification (controller, no subagent)

**Files:** none modified — verification only.

- [ ] **Step 1: Full frontend build**

```bash
cd frontend && npm run build
```

Expected: exit 0.

- [ ] **Step 2: Full backend test suite (sanity check — SP2b doesn't touch backend)**

```bash
cd backend && .venv/Scripts/python.exe -m pytest -q
```

Expected: same pass count as before this branch started (no regression).

- [ ] **Step 3: Confirm no leftover hand-rolled patterns**

```bash
cd frontend && grep -rn 'edp-tag\|edp-prio\|edp-dot\|coffee-bar' src/
grep -rn '<select' src/features/ | grep -v 'multiple'
```

Expected: zero matches for the first grep; the second should show zero results (all remaining `<select>` are the two out-of-scope `multiple` ones, already filtered out).

- [ ] **Step 4: Report outstanding manual-verification item to the user**

No browser extension was available this session (same as SP1/SP2a). State explicitly in the final report: the user must click through all 6 swapped patterns — LogDrawer (open a nota's logs), a priority/status badge screen (Verificar dashboard), any progress bar (upload a file, open KPI drawer, abrir COFFEE notes, buscar pendentes), the newly-Select-ified filters (dashboard, coffee logs, input filters/logs/notes-table), a ConfirmModal (delete/reject action in COFFEE), and the Gerar modal (open it, add IDs, run a batch generation) — in both light and dark theme, including keyboard-only navigation (Tab/Escape/Enter) to confirm the new focus-trap/ARIA behavior works as expected, before trusting this branch in production.

---

## Self-review notes (from plan authoring)

- **Spec coverage:** all 6 patterns from the design spec have a task (1:1 mapping, Tasks 1-6). The spec's "fora de escopo" (reports.tsx multi-select) is explicitly called out as untouched in Task 4.
- **Scope correction found during authoring:** the design spec's research listed `input/filters.tsx:77,153` as 2 select sites; reading the file showed `:153` is a `multiple size={4}` listbox — the same out-of-scope pattern as `reports.tsx`, not a single-value select. Task 4 corrects this to 1 site for `filters.tsx`, 10 total across the task (not 12), and states the correction explicitly so the implementer doesn't "helpfully" convert the multi-select too.
- **Raw-literal-color rule (carried over from SP2a):** applied in Task 2 (prio border colors stay inline `style`, not baked into the Badge variant className) and flagged in Task 5 (the old `rgba(0,0,0,0.3/0.4)` overlay/shadow literals are allowed to fall back to shadcn's defaults rather than being re-injected as arbitrary-value classNames).
- **Placeholder scan:** no TBD/"add appropriate"/vague instructions. Task 3's Progress customization step includes a caveat ("match it against what the CLI actually generated") because CLI-generated file content isn't knowable ahead of running it — this is a legitimate exception (same pattern SP1 used for `npx shadcn add`), not a placeholder, and the required change (add `indicatorClassName`, thread it through) is stated precisely regardless of the exact starting boilerplate.
- **Type/interface consistency:** every task's "Produces" line matches the prop signatures shown in that task's before/after code blocks exactly — no drift between `ConfirmModalProps`/`LogDrawerProps`/`CoffeeGerarModal`'s props across tasks (none of these props change at all, confirmed against Task 1/5/6's full-file rewrites).
