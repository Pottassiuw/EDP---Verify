# SP2a: Preflight + inline-styles→utilities + `.edp-*`→`@layer components` — Design

**Date:** 2026-07-06
**Status:** Approved in brainstorm (aguardando revisão da spec)

## Contexto

SP1 (limpeza + estrutura, mergeada em `develop`) deixou o frontend organizado
em `features/`, mas o CSS ainda mistura três mecanismos: 384 `style={{}}`
inline, um sistema de classes `.edp-*` não-layered (que hoje vence qualquer
utility do Tailwind por regra de cascade), e um preflight global desligado
— substituído por um hack `.ui-reset` aplicado seletivamente em ~13 raízes
de tela. O DESIGN.md e o CLAUDE.md já pedem "Tailwind v4, source of truth
app.css, use design tokens only" — este é o segundo dos três sub-projetos
do roadmap de refatoração (SP1 já feito; SP2b troca componentes à mão por
shadcn; SP3 é o manual do desenvolvedor).

Esta spec cobre **SP2a apenas**: fundação CSS (bridge de tokens, preflight,
`.edp-*` em layer) + varredura de inline styles feature a feature. Troca de
componentes à mão por shadcn (`ConfirmModal`→`AlertDialog`, modal
Gerar→`Dialog`, `LogDrawer`→`Sheet`, badges→`Badge`, selects nativos→`Select`,
barras de progresso→`Progress`) fica para SP2b — muda comportamento e
acessibilidade, precisa de ciclo próprio.

## Estado atual (referência)

- `frontend/src/app.css`: preflight OFF; `@theme inline` só expõe os tokens
  shadcn (`--color-background`, `--color-card` etc.), nenhum token EDP
  (`--text-mute`, `--line`, `--tint-green` etc.) é utility hoje.
- `.edp-*` (linhas ~219–335 de `app.css`): unlayered — vence qualquer
  utility Tailwind por regra de cascade (unlayered > layered).
- `.ui-reset` aplicado em ~13 raízes de tela (`configuracoes.tsx`,
  `coffee-gerar-modal.tsx`, `input/ramal.tsx`, `input/settings.tsx`,
  `coffee-hub.tsx`, `dashboard.tsx` ×3, `input/manage.tsx`,
  `input/input-section.tsx`, `dashboard.tsx` internos via
  `duplicate-compare`/`upload-screen`); todo o resto da árvore usa apenas o
  reset escopado a `[data-sidebar="sidebar"]`.
- 384 `style={{}}` distribuídos por `features/verificar/` (13 arquivos),
  `features/coffee/` (15 arquivos), `features/input/` (20 arquivos):

  | Feature | Arquivos com style={{}} | Ocorrências (aprox.) |
  |---|---|---|
  | `features/verificar/` | dashboard.tsx, upload-screen.tsx, kpi-drawer.tsx, duplicate-compare.tsx, shared.tsx | ~121 |
  | `features/coffee/` | coffee-log-table.tsx, coffee-gerar-modal.tsx, coffee-logs.tsx, coffee-pendentes.tsx, coffee-geradas.tsx, coffee-abrir.tsx, coffee-notas-table.tsx, coffee-hub.tsx, coffee-corrigidas.tsx, confirm-modal.tsx, coffee-log-drawer.tsx, coffee-verificar.tsx | ~146 |
  | `features/input/` | ramal.tsx, manage.tsx, settings.tsx, notes-table.tsx, input-section.tsx, hierarquia-card.tsx, filters.tsx, reports.tsx, logs.tsx, overview.tsx | ~117 |

## Objetivo

`app.css` com bridge completo (todo token EDP vira utility real), preflight
global ligado (fim do hack `.ui-reset`), `.edp-*` em `@layer components`
(utilities voltam a vencer quando combinadas na mesma tag), e os `style={{}}`
estáticos convertidos para className Tailwind — feature por feature.
**Zero mudança visual pretendida**; a exceção de verificação é que, sem
extensão de browser disponível nesta sessão, a validação é build + revisão
de código, não clique-a-clique real (mesma limitação já registrada no SP1).

## A) Fundação CSS (`app.css`) — tarefa única, antes de qualquer sweep

1. **Bridge de tokens**: estender `@theme inline` com todo token de cor
   (`--color-bg`, `--color-bg-2`, `--color-surface`, `--color-surface-2`,
   `--color-surface-3`, `--color-line`, `--color-line-2`, `--color-text`,
   `--color-text-dim`, `--color-text-mute`, `--color-green`, `--color-green-2`,
   `--color-blue`, `--color-indigo`, `--color-amber`, `--color-red`,
   `--color-accent`, `--color-accent-2`, `--color-accent-tint`,
   `--color-tint-green`, `--color-tint-blue`, `--color-tint-indigo`,
   `--color-tint-amber`, `--color-tint-red`), radii prefixados
   (`--radius-edp-sm`, `--radius-edp`, `--radius-edp-md`, `--radius-edp-lg`
   ← `--r-sm/--r/--r-md/--r-lg`, para não colidir com `--radius-sm/md/lg`
   do shadcn) e tracking (`--tracking-display`, `--tracking-tight`,
   `--tracking-label` — já literalmente nomeados assim, só precisam entrar
   no bridge). **Exceção deliberada**: `--pad`, `--gap`, `--row-py`,
   `--tile-py` não entram no bridge — são reativos a
   `.edp[data-density="compact"]`; virar Tailwind spacing scale estática
   quebraria essa alternância em runtime. Onde usados, seguem como estão
   (inline ou `p-[var(--pad)]` arbitrary).
2. **Preflight global**: adicionar
   `@import "tailwindcss/preflight.css" layer(base);` após os imports
   existentes. Remover o bloco `@layer base { html,body{margin:0}
   :where([data-sidebar="sidebar"], .ui-reset) * {...} }` (preflight
   cobre isso globalmente agora). Manter o override unlayered do
   `border-right-width:0` do sidebar-container e o bloco do Sonner —
   nenhum dos dois depende do reset escopado.
3. **Remoção do `.ui-reset`**: apagar a className `"ui-reset"` (e variações
   como `"ui-reset edp-page"`) dos ~13 arquivos que a usam — vira no-op com
   preflight global.
4. **Varredura de risco pré-preflight**: `grep` por `<ul`, `<ol`, `<li`,
   `<button` (cru, fora de `@/components/ui/button`), `<h1>`–`<h6>` fora
   das telas que já tinham `.ui-reset`. Cada ocorrência entra no relatório
   da task com uma linha: arquivo, elemento, se depende de margin/list-style/
   appearance nativo (revisão de código, não visual).
5. **`.edp-*` em `@layer components`**: envolver o bloco de regras
   (`.edp-eyebrow` até `.edp-table`, hoje unlayered) em
   `@layer components { ... }`. Sem mudança de seletor.

## B) Sweep de inline styles — uma tarefa por feature

Ordem: `verificar/` → `coffee/` → `input/` (menor para maior, para validar
o padrão de conversão antes dos arquivos mais densos).

Para cada arquivo: todo `style={{...}}` com valores estáticos (padding,
gap, cor fixa, border, font, border-radius, display/flex) vira className
Tailwind usando os tokens agora registrados (`bg-surface`,
`text-text-mute`, `border-line`, `rounded-edp-md`, `gap-[Npx]` quando não
há token de spacing correspondente, etc.). Fica inline apenas o que é
genuinamente dinâmico:

- valores calculados em runtime (`width: pct + '%'`, offsets de gráfico)
- cor condicional por dado (`color: STATUS_COR[status]`, mapas de cor por
  classificação)
- qualquer `style` que dependeria de gerar uma className por combinação
  (explosão combinatória)

Isso é prática normal em bases Tailwind — não é considerado "sobrou
trabalho", é o esperado.

**Interface entre as tarefas**: a tarefa da Fundação (A) precisa completar
e ter o build verde antes de qualquer tarefa de sweep (B) começar — os
sweeps usam nomes de utility que só existem depois do bridge estendido.
As três tarefas de sweep (verificar/coffee/input) são independentes entre
si (não compartilham arquivo), podem ser feitas em qualquer ordem relativa,
mas a ordem proposta (menor→maior) reduz risco.

## Tratamento de erros / riscos

- Preflight pode revelar dependências ocultas em margin/list-style não
  documentadas — mitigado pela varredura de risco (A.4) antes da remoção
  do hack.
- Sem browser real: todo o SP2a é verificado por `tsc -b` + `vite build` +
  revisão de diff, não clique-a-clique. Mesma ressalva do SP1 carrega para
  cá — o usuário deve validar visualmente (luz/escuro, cada tela) antes de
  confiar em produção.
- Conflito de nome de token: `--radius-edp-*` usa prefixo para não colidir
  com `--radius-sm/md/lg` já usados pelo shadcn (mapeados de `--radius`,
  não de `--r-sm/--r/--r-md/--r-lg`) — ambos os sistemas de radius
  continuam coexistindo, sem substituição um pelo outro nesta fase.

## Testes

- `cd backend && .venv/Scripts/python.exe -m pytest -q` — não deve haver
  regressão (SP2a não toca backend).
- `cd frontend && npm run build` após cada tarefa (fundação e cada sweep).
- Revisão de diff visual (leitura do CSS gerado / classNames) como proxy
  para verificação visual real, documentada como limitação.

## Fora de escopo (SP2b / SP3)

- Troca de `ConfirmModal`/modal Gerar/`LogDrawer`/badges/selects
  nativos/barras de progresso por componentes shadcn.
- Qualquer mudança de comportamento ou acessibilidade de componente.
- Manual do desenvolvedor (SP3).
