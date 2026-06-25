# Hub COFFEE: Navegacao Frontend — Plano de Implementacao

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a secao COFFEE de um componente monolitico num hub com 5 sub-paginas navegaveis via flyout na sidebar e barra segmentada no header.

**Architecture:** Nova pasta `frontend/src/coffee/` (espelho de `input/`). O `CoffeeHub` wrapper gerencia a sub-pagina ativa via `usePersistedState` (sessionStorage). O sidebar ganha um flyout popup no botao COFFEE que escreve direto em sessionStorage. O componente existente `coffee-section.tsx` move para `coffee/coffee-abrir.tsx` sem mudancas funcionais.

**Tech Stack:** React 18, TypeScript, Vite (code-splitting via `React.lazy`).

**Spec:** `docs/superpowers/specs/2026-06-18-coffee-hub-nav-design.md`

## Global Constraints

- Sem testes unitarios no frontend (nao ha vitest/jest). Verificacao e `tsc -b && vite build` (type-check + bundle) + teste visual no browser.
- Code-splitting preservado: chunk COFFEE separado via `React.lazy`.
- Estilos inline (padrao do projeto). CSS vars: `--surface`, `--line`, `--accent`, `--accent-tint`, `--text-mute`, `--r-md`, `--bg-2`.
- Hook `usePersistedState` ja existe em `frontend/src/hooks/use-persisted-state.ts` — usa sessionStorage, hidrata no mount, grava no effect.
- Barra segmentada usa classe CSS `edp-seg` com botoes filhos e classe `on` no ativo.
- Tipo `AppSection = "triagem" | "coffee" | "input"` em `types.ts`.
- Nenhuma mudanca no backend.

---

## Estrutura de arquivos

```
frontend/src/
  coffee/                       (nova pasta)
    coffee-hub.tsx              wrapper — estado da sub-pagina, header, renderizacao condicional
    coffee-abrir.tsx            move de components/coffee-section.tsx (componente "Abrir Notas")
    placeholder.tsx             placeholder generico para sub-paginas futuras
  components/
    sidebar.tsx                 modifica — flyout popup no botao COFFEE
    coffee-section.tsx          deletar (movido para coffee/)
  types.ts                      modifica — adiciona CoffeeSubPage
  App.tsx                       modifica — troca CoffeeSection por CoffeeHub, simplifica bloco coffee
```

---

### Task 1: Tipos, placeholder e mover CoffeeAbrir

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/coffee/placeholder.tsx`
- Create: `frontend/src/coffee/coffee-abrir.tsx` (copia de `components/coffee-section.tsx`)

**Interfaces:**
- Produces: tipo `CoffeeSubPage`; componente `CoffeePlaceholder`; componente `CoffeeAbrir` (mesma interface do antigo `CoffeeSection`, exportado como named export `CoffeeAbrir`).

- [ ] **Step 1: Adicionar `CoffeeSubPage` a types.ts**

Em `frontend/src/types.ts`, logo apos a linha `export type AppSection = "triagem" | "coffee" | "input";`, adicionar:

```typescript
export type CoffeeSubPage = "abrir" | "geradas" | "corrigidas" | "pendentes" | "verificar";
```

- [ ] **Step 2: Criar `frontend/src/coffee/placeholder.tsx`**

```tsx
import React from 'react';

interface CoffeePlaceholderProps {
  titulo: string;
  descricao: string;
}

export function CoffeePlaceholder({ titulo, descricao }: CoffeePlaceholderProps): React.JSX.Element {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 12, padding: 32, color: "var(--text-mute)" }}>
      <span style={{ fontSize: 36 }}>🚧</span>
      <strong style={{ fontSize: 16, color: "var(--text)" }}>{titulo}</strong>
      <span style={{ fontSize: 13, maxWidth: 400, textAlign: "center" }}>{descricao}</span>
      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: ".04em",
                     padding: "4px 10px", borderRadius: 999, background: "var(--bg-2)",
                     border: "1px solid var(--line)" }}>Em breve</span>
    </div>
  );
}
```

- [ ] **Step 3: Mover `coffee-section.tsx` para `coffee/coffee-abrir.tsx`**

Copiar `frontend/src/components/coffee-section.tsx` para `frontend/src/coffee/coffee-abrir.tsx`. Aplicar estas mudancas no arquivo copiado:

1. Na linha 2, trocar o import de tipos:
```tsx
// DE:
import type { Note, CoffeeSectionProps, CoffeeOpenMode } from '../types';
// PARA:
import type { Note, CoffeeOpenMode } from '../types';
```

2. Na linha 50, trocar a declaracao do componente:
```tsx
// DE:
export const CoffeeSection: React.FC<CoffeeSectionProps> = ({ notes, layout }) => {
// PARA:
interface CoffeeAbrirProps {
  notes: Note[];
  layout: "composer" | "split";
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeAbrir({ notes, layout, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeAbrirProps): React.JSX.Element {
```

3. Logo apos o `const header = (...)` block (antes do `if (layout === "split")`), adicionar o banner de retorno:

```tsx
  const returnBanner = coffeeReturn ? (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "8px 18px",
                  background: "var(--tint-amber)", borderBottom: "1px solid rgba(240,169,59,.3)",
                  fontSize: 13, color: "var(--text)" }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>←</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        Voce estava na{" "}
        <strong className="edp-mono" style={{ fontSize: 13 }}>Nota {coffeeReturn.noteId}</strong>
        {coffeeReturn.noteRef ? <span style={{ color: "var(--text-dim)" }}> · {coffeeReturn.noteRef}</span> : null}
      </span>
      <button className="edp-btn sm" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 600 }}
              onClick={onBackToTriagem}>
        ← Voltar a triagem
      </button>
      <button onClick={onClearReturn}
              style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--text-mute)", padding: "2px 6px" }}
              title="Dispensar" aria-label="Dispensar">x</button>
    </div>
  ) : null;
```

4. Nos dois returns (layout split e composer), adicionar `{returnBanner}` logo apos `{header}`:

No bloco `if (layout === "split")`:
```tsx
    return (
      <section className="coffee">
        <style>{COFFEE_STYLE}</style>
        {header}
        {returnBanner}
        <div style={{ flex: 1, ...
```

No bloco final (composer):
```tsx
    return (
      <section className="coffee">
        <style>{COFFEE_STYLE}</style>
        {header}
        {returnBanner}
        <div style={{ flex: 1, ...
```

5. Remover o ultimo `};` (era de um arrow function component) e usar `}` (funcao normal).

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npx tsc -b --noEmit && npx vite build`
Expected: SUCCESS (os novos arquivos sao validos TypeScript; ainda nao estao importados por ninguem, nao afetam o bundle)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/coffee/placeholder.tsx frontend/src/coffee/coffee-abrir.tsx
git commit -m "feat(coffee): tipos, placeholder e CoffeeAbrir (move de coffee-section)"
```

---

### Task 2: CoffeeHub + integracao no App.tsx

**Files:**
- Create: `frontend/src/coffee/coffee-hub.tsx`
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/components/coffee-section.tsx`

**Interfaces:**
- Consumes: `CoffeeSubPage` (types.ts), `CoffeeAbrir` (coffee-abrir.tsx), `CoffeePlaceholder` (placeholder.tsx), `usePersistedState` (hooks/).
- Produces: componente `CoffeeHub` (named export); aceita props `{ notes, layout, coffeeReturn, onClearReturn, onBackToTriagem }`.

- [ ] **Step 1: Criar `frontend/src/coffee/coffee-hub.tsx`**

```tsx
import React from 'react';
import type { Note, CoffeeSubPage } from '../types';
import { usePersistedState } from '../hooks/use-persisted-state';
import { CoffeeAbrir } from './coffee-abrir';
import { CoffeePlaceholder } from './placeholder';

const SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: "abrir", rotulo: "Abrir" },
  { id: "geradas", rotulo: "Geradas" },
  { id: "corrigidas", rotulo: "Corrigidas" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "verificar", rotulo: "Verificar" },
];

const PLACEHOLDERS: Record<string, { titulo: string; descricao: string }> = {
  geradas: { titulo: "Notas Geradas", descricao: "Notas com SAP real ja geradas pelo COFFEE. Em breve voce podera visualiza-las e move-las para o Input." },
  corrigidas: { titulo: "Notas Corrigidas", descricao: "Notas que transitaram de pendente para SAP real. Em breve voce podera acompanhar as correcoes." },
  pendentes: { titulo: "Notas Pendentes", descricao: "Notas aguardando geracao (SAP 10000000). Em breve voce podera disparar buscas e acompanhar o progresso." },
  verificar: { titulo: "Verificar Notas", descricao: "Verificacao de notas COFFEE com interface amigavel. Em breve." },
};

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
      ) : (
        <CoffeePlaceholder
          titulo={PLACEHOLDERS[sub]?.titulo ?? sub}
          descricao={PLACEHOLDERS[sub]?.descricao ?? ""} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Atualizar `App.tsx` — lazy import**

Trocar o lazy import do COFFEE:

```tsx
// DE:
const CoffeeSection = React.lazy(() =>
  import('./components/coffee-section').then((m) => ({ default: m.CoffeeSection })));
// PARA:
const CoffeeHub = React.lazy(() =>
  import('./coffee/coffee-hub').then((m) => ({ default: m.CoffeeHub })));
```

- [ ] **Step 3: Atualizar `App.tsx` — bloco de renderizacao do coffee**

Trocar todo o bloco `section === "coffee" ? (...)` (linhas 172-197 aproximadamente):

```tsx
// DE:
          ) : section === "coffee" ? (
            <React.Fragment>
              {screen === "dashboard" && (
                <TopBar t={t} setTweak={setTweak} file={file} source={source} onReset={() => { setCoffeeReturn(null); setScreen("upload"); }} />
              )}
              {screen === "dashboard" && coffeeReturn && (
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "8px 18px",
                              background: "var(--tint-amber)", borderBottom: "1px solid rgba(240,169,59,.3)",
                              fontSize: 13, color: "var(--text)" }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>←</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    Você estava na{" "}
                    <strong className="edp-mono" style={{ fontSize: 13 }}>Nota {coffeeReturn.noteId}</strong>
                    {coffeeReturn.noteRef ? <span style={{ color: "var(--text-dim)" }}> · {coffeeReturn.noteRef}</span> : null}
                  </span>
                  <button className="edp-btn sm" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 600 }}
                          onClick={() => { changeSection("triagem"); }}>
                    ← Voltar à triagem
                  </button>
                  <button onClick={() => setCoffeeReturn(null)}
                          style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--text-mute)", padding: "2px 6px" }}
                          title="Dispensar" aria-label="Dispensar">×</button>
                </div>
              )}
              <CoffeeSection notes={notes} layout={t.coffeeLayout} />
            </React.Fragment>
// PARA:
          ) : section === "coffee" ? (
            <CoffeeHub notes={notes} layout={t.coffeeLayout}
                       coffeeReturn={coffeeReturn}
                       onClearReturn={() => setCoffeeReturn(null)}
                       onBackToTriagem={() => { changeSection("triagem"); }} />
```

- [ ] **Step 4: Atualizar `sendToCoffeeQueue` — forcar sub-pagina "abrir"**

Na funcao `sendToCoffeeQueue` em `App.tsx`, adicionar uma linha antes de `setSection("coffee")`:

```tsx
  function sendToCoffeeQueue(ids: string[], sourceId?: string): void {
    const existing = JSON.parse(localStorage.getItem("edp_coffee_ids") ?? "[]") as string[];
    const valid = ids.filter((id) => /^\d{5,12}$/.test(id));
    const merged = [...new Set([...existing, ...valid])];
    localStorage.setItem("edp_coffee_ids", JSON.stringify(merged));
    if (sourceId) {
      const src = notes.find((n) => n.id === sourceId);
      setCoffeeReturn(src ? { noteId: src.id, noteRef: src.referencia } : null);
    }
    try { sessionStorage.setItem("edp_coffee_sub", JSON.stringify("abrir")); } catch { /* ignore */ }
    setSection("coffee");
  }
```

A linha adicionada e: `try { sessionStorage.setItem("edp_coffee_sub", JSON.stringify("abrir")); } catch { /* ignore */ }`

- [ ] **Step 5: Remover import e interface nao usados**

Em `types.ts`, remover `CoffeeSectionProps` da interface (se nao for mais usada por nenhum componente). Tambem remover a referencia em `App.tsx` se houver import de `CoffeeSectionProps`.

Verificar: `CoffeeSectionProps` era usada em `coffee-section.tsx` (que sera deletado). A nova `coffee-abrir.tsx` define sua propria interface `CoffeeAbrirProps`. Entao remover de `types.ts`:

```typescript
// REMOVER estas linhas:
export interface CoffeeSectionProps {
  notes: Note[];
  layout: CoffeeLayout;
}
```

- [ ] **Step 6: Deletar o arquivo antigo**

Deletar `frontend/src/components/coffee-section.tsx`.

- [ ] **Step 7: Verificar build**

Run: `cd frontend && npx tsc -b --noEmit && npx vite build`
Expected: SUCCESS — build com 3 chunks (main, coffee, input). O chunk coffee agora inclui coffee-hub + coffee-abrir + placeholder.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/coffee/coffee-hub.tsx frontend/src/App.tsx frontend/src/types.ts
git rm frontend/src/components/coffee-section.tsx
git commit -m "feat(coffee): hub wrapper com sub-paginas e integracao no App"
```

---

### Task 3: Flyout no Sidebar

**Files:**
- Modify: `frontend/src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `CoffeeSubPage` (types.ts), sessionStorage key `"edp_coffee_sub"`.
- Produces: flyout popup no botao COFFEE da sidebar.

- [ ] **Step 1: Reescrever `sidebar.tsx`**

Substituir o conteudo completo de `frontend/src/components/sidebar.tsx`:

```tsx
import React from 'react';
import type { AppSection, CoffeeSubPage } from '../types';

const svgBase = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const BrandGlyph = (): React.JSX.Element => (
  <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="30" fill="none" stroke="var(--indigo)" strokeWidth="9" />
    <circle cx="50" cy="50" r="18" fill="none" stroke="var(--blue)" strokeWidth="9" />
    <circle cx="50" cy="50" r="7" fill="none" stroke="var(--green)" strokeWidth="9" />
  </svg>
);
const IconTriage = (): React.JSX.Element => (<svg {...svgBase}><path d="M4 6h10M4 12h10M4 18h7" /><path d="M15.5 16.5l2 2 4-4.5" /></svg>);
const IconCoffee = (): React.JSX.Element => (<svg {...svgBase}><path d="M5 9h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" /><path d="M17 10h2.4a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3c-.5 1 .5 1.6 0 2.6M12 3c-.5 1 .5 1.6 0 2.6" /></svg>);
const IconInput = (): React.JSX.Element => (
  <svg {...svgBase}><rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" /></svg>
);
const IconReport = (): React.JSX.Element => (<svg {...svgBase}><path d="M3 21h18" /><rect x="5" y="10" width="3" height="8" rx="1" /><rect x="11" y="5" width="3" height="13" rx="1" /><rect x="17" y="13" width="3" height="5" rx="1" /></svg>);
const IconBI = (): React.JSX.Element => (<svg {...svgBase}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>);
const IconGear = (): React.JSX.Element => (<svg {...svgBase}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);

interface NavBtnProps { active?: boolean; soon?: boolean; label: string; onClick?: () => void; children: React.ReactNode; }
function NavBtn({ active, soon, label, onClick, children }: NavBtnProps): React.JSX.Element {
  return (
    <button title={soon ? label + " · em breve" : label} aria-label={label} disabled={soon} onClick={onClick}
            style={{ position: "relative", width: 42, height: 42, border: 0, borderRadius: 11,
                     cursor: soon ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                     background: active ? "var(--accent-tint)" : "transparent",
                     color: active ? "var(--accent)" : "var(--text-mute)", opacity: soon ? 0.4 : 1, transition: "background .12s, color .12s" }}>
      {active && <span style={{ position: "absolute", left: -7, top: 9, bottom: 9, width: 3, borderRadius: 999, background: "var(--accent)" }} />}
      {children}
      {soon && <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "var(--amber)" }} />}
    </button>
  );
}

const COFFEE_SUBS: { id: CoffeeSubPage; label: string; icon: string }[] = [
  { id: "abrir", label: "Abrir Notas", icon: "☕" },
  { id: "geradas", label: "Geradas", icon: "✓" },
  { id: "corrigidas", label: "Corrigidas", icon: "↻" },
  { id: "pendentes", label: "Pendentes", icon: "⏳" },
  { id: "verificar", label: "Verificar", icon: "🔍" },
];

function readCoffeeSub(): CoffeeSubPage {
  try {
    const raw = sessionStorage.getItem("edp_coffee_sub");
    if (raw) return JSON.parse(raw) as CoffeeSubPage;
  } catch { /* ignore */ }
  return "abrir";
}

function writeCoffeeSub(sub: CoffeeSubPage): void {
  try { sessionStorage.setItem("edp_coffee_sub", JSON.stringify(sub)); } catch { /* ignore */ }
}

interface SidebarProps { section: AppSection; setSection: (s: AppSection) => void; }
export function Sidebar({ section, setSection }: SidebarProps): React.JSX.Element {
  const [flyoutOpen, setFlyoutOpen] = React.useState(false);
  const flyoutRef = React.useRef<HTMLDivElement>(null);
  const chevronRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!flyoutOpen) return;
    function onMouseDown(e: MouseEvent): void {
      if (flyoutRef.current?.contains(e.target as Node)) return;
      if (chevronRef.current?.contains(e.target as Node)) return;
      setFlyoutOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setFlyoutOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("mousedown", onMouseDown); document.removeEventListener("keydown", onKeyDown); };
  }, [flyoutOpen]);

  function selectSub(sub: CoffeeSubPage): void {
    writeCoffeeSub(sub);
    setSection("coffee");
    setFlyoutOpen(false);
  }

  const activeSub = readCoffeeSub();

  return (
    <nav className="edp-nav" style={{ width: 56, flexShrink: 0, background: "var(--surface)", borderRight: "1px solid var(--line)",
         display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 14px", gap: 6, zIndex: 2 }}>
      <style>{`.edp-nav button:not(:disabled):hover{background:var(--surface-2)!important;color:var(--text)!important}`}</style>
      <div style={{ marginBottom: 10 }}><BrandGlyph /></div>
      <NavBtn active={section === "triagem"} label="Triagem" onClick={() => setSection("triagem")}><IconTriage /></NavBtn>

      {/* COFFEE com flyout */}
      <div style={{ position: "relative" }}>
        <NavBtn active={section === "coffee"} label="COFFEE" onClick={() => setSection("coffee")}><IconCoffee /></NavBtn>
        <button ref={chevronRef} aria-label="Sub-paginas COFFEE"
                onClick={() => setFlyoutOpen((p) => !p)}
                style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, border: 0,
                         borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                         background: flyoutOpen ? "var(--accent)" : "var(--surface-2)",
                         color: flyoutOpen ? "#fff" : "var(--text-mute)", fontSize: 8, lineHeight: 1,
                         transition: "background .12s" }}>
          ▾
        </button>

        {flyoutOpen && (
          <div ref={flyoutRef}
               style={{ position: "absolute", left: "calc(100% + 8px)", top: 0, width: 180,
                        background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)",
                        boxShadow: "0 4px 24px rgba(0,0,0,.25)", zIndex: 100,
                        display: "flex", flexDirection: "column", padding: "4px 0", overflow: "hidden" }}>
            {COFFEE_SUBS.map((s) => {
              const isActive = section === "coffee" && activeSub === s.id;
              return (
                <button key={s.id} onClick={() => selectSub(s.id)}
                        style={{ position: "relative", display: "flex", alignItems: "center", gap: 10,
                                 padding: "9px 14px", border: 0, cursor: "pointer", fontSize: 13,
                                 background: isActive ? "var(--accent-tint)" : "transparent",
                                 color: isActive ? "var(--accent)" : "var(--text)",
                                 transition: "background .1s" }}>
                  {isActive && <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3,
                                              borderRadius: 999, background: "var(--accent)" }} />}
                  <span style={{ width: 18, textAlign: "center", fontSize: 14 }}>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <NavBtn active={section === "input"} label="Input" onClick={() => setSection("input")}><IconInput /></NavBtn>
      <div style={{ flex: 1 }} />
      <NavBtn soon label="Relatorios"><IconReport /></NavBtn>
      <NavBtn soon label="De olho no BI"><IconBI /></NavBtn>
      <NavBtn soon label="Configuracoes"><IconGear /></NavBtn>
    </nav>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npx tsc -b --noEmit && npx vite build`
Expected: SUCCESS

- [ ] **Step 3: Teste visual**

Rodar o app (`cd backend && python -m uvicorn main:app --reload`) e verificar no browser:
1. Botao COFFEE na sidebar mostra chevron (▾) no canto inferior direito.
2. Clicar no botao COFFEE navega para a secao COFFEE com a barra segmentada no header.
3. Clicar no chevron abre o flyout com 5 sub-paginas.
4. Selecionar uma sub-pagina no flyout navega para ela e fecha o flyout.
5. Clicar fora do flyout ou pressionar Escape fecha o flyout.
6. Sub-paginas placeholder mostram o componente "Em breve".
7. "Abrir Notas" funciona como antes (input de IDs, chips, modos de abertura).
8. Navegar para outra secao e voltar ao COFFEE preserva a ultima sub-pagina visitada.
9. Enviar notas da triagem para o COFFEE abre na sub-pagina "Abrir Notas" com o banner de retorno.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/sidebar.tsx
git commit -m "feat(coffee): flyout de sub-paginas no sidebar"
```

---

## Verificacao final

- [ ] `cd frontend && npx tsc -b --noEmit && npx vite build` — SUCCESS, 3 chunks (main, coffee, input).
- [ ] Flyout abre/fecha corretamente (chevron, click-fora, Escape).
- [ ] Navegacao entre sub-paginas funciona (flyout e header `edp-seg`).
- [ ] "Abrir Notas" funciona identicamente ao comportamento anterior.
- [ ] `sendToCoffeeQueue` abre COFFEE na sub-pagina "Abrir Notas" com banner de retorno.
- [ ] Ultima sub-pagina visitada persiste em sessionStorage entre trocas de secao.
