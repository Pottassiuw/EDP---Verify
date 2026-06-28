# Input — Navegação igual ao COFFEE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Input a mesma navegação do COFFEE — subseções colapsáveis na sidebar + barra de abas no topo, sincronizadas por um estado `inputSub` elevado ao `App` e persistido.

**Architecture:** Espelha 1:1 o padrão já existente do COFFEE (`coffeeSub` no `App` → `AppSidebar` colapsável + `.edp-seg` no `coffee-hub`). Task 1 eleva e persiste o estado e passa `sub`/`setSub` pro `InputSection`. Task 2 troca o item simples "Input" da sidebar por um `Collapsible` com sub-itens.

**Tech Stack:** React 18 + TypeScript + Vite; shadcn sidebar/collapsible (já instalados). Sem test runner → check = `cd frontend && npm run build` + manual.

## Global Constraints

- **Espelhar o COFFEE 1:1.** Mantém a barra `.edp-seg` no topo (a migração de `.edp-seg`→shadcn é o sub-projeto D, não este). (spec §Não-objetivos)
- **Sem backend, sem dependência nova, sem tocar no COFFEE** nem nos itens desabilitados ("Relatórios", "De olho no BI").
- Reusar o tipo `AbaInput` de `frontend/src/input/types.ts` (5 valores: `visao | gerenciar | relatorios | logs | config`). Não criar tipo novo.
- Persistência via `usePersistedState("edp_input_sub", "visao")` (mesmo helper do `coffeeSub`).
- `INPUT_SUBS` exportado de `input-section.tsx` (espelha `COFFEE_SUBS` de `coffee-hub.tsx`). Aceito o mesmo tradeoff de bundle do COFFEE (`// ponytail:`).
- Build sem erros (`cd frontend && npm run build`) + verificação manual a cada task.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `frontend/src/input/input-section.tsx` — exporta `INPUT_SUBS`; recebe `sub`/`setSub` por props; remove o `useState` interno `aba`.
- `frontend/src/App.tsx` — estado `inputSub` persistido; passa `sub`/`setSub` pro `InputSection` (Task 1) e `inputSub`/`setInputSub` pro `AppSidebar` (Task 2).
- `frontend/src/components/app-sidebar.tsx` — item "Input" vira `Collapsible` com sub-itens de `INPUT_SUBS` (Task 2).
- `frontend/src/types.ts` — **sem mudança** (reuso de `AbaInput`).

---

### Task 1: Elevar e persistir `inputSub`; `InputSection` recebe por props

**Files:**
- Modify: `frontend/src/input/input-section.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `usePersistedState` (`./hooks/use-persisted-state`), `AbaInput` (`./input/types`), `useInputData`/`useRecarregarInput`/`useAvisoSincronizacao` (existentes).
- Produces: `export const INPUT_SUBS: { id: AbaInput; rotulo: string }[]`; `InputSection({ sub, setSub }: { sub: AbaInput; setSub: (s: AbaInput) => void })`. Consumido pela Task 2 (sidebar importa `INPUT_SUBS`) e pelo `App`.

- [ ] **Step 1: `input-section.tsx` — exportar `INPUT_SUBS` e receber props**

Em `frontend/src/input/input-section.tsx`, trocar o bloco `const ABAS … ` + a assinatura/início da função. Hoje:

```tsx
const ABAS: { id: AbaInput; rotulo: string }[] = [
  { id: 'visao', rotulo: 'Visão Geral' },
  { id: 'gerenciar', rotulo: 'Gerenciar' },
  { id: 'relatorios', rotulo: 'Relatórios' },
  { id: 'logs', rotulo: 'Logs' },
  { id: 'config', rotulo: 'Configurações' },
];

export function InputSection(): React.JSX.Element {
  const [aba, setAba] = React.useState<AbaInput>('visao');
  const { data: dados, isLoading, error } = useInputData();
```

Passa a ser:

```tsx
export const INPUT_SUBS: { id: AbaInput; rotulo: string }[] = [
  { id: 'visao', rotulo: 'Visão Geral' },
  { id: 'gerenciar', rotulo: 'Gerenciar' },
  { id: 'relatorios', rotulo: 'Relatórios' },
  { id: 'logs', rotulo: 'Logs' },
  { id: 'config', rotulo: 'Configurações' },
];

interface InputSectionProps {
  sub: AbaInput;
  setSub: (s: AbaInput) => void;
}

export function InputSection({ sub, setSub }: InputSectionProps): React.JSX.Element {
  const { data: dados, isLoading, error } = useInputData();
```

(Removeu-se a linha do `useState` de `aba`.)

- [ ] **Step 2: `input-section.tsx` — usar `sub`/`setSub` no render**

No mesmo arquivo, a barra de abas do topo. Hoje:

```tsx
        <div className="edp-seg">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'on' : ''} onClick={() => setAba(a.id)}>{a.rotulo}</button>
          ))}
        </div>
```

Passa a:

```tsx
        <div className="edp-seg">
          {INPUT_SUBS.map((a) => (
            <button key={a.id} className={sub === a.id ? 'on' : ''} onClick={() => setSub(a.id)}>{a.rotulo}</button>
          ))}
        </div>
```

E os cinco blocos de conteúdo no fim do componente. Hoje:

```tsx
      {dados && aba === 'visao' && <Overview dados={dados} />}
      {dados && aba === 'gerenciar' && <Manage dados={dados} />}
      {dados && aba === 'relatorios' && <Reports dados={dados} />}
      {dados && aba === 'logs' && <Logs />}
      {dados && aba === 'config' && <Settings dados={dados} />}
```

Passam a (troca `aba` por `sub`):

```tsx
      {dados && sub === 'visao' && <Overview dados={dados} />}
      {dados && sub === 'gerenciar' && <Manage dados={dados} />}
      {dados && sub === 'relatorios' && <Reports dados={dados} />}
      {dados && sub === 'logs' && <Logs />}
      {dados && sub === 'config' && <Settings dados={dados} />}
```

- [ ] **Step 3: `App.tsx` — importar `AbaInput`**

Em `frontend/src/App.tsx`, logo após a linha `import type { Note, Source, AppSection, CoffeeSubPage } from './types';`, adicionar:

```tsx
import type { AbaInput } from './input/types';
```

- [ ] **Step 4: `App.tsx` — estado `inputSub` persistido**

Logo após a linha do `coffeeSub`:

```tsx
  const [coffeeSub, setCoffeeSub] = usePersistedState<CoffeeSubPage>("edp_coffee_sub", "verificar");
```

adicionar:

```tsx
  const [inputSub, setInputSub] = usePersistedState<AbaInput>("edp_input_sub", "visao");
```

- [ ] **Step 5: `App.tsx` — passar `sub`/`setSub` pro `InputSection`**

No render, trocar:

```tsx
            {section === "input"         ? <InputSection /> :
```

por:

```tsx
            {section === "input"         ? <InputSection sub={inputSub} setSub={setInputSub} /> :
```

- [ ] **Step 6: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 7: Verificação manual**

Run: `cd frontend && npm run dev` (backend rodando). Na seção Input:
- A barra de abas no topo funciona como antes (Visão Geral / Gerenciar / Relatórios / Logs / Configurações).
- Trocar de aba e **recarregar a página** mantém a aba (persistência `edp_input_sub`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/input/input-section.tsx frontend/src/App.tsx
git commit -m "feat(ui): Input — estado inputSub elevado ao App e persistido (espelha coffeeSub)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Sidebar — item "Input" colapsável com sub-itens

**Files:**
- Modify: `frontend/src/components/app-sidebar.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `INPUT_SUBS` (Task 1), `AbaInput` (`../input/types`); `Collapsible`/`CollapsibleContent`/`CollapsibleTrigger`, `SidebarMenuSub`/`SidebarMenuSubItem`/`SidebarMenuSubButton`, `ChevronDown` (já importados no arquivo); estado `inputSub`/`setInputSub` (Task 1, no `App`).
- Produces: `AppSidebar` com props novas `inputSub`/`setInputSub` e grupo colapsável do Input.

- [ ] **Step 1: `app-sidebar.tsx` — imports**

Em `frontend/src/components/app-sidebar.tsx`, logo após `import { COFFEE_SUBS } from '../coffee/coffee-hub';`, adicionar:

```tsx
import { INPUT_SUBS } from '../input/input-section';
import type { AbaInput } from '../input/types';
```

- [ ] **Step 2: `app-sidebar.tsx` — props e helper**

Trocar a interface `AppSidebarProps` e o início da função. Hoje:

```tsx
interface AppSidebarProps {
  section: AppSection;
  setSection: (s: AppSection) => void;
  coffeeSub: CoffeeSubPage;
  setCoffeeSub: (s: CoffeeSubPage) => void;
}

export function AppSidebar({ section, setSection, coffeeSub, setCoffeeSub }: AppSidebarProps): React.JSX.Element {
  function selectSub(sub: CoffeeSubPage): void {
    setCoffeeSub(sub);
    setSection("coffee");
  }
```

Passa a:

```tsx
interface AppSidebarProps {
  section: AppSection;
  setSection: (s: AppSection) => void;
  coffeeSub: CoffeeSubPage;
  setCoffeeSub: (s: CoffeeSubPage) => void;
  inputSub: AbaInput;
  setInputSub: (s: AbaInput) => void;
}

export function AppSidebar({ section, setSection, coffeeSub, setCoffeeSub, inputSub, setInputSub }: AppSidebarProps): React.JSX.Element {
  function selectSub(sub: CoffeeSubPage): void {
    setCoffeeSub(sub);
    setSection("coffee");
  }
  function selectInputSub(sub: AbaInput): void {
    setInputSub(sub);
    setSection("input");
  }
```

- [ ] **Step 3: `app-sidebar.tsx` — Input vira `Collapsible`**

Substituir o `SidebarMenuItem` simples do Input. Hoje:

```tsx
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
```

Passa a (espelha o `Collapsible` do COFFEE, com `group/input`):

```tsx
            <SidebarMenuItem>
              <Collapsible defaultOpen className="group/input">
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip="Input"
                    isActive={section === "input"}
                    onClick={() => setSection("input")}
                  >
                    <IconInput />
                    <span>Input</span>
                    <ChevronDown
                      size={14}
                      className="ml-auto transition-transform duration-200 group-data-[state=open]/input:rotate-180"
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {INPUT_SUBS.map((s) => (
                      <SidebarMenuSubItem key={s.id}>
                        <SidebarMenuSubButton
                          className="cursor-pointer"
                          isActive={section === "input" && inputSub === s.id}
                          onClick={() => selectInputSub(s.id)}
                        >
                          {s.rotulo}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
```

- [ ] **Step 4: `App.tsx` — passar as props novas pro `AppSidebar`**

No render do `App.tsx`, trocar:

```tsx
        <AppSidebar section={section} setSection={changeSection}
                    coffeeSub={coffeeSub} setCoffeeSub={setCoffeeSub} />
```

por:

```tsx
        <AppSidebar section={section} setSection={changeSection}
                    coffeeSub={coffeeSub} setCoffeeSub={setCoffeeSub}
                    inputSub={inputSub} setInputSub={setInputSub} />
```

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 6: Verificação manual**

Run: `cd frontend && npm run dev` (backend rodando):
1. Sidebar mostra **Input** como grupo colapsável (com chevron). Expandir → Visão Geral / Gerenciar / Relatórios / Logs / Configurações.
2. Clicar num sub-item entra na seção Input naquela aba; a **barra do topo reflete** a mesma aba (e clicar na barra do topo reflete no sub-item ativo).
3. Sub-item ativo e aba do topo ficam destacados de forma sincronizada.
4. COFFEE e Configurações continuam funcionando.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/app-sidebar.tsx frontend/src/App.tsx
git commit -m "feat(ui): sidebar — Input colapsavel com subitens (espelha o COFFEE)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Estado `inputSub` elevado e persistido (`edp_input_sub`, default "visao") → Task 1. ✓
- `InputSection` recebe `sub`/`setSub`; remove estado interno → Task 1. ✓
- `INPUT_SUBS` exportado (espelha `COFFEE_SUBS`) → Task 1. ✓
- Barra `.edp-seg` mantida e sincronizada → Task 1 (usa `sub`/`setSub`). ✓
- Sidebar com grupo colapsável + sub-itens (espelha COFFEE, `group/input`, `selectInputSub`) → Task 2. ✓
- Sub-item ativo sincronizado (`section === "input" && inputSub === s.id`) → Task 2. ✓
- Reuso de `AbaInput`, sem tipo novo; `types.ts` sem mudança → respeitado. ✓
- Sem backend/dep nova/COFFEE intocado → respeitado. ✓

**Placeholder scan:** sem TBD/TODO; todos os steps têm o código concreto (antes/depois) e comandos com saída esperada.

**Type consistency:** `INPUT_SUBS: { id: AbaInput; rotulo: string }[]` definido na Task 1 e iterado na Task 2 com `s.id`/`s.rotulo`. `inputSub: AbaInput`/`setInputSub: (s: AbaInput) => void` consistentes entre `App` (Task 1 cria o estado, Task 2 passa pro sidebar), `AppSidebar` (Task 2) e `InputSection` (`sub`/`setSub`, Task 1). `selectInputSub` espelha `selectSub`. ✓
