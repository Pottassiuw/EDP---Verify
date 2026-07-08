# SP2a: Preflight + inline-styles→utilities + `.edp-*`→`@layer components` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Tailwind `@theme inline` bridge to expose every EDP design token as a utility, turn on global preflight (retiring the `.ui-reset` hack), move `.edp-*` into `@layer components`, then sweep `style={{}}` inline styles in `features/verificar`, `features/coffee`, `features/input` (and the one occurrence in `features/configuracoes`) into Tailwind utility classNames — static values only, dynamic values stay inline.

**Architecture:** One foundation task (`app.css` only) must land and build green before any sweep task starts — sweeps consume utility names the foundation task creates. The three feature sweeps are independent of each other and can run in any order; this plan orders them smallest-to-largest (verificar → coffee → input) to validate the conversion pattern on a small file set first.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4 (`@theme inline`, `@layer`), no new dependencies.

## Global Constraints

- Zero visual change intended. No browser extension available this session — every task is verified by `tsc -b && vite build` plus diff review, not a real click-through. The user must click through the app (light + dark theme) before trusting this in production, same caveat as SP1.
- Never use raw Tailwind palette colors (`bg-red-500`, `text-gray-400`, etc.) or arbitrary hex — only the design tokens now exposed via the bridge, or `white`/`black`/`transparent`.
- `--pad`, `--gap`, `--row-py`, `--tile-py` are density-reactive (`.edp[data-density="compact"]` overrides them) and must **not** enter the `@theme inline` bridge or be replaced by a static Tailwind spacing utility. Any inline style using `var(--pad)` etc. stays exactly as-is (inline, or `p-[var(--pad)]` arbitrary-value className if converting the property name itself is desired — do not change the value source).
- A `style={{}}` property converts to a Tailwind utility only if its value is static (a literal, not computed from props/state/data). Anything computed at runtime, conditional on data (`STATUS_COR[status]`, `pct + '%'`, ternaries), or that would require a className per data combination stays inline. This is normal Tailwind practice, not leftover work.
- `backend/` is untouched by this plan — no backend tests should regress; run the suite once at the end as a sanity check only.
- Run `cd frontend && npm run build` after every task (foundation and each sweep) — must exit 0 with no new TypeScript errors before committing.

---

## Task 1: Foundation — extend theme bridge, enable preflight, layer `.edp-*`

**Files:**
- Modify: `frontend/src/app.css`
- Modify (remove `className="ui-reset"` / `"ui-reset edp-page"`): `frontend/src/features/configuracoes/configuracoes.tsx:26`, `frontend/src/features/coffee/coffee-hub.tsx:35`, `frontend/src/features/coffee/coffee-gerar-modal.tsx:217`, `frontend/src/features/verificar/dashboard.tsx:191,252,337`, `frontend/src/features/input/input-section.tsx:44`, `frontend/src/features/input/manage.tsx:166`, `frontend/src/features/input/ramal.tsx:169`, `frontend/src/features/input/settings.tsx:36`

**Interfaces:**
- Produces: Tailwind utility classNames usable by Tasks 2–4 — `bg-bg`, `bg-bg-2`, `bg-surface`, `bg-surface-2`, `bg-surface-3`, `text-text`, `text-text-dim`, `text-text-mute`, `text-green`, `text-green-2`, `text-blue`, `text-indigo`, `text-amber`, `text-red`, `text-accent`, `text-accent-2`, `border-line`, `border-line-2`, `bg-tint-green`, `bg-tint-blue`, `bg-tint-indigo`, `bg-tint-amber`, `bg-tint-red`, `bg-accent-tint`, `rounded-edp-sm`, `rounded-edp`, `rounded-edp-md`, `rounded-edp-lg`, `tracking-display`, `tracking-tight`, `tracking-label`.

- [ ] **Step 1: Extend `@theme inline` with every EDP color, radius, and tracking token**

In `frontend/src/app.css`, inside the existing `@theme inline { ... }` block (lines 12–45), add these lines right before the closing `}` on line 45:

```css
  --color-bg: var(--bg);
  --color-bg-2: var(--bg-2);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-line: var(--line);
  --color-line-2: var(--line-2);
  --color-text: var(--text);
  --color-text-dim: var(--text-dim);
  --color-text-mute: var(--text-mute);
  --color-green: var(--green);
  --color-green-2: var(--green-2);
  --color-blue: var(--blue);
  --color-indigo: var(--indigo);
  --color-amber: var(--amber);
  --color-red: var(--red);
  --color-accent-2: var(--accent-2);
  --color-accent-tint: var(--accent-tint);
  --color-tint-green: var(--tint-green);
  --color-tint-blue: var(--tint-blue);
  --color-tint-indigo: var(--tint-indigo);
  --color-tint-amber: var(--tint-amber);
  --color-tint-red: var(--tint-red);
  --radius-edp-sm: var(--r-sm);
  --radius-edp: var(--r);
  --radius-edp-md: var(--r-md);
  --radius-edp-lg: var(--r-lg);
  --tracking-display: var(--tracking-display);
  --tracking-tight: var(--tracking-tight);
  --tracking-label: var(--tracking-label);
```

Note: `--color-accent` already exists in the bridge (line 25, mapped to `--sh-accent` — the shadcn hover slot, not the EDP brand accent). Do not touch that line. The EDP brand accent is reachable today via `--accent`/`--accent-2` CSS vars directly; this step adds `--color-accent-2` as a utility (`text-accent-2`, `bg-accent-2`) but deliberately does **not** add a `--color-accent` override, since that name is already claimed by the shadcn bridge and changing it would recolor every shadcn primitive (buttons, focus rings) that consumes `--color-accent` today. Where a sweep task needs the EDP brand green specifically, use `text-green` / `bg-green` (already added above), not `text-accent`.

- [ ] **Step 2: Turn on global preflight**

Replace lines 1–2 of `frontend/src/app.css`:

```css
/* Tailwind v4 — só theme + utilities (SEM preflight nesta fase).
   O preflight/reset volta na Fase 4, quando todas as telas estiverem migradas. */
```

with:

```css
/* Tailwind v4 — theme + preflight + utilities. */
```

Replace line 5 (`@import "tailwindcss/utilities.css" layer(utilities);`) — insert a new import line immediately after it:

```css
@import "tailwindcss/utilities.css" layer(utilities);
@import "tailwindcss/preflight.css" layer(base);
```

- [ ] **Step 3: Remove the scoped preflight-lite reset block, keep the two unlayered fixes**

Delete the entire block from the comment starting `/* ============================================================\n   Reset "preflight-lite" escopado...` through the closing `}` of the `@layer base { ... }` rule — i.e. everything currently on lines 339–394 of `app.css` (from the banner comment through `}` that closes `@layer base`). Keep everything after it (the `[data-slot="sidebar-container"]` rule and the `[data-sonner-toaster]` rule) untouched — those two are already unlayered/scoped correctly and don't depend on the block being removed.

- [ ] **Step 4: Wrap `.edp-*` component classes in `@layer components`**

Wrap the block from `.edp-eyebrow {` (currently line 219) through the end of `.edp-table tbody tr:nth-child(even) td { background: var(--zebra); }` (currently line 335) in `@layer components { ... }`. Do not change any selector or declaration inside — only add the wrapping `@layer components {` before `.edp-eyebrow` and a matching closing `}` after the last `.edp-table` rule.

- [ ] **Step 5: Pre-removal risk grep for elements that relied on the scoped reset**

Run, from `frontend/`:

```bash
grep -rn '<ul\|<ol\|<li\|<h1\|<h2\|<h3\|<h4\|<h5\|<h6' src/features src/components/app-sidebar.tsx
grep -rn '<button' src/features src/components/app-sidebar.tsx | grep -v '@/components/ui/button'
```

For every match, note in the task's completion report: file, element, and whether it's inside one of the 10 files listed in this task's "Files" section (already covered by the old `.ui-reset` scope, now covered by global preflight — no behavior change) or outside that scope (previously had **no** reset at all, so global preflight is a **new** reset for that element — flag these specifically, they're the ones that could visually shift: default `<ul>`/`<ol>` bullet removal, `<button>` appearance reset, heading margin removal). This is a code-review-only check (no browser); list the flagged elements in the report for the user's eventual click-through, don't attempt to "fix" them preemptively — preflight is the intended new baseline.

- [ ] **Step 6: Strip `className="ui-reset"` from the 10 files that use it**

In each of these files, remove the `ui-reset` token from the className. Where it's the only class, remove the attribute; where combined (`"ui-reset edp-page"`), keep the rest:

- `frontend/src/features/configuracoes/configuracoes.tsx:26` — `className="ui-reset h-full overflow-y-auto"` → `className="h-full overflow-y-auto"`
- `frontend/src/features/coffee/coffee-hub.tsx:35` — `className="ui-reset"` → remove the `className` attribute entirely (it has no other class)
- `frontend/src/features/coffee/coffee-gerar-modal.tsx:217` — `className="ui-reset"` → remove the `className` attribute entirely
- `frontend/src/features/verificar/dashboard.tsx:191` — `className="ui-reset"` → remove the `className` attribute entirely
- `frontend/src/features/verificar/dashboard.tsx:252` — `className="ui-reset"` → remove the `className` attribute entirely
- `frontend/src/features/verificar/dashboard.tsx:337` — `className="ui-reset"` → remove the `className` attribute entirely
- `frontend/src/features/input/input-section.tsx:44` — `className="ui-reset"` → remove the `className` attribute entirely
- `frontend/src/features/input/manage.tsx:166` — `className="ui-reset edp-page"` → `className="edp-page"`
- `frontend/src/features/input/ramal.tsx:169` — `className="ui-reset edp-page"` → `className="edp-page"`
- `frontend/src/features/input/settings.tsx:36` — `className="ui-reset edp-page"` → `className="edp-page"`

After removal, confirm no other file still references `ui-reset`:

```bash
grep -rn 'ui-reset' src/
```

Expected: no matches outside `app.css`'s own doc comments (which Step 3 already deleted) — expect zero matches total.

- [ ] **Step 7: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript or CSS errors. If Tailwind reports an unknown utility, re-check Step 1's token names against what a sweep task will consume (none yet — this task doesn't add any new classNames to `.tsx` files besides the `ui-reset` removals).

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/app.css src/features/configuracoes/configuracoes.tsx src/features/coffee/coffee-hub.tsx src/features/coffee/coffee-gerar-modal.tsx src/features/verificar/dashboard.tsx src/features/input/input-section.tsx src/features/input/manage.tsx src/features/input/ramal.tsx src/features/input/settings.tsx
git commit -m "feat(css): extend theme bridge, enable preflight, layer .edp-*

Adds every EDP color/radius/tracking token to @theme inline, turns on
tailwindcss/preflight.css globally, retires the scoped .ui-reset hack,
and moves .edp-* component classes into @layer components so utilities
win when combined on the same element."
```

---

## Task 2: Sweep inline styles — `features/verificar/` (+ `features/configuracoes/`)

**Files:**
- Modify: `frontend/src/features/verificar/upload-screen.tsx` (20 occurrences), `frontend/src/features/verificar/shared.tsx` (2), `frontend/src/features/verificar/kpi-drawer.tsx` (20), `frontend/src/features/verificar/dashboard.tsx` (51), `frontend/src/features/verificar/duplicate-compare.tsx` (14), `frontend/src/features/configuracoes/configuracoes.tsx` (1)

**Interfaces:**
- Consumes: utility classNames produced by Task 1 (Step 1's list). Task 1 must be merged and `npm run build` green before starting this task.

### Conversion table (apply mechanically to every static `style={{...}}` property in this task's files)

| Style property / value | Tailwind className |
|---|---|
| `display: "flex"` | `flex` |
| `flexDirection: "column"` | `flex-col` |
| `alignItems: "center"` | `items-center` |
| `alignItems: "flex-start"` | `items-start` |
| `alignItems: "flex-end"` | `items-end` |
| `justifyContent: "center"` | `justify-center` |
| `justifyContent: "space-between"` | `justify-between` |
| `justifyContent: "flex-end"` | `justify-end` |
| `flex: 1` | `flex-1` |
| `flexShrink: 0` | `shrink-0` |
| `flexWrap: "wrap"` | `flex-wrap` |
| `minWidth: 0` | `min-w-0` |
| `overflow: "hidden"` | `overflow-hidden` |
| `overflow: "auto"` | `overflow-auto` |
| `whiteSpace: "nowrap"` | `whitespace-nowrap` |
| `textOverflow: "ellipsis"` | `text-ellipsis` |
| `gap: N` (px, literal number) | `gap-[Npx]` |
| `padding: "Ya Xb"` | `py-[Yapx] px-[Xbpx]` (split shorthand into the two axis utilities; if all four sides differ use `pt-[]`/`pr-[]`/`pb-[]`/`pl-[]`) |
| `background: "var(--surface)"` | `bg-surface` |
| `background: "var(--surface-2)"` | `bg-surface-2` |
| `background: "var(--surface-3)"` | `bg-surface-3` |
| `background: "var(--bg)"` | `bg-bg` |
| `background: "var(--bg-2)"` | `bg-bg-2` |
| `background: "var(--tint-green)"` etc. | `bg-tint-green` (same pattern for blue/indigo/amber/red) |
| `color: "var(--text)"` | `text-text` |
| `color: "var(--text-dim)"` | `text-text-dim` |
| `color: "var(--text-mute)"` | `text-text-mute` |
| `color: "var(--green)"` | `text-green` (same pattern for blue/indigo/amber/red) |
| `border: "1px solid var(--line)"` | `border border-line` |
| `border: "1px solid var(--line-2)"` | `border border-line-2` |
| `borderRadius: "var(--r-sm)"` | `rounded-edp-sm` |
| `borderRadius: "var(--r)"` | `rounded-edp` |
| `borderRadius: "var(--r-md)"` | `rounded-edp-md` |
| `borderRadius: "var(--r-lg)"` | `rounded-edp-lg` |
| `fontSize: N` (px) | `text-[Npx]` |
| `fontWeight: 500` | `font-medium` |
| `fontWeight: 600` | `font-semibold` |
| `fontWeight: 700` | `font-bold` |
| `letterSpacing: "var(--tracking-display)"` | `tracking-display` |
| `letterSpacing: "var(--tracking-tight)"` | `tracking-tight` |
| `letterSpacing: "var(--tracking-label)"` | `tracking-label` |
| `fontFamily: "var(--font-mono)"` | `font-mono` |
| `position: "relative"` / `"absolute"` / `"fixed"` / `"sticky"` | `relative` / `absolute` / `fixed` / `sticky` |
| `top`/`right`/`bottom`/`left: N` (px) | `top-[Npx]` / `right-[Npx]` / `bottom-[Npx]` / `left-[Npx]` |
| `width: N` (px) / `"N%"` | `w-[Npx]` / `w-[N%]` |
| `height: N` (px) / `"N%"` | `h-[Npx]` / `h-[N%]` |
| `margin: N` (px, single value, all sides) | `m-[Npx]` |
| `marginTop`/`marginRight`/`marginBottom`/`marginLeft: N` | `mt-[Npx]` / `mr-[Npx]` / `mb-[Npx]` / `ml-[Npx]` |
| `padding: N` (single number, all sides) | `p-[Npx]` |
| `padding: "Ya Xb Zc"` (3-value shorthand: top, left/right, bottom) | `pt-[Yapx] px-[Xbpx] pb-[Zcpx]` |
| `boxShadow: "var(--shadow-sm)"` / `"var(--shadow)"` / `"var(--shadow-lg)"` | `shadow-[var(--shadow-sm)]` / `shadow-[var(--shadow)]` / `shadow-[var(--shadow-lg)]` (Tailwind v4 arbitrary value, references the same CSS var — no new bridge token needed) |
| `borderLeft`/`borderRight`/`borderTop`/`borderBottom: "Npx solid var(--x)"` | `border-l-[Npx] border-l-{token}` (same pattern for r/t/b; `{token}` per the color table above, e.g. `border-l-line`) |
| `borderColor: "var(--x)"` (no matching `border` shorthand entry above) | `border-{token}` |
| `zIndex: N` | `z-[N]` |
| `display: "grid"` | `grid` |
| `display: "none"` | `hidden` |
| `display: "inline-flex"` | `inline-flex` |
| `display: "inline-block"` | `inline-block` |
| `display: "block"` | `block` |
| `fontWeight: 800` | `font-extrabold` |
| `fontWeight: 400` | `font-normal` |
| `letterSpacing: "Nem"` / `"Npx"` (literal, not a `var(--tracking-*)`) | `tracking-[Nem]` / `tracking-[Npx]` |
| `borderRadius: N` (px, literal, not a `var(--r*)`) | `rounded-[Npx]` |
| `background: "var(--line)"` | `bg-line` |
| `background: "var(--accent-tint)"` | `bg-accent-tint` |
| `background: "var(--accent)"` or `"var(--accent-2)"` | `bg-[var(--accent)]` / `bg-[var(--accent-2)]` (arbitrary value — `--color-accent` in the bridge is the shadcn slot, not the EDP brand accent; don't use the bare `bg-accent` utility for this) |
| `accentColor: "var(--accent)"` | `[accent-color:var(--accent)]` (Tailwind v4 arbitrary-property syntax) |
| any other static, literal CSS value not listed above | Tailwind v4 arbitrary-value/arbitrary-property syntax: a bracketed value on the closest matching utility prefix (`w-[..]`, `h-[..]`, `top-[..]`) or, if no utility prefix exists for the CSS property at all, the full arbitrary-property form `[css-property:value]`. Do not invent new `@theme` tokens or edit `app.css` to cover a one-off value. |

**Leave inline** (do not touch): any property whose value is a variable, prop, computed expression, ternary, template literal, or `var(--pad)`/`var(--gap)`/`var(--row-py)`/`var(--tile-py)` (density-reactive, per Global Constraints).

**Worked example** (`frontend/src/features/verificar/shared.tsx:60-73` today):

Before:
```tsx
<span
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 5,
  }}
>
  <span
    style={{ color: accent ? "var(--green)" : "var(--text-mute)" }}
  >
    {label}
  </span>
</span>
```

After:
```tsx
<span className="flex flex-col gap-[5px]">
  <span
    style={{ color: accent ? "var(--green)" : "var(--text-mute)" }}
  >
    {label}
  </span>
</span>
```

The outer `style` is entirely static → fully replaced by `className`, `style` prop removed. The inner `color` is a ternary on a prop → stays inline exactly as-is.

- [ ] **Step 1: Convert `frontend/src/features/verificar/shared.tsx`**

Read the file, apply the conversion table to both `style={{...}}` occurrences (the one at line 60 shown above; check for one more per the earlier grep count of 2 total). Leave any dynamic value inline.

- [ ] **Step 2: Convert `frontend/src/features/verificar/upload-screen.tsx`**

Read the file, apply the conversion table to all 20 `style={{...}}` occurrences. Leave dynamic values (progress percentages, conditional colors) inline.

- [ ] **Step 3: Convert `frontend/src/features/verificar/kpi-drawer.tsx`**

Read the file, apply the conversion table to all 20 `style={{...}}` occurrences. Leave dynamic values (KPI-driven colors/widths) inline.

- [ ] **Step 4: Convert `frontend/src/features/verificar/dashboard.tsx`**

Read the file, apply the conversion table to all 51 `style={{...}}` occurrences (the largest file in this task). Leave dynamic values inline.

- [ ] **Step 5: Convert `frontend/src/features/verificar/duplicate-compare.tsx`**

Read the file, apply the conversion table to all 14 `style={{...}}` occurrences. Leave dynamic values inline.

- [ ] **Step 6: Convert `frontend/src/features/configuracoes/configuracoes.tsx`**

Read the file, apply the conversion table to its 1 `style={{...}}` occurrence.

- [ ] **Step 7: Grep-verify no static styles were missed**

```bash
cd frontend && grep -n 'style={{' src/features/verificar/*.tsx src/features/configuracoes/configuracoes.tsx
```

For every remaining match, confirm (by reading the surrounding code) it's genuinely dynamic per the Global Constraints rule — not a static value that was overlooked.

- [ ] **Step 8: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors.

- [ ] **Step 9: Commit**

```bash
cd frontend && git add src/features/verificar src/features/configuracoes/configuracoes.tsx
git commit -m "refactor(css): convert static inline styles to Tailwind utilities in verificar/

Static style={{}} properties in features/verificar/ and the single
occurrence in features/configuracoes/ now use the utility classNames
from the extended theme bridge (Task 1). Dynamic/computed styles stay
inline, per SP2a scope."
```

---

## Task 3: Sweep inline styles — `features/coffee/`

**Files:**
- Modify: `frontend/src/features/coffee/coffee-abrir.tsx` (15), `coffee-gerar-modal.tsx` (21), `coffee-corrigidas.tsx` (9), `coffee-geradas.tsx` (16), `coffee-log-table.tsx` (22), `coffee-pendentes.tsx` (17), `coffee-log-drawer.tsx` (6), `coffee-notas-table.tsx` (11), `confirm-modal.tsx` (8), `coffee-hub.tsx` (10), `coffee-logs.tsx` (18), `coffee-verificar.tsx` (2)

**Interfaces:**
- Consumes: same utility classNames as Task 2 (produced by Task 1). Independent of Task 2 — no shared files — can run before, after, or in parallel with it, but Task 1 must be merged first.

Use the identical conversion table from Task 2 ("Conversion table" section above) and the identical "leave inline" rule. Do not duplicate the table here — apply it as written in Task 2.

- [ ] **Step 1: Convert `frontend/src/features/coffee/confirm-modal.tsx`** (8 occurrences — smallest first)

- [ ] **Step 2: Convert `frontend/src/features/coffee/coffee-verificar.tsx`** (2 occurrences)

- [ ] **Step 3: Convert `frontend/src/features/coffee/coffee-log-drawer.tsx`** (6 occurrences)

- [ ] **Step 4: Convert `frontend/src/features/coffee/coffee-corrigidas.tsx`** (9 occurrences)

- [ ] **Step 5: Convert `frontend/src/features/coffee/coffee-hub.tsx`** (10 occurrences)

- [ ] **Step 6: Convert `frontend/src/features/coffee/coffee-notas-table.tsx`** (11 occurrences)

- [ ] **Step 7: Convert `frontend/src/features/coffee/coffee-abrir.tsx`** (15 occurrences)

- [ ] **Step 8: Convert `frontend/src/features/coffee/coffee-geradas.tsx`** (16 occurrences)

- [ ] **Step 9: Convert `frontend/src/features/coffee/coffee-pendentes.tsx`** (17 occurrences)

- [ ] **Step 10: Convert `frontend/src/features/coffee/coffee-logs.tsx`** (18 occurrences)

- [ ] **Step 11: Convert `frontend/src/features/coffee/coffee-gerar-modal.tsx`** (21 occurrences)

- [ ] **Step 12: Convert `frontend/src/features/coffee/coffee-log-table.tsx`** (22 occurrences — largest in this task)

- [ ] **Step 13: Grep-verify no static styles were missed**

```bash
cd frontend && grep -n 'style={{' src/features/coffee/*.tsx
```

For every remaining match, confirm it's genuinely dynamic (data-driven color maps, computed widths/offsets, conditional expressions) by reading the surrounding code.

- [ ] **Step 14: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors.

- [ ] **Step 15: Commit**

```bash
cd frontend && git add src/features/coffee
git commit -m "refactor(css): convert static inline styles to Tailwind utilities in coffee/

Static style={{}} properties in features/coffee/ now use the utility
classNames from the extended theme bridge (Task 1). Dynamic/computed
styles stay inline, per SP2a scope."
```

---

## Task 4: Sweep inline styles — `features/input/`

**Files:**
- Modify: `frontend/src/features/input/data-grid.tsx` (1), `overview.tsx` (4), `logs.tsx` (7), `reports.tsx` (7), `filters.tsx` (10), `hierarquia-card.tsx` (11), `input-section.tsx` (11), `settings.tsx` (14), `notes-table.tsx` (14), `ramal.tsx` (19), `manage.tsx` (17)

**Interfaces:**
- Consumes: same utility classNames as Tasks 2–3 (produced by Task 1). Independent of Tasks 2–3 — no shared files — can run before, after, or in parallel with them, but Task 1 must be merged first.

Use the identical conversion table from Task 2 ("Conversion table" section above) and the identical "leave inline" rule.

- [ ] **Step 1: Convert `frontend/src/features/input/data-grid.tsx`** (1 occurrence)

- [ ] **Step 2: Convert `frontend/src/features/input/overview.tsx`** (4 occurrences)

- [ ] **Step 3: Convert `frontend/src/features/input/logs.tsx`** (7 occurrences)

- [ ] **Step 4: Convert `frontend/src/features/input/reports.tsx`** (7 occurrences)

- [ ] **Step 5: Convert `frontend/src/features/input/filters.tsx`** (10 occurrences)

- [ ] **Step 6: Convert `frontend/src/features/input/hierarquia-card.tsx`** (11 occurrences)

- [ ] **Step 7: Convert `frontend/src/features/input/input-section.tsx`** (11 occurrences)

- [ ] **Step 8: Convert `frontend/src/features/input/notes-table.tsx`** (14 occurrences)

- [ ] **Step 9: Convert `frontend/src/features/input/settings.tsx`** (14 occurrences)

- [ ] **Step 10: Convert `frontend/src/features/input/manage.tsx`** (17 occurrences)

- [ ] **Step 11: Convert `frontend/src/features/input/ramal.tsx`** (19 occurrences — largest in this task)

- [ ] **Step 12: Grep-verify no static styles were missed**

```bash
cd frontend && grep -n 'style={{' src/features/input/*.tsx
```

For every remaining match, confirm it's genuinely dynamic by reading the surrounding code.

- [ ] **Step 13: Build and verify**

```bash
cd frontend && npm run build
```

Expected: exit 0, no new TypeScript errors.

- [ ] **Step 14: Commit**

```bash
cd frontend && git add src/features/input
git commit -m "refactor(css): convert static inline styles to Tailwind utilities in input/

Static style={{}} properties in features/input/ now use the utility
classNames from the extended theme bridge (Task 1). Dynamic/computed
styles stay inline, per SP2a scope."
```

---

## Task 5: Final verification (controller, no subagent)

**Files:** none modified — verification only.

- [ ] **Step 1: Full frontend build**

```bash
cd frontend && npm run build
```

Expected: exit 0.

- [ ] **Step 2: Full backend test suite (sanity check — SP2a doesn't touch backend)**

```bash
cd backend && .venv/Scripts/python.exe -m pytest -q
```

Expected: same pass count as before this branch started (no regression).

- [ ] **Step 3: Confirm zero remaining `.ui-reset` references and zero unlayered `.edp-*` rules**

```bash
cd frontend && grep -rn 'ui-reset' src/
grep -n '@layer components' src/app.css
```

Expected: no `ui-reset` matches; `@layer components` present wrapping `.edp-*`.

- [ ] **Step 4: Grep repo-wide for any remaining static inline styles this plan missed**

```bash
cd frontend && grep -c 'style={{' src/features/verificar/*.tsx src/features/coffee/*.tsx src/features/input/*.tsx src/features/configuracoes/*.tsx
```

Compare against the per-file counts in Tasks 2–4's headers — remaining counts should be lower (dynamic-only) or explain any file where the count is unexpectedly high.

- [ ] **Step 5: Report outstanding manual-verification item to the user**

No browser extension was available this session (same as SP1). State explicitly in the final report: the user must click through Verificar (upload, KPI drawer, duplicate compare), all COFFEE sub-tabs, all Input sub-tabs, and Configuracoes, in both light and dark theme, before trusting this branch in production — preflight and the `.edp-*` layer change are exactly the kind of CSS-cascade change that can silently shift spacing/borders without a build error.

---

## Self-review notes (from plan authoring)

- **Spec coverage:** Section A (bridge, preflight, `.ui-reset` removal, `.edp-*` layering, risk grep) → Task 1. Section B (per-feature sweep, verificar→coffee→input order) → Tasks 2–4. `configuracoes.tsx`'s lone occurrence (not in the spec's original per-feature table, discovered during file-count verification) → folded into Task 2 rather than given its own task, since a 1-occurrence file doesn't warrant a separate review gate. `data-grid.tsx` (also not in the spec's original table) → folded into Task 4 for the same reason.
- **Actual vs spec-estimated counts:** spec estimated `.ui-reset` in ~13 files; actual grep found 10. Spec estimated ~121/146/117 style occurrences for verificar/coffee/input; actual grep found 107/155/115 (378 total across 29 files, incl. configuracoes + data-grid not in the original table). Plan uses the actual grep counts throughout, not the spec's estimates.
- **Placeholder scan:** no TBD/"add appropriate"/"similar to Task N" — the conversion table in Task 2 is the single source of truth Tasks 3–4 explicitly reference rather than repeat, which is a cross-reference to a fully-written table (not a placeholder), consistent with how the tasks are meant to be read (in order, foundation first).
- **Type consistency:** utility classNames listed in Task 1's "Produces" interface match exactly the names used in the Task 2 conversion table (`bg-surface`, `text-text-mute`, `rounded-edp-md`, `tracking-display`, etc.) — no naming drift.
