# UI/UX Fase 1 — Shell (Sidebar shadcn + Configurações + Tema persistido) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o shell do EDP Verify — sidebar custom vira AppSidebar shadcn, TweaksPanel é removido, configurações ganham uma página real, e o tema/density/accent passam a ser persistidos via SettingsContext no localStorage.

**Architecture:** Cria `SettingsContext` como fonte de verdade de settings (sem prop drilling), substitui `<Sidebar>` por `<AppSidebar>` (shadcn `collapsible="icon"`), adiciona `ConfiguracoesPage` como nova `AppSection`, e remove todos os artefatos de TweakState em cascata controlada — cada task produz um build funcional.

**Tech Stack:** React 18, TypeScript 5, shadcn/ui (new-york, cssVariables), Tailwind v4, Vite 6, lucide-react.

## Global Constraints

- **Sem preflight Tailwind** — `index.css` importa apenas `tailwindcss/theme.css` + `tailwindcss/utilities.css` (sem `@import "tailwindcss"`). Não alterar essa estrutura.
- **shadcn style: new-york, rsc: false, cssVariables: true** — conforme `frontend/components.json`.
- **SSL corporativo (Netskope):** `npm config get cafile` retorna `C:/Users/e713611/.windows-ca-bundle.pem`. **NUNCA** usar `--strict-ssl=false`. Sempre verificar `npm config get cafile` antes de instalar pacotes.
- **Idioma:** labels e textos do produto em português brasileiro; nomes de arquivos e símbolos TypeScript em inglês.
- **TweakState não é removido até Task 6** — remover antes quebra imports em cascata. Cada task deve passar em `npm run build`.
- **Branch:** `develop` — nunca fazer merge em `main` neste plano.
- **Diretório de trabalho:** `C:\Users\e713611\Documents\EDP---Verify\frontend` para comandos npm/npx.

---

### Task 1: SettingsContext + atualização de types

**Files:**
- Create: `frontend/src/context/settings-context.tsx`
- Modify: `frontend/src/types.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores
- Produces:
  - `Settings`, `SettingsContextValue`, `useSettings()`, `SettingsProvider` exportados de `frontend/src/context/settings-context.tsx`
  - `Theme = "system" | "dark" | "light"` em `types.ts`
  - `AppSection = "coffee" | "input" | "configuracoes"` em `types.ts`
  - **TweakState NÃO é removido nesta task** — apenas as duas linhas acima são alteradas

---

- [ ] **Step 1: Atualizar `types.ts`**

Altere as duas linhas de tipo (apenas essas, nada mais):

```ts
// antes:
export type Theme = "dark" | "light";
export type AppSection = "coffee" | "input";

// depois:
export type Theme = "system" | "dark" | "light";
export type AppSection = "coffee" | "input" | "configuracoes";
```

- [ ] **Step 2: Criar `frontend/src/context/settings-context.tsx`**

Conteúdo completo do arquivo:

```tsx
import React from 'react';
import type { Theme, Density, CoffeeLayout, Accent } from '../types';

export interface Settings {
  theme: Theme;
  density: Density;
  accent: Accent;
  showKpis: boolean;
  coffeeLayout: CoffeeLayout;
}

export interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resolvedTheme: "light" | "dark";
}

const DEFAULTS: Settings = {
  theme: "system",
  density: "cozy",
  accent: ["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
  showKpis: true,
  coffeeLayout: "composer",
};

const STORAGE_KEY = "edp_settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* ignore */ }
  return DEFAULTS;
}

function saveSettings(s: Settings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = React.useState<Settings>(loadSettings);
  const [systemTheme, setSystemTheme] = React.useState<"dark" | "light">(getSystemTheme);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent): void => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: "dark" | "light" =
    settings.theme === "system" ? systemTheme : settings.theme;

  function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }

  return (
    <SettingsContext.Provider value={{ settings, setSetting, resolvedTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
```

- [ ] **Step 3: Verificar build**

```
cd C:\Users\e713611\Documents\EDP---Verify\frontend
npm run build
```

Esperado: sem erros TypeScript ou de bundle. Avisos de `Theme` sendo mais amplo do que antes são normais — não são erros.

- [ ] **Step 4: Commit**

```
git add frontend/src/context/settings-context.tsx frontend/src/types.ts
git commit -m "feat(ui): SettingsContext com persistência localStorage e tema system"
```

---

### Task 2: Instalar componentes shadcn (sidebar, switch, toggle-group)

> **Nota de execução:** Esta task é puramente instalação de pacotes. O implementador deve verificar `npm config get cafile` antes de qualquer comando npm/npx. NUNCA usar `--strict-ssl=false`.

**Files:**
- Create: `frontend/src/components/ui/sidebar.tsx` (gerado pelo shadcn CLI)
- Create: `frontend/src/components/ui/switch.tsx`
- Create: `frontend/src/components/ui/toggle-group.tsx`
- Create: (outros gerados automaticamente: `collapsible.tsx`, `tooltip.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton.tsx`)

**Interfaces:**
- Consumes: nada de tasks anteriores além da base shadcn da Fase 0
- Produces: componentes shadcn disponíveis para import de `@/components/ui/*`

---

- [ ] **Step 1: Verificar configuração SSL**

```
cd C:\Users\e713611\Documents\EDP---Verify\frontend
npm config get cafile
npm config get strict-ssl
```

Esperado: `cafile` retorna `C:/Users/e713611/.windows-ca-bundle.pem` e `strict-ssl` retorna `true`. **Se `strict-ssl` for `false`, corrigir com `npm config set strict-ssl true` antes de continuar.**

- [ ] **Step 2: Instalar componentes shadcn**

```
cd C:\Users\e713611\Documents\EDP---Verify\frontend
npx shadcn@latest add sidebar switch toggle-group --yes
```

O flag `--yes` evita prompts interativos. O comando `sidebar` puxa automaticamente `collapsible`, `tooltip`, `separator`, `sheet`, `skeleton`.

Se o comando falhar com erro SSL, **não** usar `--strict-ssl=false`. Ao invés disso, verificar se `NODE_EXTRA_CA_CERTS` está definido ou se o cafile está correto.

- [ ] **Step 3: Verificar arquivos gerados**

```
dir frontend\src\components\ui\sidebar.tsx
dir frontend\src\components\ui\switch.tsx
dir frontend\src\components\ui\toggle-group.tsx
dir frontend\src\components\ui\tooltip.tsx
dir frontend\src\components\ui\collapsible.tsx
dir frontend\src\components\ui\separator.tsx
```

Todos os arquivos devem existir.

- [ ] **Step 4: Verificar build**

```
npm run build
```

Esperado: build passa sem erros.

- [ ] **Step 5: Commit**

```
git add frontend/src/components/ui/ frontend/package.json frontend/package-lock.json
git commit -m "feat(ui): adicionar componentes shadcn sidebar, switch, toggle-group"
```

---

### Task 3: AppSidebar component

**Files:**
- Create: `frontend/src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes:
  - `AppSection`, `CoffeeSubPage` de `../types`
  - `useSettings` de `../context/settings-context` (não necessário nesta task — AppSidebar não lê settings diretamente)
  - Componentes shadcn de `@/components/ui/sidebar`, `@/components/ui/collapsible`, `@/components/ui/tooltip`, `@/components/ui/separator`
  - `ChevronDown` de `lucide-react`
- Produces:
  - `AppSidebar({ section, setSection, coffeeSub, setCoffeeSub }: AppSidebarProps)` exportado
  - Não modifica `App.tsx` ainda — o componente existe mas não está em uso

---

- [ ] **Step 1: Criar `frontend/src/components/app-sidebar.tsx`**

```tsx
import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { AppSection, CoffeeSubPage } from '../types';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarTrigger,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';

// ─── Ícones inline (mesmas formas do sidebar.tsx original) ───────────────────
const svgBase = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const BrandGlyph = (): React.JSX.Element => (
  <svg width="24" height="24" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
    <circle cx="50" cy="50" r="30" fill="none" stroke="var(--indigo)" strokeWidth="9" />
    <circle cx="50" cy="50" r="18" fill="none" stroke="var(--blue)" strokeWidth="9" />
    <circle cx="50" cy="50" r="7" fill="none" stroke="var(--green)" strokeWidth="9" />
  </svg>
);
const IconCoffee = (): React.JSX.Element => (
  <svg {...svgBase}><path d="M5 9h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" /><path d="M17 10h2.4a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3c-.5 1 .5 1.6 0 2.6M12 3c-.5 1 .5 1.6 0 2.6" /></svg>
);
const IconInput = (): React.JSX.Element => (
  <svg {...svgBase}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></svg>
);
const IconReport = (): React.JSX.Element => (
  <svg {...svgBase}><path d="M3 21h18" /><rect x="5" y="10" width="3" height="8" rx="1" /><rect x="11" y="5" width="3" height="13" rx="1" /><rect x="17" y="13" width="3" height="5" rx="1" /></svg>
);
const IconBI = (): React.JSX.Element => (
  <svg {...svgBase}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
const IconGear = (): React.JSX.Element => (
  <svg {...svgBase}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);

// ─── Sub-itens COFFEE ────────────────────────────────────────────────────────
const COFFEE_SUBS: { id: CoffeeSubPage; label: string }[] = [
  { id: "verificar",  label: "Verificar" },
  { id: "abrir",      label: "Abrir" },
  { id: "geradas",    label: "Gerar" },
  { id: "corrigidas", label: "Corrigidas" },
  { id: "pendentes",  label: "Pendentes" },
  { id: "logs",       label: "Logs" },
];

// ─── Props ───────────────────────────────────────────────────────────────────
interface AppSidebarProps {
  section: AppSection;
  setSection: (s: AppSection) => void;
  coffeeSub: CoffeeSubPage;
  setCoffeeSub: (s: CoffeeSubPage) => void;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function AppSidebar({ section, setSection, coffeeSub, setCoffeeSub }: AppSidebarProps): React.JSX.Element {
  function selectSub(sub: CoffeeSubPage): void {
    setCoffeeSub(sub);
    setSection("coffee");
  }

  return (
    <Sidebar collapsible="icon">
      {/* ── Header: brand + trigger ── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-1 py-1">
              <BrandGlyph />
              <span className="font-semibold text-sm truncate group-data-[collapsible=icon]:hidden">
                EDP Verify
              </span>
              <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:hidden" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Content: navegação principal ── */}
      <SidebarContent>
        <SidebarMenu>
          {/* COFFEE com accordion */}
          <SidebarMenuItem>
            <Collapsible defaultOpen className="group/coffee">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  tooltip="COFFEE"
                  isActive={section === "coffee"}
                  onClick={() => setSection("coffee")}
                >
                  <IconCoffee />
                  <span>COFFEE</span>
                  <ChevronDown
                    size={14}
                    className="ml-auto transition-transform duration-200 group-data-[state=open]/coffee:rotate-180"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {COFFEE_SUBS.map((s) => (
                    <SidebarMenuSubItem key={s.id}>
                      <SidebarMenuSubButton
                        isActive={section === "coffee" && coffeeSub === s.id}
                        onClick={() => selectSub(s.id)}
                      >
                        {s.label}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>

          {/* Input */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Input"
              isActive={section === "input"}
              onClick={() => setSection("input")}
            >
              <IconInput />
              <span>Input</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Soon: Relatórios */}
          <SidebarMenuItem>
            <SidebarMenuButton disabled style={{ opacity: 0.4 }}>
              <IconReport />
              <span>Relatórios</span>
              <span className="ml-auto text-[9px] group-data-[collapsible=icon]:hidden">soon</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Soon: BI */}
          <SidebarMenuItem>
            <SidebarMenuButton disabled style={{ opacity: 0.4 }}>
              <IconBI />
              <span>De olho no BI</span>
              <span className="ml-auto text-[9px] group-data-[collapsible=icon]:hidden">soon</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      {/* ── Footer: Configurações ── */}
      <SidebarFooter>
        <Separator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Configurações"
              isActive={section === "configuracoes"}
              onClick={() => setSection("configuracoes")}
            >
              <IconGear />
              <span>Configurações</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Verificar build**

```
cd C:\Users\e713611\Documents\EDP---Verify\frontend
npm run build
```

Esperado: sem erros. O componente existe mas ainda não está conectado ao App — isso é intencional.

- [ ] **Step 3: Commit**

```
git add frontend/src/components/app-sidebar.tsx
git commit -m "feat(ui): AppSidebar shadcn com collapsible COFFEE e Configurações no footer"
```

---

### Task 4: Página Configurações

**Files:**
- Create: `frontend/src/pages/configuracoes.tsx`

**Interfaces:**
- Consumes:
  - `useSettings` de `../context/settings-context`
  - `Settings` (type) de `../context/settings-context`
  - Componentes shadcn: `Card`, `CardContent`, `CardHeader`, `CardTitle` de `@/components/ui/card` (já existe da Fase 0)
  - `Switch` de `@/components/ui/switch`
  - `ToggleGroup`, `ToggleGroupItem` de `@/components/ui/toggle-group`
- Produces:
  - `ConfiguracoesPage()` exportado de `frontend/src/pages/configuracoes.tsx`

---

- [ ] **Step 1: Criar `frontend/src/pages/configuracoes.tsx`**

```tsx
import React from 'react';
import { useSettings } from '../context/settings-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const ACCENT_PRESETS: [string, string, string][] = [
  ["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
  ["#1f9fd6", "#46b6e3", "rgba(31,159,214,0.14)"],
  ["#6b5ce6", "#8576ec", "rgba(107,92,230,0.15)"],
];

export function ConfiguracoesPage(): React.JSX.Element {
  const { settings, setSetting } = useSettings();

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 24px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          Configurações
        </h1>

        {/* ── Aparência ── */}
        <Card>
          <CardHeader>
            <CardTitle>Aparência</CardTitle>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Tema */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Tema</span>
              <ToggleGroup
                type="single"
                value={settings.theme}
                onValueChange={(v) => { if (v) setSetting("theme", v as typeof settings.theme); }}
              >
                <ToggleGroupItem value="system" aria-label="Sistema">Sistema</ToggleGroupItem>
                <ToggleGroupItem value="light"  aria-label="Claro">Claro</ToggleGroupItem>
                <ToggleGroupItem value="dark"   aria-label="Escuro">Escuro</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Densidade */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Densidade</span>
              <ToggleGroup
                type="single"
                value={settings.density}
                onValueChange={(v) => { if (v) setSetting("density", v as typeof settings.density); }}
              >
                <ToggleGroupItem value="compact" aria-label="Compacto">Compacto</ToggleGroupItem>
                <ToggleGroupItem value="cozy"    aria-label="Confortável">Confortável</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Cor de destaque */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Cor de destaque</span>
              <div style={{ display: "flex", gap: 8 }}>
                {ACCENT_PRESETS.map((preset) => {
                  const isActive = settings.accent[0] === preset[0];
                  return (
                    <button
                      key={preset[0]}
                      aria-label={`Cor de destaque ${preset[0]}`}
                      onClick={() => setSetting("accent", preset)}
                      style={{
                        width: 28, height: 28, borderRadius: "50%", border: "none",
                        background: preset[0], cursor: "pointer",
                        outline: isActive ? `2px solid ${preset[0]}` : "none",
                        outlineOffset: 2,
                        boxShadow: isActive ? "0 0 0 4px var(--bg)" : "none",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Exibição ── */}
        <Card>
          <CardHeader>
            <CardTitle>Exibição</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label htmlFor="show-kpis" style={{ fontSize: 13.5, color: "var(--text-dim)", cursor: "pointer" }}>
                Mostrar KPIs
              </label>
              <Switch
                id="show-kpis"
                checked={settings.showKpis}
                onCheckedChange={(v) => setSetting("showKpis", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Seção COFFEE ── */}
        <Card>
          <CardHeader>
            <CardTitle>Seção COFFEE</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Layout</span>
              <ToggleGroup
                type="single"
                value={settings.coffeeLayout}
                onValueChange={(v) => { if (v) setSetting("coffeeLayout", v as typeof settings.coffeeLayout); }}
              >
                <ToggleGroupItem value="composer" aria-label="Composer">Composer</ToggleGroupItem>
                <ToggleGroupItem value="split"    aria-label="Split">Split</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

```
cd C:\Users\e713611\Documents\EDP---Verify\frontend
npm run build
```

Esperado: sem erros. A página existe mas ainda não está no roteamento — isso é intencional.

- [ ] **Step 3: Commit**

```
git add frontend/src/pages/configuracoes.tsx
git commit -m "feat(ui): página Configurações com SettingsContext (tema, densidade, accent, KPIs, layout)"
```

---

### Task 5: Migração de props — remover TweakState dos componentes filhos

**Files:**
- Modify: `frontend/src/components/top-bar.tsx`
- Modify: `frontend/src/components/dashboard.tsx`
- Modify: `frontend/src/coffee/coffee-verificar.tsx`
- Modify: `frontend/src/components/upload-screen.tsx` (apenas `UploadScreenProps` em types.ts)
- Modify: `frontend/src/input/input-section.tsx`
- Modify: `frontend/src/App.tsx` (atualização mínima do objeto `triage`)

**Interfaces:**
- Consumes:
  - `TriageHandoff` (interface de `coffee-verificar.tsx`) — será substituída nesta task
  - `DashboardProps` (interface de `dashboard.tsx`) — será atualizada
  - `TopBarProps` (interface de `top-bar.tsx`) — será atualizada
- Produces (contratos finais desta task):
  - `TriageHandoff` sem `t: TweakState` e `setTweak`; com `resolvedTheme: "dark" | "light"` e `showKpis: boolean`
  - `DashboardProps` com `showKpis: boolean` no lugar de `t: TweakState`
  - `TopBarProps` com `resolvedTheme: "dark" | "light"` no lugar de `t: TweakState` e `setTweak`
  - `InputSection` sem prop `t`
  - `App.tsx` compila e o app funciona (tema ainda vem de `useTweaks`, mas o tema toggle no TopBar é removido)

**Atenção:** Nesta task, `App.tsx` ainda usa `useTweaks` e passa `resolvedTheme: t.theme` (string literal, sem "system"). O SettingsProvider é conectado na Task 6.

---

- [ ] **Step 1: Atualizar `top-bar.tsx`**

Substituir o arquivo completo por:

```tsx
import React from 'react';
import type { Source } from '../types';
import { Logo } from './shared';

interface TopBarProps {
  resolvedTheme: "dark" | "light";
  file: string;
  source: Source;
  onReset: () => void;
}

export function TopBar({ resolvedTheme, file, source, onReset }: TopBarProps): React.JSX.Element {
  return (
    <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0 22px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
      <Logo theme={resolvedTheme} h={24} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)", background: "var(--bg-2)",
                   padding: "5px 10px", borderRadius: 6, border: "1px solid var(--line)" }}>{file}</span>
        <span title={source === "api" ? "Conectado ao backend" : "Dados de demonstração (offline)"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontFamily: "var(--font-mono)",
                       letterSpacing: ".06em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 999,
                       color: source === "api" ? "var(--green)" : "var(--amber)",
                       background: source === "api" ? "var(--tint-green)" : "var(--tint-amber)",
                       border: "1px solid " + (source === "api" ? "rgba(0,168,89,.3)" : "rgba(240,169,59,.3)") }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
          {source === "api" ? "API" : "Demo"}
        </span>
        <button className="edp-btn ghost sm" title="Nova planilha" onClick={onReset}>↑ Nova</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Atualizar interface `DashboardProps` em `dashboard.tsx`**

Localizar a interface `DashboardProps` (linha ~24) e substituir apenas a linha `t: TweakState`:

```ts
// antes — dentro da interface DashboardProps:
  t: TweakState;

// depois:
  showKpis: boolean;
```

Remover `TweakState` do import na linha 1:

```ts
// antes:
import type { Note, TweakState, UrgBand, RuleKey } from '../types';

// depois:
import type { Note, UrgBand, RuleKey } from '../types';
```

Localizar o uso de `t.showKpis` (há apenas uma ocorrência) e substituir por `showKpis`:

```tsx
// antes (dentro do JSX de Dashboard):
{t.showKpis && (

// depois:
{showKpis && (
```

Na desestruturação dos props do componente `Dashboard`, substituir `t` por `showKpis`:

```tsx
// antes:
export function Dashboard({ t, notes, completed, dupResolved, ...

// depois:
export function Dashboard({ showKpis, notes, completed, dupResolved, ...
```

- [ ] **Step 3: Atualizar `coffee-verificar.tsx`**

Substituir o arquivo completo por:

```tsx
import React from 'react';
import type { Note, Source } from '../types';
import { TopBar } from '../components/top-bar';
import { UploadScreen } from '../components/upload-screen';
import { Dashboard } from '../components/dashboard';

export interface TriageHandoff {
  resolvedTheme: "dark" | "light";
  showKpis: boolean;
  notes: Note[];
  completed: Set<string>;
  dupResolved: Set<string>;
  source: Source;
  file: string;
  screen: "upload" | "dashboard";
  onToggleComplete: (id: string) => void;
  onMarkMany: (ids: string[], action: "done" | "reopen") => void;
  onMarkDuplicate: (id: string) => void;
  onSendToCoffee: (ids: string[], sourceId?: string) => void;
  onUpload: (file: File) => Promise<void>;
  onDemo: (name?: string) => void;
  onReset: () => void;
}

export function CoffeeVerificar({ triage }: { triage: TriageHandoff }): React.JSX.Element {
  if (triage.screen === "upload") {
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <UploadScreen theme={triage.resolvedTheme} onDemo={triage.onDemo} onUpload={triage.onUpload} />
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar resolvedTheme={triage.resolvedTheme} file={triage.file}
              source={triage.source} onReset={triage.onReset} />
      <Dashboard showKpis={triage.showKpis} notes={triage.notes} completed={triage.completed}
                 dupResolved={triage.dupResolved}
                 onToggleComplete={triage.onToggleComplete} onMarkMany={triage.onMarkMany}
                 onMarkDuplicate={triage.onMarkDuplicate} onSendToCoffee={triage.onSendToCoffee} />
    </div>
  );
}
```

- [ ] **Step 4: Atualizar `input-section.tsx`**

Substituir apenas a linha de importação e a assinatura do componente:

```tsx
// antes:
import type { TweakState } from '../types';
// ... (outras imports)
export function InputSection({ t: _t }: { t: TweakState }): React.JSX.Element {

// depois — remover o import TweakState e alterar a assinatura:
// (remover a linha de import TweakState completamente se não houver outros usos)
export function InputSection(): React.JSX.Element {
```

- [ ] **Step 5: Atualizar `App.tsx` — mínimo para compilar**

Em `App.tsx`, as mudanças são mínimas — apenas atualizar o objeto `triage` e a chamada de `InputSection`. O `SettingsProvider` e `SidebarProvider` ainda não são adicionados nesta task.

Encontrar o objeto `triage` (~linha 170) e substituir por:

```tsx
const triage: TriageHandoff = {
  resolvedTheme: t.theme as "dark" | "light",
  showKpis: t.showKpis,
  notes, completed, dupResolved, source, file, screen,
  onToggleComplete: toggleComplete,
  onMarkMany: markMany,
  onMarkDuplicate: markDuplicate,
  onSendToCoffee: sendToCoffeeQueue,
  onUpload: handleUpload,
  onDemo: loadDemo,
  onReset: () => { setCoffeeReturn(null); limparSnapshot(); setScreen("upload"); },
};
```

Encontrar `<InputSection t={t} />` e substituir por `<InputSection />`.

Remover o import de `TweakState` da linha 1 de `App.tsx` (mantendo os outros imports de types):

```tsx
// antes:
import type { Note, TweakState, Source, AppSection, Accent, CoffeeSubPage } from './types';

// depois:
import type { Note, Source, AppSection, Accent, CoffeeSubPage } from './types';
```

- [ ] **Step 6: Verificar build**

```
cd C:\Users\e713611\Documents\EDP---Verify\frontend
npm run build
```

Esperado: sem erros. O app ainda usa `useTweaks` para settings e a sidebar antiga — isso muda na Task 6.

- [ ] **Step 7: Commit**

```
git add frontend/src/components/top-bar.tsx frontend/src/components/dashboard.tsx
git add frontend/src/coffee/coffee-verificar.tsx frontend/src/input/input-section.tsx
git add frontend/src/App.tsx
git commit -m "refactor(ui): remover TweakState dos componentes filhos, preparar para SettingsContext"
```

---

### Task 6: App.tsx — wiring completo + remoção de artefatos

**Files:**
- Modify: `frontend/src/App.tsx` — reescrever para usar SettingsProvider + SidebarProvider + AppSidebar + ConfiguracoesPage
- Delete: `frontend/src/components/sidebar.tsx`
- Delete: `frontend/src/components/tweaks-panel.tsx`
- Modify: `frontend/src/types.ts` — remover TweakState, SetTweak e todos os tipos de TweaksPanel

**Interfaces:**
- Consumes: todos os contracts produzidos pelas Tasks 1–5
- Produces: app funcional completo conforme critérios de aceite da spec

---

- [ ] **Step 1: Reescrever `App.tsx`**

Substituir o conteúdo completo de `frontend/src/App.tsx` por:

```tsx
import React from 'react';
import type { Note, Source, AppSection, CoffeeSubPage } from './types';
import type { TriageHandoff } from './coffee/coffee-verificar';
import { usePersistedState } from './hooks/use-persisted-state';
import { SettingsProvider, useSettings } from './context/settings-context';
import { EDPApi } from './api';
import { EDP_DEMO } from './data';
import { AppSidebar } from './components/app-sidebar';
import { useTriageData } from './hooks/useTriageData';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

const InputSection = React.lazy(() =>
  import('./input/input-section').then((m) => ({ default: m.InputSection })));
const CoffeeHub = React.lazy(() =>
  import('./coffee/coffee-hub').then((m) => ({ default: m.CoffeeHub })));
const ConfiguracoesPage = React.lazy(() =>
  import('./pages/configuracoes').then((m) => ({ default: m.ConfiguracoesPage })));

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

const VERIFY_FILTER_KEYS = [
  "edp_verify_q", "edp_verify_uf", "edp_verify_setor", "edp_verify_urg",
  "edp_verify_status", "edp_verify_situacao", "edp_verify_rules", "edp_verify_sel",
];
function limparFiltrosVerify(): void {
  try { VERIFY_FILTER_KEYS.forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
}

const TRIAGE_SNAPSHOT_KEY = "edp_triage_snapshot";

interface TriageSnapshot {
  notes: Note[];
  completed: string[];
  dupResolved: string[];
  file: string;
  source: Source;
  screen: "upload" | "dashboard";
}

function lerSnapshot(): TriageSnapshot | null {
  try {
    const raw = sessionStorage.getItem(TRIAGE_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as TriageSnapshot) : null;
  } catch { return null; }
}
function gravarSnapshot(s: TriageSnapshot): void {
  try { sessionStorage.setItem(TRIAGE_SNAPSHOT_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
function limparSnapshot(): void {
  try { sessionStorage.removeItem(TRIAGE_SNAPSHOT_KEY); } catch { /* ignore */ }
}

function SectionLoading(): React.JSX.Element {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
      Carregando…
    </div>
  );
}

function AppContent(): React.JSX.Element {
  const { settings, resolvedTheme } = useSettings();
  const _snap = React.useMemo(() => lerSnapshot(), []);
  const [screen, setScreen] = React.useState<"upload" | "dashboard">(_snap?.screen ?? "upload");
  const [notes, setNotes] = React.useState<Note[]>(_snap?.notes ?? []);
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set(_snap?.completed ?? []));
  const [dupResolved, setDupResolved] = React.useState<Set<string>>(() => new Set(_snap?.dupResolved ?? []));
  const [file, setFile] = React.useState(_snap?.file ?? "");
  const [source, setSource] = React.useState<Source>(_snap?.source ?? "demo");
  const [section, setSection] = React.useState<AppSection>("coffee");
  const [coffeeReturn, setCoffeeReturn] = React.useState<{ noteId: string; noteRef: string } | null>(null);
  const [coffeeSub, setCoffeeSub] = usePersistedState<CoffeeSubPage>("edp_coffee_sub", "verificar");

  const accentStyle: CssVars = {
    "--accent": settings.accent[0],
    "--accent-2": settings.accent[1],
    "--accent-tint": settings.accent[2],
  };

  React.useEffect(() => {
    if (screen !== "dashboard" || notes.length === 0) return;
    gravarSnapshot({ notes, completed: [...completed], dupResolved: [...dupResolved], file, source, screen });
  }, [notes, completed, dupResolved, file, source, screen]);

  function changeSection(s: AppSection): void {
    if (s !== "coffee") setCoffeeReturn(null);
    setSection(s);
  }

  const { data: apiData } = useTriageData();

  React.useEffect(() => {
    if (_snap) return;
    if (!apiData?.notes?.length || screen !== "upload" || source === "demo") return;
    setNotes(apiData.notes);
    setCompleted(apiData.completed);
    setSource("api");
    setFile(localStorage.getItem("edp_file") ?? "planilha carregada");
    setScreen("dashboard");
  }, [apiData]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadDemo(name?: string): void {
    limparFiltrosVerify();
    limparSnapshot();
    const savedDone = JSON.parse(localStorage.getItem("edp_demo_done") ?? "null") as string[] | null;
    const savedDup = JSON.parse(localStorage.getItem("edp_demo_dup") ?? "null") as string[] | null;
    setNotes(EDP_DEMO.notes);
    setCompleted(new Set(savedDone ?? EDP_DEMO.defaultDone));
    setDupResolved(new Set(savedDup ?? EDP_DEMO.defaultDup));
    setSource("demo"); setFile(name ?? EDP_DEMO.file); setScreen("dashboard");
  }

  async function handleUpload(f: File): Promise<void> {
    limparFiltrosVerify();
    limparSnapshot();
    await EDPApi.upload(f);
    const d = await EDPApi.fetchData();
    setNotes(d.notes); setCompleted(d.completed); setSource("api");
    setFile(f.name); localStorage.setItem("edp_file", f.name);
    setScreen("dashboard");
  }

  function persistDone(set: Set<string>): void { if (source === "demo") localStorage.setItem("edp_demo_done", JSON.stringify([...set])); }
  function persistDup(set: Set<string>): void { if (source === "demo") localStorage.setItem("edp_demo_dup", JSON.stringify([...set])); }

  function toggleComplete(id: string): void {
    const reopening = completed.has(id);
    setCompleted((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); persistDone(s); return s; });
    if (reopening) setDupResolved((prev) => { const s = new Set(prev); s.delete(id); persistDup(s); return s; });
    if (source === "api") EDPApi.toggleComplete(id).catch(() => {});
  }

  function markMany(ids: string[], action: "done" | "reopen"): void {
    const marking = action === "done";
    const targets = ids.filter((id) => completed.has(id) !== marking);
    setCompleted((prev) => {
      const s = new Set(prev);
      targets.forEach((id) => { if (marking) s.add(id); else s.delete(id); });
      persistDone(s);
      return s;
    });
    if (source === "api") targets.forEach((id) => EDPApi.toggleComplete(id).catch(() => {}));
  }

  function sendToCoffeeQueue(ids: string[], sourceId?: string): void {
    const existing = JSON.parse(localStorage.getItem("edp_coffee_ids") ?? "[]") as string[];
    const valid = ids.filter((id) => /^\d{5,12}$/.test(id));
    const merged = [...new Set([...existing, ...valid])];
    localStorage.setItem("edp_coffee_ids", JSON.stringify(merged));
    if (sourceId) {
      const src = notes.find((n) => n.id === sourceId);
      setCoffeeReturn(src ? { noteId: src.id, noteRef: src.referencia } : null);
    }
    setCoffeeSub("abrir");
    setSection("coffee");
  }

  function markDuplicate(id: string): void {
    const undo = dupResolved.has(id);
    setDupResolved((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); persistDup(s); return s; });
    setCompleted((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); persistDone(s); return s; });
    if (source === "api") {
      if (undo) EDPApi.toggleComplete(id).catch(() => {});
      else EDPApi.markDuplicate(id).catch(() => {});
    }
  }

  const triage: TriageHandoff = {
    resolvedTheme,
    showKpis: settings.showKpis,
    notes, completed, dupResolved, source, file, screen,
    onToggleComplete: toggleComplete,
    onMarkMany: markMany,
    onMarkDuplicate: markDuplicate,
    onSendToCoffee: sendToCoffeeQueue,
    onUpload: handleUpload,
    onDemo: loadDemo,
    onReset: () => { setCoffeeReturn(null); limparSnapshot(); setScreen("upload"); },
  };

  return (
    <div className="edp triage" data-theme={resolvedTheme} data-density={settings.density}
         style={{ height: "100vh", overflow: "hidden", background: "var(--bg)", ...accentStyle } as CssVars}>
      <SidebarProvider style={{ height: "100%", minHeight: 0 }}>
        <AppSidebar section={section} setSection={changeSection}
                    coffeeSub={coffeeSub} setCoffeeSub={setCoffeeSub} />
        <SidebarInset style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <React.Suspense fallback={<SectionLoading />}>
            {section === "input"         ? <InputSection /> :
             section === "configuracoes" ? <ConfiguracoesPage /> :
             <CoffeeHub notes={notes} layout={settings.coffeeLayout}
                        sub={coffeeSub} setSub={setCoffeeSub}
                        triage={triage}
                        coffeeReturn={coffeeReturn}
                        onClearReturn={() => setCoffeeReturn(null)}
                        onBackToTriagem={() => { setCoffeeSub("verificar"); }} />}
          </React.Suspense>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}
```

- [ ] **Step 2: Deletar `sidebar.tsx` e `tweaks-panel.tsx`**

```
del "frontend\src\components\sidebar.tsx"
del "frontend\src\components\tweaks-panel.tsx"
```

- [ ] **Step 3: Limpar `types.ts` — remover TweakState e tipos do TweaksPanel**

Remover de `frontend/src/types.ts` as seguintes declarações (apenas estas; manter todo o resto):

```ts
// Remover bloco completo "── Estado de Tweaks ─────":
export type Accent = [string, string, string];
export interface TweakState { ... }
export type SetTweak<T> = { ... };

// Remover no bloco "── Props dos componentes ────":
export type TweakOption<T> = T | { value: T; label: string };
export interface TweaksPanelProps { ... }
export interface TweakSectionProps { ... }
export interface TweakRadioProps<T extends string> { ... }
export interface TweakToggleProps { ... }
export type ColorValue = string | string[];
export interface TweakColorProps { ... }
```

Manter `Accent` se ainda for usado em algum lugar — verificar. Se `Accent` não for mais importado fora de `App.tsx` (que agora usa `Settings.accent`), remover também.

Verificar que `LogoProps.theme?: Theme` e `UploadScreenProps.theme?: Theme` continuam usando o tipo `Theme` atualizado (que agora inclui "system") — isso é válido sem alteração adicional.

- [ ] **Step 4: Verificar build**

```
cd C:\Users\e713611\Documents\EDP---Verify\frontend
npm run build
```

Esperado: sem erros. Se houver imports quebrados de `Accent`, adicionar o tipo de volta em `context/settings-context.tsx` ou em um arquivo de tipos separado, e atualizar o import.

- [ ] **Step 5: Verificar app no browser**

Com o backend rodando (`uvicorn backend.main:app --reload`), abrir `http://127.0.0.1:8000` e verificar:

- [ ] Sidebar aparece com design shadcn; expande e colapsa
- [ ] No modo colapsado, hover nos botões mostra tooltip com o nome da seção
- [ ] Accordion COFFEE abre/fecha; sub-itens navegam corretamente
- [ ] Item "Configurações" abre a página de Configurações
- [ ] Relatórios e BI estão desabilitados (opacidade reduzida)
- [ ] Página Configurações: alterar tema muda imediatamente; reload mantém a seleção
- [ ] `data-theme` no `.edp` muda conforme o tema selecionado
- [ ] Com tema "Sistema": mudar o tema do OS reflete em tempo real (testar via DevTools > Emulate CSS media feature)
- [ ] COFFEE e Input funcionam igual ao anterior

- [ ] **Step 6: Commit**

```
git add frontend/src/App.tsx
git add frontend/src/types.ts
git add -u frontend/src/components/sidebar.tsx frontend/src/components/tweaks-panel.tsx
git commit -m "feat(ui): Fase 1 completa — AppSidebar shadcn, SettingsContext, ConfiguracoesPage, TweaksPanel removido"
```

---

## Self-Review

### Spec coverage

| Requisito da spec | Task |
|-------------------|------|
| SettingsContext com `Settings`, `useSettings`, `SettingsProvider` | Task 1 |
| `Theme` inclui `"system"`; `AppSection` inclui `"configuracoes"` | Task 1 |
| `resolvedTheme` via matchMedia com listener de SO | Task 1 |
| Persistência em `"edp_settings"` no localStorage | Task 1 |
| Instalar sidebar, switch, toggle-group, collapsible, tooltip, separator | Task 2 |
| `AppSidebar` com `collapsible="icon"`, accordion COFFEE, Configurações no footer | Task 3 |
| Itens "Relatórios" e "BI" desabilitados com label "soon" | Task 3 |
| Tooltips no modo colapsado | Task 3 (via prop `tooltip=` do `SidebarMenuButton`) |
| Página Configurações com ToggleGroup (tema, densidade, layout), Switch (KPIs), chips accent | Task 4 |
| Mudança imediata sem botão salvar | Task 4 |
| `top-bar.tsx` sem `t: TweakState` e sem botões de tema | Task 5 |
| `dashboard.tsx` com `showKpis: boolean` | Task 5 |
| `TriageHandoff` sem `t` e `setTweak` | Task 5 |
| `InputSection` sem prop `t` | Task 5 |
| App.tsx com `<SettingsProvider>` + `<SidebarProvider>` + `<AppSidebar>` | Task 6 |
| `section === "configuracoes"` renderiza `<ConfiguracoesPage>` | Task 6 |
| `sidebar.tsx` e `tweaks-panel.tsx` deletados | Task 6 |
| `TweakState`, `SetTweak`, tipos TweaksPanel removidos de `types.ts` | Task 6 |
| `data-theme={resolvedTheme}` (não `t.theme`) | Task 6 |
| `settings.accent` via inline style | Task 6 |

### Placeholder scan — LIMPO

### Type consistency

- `resolvedTheme: "dark" | "light"` em `SettingsContextValue` (Task 1) → usado em `TopBar.resolvedTheme` (Task 5) e `triage.resolvedTheme` (Task 5) → propagado corretamente
- `Settings.accent: Accent` → se `Accent = [string, string, string]` for removido de `types.ts` (Task 6), precisa estar em `settings-context.tsx`. O `ConfiguracoesPage` usa `settings.accent[0]` sem precisar importar `Accent` como tipo.
- `AppSection` com `"configuracoes"` (Task 1) → `AppSidebar` usa `section === "configuracoes"` (Task 3) → `App.tsx` renderiza `ConfiguracoesPage` (Task 6) ✓
- `TriageHandoff` sem `t`/`setTweak` (Task 5) → `App.tsx` Task 6 não passa `t` ✓
