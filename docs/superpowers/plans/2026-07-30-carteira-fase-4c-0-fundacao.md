# Carteira de Notas — Fase 4c-0 (Fundação Supabaze Global) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans ou
> superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`).

**Goal:** Promover os tokens Supabaze de `.carteira-scope` para `:root`, com tema
claro e escuro, densidade e ponte shadcn completos, sem alterar comportamento,
conteúdo ou navegação — e sem que a Carteira mude um pixel.

**Architecture:** Uma única fonte de verdade de tokens em `app.css`. O tema deixa
de ser escopado por classe e passa a ser um atributo em `<html>`, escrito pelo
`SettingsProvider`. A classe raiz `.edp` continua no DOM, mas para de declarar
tokens — vira um no-op inerte até a 4c-fim removê-la.

**Tech Stack:** Tailwind v4, CSS custom properties, React 18, TypeScript, Vitest.

---

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-29-carteira-fase-4c-migracao-visual-supabaze-design.md`.
- **Ponto de não-regressão:** a Carteira deve ficar **idêntica** antes e depois.
- **Limite:** só pele. Nenhuma mudança de lógica, fluxo, conteúdo ou navegação.
- **Sem segunda fonte de verdade:** a paleta clara é declarada **uma vez**; não
  existe bloco duplicado para a Carteira.
- **Cor só por token.** Nenhum hex novo fora dos valores do DESIGN.md.
- **Acessibilidade não regride.** Contraste AA verificado por teste automatizado.
- **Fora de escopo (vão para os lotes 4c-1..4c-5):** trocar anatomia `.edp-*` por
  `ui/`/`branded/`, remover os hooks de portal, remover `className="edp"` dos 18
  portais, limpar as cores hardcoded de feature, apagar CSS morto.
- **Comandos:** a partir de `frontend/`, `npm test`, `npx tsc -b` e `npm run build`.

---

## Decisões que este plano fecha

| Questão | Decisão | Por quê |
|---|---|---|
| Onde mora `data-theme`/`data-density` | `<html>` (e também, sem efeito, no div raiz) | Portal do Radix renderiza no `<body>`, fora do div raiz. Com o atributo no `<html>`, `:root[data-theme=…]` alcança todo portal sem hook nem `className` manual. |
| O que sobra da classe `.edp` | Nada de token. Só as regras de comportamento (`box-sizing`, scrollbar) até a 4c-fim | Se `.edp` continuasse declarando a paleta escura, venceria `:root` por ordem de arquivo e por proximidade na árvore — os 18 portais com `className="edp"` voltariam a renderizar escuro sobre app claro. |
| Como a Carteira continua sempre clara | `:root, .carteira-scope { …claro… }` — um bloco, dois seletores | Especificidade não decide entre `:root` e `.carteira-scope`: são **elementos diferentes**. O `<html>` recebe o escuro, o div da Carteira redeclara o claro para a própria subárvore. Uma fonte de verdade, zero duplicação. |
| Onde a ponte shadcn é declarada | Só no bloco claro (`:root, .carteira-scope`) | A armadilha da Fase 1b (custom property herdada não recalcula) vale entre **elementos diferentes**. `:root[data-theme="dark"]` é o mesmo elemento que `:root`, então `--background: var(--bg)` já recalcula sozinho. Só a Carteira, por ser outro elemento, precisa da ponte junto. |
| Onde a densidade é declarada | Só em `:root`/`:root[data-density]`, **fora** do bloco claro | Se `--pad` entrasse no bloco de dois seletores, `.carteira-scope` redeclararia o valor `cozy` e a densidade compacta pararia de valer dentro da Carteira. |

---

## File Structure

- `frontend/src/app.css` — reestruturação dos blocos de token (o coração do lote).
- `frontend/src/context/settings-context.tsx` — escreve tema/densidade/accent no
  `<html>`; passa a ser dono da lista de presets de accent e a validar o valor salvo.
- `frontend/src/features/configuracoes/configuracoes.tsx` — consome os presets do context.
- `frontend/index.html` — cor de fallback do `<body>` antes do CSS carregar.
- `frontend/src/features/input/filters.tsx` — `text-white` sobre `bg-primary`.
- `frontend/src/features/input/rateio.tsx` — idem.
- `frontend/src/features/input/reports.tsx` — idem.
- `frontend/src/features/verificar/kpi-drawer.tsx` — idem.
- `frontend/src/tokens.test.ts` — guarda de contraste AA sobre os tokens de `app.css`.
- `docs/dev/04-frontend-shared.md` — sistema de tokens, tema, portais.
- `docs/dev/11-frontend-carteira.md` — aposenta a narrativa "única feature Supabaze".
- `docs/dev/00-overview.md` — a Carteira deixa de ser exceção visual.

---

### Task 1: Tema e densidade passam a viver no `<html>`

**Files:**
- Modify: `frontend/src/context/settings-context.tsx`

**Interfaces:**
- Produces: `ACCENT_PRESETS` exportado do context.
- Efeito colateral novo: `document.documentElement` recebe `data-theme`,
  `data-density` e as três custom properties de accent.

- [ ] **Step 1: Mover `ACCENT_PRESETS` para o context e re-basear em Supabaze**
  - O preset padrão vira o esmeralda do DESIGN.md
    (`#3ecf8e` / `#24b47e` / `rgba(62,207,142,0.12)`).
  - Os outros dois viram `accent-indigo` (`#054cff`) e `accent-violet` (`#644fc1`)
    do DESIGN.md, com seus tons de hover/tint derivados. Nenhum hex legado
    (`#00a859`, `#1f9fd6`, `#6b5ce6`) sobrevive.
  - `DEFAULTS.accent` aponta para o primeiro preset.

- [ ] **Step 2: Validar o accent salvo no `localStorage`**
  - Usuário com `edp_settings` antigo tem `#00a859` (ou o azul/índigo legados)
    gravado. Estilo inline vence `:root`, então sem isso o app inteiro continua
    com a marca legada depois da promoção — o risco que sozinho anula o lote.
  - Em `loadSettings()`, se o accent salvo não estiver em `ACCENT_PRESETS`,
    cair para o padrão. Sem migração versionada, sem tocar nas outras chaves.

- [ ] **Step 3: Escrever tema, densidade e accent no `documentElement`**
  - Um `useEffect` no `SettingsProvider` seta `data-theme` (valor resolvido),
    `data-density` e `--accent`/`--accent-2`/`--accent-tint` no `<html>`.
  - Motivo de estar aqui e não no `App.tsx`: o provider é dono do estado e o
    valor precisa alcançar portais que não têm o `App` como ancestral.
  - O `accentStyle` inline em `App.tsx` e os dois hooks de portal continuam
    intactos neste lote — passam a escrever o mesmo valor duas vezes, o que é
    inofensivo. Removê-los é trabalho dos lotes de feature.

---

### Task 2: Reestruturar `app.css` — tokens Supabaze globais

**Files:**
- Modify: `frontend/src/app.css`

**Interfaces:**
- Produces: `:root` (base neutra), `:root, .carteira-scope` (tema claro completo
  + ponte shadcn), `:root[data-theme="dark"]` (tema escuro canvas-night),
  `:root[data-density="compact"]`.
- Removes: `:root, .edp { … }`, `.edp[data-theme="light"]`, `.edp[data-density="compact"]`
  e o bloco `.carteira-scope` isolado.

- [ ] **Step 1: Bloco `:root` — o que não depende de tema**
  - Fontes, tracking, geometria (`--r-sm/--r/--r-md/--r-lg` e `--radius`) e
    densidade `cozy`. Geometria assume a escala Supabaze (6/8/12/16px, `--radius: 6px`).
  - **Consequência aceita e documentada:** todo `rounded-sm/md/lg` do shadcn no
    app muda de valor. É mudança de forma, não só de cor, e a spec §2 a autoriza
    ("6px é o raio-assinatura de botão do DESIGN.md").

- [ ] **Step 2: Bloco `:root, .carteira-scope` — tema claro + ponte**
  - Recebe, na íntegra, o conteúdo cromático de hoje do `.carteira-scope`:
    canvas, superfícies, hairlines, tinta, marca esmeralda, status, sombras,
    zebra, `color-scheme: light`.
  - Acrescenta o que o `.carteira-scope` **nunca teve** e que sem isso quebra o
    app inteiro (levantados um a um no reconhecimento):
    - `--scrollbar-thumb` / `--scrollbar-thumb-hover` em tom escuro translúcido
      (hoje só existem em valor claro; sobre canvas branco o polegar sumia);
    - os oito tokens `--sidebar-*` (sem eles a sidebar inteira vira branca);
    - `--green-3`, que só existia dentro do escopo da Carteira.
  - A ponte shadcn inteira mora aqui, incluindo
    `--primary-foreground: var(--text)` — tipo quase-preto sobre o verde, a
    idiossincrasia explícita do DESIGN.md.

- [ ] **Step 3: Bloco `:root[data-theme="dark"]` — canvas-night**
  - Traduz a mesma linguagem para o escuro usando `canvas-night` (`#1c1c1c`) e
    `canvas-night-soft` (`#202020`). A paleta navy/índigo/ciano legada morre aqui.
  - Só redeclara token cru (superfície, linha, tinta, tint, sombra, zebra,
    scrollbar, `color-scheme: dark`) e os status clareados para AA sobre escuro.
    **Não** repete a ponte shadcn: é o mesmo elemento que `:root`, então
    `var(--bg)` já recalcula.

- [ ] **Step 4: `:root[data-density="compact"]`**
  - Move os quatro tokens de densidade para o seletor de atributo. Continuam
    fora do bridge `@theme inline` pelo motivo já registrado na SP2a: precisam
    reagir em runtime.

- [ ] **Step 5: Esvaziar a classe `.edp`**
  - `.edp` para de declarar qualquer token. Ficam apenas `box-sizing` e as
    regras de scrollbar, que são comportamento amarrado ao seletor, não paleta.
  - Nenhum outro arquivo muda: os 18 portais com `className="edp"` passam a
    carregar uma classe inerte e continuam funcionando, agora herdando o tema
    certo de `:root`.

---

### Task 3: Contraste sobre a marca — a única correção de a11y do lote

**Files:**
- Modify: `frontend/src/features/input/filters.tsx`
- Modify: `frontend/src/features/input/rateio.tsx`
- Modify: `frontend/src/features/input/reports.tsx`
- Modify: `frontend/src/features/verificar/kpi-drawer.tsx`

- [ ] **Step 1: Trocar `text-white` por `text-primary-foreground` sobre a marca**
  - Com `--primary` = esmeralda `#3ecf8e`, texto branco dá 2,0:1 — abaixo do
    mínimo AA de 4,5:1. São 10 superfícies de ação primária.
  - Usar o token em vez da cor literal resolve nos dois temas de uma vez e
    devolve os 9:1 do tipo quase-preto.
  - Isto não é migração de anatomia (que é dos lotes de feature): é impedir que
    a fundação introduza uma regressão de acessibilidade, o que o CLAUDE.md veta.

---

### Task 4: Fallback do documento

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Fallback do `background` do `<body>`**
  - `var(--bg, #161e2b)` guarda o navy legado para o frame anterior ao CSS.
    Passa a `#ffffff`, coerente com o canvas branco autoritativo.

---

### Task 5: Guarda automatizada de contraste

**Files:**
- Create: `frontend/src/tokens.test.ts`

- [ ] **Step 1: Teste que lê `app.css` e afere contraste**
  - Extrai os hexes dos blocos claro e escuro e afere WCAG para os pares que
    carregam texto: tinta/canvas, tinta secundária/superfície, marca/canvas e
    tipo-sobre-marca.
  - Sem dependência nova: `fs` + a fórmula de luminância relativa.
  - É a rede que protege os lotes 4c-1..4c-5, que vão continuar mexendo em cor.
  - Documentar no teste os dois pares que já nascem abaixo de AA no claro e por
    quê (`--text-mute` é tinta terciária decorativa; `--green-3` só é usado em
    número de 26px, onde o mínimo é 3:1) — herdados do baseline aprovado da
    Carteira, não introduzidos aqui.

---

### Task 6: Documentação

**Files:**
- Modify: `docs/dev/04-frontend-shared.md`
- Modify: `docs/dev/11-frontend-carteira.md`
- Modify: `docs/dev/00-overview.md`

- [ ] **Step 1: `04-frontend-shared.md` — sistema de tokens**
  - Reescrever a seção de tokens: onde cada bloco mora, por que a ponte fica só
    no bloco claro, por que a densidade fica fora dele, e que o tema agora é um
    atributo do `<html>`.
  - Corrigir a afirmação de que `--radius` acompanha `--r`: passam a ser
    independentes (6px fixo contra a escala 6/8/12/16).
  - Registrar que os dois hooks de portal viraram redundantes para tema e ainda
    sobrevivem só por causa do accent inline — e que sua remoção é dos lotes de feature.

- [ ] **Step 2: `11-frontend-carteira.md` — aposentar a exceção**
  - `.carteira-scope` deixa de ser "o escopo que dá pele Supabaze à seção" e
    passa a ser "o escopo que mantém a Carteira clara quando o app está escuro".
  - Registrar a decisão de que, na 4c-fim, o escopo sai e a Carteira passa a
    acompanhar o tema do app.
  - A instrução de aplicar `.carteira-scope`/`.edp` em `SheetContent`/`SelectContent`
    vira desnecessária; marcar como resíduo a limpar no lote 4c-1.

- [ ] **Step 3: `00-overview.md`**
  - A Carteira deixa de ser "a primeira feature na direção Supabaze" e passa a
    ser a referência de não-regressão da fundação.

---

## Dívida deliberada, com endereço

Registrada aqui para não virar "depois a gente vê". Nada disto entra na 4c-0:

| Item | Onde | Lote |
|---|---|---|
| Halo radial índigo/ciano de 720px, sem `var()` | `verificar/upload-screen.tsx:62` | 4c-5 |
| 11 hexes do Bootstrap no donut | `input/reports.tsx:16-26` | 4c-3 |
| 13 bordas `rgba()` derivadas da paleta legada | `verificar/`, `coffee-hub.tsx:57` | 4c-4/4c-5 |
| Sombras `rgba(0,0,0,.35)` fora da escala | `verificar/kpi-drawer.tsx:45,57` | 4c-5 |
| 11 variants de badge "tint + texto saturado" sem AA no claro | `ui/badge.tsx:21-32` | 4c-1 |
| `DialogContent`/`AlertDialogContent` com `bg-surface` hardcoded | `ui/dialog.tsx:62`, `ui/alert-dialog.tsx:59` | 4c-1 |
| Hooks de portal + `className="edp"` em 18 portais | `use-*-portal-theme.ts` e call sites | 4c-2..4c-5 |
| `.edp-rule` morta; `select.edp-field[multiple]` nunca casa; `.edp-stats-row` órfã | `app.css:260`, `app.css:310`, `explorador/kpis.tsx:9` | 4c-fim |
| `.edp *` com `box-sizing` redundante com o preflight | `app.css:237` | 4c-fim |
| `@custom-variant dark` inerte — classe `.dark` não existe no DOM | `app.css:8` | 4c-fim |
| `.carteira-table`/`.carteira-sync-dot` usadas dentro do Input | `input/logs.tsx`, `input-section.tsx:88` | 4c-3 |

---

## Critérios de aceite do lote

- [ ] `npx tsc -b` sem erro.
- [ ] `npm test` verde, incluindo a nova guarda de contraste.
- [ ] `npm run build` verde.
- [ ] `rg "carteira-scope" frontend/src/app.css` mostra o seletor **só** no bloco
      claro compartilhado — nenhum bloco de paleta duplicado.
- [ ] Nenhum hex legado (`#161e2b`, `#6b5ce6`, `#1f9fd6`, `#00a859`) em `app.css`,
      `settings-context.tsx`, `configuracoes.tsx` ou `index.html`.
- [ ] **Gate humano (não automatizável aqui):** screenshots de Carteira,
      Relatórios, Input, COFFEE e Verificar em claro e escuro. A Carteira precisa
      estar idêntica; as demais mudam só por causa do novo mapeamento de tokens.
      Validar ao menos um portal por seção (Select, Sheet, Dialog, Tooltip, toast).
