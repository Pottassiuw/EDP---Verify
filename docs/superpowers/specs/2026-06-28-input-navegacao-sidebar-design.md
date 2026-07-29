# Input — Navegação igual ao COFFEE (subseções na sidebar + abas sincronizadas)

**Data:** 2026-06-28
**Branch:** develop
**Escopo:** Frontend (`frontend/src/types.ts`, `frontend/src/App.tsx`, `frontend/src/components/app-sidebar.tsx`, `frontend/src/input/input-section.tsx`)

> Sub-projeto **B** do overhaul da seção Input. Ordem geral: A (tabela ✓) → **B** (navegação) → C (formulários em shadcn) → D (sweep dos primitivos compartilhados).

## Problema

O COFFEE tem as subseções (Verificar, Abrir, Gerar, …) como **grupo colapsável na sidebar** *e* como **barra de abas no topo**, sincronizadas pelo estado `coffeeSub` elevado ao `App`. O Input não: as abas (Visão Geral, Gerenciar, Relatórios, Logs, Configurações) vivem só num `useState` interno do `input-section.tsx` (`aba`), sem presença na sidebar e sem persistência. Resultado: navegação inconsistente entre os dois módulos.

## Objetivo

Replicar no Input exatamente o padrão do COFFEE: subseções colapsáveis na sidebar + barra de abas no topo, ambas dirigidas por um estado `inputSub` elevado ao `App` e persistido.

## Não-objetivos (YAGNI)

- **Não** migrar `.edp-seg`/`.edp-btn` para shadcn aqui — isso é o sub-projeto D (sweep). A barra de abas do topo continua `.edp-seg`, igual ao COFFEE hoje.
- **Não** mexer na tabela (sub-projeto A, feito), nos formulários (sub-projeto C) nem no backend.
- **Não** mexer no COFFEE nem nos itens desabilitados da sidebar ("Relatórios", "De olho no BI").
- Sem rota nova, sem dependência nova.

## Decisões (minhas, delegadas pelo usuário — "igual ao COFFEE")

- Espelhar o COFFEE 1:1: `Collapsible` na sidebar com sub-itens + `.edp-seg` no topo, sincronizados.
- Estado `inputSub` elevado ao `App`, persistido via `usePersistedState("edp_input_sub", "visao")` (espelha `edp_coffee_sub`).
- `INPUT_SUBS` exportado de `input-section.tsx` (espelha `COFFEE_SUBS` de `coffee-hub.tsx`). Isso faz o `app-sidebar` importar `input-section` estaticamente — **mesmo tradeoff de bundle que o COFFEE já tem** hoje (o lazy-load do `InputSection` deixa de surtir efeito pleno). Aceito por consistência; um módulo `input/subs.ts` resolveria os dois se algum dia o bundle importar (`// ponytail:`).
- Tipo da subpágina: reusar `AbaInput` (já existe em `input/types.ts` com os 5 valores). Sem criar tipo novo.

## Design

Quatro arquivos, espelhando o que o COFFEE já faz.

### 1. `App.tsx` — eleva e persiste o estado

- Novo estado: `const [inputSub, setInputSub] = usePersistedState<AbaInput>("edp_input_sub", "visao");` (ao lado de `coffeeSub`).
- Passa `inputSub`/`setInputSub` pro `<AppSidebar>`.
- Renderiza `<InputSection sub={inputSub} setSub={setInputSub} />` (hoje é `<InputSection />` sem props).
- Importa o tipo `AbaInput` de `./input/types`.

### 2. `input-section.tsx` — recebe o estado por props

- Assinatura passa a `InputSection({ sub, setSub }: { sub: AbaInput; setSub: (s: AbaInput) => void })`.
- Remove o `useState` interno `aba`/`setAba`; usa `sub`/`setSub`.
- Exporta a lista de abas como `INPUT_SUBS` (hoje é o `const ABAS` local) — `{ id: AbaInput; rotulo: string }[]`, consumida pela sidebar.
- A barra `.edp-seg` do topo passa a iterar `INPUT_SUBS` e usar `sub === a.id` / `setSub(a.id)`.
- Os blocos `aba === 'visao'` etc. viram `sub === 'visao'` etc.

### 3. `app-sidebar.tsx` — grupo colapsável do Input

- Props ganham `inputSub: AbaInput; setInputSub: (s: AbaInput) => void;`.
- O item simples "Input" (hoje só um `SidebarMenuButton`) vira um `Collapsible` espelhando o do COFFEE: `CollapsibleTrigger` no `SidebarMenuButton` (com o `IconInput`, `isActive={section === "input"}`, `onClick={() => setSection("input")}`, chevron `group-data-[state=open]/input:rotate-180`) e `CollapsibleContent` com `SidebarMenuSub` iterando `INPUT_SUBS`.
- Cada sub-item: `SidebarMenuSubButton` com `isActive={section === "input" && inputSub === s.id}` e `onClick={() => selectInputSub(s.id)}`, onde `selectInputSub(sub)` faz `setInputSub(sub); setSection("input")` (espelha o `selectSub` do COFFEE).
- Importa `INPUT_SUBS` de `../input/input-section` e o tipo `AbaInput` de `../input/types`.

### 4. `types.ts`

- Sem mudança obrigatória (reusamos `AbaInput`). (Se preferíssemos simetria de nomes com `CoffeeSubPage`, daria pra adicionar `InputSubPage = AbaInput`, mas é alias redundante — YAGNI.)

## Tratamento de erro / casos de borda

- `usePersistedState` já trata storage indisponível (mesmo helper do `coffeeSub`); valor inválido cai no default `"visao"` no pior caso (sem crash — o `sub ===` simplesmente não casa e nenhuma aba renderiza; mas o default garante "visao").
- Sub-item clicado com a seção em COFFEE/Configurações → `selectInputSub` troca a seção pra "input" e a subpágina (igual ao COFFEE).
- O `changeSection` do App (que zera `coffeeReturn` ao sair do COFFEE) continua valendo; trocar pra Input por qualquer caminho passa por `setSection`.

## Verificação

Sem test runner no frontend → `cd frontend && npm run build` (`tsc -b && vite build`) sem erros + manual no dev server:

1. Sidebar mostra **Input** como grupo colapsável; expandir lista Visão Geral / Gerenciar / Relatórios / Logs / Configurações.
2. Clicar num sub-item entra na seção Input naquela aba; a **barra de abas do topo reflete** a mesma seleção (e vice-versa).
3. Sub-item e aba do topo ficam ambos com destaque "ativo" sincronizado.
4. Recarregar a página mantém a aba do Input (persistência `edp_input_sub`).
5. COFFEE e Configurações seguem funcionando como antes.

## Arquivos afetados

- `frontend/src/App.tsx` — estado `inputSub` persistido; passa props pra sidebar e InputSection.
- `frontend/src/input/input-section.tsx` — recebe `sub`/`setSub`; exporta `INPUT_SUBS`; remove estado interno.
- `frontend/src/components/app-sidebar.tsx` — grupo colapsável do Input com sub-itens.
- `frontend/src/types.ts` — sem mudança (reuso de `AbaInput`); listado por contexto.
