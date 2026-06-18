# Spec — Hub COFFEE: Navegação Frontend com Flyout

**Data:** 2026-06-18
**Status:** Aprovado para implementação

> **Contexto maior:** Este é o **Sub-projeto 2** da iniciativa Hub Operacional COFFEE. O Sub-projeto 1 (fundação backend — `/api/coffee/*`) está completo. Este sub-projeto entrega **apenas a navegação frontend** — dropdown flyout na sidebar, hub wrapper e placeholders para as sub-páginas. O conteúdo real das sub-páginas (tabelas, ações) fica para sub-projetos futuros.

## Problema

A seção COFFEE é hoje um componente monolítico (`coffee-section.tsx`) que faz uma única coisa: abrir notas no COFFEE. A visão do Hub Operacional exige 5 sub-páginas (Abrir Notas, Geradas, Corrigidas, Pendentes, Verificar) acessíveis via navegação no sidebar. O sidebar atual tem 56px de largura (só ícones), então sub-itens de texto não cabem inline.

## Solução

Flyout popup lateral no sidebar + hub wrapper que renderiza a sub-página ativa. Segue o padrão do `InputSection` (componente wrapper + renderização condicional por sub-página), mas com navegação via flyout em vez de abas horizontais.

## Modelo de navegação

### Novo tipo

```typescript
type CoffeeSubPage = "abrir" | "geradas" | "corrigidas" | "pendentes" | "verificar";
```

Adicionado em `frontend/src/types.ts`.

### Estado

- `coffeeSub: CoffeeSubPage` — gerenciado por `usePersistedState("edp_coffee_sub", "abrir")` dentro do componente `CoffeeHub`.
- Persistido em `sessionStorage` — sobrevive troca de seção e reload, reseta por sessão.
- Quando o usuário clica no botão COFFEE da sidebar (sem flyout), a seção muda para `"coffee"` e a sub-página é a última visitada (lida do sessionStorage).

## Flyout no Sidebar

### Comportamento

- O botão COFFEE na sidebar ganha um **indicador de chevron** (▾) pequeno no canto inferior direito, indicando que tem sub-menu.
- **Clique no botão** → navega para a seção COFFEE (última sub-página visitada). O flyout **não** abre.
- **Clique no chevron** (ou clique-direito / long-press no botão) → abre o flyout.
- O flyout é um `<div>` com `position: absolute`, posicionado à direita do botão COFFEE, alinhado verticalmente com ele.
- **Fecha ao:** selecionar um item, clicar fora (mousedown handler no document), pressionar Escape.

### Visual

- Fundo: `var(--surface)`, borda: `1px solid var(--line)`, border-radius: `var(--r-md)`, box-shadow sutil.
- Largura: ~180px.
- Cada item: padding vertical, ícone à esquerda (emoji ou SVG simples), texto descritivo à direita.
- Item ativo: destaque com `var(--accent-tint)` e barra lateral como o botão ativo da sidebar.
- Z-index alto (acima do conteúdo principal).

### Itens do flyout

| Chave | Label | Ícone |
|---|---|---|
| `abrir` | Abrir Notas | ☕ |
| `geradas` | Geradas | ✓ (verde) |
| `corrigidas` | Corrigidas | ↻ |
| `pendentes` | Pendentes | ⏳ |
| `verificar` | Verificar | 🔍 |

## Componente CoffeeHub

Wrapper que substitui o `CoffeeSection` no render do `App.tsx`.

### Responsabilidades

1. Gerencia o estado `coffeeSub` via `usePersistedState`.
2. Renderiza um **header** com o título da sub-página ativa (estilo consistente com o `InputSection` — 56px de altura, fundo `var(--surface)`, borda inferior).
3. Renderiza o componente correspondente à sub-página:
   - `"abrir"` → componente `CoffeeAbrir` (o `coffee-section.tsx` atual, movido e renomeado)
   - `"geradas"` / `"corrigidas"` / `"pendentes"` / `"verificar"` → componente `CoffeePlaceholder` genérico

### Header do Hub

Barra de 56px no topo (como o `InputSection`), fundo `var(--surface)`, borda inferior. Contém:
- Título à esquerda: **"COFFEE"** em bold.
- Barra segmentada `edp-seg` com as 5 sub-páginas (labels curtos: "Abrir", "Geradas", "Corrigidas", "Pendentes", "Verificar"). Funciona como navegação secundária dentro da seção — alternativa rápida ao flyout para quem já está na seção COFFEE.

## Componente CoffeePlaceholder

Componente reutilizável para sub-páginas ainda não implementadas.

```tsx
interface CoffeePlaceholderProps {
  titulo: string;
  descricao: string;
}
```

Renderiza: título centralizado, descrição em `var(--text-mute)`, ícone de "em construção". Estilo consistente com o resto do app.

## Estrutura de arquivos

```
frontend/src/
├── coffee/                        (nova pasta — equivalente a input/)
│   ├── coffee-hub.tsx             hub wrapper com estado de sub-página
│   ├── coffee-abrir.tsx           move de components/coffee-section.tsx
│   └── placeholder.tsx            componente genérico de placeholder
├── components/
│   ├── sidebar.tsx                modifica: flyout no botão COFFEE
│   └── coffee-section.tsx         remove (movido para coffee/)
├── types.ts                       modifica: adiciona CoffeeSubPage
└── App.tsx                        modifica: troca CoffeeSection por CoffeeHub
```

## Mudanças no App.tsx

- O lazy import muda de `coffee-section` para `coffee/coffee-hub`.
- O bloco `section === "coffee"` simplifica — o `CoffeeHub` gerencia suas sub-páginas internamente, sem precisar do `coffeeReturn` / `TopBar` condicional no App.
- O `coffeeReturn` (banner de "voltar à triagem") move para dentro do `CoffeeHub` ou do `CoffeeAbrir`, já que só faz sentido na sub-página "Abrir Notas".

## Mudanças no Sidebar

- O botão COFFEE precisa comunicar ao `App.tsx` que a seção mudou. Isso já funciona via `setSection("coffee")`.
- O flyout precisa saber qual sub-página está ativa para destacá-la. **Duas opções:**
  - O sidebar recebe `coffeeSub` como prop (simples, mas acopla sidebar ao COFFEE).
  - O flyout lê de `sessionStorage` diretamente (desacoplado, mas duplica lógica).
- **Decisão:** O sidebar recebe `coffeeSub` e `setCoffeeSub` como props opcionais. O flyout usa esses para destacar e navegar. Quando o flyout seleciona uma sub-página, chama `setSection("coffee")` + `setCoffeeSub(sub)`.

Alternativa simplificada: o sidebar **não** recebe o estado da sub-página. O flyout apenas navega (`setSection("coffee")` + escreve em sessionStorage). O `CoffeeHub` lê do sessionStorage via `usePersistedState` e reage. Isso desacopla completamente.

**Decisão final:** Alternativa simplificada — o sidebar escreve em `sessionStorage` e o `CoffeeHub` lê via `usePersistedState`. Zero props extras no sidebar.

## Comportamento do sendToCoffeeQueue

A função `sendToCoffeeQueue` no `App.tsx` (que envia notas da triagem para o COFFEE) continua funcionando:
1. Escreve os IDs em `localStorage("edp_coffee_ids")` como hoje.
2. Seta a sub-página para `"abrir"` via `sessionStorage.setItem("edp_coffee_sub", JSON.stringify("abrir"))`.
3. Chama `setSection("coffee")`.

O `CoffeeHub` lê `"abrir"` do sessionStorage e renderiza a `CoffeeAbrir`.

## Fora de escopo

- Conteúdo real das sub-páginas Geradas/Corrigidas/Pendentes/Verificar (sub-projeto 3+).
- Consumo do `/api/coffee/notas` no frontend.
- Busca em lote no frontend (UI para disparar `/api/coffee/buscar`).
- Qualquer mudança no backend.

## Verificação

- O flyout abre e fecha corretamente (click chevron, click fora, Escape).
- Navegar entre sub-páginas funciona (flyout e header).
- A sub-página "Abrir Notas" funciona exatamente como antes (regressão zero).
- A última sub-página visitada persiste em sessionStorage.
- `sendToCoffeeQueue` da triagem continua abrindo a seção COFFEE na sub-página "Abrir Notas".
- O app builda sem erros (`npm run build`).
- Code-splitting preservado (chunk COFFEE separado).
