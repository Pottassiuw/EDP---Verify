# Refatoração UI/UX — Fase 1: Shell (Sidebar shadcn + Configurações + Tema persistido)

**Data:** 2026-06-26
**Status:** Aprovado

## Contexto

Continuação do roadmap de refatoração UI/UX do EDP Verify. A Fase 0 introduziu
Tailwind v4 + shadcn + bridge de tokens sem alterar telas. Esta Fase 1 substitui a
infraestrutura de shell do app: a sidebar custom vira um componente shadcn, o
TweaksPanel flutuante (scaffold "omelette") é removido do produto, e as
configurações ganham uma página real acessível pela navegação.

Estado atual relevante:
- `frontend/src/components/sidebar.tsx` — sidebar 100% custom, inline styles,
  expand/collapse via `localStorage`, accordion COFFEE manual.
- `frontend/src/components/tweaks-panel.tsx` — painel flutuante com `useTweaks`
  (`useState`, não persiste), ativado via `postMessage`. Contém tema, densidade,
  accent, showKpis, coffeeLayout.
- `AppSection = "coffee" | "input"` — sem seção de Configurações.
- Tema não persiste; default é `"dark"` hardcoded.

## Decisões de produto

1. **SettingsContext** substitui `useTweaks`: estado persistido em `localStorage`,
   disponível via `useSettings()` em qualquer componente sem prop drilling.
2. **Tema `"system"`** adicionado como nova opção (default). Resolve para
   `"dark"` ou `"light"` via `prefers-color-scheme` com listener de mudança.
3. **Sidebar shadcn** com `collapsible="icon"` — redesign leve, não clone do atual.
   Estado de expansão gerenciado pelo `SidebarProvider`.
4. **Configurações** vira `AppSection` completa (substitui conteúdo principal ao
   clicar), não modal nem drawer.
5. **TweaksPanel removido** por completo — arquivo `tweaks-panel.tsx` deletado.

---

## Escopo da Fase 1

**Objetivo:** substituir o shell do app (sidebar + estado de configurações) sem
alterar a lógica de negócio dos módulos COFFEE e Input.

### 1. SettingsContext

**Arquivo:** `frontend/src/context/settings-context.tsx`

Interface pública:

```ts
export type Theme   = "system" | "light" | "dark";
export type Density = "compact" | "cozy";
export type CoffeeLayout = "composer" | "split";
export type Accent  = [string, string, string]; // [primary, secondary, tint]

export interface Settings {
  theme: Theme;           // default: "system"
  density: Density;       // default: "cozy"
  accent: Accent;         // default: ["#00a859","#1dbd6e","rgba(0,168,89,0.13)"]
  showKpis: boolean;      // default: true
  coffeeLayout: CoffeeLayout; // default: "composer"
}

export interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resolvedTheme: "light" | "dark"; // "system" resolvido via matchMedia
}

export function useSettings(): SettingsContextValue;
export function SettingsProvider({ children }: { children: React.ReactNode }): JSX.Element;
```

**Persistência:** `localStorage` sob a chave `"edp_settings"`, JSON completo.
Leitura na inicialização com fallback para os defaults. Cada `setSetting` salva
o objeto inteiro.

**Resolução de tema:**
- `resolvedTheme` é derivado: se `settings.theme !== "system"`, retorna o valor
  diretamente; se `"system"`, retorna o resultado de
  `window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light"`.
- Um `useEffect` registra um listener no `MediaQueryList` para atualizar
  `resolvedTheme` quando o tema do SO muda (só relevante enquanto `theme === "system"`).
- `resolvedTheme` é o que vai para `data-theme={resolvedTheme}` no `<div class="edp">`.

**Accent vars:** `App.tsx` aplica as vars CSS de accent como inline style no
`<div class="edp">`, igual ao padrão atual:
`style={{ "--accent": settings.accent[0], "--accent-2": settings.accent[1], "--accent-tint": settings.accent[2] }}`.

### 2. Tipos atualizados

**Arquivo:** `frontend/src/types.ts`

- `Theme` passa de `"dark" | "light"` para `"system" | "dark" | "light"`.
- `AppSection` passa de `"coffee" | "input"` para `"coffee" | "input" | "configuracoes"`.
- `TweakState` é removido (substituído por `Settings` no context).
- Exports relacionados ao TweaksPanel (`SetTweak`, `TweaksPanelProps`,
  `TweakSectionProps`, `TweakRadioProps`, `TweakToggleProps`, `TweakColorProps`,
  `TweakOption`) são removidos.

### 3. Sidebar shadcn

**Arquivo:** `frontend/src/components/app-sidebar.tsx` (novo)
**Removido:** `frontend/src/components/sidebar.tsx`

Componentes shadcn utilizados:
- `Sidebar`, `SidebarProvider`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`
- `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuSub`,
  `SidebarMenuSubItem`, `SidebarMenuSubButton`
- `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` — para o accordion COFFEE
- `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent` — labels no modo colapsado

Layout da sidebar:

```
SidebarHeader
  BrandGlyph + "EDP Verify" + SidebarTrigger

SidebarContent
  SidebarMenu
    SidebarMenuItem (COFFEE)
      Collapsible
        CollapsibleTrigger → SidebarMenuButton [ativo se section=coffee]
        CollapsibleContent → SidebarMenuSub
          SidebarMenuSubItem × 6 (Verificar, Abrir, Gerar, Corrigidas, Pendentes, Logs)
    SidebarMenuItem (Input)
      SidebarMenuButton [ativo se section=input]

  SidebarMenu (soon group — Relatórios, BI)
    SidebarMenuItem × 2  disabled + opacity reduzida + label "soon" no expanded

SidebarFooter
  Separator
  SidebarMenu
    SidebarMenuItem (Configurações)
      SidebarMenuButton [ativo se section=configuracoes]
```

`collapsible="icon"`: no modo colapsado, labels somem e `Tooltip` mostra o nome
ao hover. Itens "soon" não recebem Tooltip (sem ação). O accordion COFFEE
abre/fecha com `defaultOpen={true}` e não persiste estado separadamente (o
`SidebarProvider` já persiste o estado de expansão da sidebar via cookie padrão).

`AppSidebar` recebe via props:
```ts
interface AppSidebarProps {
  section: AppSection;
  setSection: (s: AppSection) => void;
  coffeeSub: CoffeeSubPage;
  setCoffeeSub: (s: CoffeeSubPage) => void;
}
```

### 4. Página Configurações

**Arquivo:** `frontend/src/pages/configuracoes.tsx`

Página simples, sem formulário. Cada controle aplica a mudança imediatamente via
`setSetting`. Usa `Card` + `CardHeader` + `CardContent` (shadcn, Fase 0) para
agrupar as seções. Layout: coluna centralizada, max-width ~520px.

**Grupos e controles:**

| Grupo | Controle | Componente shadcn |
|-------|----------|-------------------|
| Aparência | Tema: Sistema / Claro / Escuro | `ToggleGroup` + `ToggleGroupItem` |
| Aparência | Densidade: Compacto / Confortável | `ToggleGroup` + `ToggleGroupItem` |
| Aparência | Cor de destaque (3 presets) | chips `<button>` com estilo inline (presets fixos) |
| Exibição | Mostrar KPIs | `Switch` (shadcn) |
| Seção COFFEE | Layout: Composer / Split | `ToggleGroup` + `ToggleGroupItem` |

shadcn components novos necessários (add na Task correspondente):
`toggle-group`, `switch`, `separator`, `tooltip`, `collapsible`.

A página não tem botão "Salvar" — cada mudança persiste imediatamente.

### 5. App.tsx refatorado

**Arquivo:** `frontend/src/App.tsx`

Mudanças:
- Remove `useTweaks`, todas as importações de `tweaks-panel.tsx` e `<TweaksPanel>`.
- Passa a usar `useSettings()` para `resolvedTheme`, `density`, `accent`, etc.
- `data-theme={resolvedTheme}` (não `t.theme`).
- Inline style de accent lido de `settings.accent`.
- `section` ganha `"configuracoes"` no render switch:
  ```tsx
  {section === "input"          ? <InputSection /> :
   section === "configuracoes"  ? <ConfiguracoesPage /> :
                                  <CoffeeHub ... />}
  ```
- `<SidebarProvider>` envolve o layout; `<AppSidebar>` substitui `<Sidebar>`.
- `<SettingsProvider>` é o wrapper mais externo (dentro de `QueryClientProvider`).
- `CoffeeHub` e `InputSection` recebem apenas o que precisam — `coffeeLayout`
  e `showKpis` continuam passados como props (os módulos não chamam `useSettings`
  diretamente nesta fase; isso muda nas Fases 2/3).

### 6. Remoção do TweaksPanel

- `frontend/src/components/tweaks-panel.tsx` — **deletado**.
- `frontend/src/types.ts` — tipos do TweaksPanel removidos (ver §2).
- `frontend/src/App.tsx` — todas as referências removidas.
- Nenhum outro arquivo importa `tweaks-panel.tsx` (confirmar no plano).

## Critérios de aceite (Fase 1)

- [ ] `npm run build` passa sem erros.
- [ ] App abre com tema do sistema (dark em OS dark, light em OS light); mudar o
      tema do SO com `"system"` selecionado reflete em tempo real.
- [ ] Selecionar `"dark"` ou `"light"` explicitamente ignora o SO.
- [ ] Todas as configurações persistem após reload (fechar aba e reabrir).
- [ ] Sidebar shadcn expande/colapsa; no modo colapsado, tooltips aparecem ao hover.
- [ ] Accordion COFFEE abre/fecha; sub-itens navegam corretamente.
- [ ] Item "Configurações" abre a página de Configurações (seção completa).
- [ ] Itens "Relatórios" e "BI" ficam desabilitados/soon.
- [ ] Página Configurações: cada controle muda o estado imediatamente e persiste.
- [ ] TweaksPanel não aparece em nenhuma circunstância.
- [ ] Módulos COFFEE e Input funcionam igual ao anterior (sem regressão de lógica).

## Riscos e mitigações

- **shadcn sidebar é um componente grande** (~400 linhas de primitivos) — instalar
  via `npx shadcn@latest add sidebar` (que também puxa `collapsible`, `tooltip`,
  `separator`, `sheet`, `skeleton`). Sem o CLI, copiar manualmente do fonte oficial.
- **`SidebarProvider` usa cookie para persistir estado** (`document.cookie`) — pode
  colidir com configurações de CSP do ambiente interno. Se isso ocorrer, desabilitar
  a persistência do provider e gerenciar expand/collapse manualmente.
- **Remoção de `TweakState` quebra imports** — confirmar no plano que nenhum módulo
  fora de `App.tsx` e `tweaks-panel.tsx` importa os tipos removidos.
- **`CoffeeHub` e `InputSection` passam `t` como prop** — ao remover `t`, checar
  quais campos cada módulo usa e substituir pelos equivalentes de `settings`.

## Escopo excluído (Fase 1)

- Migrar componentes internos do COFFEE ou Input para Tailwind/shadcn (Fases 2/3).
- Reativar preflight do Tailwind (Fase 4).
- Adicionar novos campos à página Configurações além dos migrados do TweaksPanel.
- Fazer Relatórios ou BI funcionarem (seguem placeholder).
