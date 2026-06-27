# Refatoração da Sidebar (shadcn sidebar-08) + Página Configurações

**Data:** 2026-06-26
**Branch:** develop
**Escopo:** Frontend (`frontend/src`)

## Problema

A implementação atual da sidebar shadcn está visualmente quebrada (ver imagens de referência da sessão):

- `<ul>`/`<li>` da `SidebarMenu` aparecem com **bullets nativos do navegador** (bolinhas flutuando na borda esquerda).
- A sidebar colapsada vira uma **barra branca vertical** quase vazia.
- Na página Configurações, os `ToggleGroup` renderizam como **botões soltos com borda nativa**, em vez de um segmented control unificado.

### Causa raiz

O Tailwind preflight (reset/normalize) está **desligado de propósito** em `frontend/src/index.css`:

```css
/* Tailwind v4 — só theme + utilities (SEM preflight nesta fase). */
```

Os componentes shadcn dependem do preflight para zerar `list-style`, margens e a aparência nativa de `<button>`. Sem ele, qualquer componente shadcn baseado em lista ou botão quebra.

O preflight foi desligado porque as telas legadas (`CoffeeHub`, `InputSection`) usam CSS custom (`.edp-*`, estilos inline) que assumem os defaults do navegador. Ligar o preflight global agora quebraria essas telas. O projeto planejou religar o preflight só na "Fase 4", quando todas as telas estiverem migradas.

**Observação:** o `app-sidebar.tsx` atual usa os primitivos shadcn corretamente. O problema é exclusivamente a falta do reset — não a estrutura dos componentes.

## Objetivos

1. Sidebar com o **visual limpo do shadcn sidebar-08** (imagem de referência 3), usando o conteúdo do EDP.
2. Página Configurações com aparência correta e layout intencional.
3. **Sem quebrar** as telas legadas (`CoffeeHub`, `InputSection`).
4. Manter os defaults do shadcn — ajustar apenas cores/bordas via tokens existentes. Não reinventar estilo.

## Não-objetivos (YAGNI)

- Não ligar o preflight global (fica para a Fase 4).
- Não adicionar TeamSwitcher, NavUser ou NavProjects do sidebar-08 (o EDP não tem times/contas/projetos). **Apenas a estrutura visual.**
- Não refatorar `CoffeeHub` nem `InputSection`.
- Não alterar os controles/comportamento das Configurações (mesmas opções: Tema, Densidade, Cor de destaque, KPIs, Layout COFFEE).

## Design

### 1. Reset escopado (a correção central)

Adicionar um reset CSS **cirúrgico**, escopado às superfícies já migradas para shadcn — não global. Cobre:

- O subtree da sidebar: `[data-slot="sidebar-wrapper"]` e o sheet mobile (`[data-slot="sidebar"]` dentro do `Sheet`).
- A raiz da página Configurações (via uma classe marcadora, ex. `.ui-reset`).

O reset normaliza dentro desse escopo:

```css
/* exemplo ilustrativo — localização: tokens.css ou novo arquivo importado */
[data-slot="sidebar-wrapper"], [data-slot="sidebar"] [data-sidebar="sidebar"], .ui-reset {
  ul, ol { list-style: none; margin: 0; padding: 0; }
  li     { margin: 0; }
  button { font: inherit; color: inherit; background: none; border: 0; }
}
```

> **Implementado (`a4d6a3c`):** o escopo em `tokens.css` ganhou também um "preflight-lite" de bordas (`*, *::before, *::after { border: 0 solid }` dentro do escopo), necessário para que as utilities de borda do Tailwind (`border`, `border-input`) renderizem corretamente sem o preflight global.

Convenção: páginas/telas que migrarem para shadcn passam a usar o marcador `.ui-reset` na sua raiz para entrar no escopo. Isso mantém o caminho de migração consistente até a Fase 4.

### 2. Sidebar — estrutura sidebar-08, conteúdo EDP

Rodar `npx shadcn@latest add sidebar-08 --overwrite` para trazer os arquivos canônicos e quaisquer primitivos que faltem (ex. `dropdown-menu`, `avatar`, `breadcrumb`). Em seguida reescrever `app-sidebar.tsx` na **anatomia do 08**, removendo os blocos sem equivalente no EDP.

Estrutura final do `app-sidebar.tsx`:

- **SidebarHeader:** glyph da marca + texto "EDP Verify" (ocupa o slot do team-switcher, **sem dropdown**). Trigger de colapsar.
- **SidebarContent** → `SidebarGroup` com `SidebarGroupLabel` ("Plataforma"), padrão NavMain:
  - **COFFEE** — item collapsible com 6 subitens (`Verificar`, `Abrir`, `Gerar`, `Corrigidas`, `Pendentes`, `Logs`).
  - **Input**
  - **Relatórios** — `disabled`, badge "soon".
  - **De olho no BI** — `disabled`, badge "soon".
- **SidebarFooter:** **Configurações** (item único; ocupa o slot do nav-user).
- `collapsible="icon"` + `<SidebarRail />` mantidos → colapsa para rail de ícones com expansão por hover.

A fiação de props (`section`, `setSection`, `coffeeSub`, `setCoffeeSub`) e os ícones inline existentes são preservados.

Sub-componentes do sidebar-08 que **não** serão usados (remover/não importar): `team-switcher`, `nav-user`, `nav-projects`.

> **Implementado (`a4d6a3c`):** `<SidebarRail />` foi removido — a barra lateral aparecia como faixa branca. O botão de colapso ficou no `SidebarHeader` e fica sempre visível (centralizado quando a sidebar está colapsada). `collapsible="icon"` mantido, mas expansão por hover via rail não está mais presente.

### 3. Cores e bordas — apenas tokens

Manter o styling padrão dos componentes shadcn. Ajustar somente via os tokens `--sidebar-*` já definidos em `frontend/src/tokens.css`:

- `--sidebar` = `--surface`
- `--sidebar-accent` = hover/ativo
- `--sidebar-primary` = verde EDP (`--accent`)
- bordas via `--sidebar-border`

Nenhuma reescrita de estilo interno dos componentes.

### 4. Página Configurações — refator completo

Mantém **os mesmos controles e comportamento**. Mudanças:

- Adicionar o marcador `.ui-reset` na raiz da página → Card/Switch/ToggleGroup renderizam com o visual shadcn correto.
- Substituir os estilos inline (`style={{...}}`) pelo idioma shadcn/Tailwind (classes utilitárias).
- Corrigir o layout: header de página + coluna de largura sensata (sem o `maxWidth: 520` centralizado que deixa o oceano vazio). Alinhamento consistente com a estética do sidebar-08.
- Cards: Aparência (Tema, Densidade, Cor de destaque), Exibição (Mostrar KPIs), Seção COFFEE (Layout Composer/Split).

### 5. SidebarInset / conteúdo

Confirmar que o `SidebarInset` usa o fundo `--bg` e que a barra branca de colapso desaparece após o reset. Validar `SidebarProvider` com os defaults corretos.

## Verificação

Subir o dev server (`npm run dev` em `frontend/`) e confirmar visualmente:

1. Bullets/bolinhas sumiram da sidebar.
2. Fundo da sidebar sólido; sem barra branca ao colapsar.
3. Colapso → sidebar colapsa para ícones; botão de toggle sempre visível no header (centralizado). ~~SidebarRail removido.~~
4. Item ativo destacado com o verde EDP.
5. COFFEE expande/colapsa com os 6 subitens; navegação troca a seção corretamente.
6. Página Configurações: toggles como segmented control unificado, layout sem espaço vazio gigante, todos os controles funcionando.
7. **Regressão:** `CoffeeHub` e `InputSection` permanecem visualmente intactos.

## Arquivos afetados

- `frontend/src/index.css` ou `frontend/src/tokens.css` — reset escopado.
- `frontend/src/components/app-sidebar.tsx` — reescrita na anatomia do 08.
- `frontend/src/components/ui/*` — novos primitivos trazidos pelo `shadcn add` (se houver).
- `frontend/src/pages/configuracoes.tsx` — refator para idioma shadcn + layout.
- Possíveis novos arquivos do bloco sidebar-08 (a maioria removida/não usada).
