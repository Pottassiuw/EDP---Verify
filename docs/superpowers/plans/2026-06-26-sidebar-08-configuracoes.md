# Sidebar (shadcn sidebar-08) + Configurações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consertar a sidebar shadcn (que está quebrada por falta de reset CSS) adotando a anatomia visual do sidebar-08 com o conteúdo do EDP, e refatorar a página Configurações para o idioma shadcn — sem quebrar as telas legadas.

**Architecture:** A causa raiz é o Tailwind preflight desligado (`index.css`), que deixa `<ul>`/`<button>` com estilo nativo. Em vez de ligar o preflight global (quebraria Coffee/Input), aplicamos um **reset CSS de especificidade zero escopado** ao subtree da sidebar (`[data-sidebar="sidebar"]`) e a páginas migradas (`.ui-reset`). A sidebar é reorganizada na anatomia do sidebar-08 usando os primitivos shadcn já instalados. A página Configurações é refatorada de estilos inline para classes Tailwind.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind v4, shadcn/ui (new-york), Radix UI, lucide-react.

## Global Constraints

- Trabalhar só dentro de `frontend/` (working dir do app). Comandos rodam a partir de `frontend/`.
- **NÃO ligar o preflight global** do Tailwind. O reset é sempre escopado.
- **NÃO** tocar em `frontend/src/coffee/*` nem `frontend/src/input/*` (telas legadas). Qualquer regressão visual nelas reprova a task.
- Reset CSS deve ter **especificidade zero** (envolver seletores em `:where(...)`) para que as classes utilitárias do shadcn sempre vençam.
- Manter os defaults do shadcn. Ajustar aparência só via tokens `--sidebar-*` já existentes em `tokens.css`.
- Gate automatizado de cada task: `npm run build` (= `tsc -b && vite build`) deve passar sem erros.
- Gate visual de cada task: `npm run dev` + checklist visual no navegador.
- Commits frequentes, um por task.

### Nota de abordagem (desvio consciente do spec)

O spec menciona rodar `npx shadcn@latest add sidebar-08 --overwrite`. **Este plano NÃO roda esse comando**, porque:
1. O bloco sidebar-08 traz `team-switcher`, `nav-user`, `nav-projects` (mais deps `dropdown-menu`/`avatar`/`breadcrumb`) que o usuário decidiu **não** usar ("só a estrutura visual") → seriam código morto.
2. Sobrescreveria o `app-sidebar.tsx` atual e possivelmente o `ui/sidebar.tsx` já instalado.
3. A "anatomia do sidebar-08" que queremos (header de marca + `SidebarGroup`/`SidebarGroupLabel` + nav collapsible + footer) usa **apenas primitivos já instalados** em `ui/sidebar.tsx`.

Resultado visual idêntico, sem código morto. Se o revisor preferir rodar o bloco mesmo assim, é só sinalizar antes da Task 2.

---

## File Structure

- `frontend/src/tokens.css` — **Modify.** Adicionar o bloco de reset escopado ao final.
- `frontend/src/components/app-sidebar.tsx` — **Modify.** Envolver o conteúdo em `SidebarGroup` + `SidebarGroupLabel` (anatomia 08).
- `frontend/src/pages/configuracoes.tsx` — **Rewrite.** Estilos inline → classes Tailwind, raiz com `.ui-reset`, header de página + largura sensata.

Não há testes automatizados de aparência neste projeto. O gate automatizado é o `npm run build` (typecheck + bundle); o gate de aceitação é o checklist visual. Cada task abaixo segue: definir o resultado esperado → confirmar que falha hoje → aplicar a mudança → confirmar que passa (build + visual) → commit.

---

## Task 1: Reset CSS escopado

**Files:**
- Modify: `frontend/src/tokens.css` (adicionar ao final, depois da linha 206)

**Interfaces:**
- Consumes: nada.
- Produces: dois escopos de reset — `[data-sidebar="sidebar"]` (aplicado automaticamente pelo `ui/sidebar.tsx`, ver `sidebar.tsx:187` mobile e `sidebar.tsx:245` desktop) e a classe `.ui-reset` (opt-in, usada pela Task 3).

- [ ] **Step 1: Definir o resultado esperado (visual)**

Antes da mudança, no estado atual: a `SidebarMenu` (`<ul>`) renderiza com bullets nativos (bolinhas na borda esquerda) porque o preflight está desligado (`index.css:1-2`). Após esta task, dentro de `[data-sidebar="sidebar"]` e `.ui-reset`: sem bullets, sem margens/paddings nativos de lista, e `<button>` sem aparência nativa.

- [ ] **Step 2: Confirmar que falha hoje**

Run: `cd frontend && npm run dev`
Abrir `http://localhost:5173`, olhar a sidebar.
Expected (estado quebrado): bolinhas/bullets visíveis na borda esquerda dos itens do menu. Parar o dev server (Ctrl+C) depois de confirmar.

- [ ] **Step 3: Adicionar o reset escopado**

Adicionar ao **final** de `frontend/src/tokens.css`:

```css
/* ============================================================
   Reset escopado para superfícies shadcn (preflight ainda OFF
   globalmente — ver index.css). Especificidade ZERO via :where()
   para que as classes utilitárias do shadcn sempre vençam.
   Escopos:
     [data-sidebar="sidebar"]  → subtree da sidebar (desktop+mobile)
     .ui-reset                 → páginas já migradas (opt-in)
   ============================================================ */
:where([data-sidebar="sidebar"], .ui-reset) :where(ul, ol) {
  list-style: none;
  margin: 0;
  padding: 0;
}
:where([data-sidebar="sidebar"], .ui-reset) :where(li) {
  margin: 0;
}
:where([data-sidebar="sidebar"], .ui-reset) :where(button) {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 0;
  margin: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
```

- [ ] **Step 4: Gate automatizado**

Run: `cd frontend && npm run build`
Expected: build conclui sem erros de TypeScript nem de bundle.

- [ ] **Step 5: Gate visual**

Run: `cd frontend && npm run dev`, abrir `http://localhost:5173`.
Expected:
- Sidebar **sem** bolinhas/bullets.
- Itens do menu alinhados (sem indentação nativa de lista).
- COFFEE/Input/Configurações continuam clicáveis e trocando de seção.
- **Regressão:** abrir a tela COFFEE e a tela Input — devem estar visualmente idênticas ao antes (o reset não vaza para elas).
Parar o dev server depois.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/tokens.css
git commit -m "fix(ui): reset escopado para superfícies shadcn (sidebar + .ui-reset)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Sidebar na anatomia sidebar-08

**Files:**
- Modify: `frontend/src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes: o reset da Task 1 (já aplicado via `[data-sidebar="sidebar"]`); primitivos de `@/components/ui/sidebar` (`SidebarGroup`, `SidebarGroupLabel` além dos já importados).
- Produces: `AppSidebar` com a mesma assinatura de props (`section`, `setSection`, `coffeeSub`, `setCoffeeSub` — inalterada).

- [ ] **Step 1: Definir o resultado esperado (visual)**

A sidebar ganha um rótulo de grupo "Plataforma" acima dos itens (assinatura visual do sidebar-08, equivalente ao "Platform" da imagem de referência), com os itens COFFEE (collapsible, 6 subitens), Input, Relatórios (soon/disabled), De olho no BI (soon/disabled). Header de marca e footer Configurações inalterados.

- [ ] **Step 2: Confirmar que falha hoje**

Inspecionar `frontend/src/components/app-sidebar.tsx:79-141`: a `SidebarMenu` está direto dentro de `SidebarContent`, **sem** `SidebarGroup`/`SidebarGroupLabel`. Não há rótulo "Plataforma".

- [ ] **Step 3: Adicionar import de `SidebarGroup` e `SidebarGroupLabel`**

Em `frontend/src/components/app-sidebar.tsx`, alterar o bloco de import (linhas 4-8) para incluir os dois primitivos:

```tsx
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
```

- [ ] **Step 4: Envolver o menu em `SidebarGroup` + `SidebarGroupLabel`**

Em `app-sidebar.tsx`, substituir o `<SidebarContent>` atual (linhas 79-141) por:

```tsx
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarMenu>
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

            <SidebarMenuItem>
              <SidebarMenuButton disabled style={{ opacity: 0.4 }}>
                <IconReport />
                <span>Relatórios</span>
                <span className="ml-auto text-[9px] group-data-[collapsible=icon]:hidden">soon</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton disabled style={{ opacity: 0.4 }}>
                <IconBI />
                <span>De olho no BI</span>
                <span className="ml-auto text-[9px] group-data-[collapsible=icon]:hidden">soon</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
```

(O conteúdo dos itens é idêntico ao atual — só foi envolvido em `SidebarGroup`/`SidebarGroupLabel`.)

- [ ] **Step 5: Gate automatizado**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 6: Gate visual**

Run: `cd frontend && npm run dev`, abrir `http://localhost:5173`.
Expected:
- Rótulo "Plataforma" (cinza, pequeno, maiúsculo-suave) acima dos itens.
- COFFEE expande/colapsa os 6 subitens com a seta girando.
- Item ativo destacado.
- Colapsar a sidebar (clicar no trigger / arrastar a rail): vira rail de ícones, **sem** barra branca; "Plataforma" e os textos somem, ícones permanecem; expande de volta por hover na `SidebarRail`.
Parar o dev server depois.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/components/app-sidebar.tsx
git commit -m "feat(ui): sidebar na anatomia sidebar-08 (SidebarGroup + label Plataforma)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Refator da página Configurações

**Files:**
- Rewrite: `frontend/src/pages/configuracoes.tsx`

**Interfaces:**
- Consumes: `.ui-reset` (Task 1); `useSettings` de `../context/settings-context`; `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Switch`, `ToggleGroup`/`ToggleGroupItem` de `@/components/ui/*`.
- Produces: `ConfiguracoesPage` (mesma exportação nomeada, sem props — inalterada).

- [ ] **Step 1: Definir o resultado esperado (visual)**

Mesmos controles (Tema, Densidade, Cor de destaque, Mostrar KPIs, Layout COFFEE), mas: ToggleGroups renderizam como segmented control unificado (não botões soltos), zero estilos inline de layout (tudo em classes Tailwind), header de página, e coluna centralizada de largura confortável (`max-w-2xl`) — sem o `maxWidth: 520` que deixava a página desbalanceada.

- [ ] **Step 2: Confirmar que falha hoje**

Inspecionar `frontend/src/pages/configuracoes.tsx`: usa `style={{...}}` inline em toda parte (ex. linha 17-18) e os `ToggleGroup` aparecem como botões soltos com borda nativa (sem o reset, que esta página ainda não opta via `.ui-reset`).

- [ ] **Step 3: Reescrever o arquivo**

Substituir **todo** o conteúdo de `frontend/src/pages/configuracoes.tsx` por:

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

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function ConfiguracoesPage(): React.JSX.Element {
  const { settings, setSetting } = useSettings();

  return (
    <div className="ui-reset h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-8 md:px-8">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">Aparência e preferências do EDP Verify.</p>
        </header>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Aparência</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Row label="Tema">
                <ToggleGroup
                  type="single"
                  value={settings.theme}
                  onValueChange={(v) => { if (v) setSetting("theme", v as typeof settings.theme); }}
                >
                  <ToggleGroupItem value="system" aria-label="Sistema">Sistema</ToggleGroupItem>
                  <ToggleGroupItem value="light"  aria-label="Claro">Claro</ToggleGroupItem>
                  <ToggleGroupItem value="dark"   aria-label="Escuro">Escuro</ToggleGroupItem>
                </ToggleGroup>
              </Row>

              <Row label="Densidade">
                <ToggleGroup
                  type="single"
                  value={settings.density}
                  onValueChange={(v) => { if (v) setSetting("density", v as typeof settings.density); }}
                >
                  <ToggleGroupItem value="compact" aria-label="Compacto">Compacto</ToggleGroupItem>
                  <ToggleGroupItem value="cozy"    aria-label="Confortável">Confortável</ToggleGroupItem>
                </ToggleGroup>
              </Row>

              <Row label="Cor de destaque">
                <div className="flex gap-2">
                  {ACCENT_PRESETS.map((preset) => {
                    const isActive = settings.accent[0] === preset[0];
                    return (
                      <button
                        key={preset[0]}
                        aria-label={`Cor de destaque ${preset[0]}`}
                        onClick={() => setSetting("accent", preset)}
                        className="size-7 rounded-full transition-transform hover:scale-110"
                        style={{
                          background: preset[0],
                          outline: isActive ? `2px solid ${preset[0]}` : "none",
                          outlineOffset: 2,
                          boxShadow: isActive ? "0 0 0 4px var(--bg)" : "none",
                        }}
                      />
                    );
                  })}
                </div>
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exibição</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <label htmlFor="show-kpis" className="cursor-pointer text-sm text-muted-foreground">
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

          <Card>
            <CardHeader>
              <CardTitle>Seção COFFEE</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Layout">
                <ToggleGroup
                  type="single"
                  value={settings.coffeeLayout}
                  onValueChange={(v) => { if (v) setSetting("coffeeLayout", v as typeof settings.coffeeLayout); }}
                >
                  <ToggleGroupItem value="composer" aria-label="Composer">Composer</ToggleGroupItem>
                  <ToggleGroupItem value="split"    aria-label="Split">Split</ToggleGroupItem>
                </ToggleGroup>
              </Row>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Gate automatizado**

Run: `cd frontend && npm run build`
Expected: build sem erros de TypeScript.

- [ ] **Step 5: Gate visual**

Run: `cd frontend && npm run dev`, abrir `http://localhost:5173`, ir em Configurações.
Expected:
- ToggleGroups como segmented control unificado (item selecionado destacado, sem botões soltos com borda nativa).
- Coluna centralizada confortável, com header "Configurações" + subtítulo; sem o oceano de espaço vazio.
- Trocar Tema/Densidade/Cor/Layout e o toggle "Mostrar KPIs" — todos funcionam (refletem na UI).
Parar o dev server depois.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/configuracoes.tsx
git commit -m "refactor(ui): página Configurações em idioma shadcn (.ui-reset + Tailwind + layout)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Reset escopado (spec §1 ajustado) → Task 1. ✓ (seletor corrigido para `[data-sidebar="sidebar"]`, pois o wrapper engloba o conteúdo legado.)
- Sidebar anatomia 08, só estrutura visual (spec §2) → Task 2. ✓ TeamSwitcher/NavUser/NavProjects não usados (não importados). ✓
- Cores/bordas só via tokens (spec §3) → coberto: nenhuma task altera estilo interno; tokens `--sidebar-*` já existem em `tokens.css`. ✓
- Página Configurações refator completo (spec §4/§6) → Task 3. ✓
- SidebarInset/barra branca (spec §5) → verificado no gate visual da Task 2 (Step 6). ✓
- Não quebrar Coffee/Input (spec §3 objetivos) → gate de regressão na Task 1 (Step 5) + Global Constraints. ✓

**Placeholder scan:** Sem TBD/TODO; todo código está completo e literal. ✓

**Type consistency:** `AppSidebar` e `ConfiguracoesPage` mantêm assinaturas inalteradas. Imports de `SidebarGroup`/`SidebarGroupLabel` existem em `ui/sidebar.tsx` (confirmado: `sidebar.tsx:385` e `:396`). `.ui-reset` definido na Task 1 e consumido na Task 3. ✓
