# Componentes e infraestrutura compartilhada

## Configurações (features/configuracoes/)

`configuracoes.tsx` é a tela "Configurações" da sidebar: três `Card`
(Aparência, Exibição, Logs) que leem e escrevem em `useSettings()`
(`configuracoes.tsx:23`). Tema, densidade e cor de destaque (accent)
usam `ToggleGroup`/paleta de botões; "Mostrar KPIs" e "Habilitar logs
de Dev" usam `Switch`.

O estado central mora em `context/settings-context.tsx`: um único
objeto `Settings` (`theme`, `density`, `accent`, `showKpis`, `devLogs`,
`settings-context.tsx:4-10`) com valores padrão em `DEFAULTS`
(`settings-context.tsx:18-24`, tema `"system"`, densidade `"cozy"`).
`setSetting` (`settings-context.tsx:60-66`) faz merge imutável e grava
em `localStorage` sob a chave `edp_settings`
(`saveSettings`/`loadSettings`, `settings-context.tsx:26-38`) a cada
mudança — não é `usePersistedState` (que usa `sessionStorage` e serve
para estado efêmero de navegação, ver "Hooks compartilhados" abaixo);
`settings-context.tsx` implementa sua própria leitura/escrita porque
precisa persistir entre sessões (fecha o navegador, preferência
continua) e faz merge com `DEFAULTS` para tolerar chaves novas
adicionadas depois que o usuário já tinha algo salvo.

Tema "Sistema" é resolvido via `window.matchMedia("(prefers-color-scheme:
dark)")` (`getSystemTheme`, `settings-context.tsx:40-42`), com um
listener de mudança (`settings-context.tsx:50-55`) para acompanhar o
SO em tempo real; `resolvedTheme` (`settings-context.tsx:57-58`)
resolve `"system"` para `"dark"`/`"light"` e é o valor exposto pelo
contexto — nenhum consumidor downstream precisa saber sobre
`"system"`.

A aplicação de fato acontece em `App.tsx:201`: o elemento raiz recebe
`className="edp triage"` mais `data-theme={resolvedTheme}` e
`data-density={settings.density}`. Esses dois atributos são os
seletores que o sistema de tokens em `app.css` observa (`.edp[data-theme="light"]`,
`.edp[data-density="compact"]`) para trocar a paleta e a densidade de
toda a árvore sem re-render de componentes — é CSS puro reagindo a um
atributo do DOM. A cor de destaque (accent) não usa `data-*`: os três
valores do preset escolhido (cor sólida, cor secundária, tint)
viram variáveis inline `--accent`/`--accent-2`/`--accent-tint` no
mesmo elemento (`accentStyle`, `App.tsx:78-82`), sobrescrevendo os
valores padrão definidos em `app.css`.

## components/branded/

Hoje contém um único arquivo, `section.tsx`, com composições que
combinam primitivos de `components/ui/` com classes `.edp-*` do
sistema de tokens — exatamente a definição de CLAUDE.md ("compositions
built on top of ui/"). Quatro exports:

- **`PageHeader`** (`section.tsx:5-21`) — cabeçalho de seção: eyebrow
  técnico opcional + título + subtítulo + slot de ação à direita.
  Usa só classes `.edp-*` (`edp-head`, `edp-title` etc.), sem
  primitivo shadcn.
- **`StatTile`** (`section.tsx:24-34`) — tile de KPI (rótulo mono +
  número display tabular), também puro `.edp-*`.
- **`Banner`** (`section.tsx:37-42`) — banner de status inline
  (`ok`/`err`), `role="status"`, também puro `.edp-*`.
- **`SegTabs`** (`section.tsx:51-71`) — a única composição que
  efetivamente envolve um primitivo `ui/`: um `ToggleGroup` do shadcn
  com `className="edp-segtabs"`, que troca a pele padrão (caixa) por
  um sublinhado, preservando a acessibilidade Radix (roving tabindex,
  navegação por setas) do `ToggleGroup` por baixo. É o padrão de
  sub-navegação usado por `input-section.tsx` e pelo hub COFFEE
  (documentado em `02-frontend-coffee.md`/`03-frontend-input.md`).

## components/ui/ (shadcn)

Por decisão registrada em CLAUDE.md desde o SP1, `src/components/ui/`
é vendorizado mas é código do projeto — editável diretamente para
tematizar, redimensionar ou ajustar comportamento padrão de um
primitivo, em vez de mantido intocado como em outros projetos shadcn.

Dois componentes têm customização real, ambas adicionadas no SP2b
(`docs/superpowers/specs/2026-07-08-sp2b-shadcn-component-swaps-design.md`)
para reproduzir exatamente um padrão visual que antes era CSS/JSX
manual:

- **`badge.tsx`** — além das 6 variantes stock do CLI
  (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`),
  tem 8 variantes específicas do projeto: `tagOk`, `tagErr`, `tagDone`,
  `tagDup` (`badge.tsx:21-24`, substituem `.edp-tag.ok/err/done/dup`) e
  `prioHigh`, `prioMed`, `prioLow`, `prioNone` (`badge.tsx:25-28`,
  substituem `.edp-prio.high/med/low/none`). Cada variante reproduz
  pixel a pixel o tom/tint/formato do CSS manual anterior (mono
  uppercase para as `tag*`, `min-width: 26px` para as `prio*`) — a spec
  SP2b as descreve como reprodução exata dos antigos `.edp-tag`/`.edp-prio`
  para os 8 call sites conhecidos em `shared.tsx` e `dashboard.tsx`.
- **`progress.tsx`** — a prop `indicatorClassName`
  (`progress.tsx:9,25`) não existe no output padrão do CLI; foi
  adicionada no SP2b para que os 4 call sites de barra de progresso possam
  colorir o indicador via `className` em vez de cor hardcoded. Apenas um deles
  (`coffee-pendentes.tsx:164`) usa cor condicional (verde quando concluído vs. accent
  enquanto rodando); os outros três (`upload-screen.tsx`, `kpi-drawer.tsx`,
  `coffee-abrir.tsx`) usam uma cor fixa.

Os demais componentes lidos para esta doc — `select.tsx`, `sheet.tsx`,
`dialog.tsx`, `alert-dialog.tsx` — são majoritariamente stock: mesma
estrutura de sub-componentes, mesmas classes utilitárias e mesmos
`data-slot` que o `npx shadcn add` gera por padrão, sem variante ou
prop além do que o primitivo Radix já expõe. São consumidos como
vieram do CLI, com o wiring de call sites feito nas features (não
dentro do próprio arquivo `ui/`).

## Sistema de tokens (app.css)

O arquivo abre com a ordem de camadas do Tailwind v4
(`app.css:2`, `@layer theme, base, components, utilities;`) e os
imports de `theme.css`, `utilities.css`, `preflight.css` e
`tw-animate-css` (`app.css:3-6`). Essa ordem importa porque, na mesma
especificidade, **utilities sempre vence components** — é a regra que
motivou, no SP2a
(`docs/superpowers/specs/2026-07-06-sp2a-preflight-tailwind-utilities-design.md`),
mover o bloco `.edp-*` (antes unlayered, e por isso vencendo qualquer
utility Tailwind por regra de cascade) para dentro de `@layer
components` (`app.css:249-341`) — "sem mudança de seletor", só de
camada, para que utilities Tailwind aplicadas na mesma tag voltem a
vencer quando combinadas com uma classe `.edp-*`.

O bridge `@theme inline` (`app.css:12-75`) expõe as variáveis
semânticas definidas dentro de `.edp` (cores, radii, fontes, tracking)
como utilities reais do Tailwind (`bg-surface`, `text-text-mute`,
`rounded-edp-md` etc.) — sem o bridge, esses tokens só existiam como
CSS custom properties, inacessíveis a className. Os radii EDP são
prefixados (`--radius-edp-sm/--radius-edp/--radius-edp-md/--radius-edp-lg`,
mapeados de `--r-sm/--r/--r-md/--r-lg`) para não colidir com
`--radius-sm/md/lg` do shadcn, que continuam mapeados de `--radius`
(`var(--r)`) — os dois sistemas de radius coexistem sem um substituir
o outro.

**Exceção deliberada:** `--pad`, `--gap`, `--row-py` e `--tile-py`
(`app.css:154-158`) ficam fora do bridge. A spec SP2a é explícita
sobre o motivo: esses quatro tokens "são reativos a
`.edp[data-density="compact"]`" (`app.css:198-203` redefine os quatro
valores para a densidade compacta) — "virar Tailwind spacing scale
estática quebraria essa alternância em runtime". Onde usados, seguem
como estão: inline ou como arbitrary value (`p-[var(--pad)]`), nunca
como uma classe Tailwind gerada em build-time, porque uma classe assim
não teria como reagir à troca de `data-density` no cliente.

Preflight global (`@import "tailwindcss/preflight.css" layer(base);`,
`app.css:5`) foi ligado no SP2a e substituiu o hack `.ui-reset`
aplicado manualmente em ~13 raízes de tela — antes do SP2a, o restante
da árvore só tinha reset escopado a `[data-sidebar="sidebar"]`, então
qualquer tela nova precisava lembrar de aplicar `.ui-reset` para não
herdar margin/list-style/appearance nativos do browser. Com preflight
global, esse reset é automático em toda a árvore e o hack virou no-op
(removido dos ~13 arquivos que o usavam).

Dois blocos ficam deliberadamente **fora** de `@layer` (unlayered),
depois do bloco `.edp-*`:

- `[data-slot="sidebar-container"]` (`app.css:351-354`) zera a
  `border-right`/`border-left` do container fixo da sidebar shadcn —
  precisa vencer a utility `border-r` (que está em `@layer utilities`),
  e CSS sem layer sempre vence CSS com layer, então esse override
  precisa ficar fora de qualquer `@layer` para funcionar.
- O bloco do Sonner (`[data-sonner-toaster]`, `app.css:358-362`) mapeia
  as variáveis do toast aos tokens EDP; herda os tokens via `:root`
  porque o Sonner portaliza no `<body>`, fora do elemento `.edp`.

Por essa mesma razão de portal, `:root` recebe os mesmos tokens que
`.edp` (`app.css:91-92`, comentário em `app.css:86-90`): conteúdo
portalizado pelo Radix (tooltip, dropdown, sheet) renderiza fora de
`.edp`, direto no `<body>`, e precisa resolver as mesmas cores sem
depender do elemento `.edp[data-theme="light"]` estar como ancestral.

## Hooks compartilhados

- **`use-mobile.ts`** (`useIsMobile`) — hook usado pelo `Sidebar` do
  shadcn para saber se a viewport está abaixo de 768px
  (`MOBILE_BREAKPOINT`, `use-mobile.ts:3`), via `matchMedia` +
  listener de `change`. Retorna sempre um `boolean` (`!!isMobile`,
  `use-mobile.ts:18`), nunca `undefined`, mesmo no primeiro render
  antes do efeito rodar.
- **`use-persisted-state.ts`** (`usePersistedState<T>`) — `useState`
  genérico que hidrata de e grava em `sessionStorage`
  (`use-persisted-state.ts:3`), defensivo a falhas de `JSON.parse`/quota
  (`try/catch` silencioso em ambas as pontas). Diferente de
  `settings-context.tsx` (que usa `localStorage` e persiste entre
  sessões do navegador), este hook é para estado que deve sobreviver a
  reload de página mas não precisa sobreviver ao fechamento da aba —
  usado por `App.tsx` para lembrar a sub-aba ativa de COFFEE/Input
  (`edp_coffee_sub`, `edp_input_sub`, `App.tsx:75-76`).

## Pontos de atenção

- `configuracoes.tsx:69-84` — os botões de accent color são `<button>`
  cru com `style` inline calculando `outline`/`boxShadow` por preset;
  não usam nenhum primitivo `ui/` nem token de foco padrão
  (`focus-visible:ring-*`), então o indicador de foco por teclado
  desses três botões é só o outline nativo do browser, diferente de
  todo o resto da tela que usa `ToggleGroup`/`Switch` com foco
  consistente.
- `settings-context.tsx:32,37` — `loadSettings`/`saveSettings` engolem
  qualquer exceção de `localStorage` (`catch { /* ignore */ }`) sem
  logar nem avisar o usuário; se `localStorage` estiver indisponível
  (modo privado restrito, quota cheia), a preferência silenciosamente
  para de persistir e o usuário não tem indicação de que suas escolhas
  de tema/densidade não vão sobreviver a um reload.
- `app.css:198-203` — `--pad`/`--gap`/`--row-py`/
  `--tile-py` ficam fora do bridge `@theme inline` por design (ver
  seção acima), mas isso significa que qualquer novo componente que
  precise desses valores como className Tailwind não tem como — só
  `style={{ padding: "var(--pad)" }}` ou arbitrary value
  `p-[var(--pad)]`, uma exceção que precisa ser lembrada manualmente a
  cada novo uso, sem checagem em tempo de compilação.
- `docs/superpowers/specs/2026-07-08-sp2b-shadcn-component-swaps-design.md:30-34`
  registra que `features/input/reports.tsx:144`'s `<select multiple
  size={4}>` ficou deliberadamente fora da varredura de `<select>` →
  `Select` do SP2b (shadcn `Select` não cobre multi-select nativo) —
  é o único `<select>` nativo restante no app, estilizado via
  `.edp-field`.
- `frontend/src/components/branded/` tem hoje um único arquivo
  (`section.tsx`); o brief desta doc referenciava
  `components/section.tsx` (sem `branded/`) — caminho corrigido nesta
  doc para o real, `frontend/src/components/branded/section.tsx`.
