# SP2b: Hand-rolled components → shadcn — Design

**Date:** 2026-07-08
**Status:** Approved in brainstorm (aguardando revisão da spec)

## Contexto

SP1 (limpeza + estrutura) e SP2a (preflight + tailwind utilities) já foram
mergeados em `develop`. SP2a's spec explicitamente adiou para SP2b a troca
de 6 padrões de UI feitos à mão por primitivos shadcn — ganho de
acessibilidade (focus trap, ARIA, roving tabindex) e menos CSS/JS
reinventado, sem mudança de comportamento visado.

Levantamento atual (`frontend/src/components/ui/` já vendorizado):
`button, card, collapsible, input, label, select, separator, sheet,
sidebar, skeleton, switch, table, textarea, toggle-group, toggle,
tooltip`. Faltam: `dialog`, `alert-dialog`, `badge`, `progress` — serão
adicionados via `npx shadcn@latest add <nome>` (nunca copiados à mão).

## Objetivo

Trocar os 6 padrões abaixo por primitivos shadcn, preservando pixel a
pixel a aparência atual (cores, formas, largura/animação do drawer) via
customização direta dos arquivos em `src/components/ui/` (permitido por
CLAUDE.md) e variantes — não adotar o visual padrão do shadcn. Zero
mudança de API externa dos componentes trocados (mesmas props, mesmos
call sites), a menos que o próprio padrão exija (ex.: `AlertDialog` já
inclui focus trap que o `ConfirmModal` não tinha).

**Fora de escopo:** `features/input/reports.tsx:144`'s `<select multiple
size={4}>` (multi-select listbox) — fica nativo, já estilizado via
`.edp-field` desde SP2a; shadcn `Select` não cobre multi-select e
construir um componente novo é desproporcional para 1 campo. Manual do
desenvolvedor (SP3, próximo sub-projeto do roadmap).

## Tarefas (ordem: simples/mecânico → arriscado, cada uma com seu próprio
build-verify-commit)

### 1. LogDrawer → Sheet

`frontend/src/features/coffee/coffee-log-drawer.tsx` (66 linhas, 3 call
sites: `coffee-pendentes.tsx:215`, `coffee-geradas.tsx:157`,
`coffee-corrigidas.tsx:71`, todos `<LogDrawer notaPk={...} open
onClose={...} />`).

Shadcn `Sheet` já instalado (`src/components/ui/sheet.tsx`). Troca:
overlay fixo + painel fixo `w-[360px] h-[100vh]` + bloco `<style>` com
keyframes manuais de slide-in + listener manual de Escape → `<Sheet
open={open} onOpenChange={...}><SheetContent side="right"
className="w-[360px]">`. A animação de slide do Radix substitui os
keyframes manuais (remove o bloco `<style>` inline). Botão de fechar
`✕` custom → `SheetContent`'s built-in close (ou mantém o `✕` custom
dentro, se o visual built-in do shadcn divergir — decisão do
implementador, desde que o resultado visual seja idêntico ao atual).
Mesma assinatura de props (`notaPk`, `open`, `onClose`) — call sites não
mudam.

### 2. Badges → Badge

`frontend/src/features/verificar/shared.tsx`'s `PriorityChip` (usa
`.edp-prio`) e `StatusTag` (usa `.edp-tag`) — os dois componentes
compartilhados que cobrem os 8 call sites conhecidos (`shared.tsx:18,28,
35,41,46`; `dashboard.tsx:232,233,236,358`).

`npx shadcn@latest add badge`, depois customizar
`src/components/ui/badge.tsx` com variantes que reproduzem exatamente:
- `.edp-tag.ok/err/done/dup` (tint de fundo + cor de texto por tom,
  mono uppercase, `border-radius: 5px`)
- `.edp-prio.high/med/low/none` (tint + cor + borda por prioridade,
  `min-width: 26px`, mono)

`PriorityChip`/`StatusTag` passam a renderizar `<Badge variant="...">`
por dentro, mantendo suas próprias props externas (call sites em
`dashboard.tsx` não mudam). Depois que nenhum arquivo mais referenciar
`.edp-tag`/`.edp-prio`, remover esses blocos de `app.css` (dead code).

### 3. Progress → Progress

4 divs `style={{ width: pct + "%" }}` — `upload-screen.tsx:163`,
`kpi-drawer.tsx:66`, `coffee-abrir.tsx:160`, `coffee-pendentes.tsx:164`
(este último com cor condicional: verde quando concluído, accent
enquanto rodando).

`npx shadcn@latest add progress`, customizar
`src/components/ui/progress.tsx`'s indicator para aceitar a cor via
`className`/prop (não hardcoded), preservando a cor exata de cada call
site (accent nos 3 primeiros, verde/accent condicional no quarto).

### 4. Varredura de `<select>` nativo → Select

12 dos 13 `<select>` crus restantes (shadcn `Select` já instalado e já
usado em outras partes do app — estes são os que ainda faltam migrar):
`dashboard.tsx:134,138,142,146,150` (5), `coffee-logs.tsx:77,86,94` (3),
`input/filters.tsx:77,153` (2), `input/logs.tsx:50` (1),
`input/notes-table.tsx:138` (1).

Cada um vira `<Select>` seguindo o mesmo padrão já usado em outros
lugares do app (não inventar um padrão novo — replicar o existente).
`input/reports.tsx:144` fica nativo (fora de escopo, ver acima).

### 5. ConfirmModal → AlertDialog

`frontend/src/features/coffee/confirm-modal.tsx` (71 linhas, 3 call
sites: `coffee-geradas.tsx:160`, `coffee-pendentes.tsx:217,240`).

`npx shadcn@latest add alert-dialog`. Troca do overlay/dialog fixo +
listener manual de Escape + `autoFocus` manual pelo `AlertDialog` do
Radix (focus trap real, Escape/click-outside built-in). Preserva a API
externa: `open, title, message?, confirmLabel?, tone?: "default" |
"danger", requireJustification?, busy?, onConfirm(justificativa),
onCancel`. O textarea de justificativa e o estado `tone` (cor do botão
de confirmação: default vs. danger/vermelho) continuam iguais.

### 6. Gerar modal → Dialog (última — maior e mais arriscada)

`frontend/src/features/coffee/coffee-gerar-modal.tsx` (358 linhas, 1
call site: `coffee-geradas.tsx:149`).

`npx shadcn@latest add dialog`. Troca **apenas o chrome do modal**
(overlay fixo, posicionamento, listener manual de Escape, `role="dialog"`
manual) por `<Dialog open={open} onOpenChange={...}><DialogContent>`.
A lógica interna (query de notas, edição local, geração em lote com
polling) não é tocada — só a casca. Maior risco de regressão por ser o
arquivo mais complexo tocado nesta spec; feito por último, depois que os
5 padrões mais simples já validaram a abordagem de customização de
variantes shadcn.

## Tratamento de erros / riscos

- Instalar cada componente shadcn faltante via CLI antes da tarefa que o
  usa (não instalar todos de uma vez no início — cada tarefa instala o
  que precisa, mantendo o diff de cada tarefa autocontido).
- Re-rodar `add` em um componente já customizado sobrescreve edições —
  não se aplica aqui (todos os 4 componentes novos são instalados uma
  única vez, customizados uma única vez, dentro de sua própria tarefa).
- Sem browser real nesta sessão (mesma ressalva de SP1/SP2a): toda
  verificação é `tsc -b` + `vite build` + revisão de diff, não
  clique-a-clique. O ganho de acessibilidade (focus trap no
  AlertDialog/Dialog, roving tabindex herdado do Radix) é estrutural e
  não pode ser confirmado visualmente nesta sessão — o usuário deve
  testar navegação por teclado (Tab/Escape/Enter) nos modais/drawer
  trocados antes de confiar em produção.
- `coffee-gerar-modal.tsx` (tarefa 6) tem lógica de polling ativa
  enquanto o modal está aberto — confirmar que trocar o chrome não
  interrompe o ciclo de polling (o `useEffect`/`setInterval` que
  controla isso deve permanecer fora do que a tarefa toca).

## Testes

- `cd backend && .venv/Scripts/python.exe -m pytest -q` — não deve haver
  regressão (SP2b não toca backend).
- `cd frontend && npm run build` após cada uma das 6 tarefas.
- Revisão de diff (leitura do JSX resultante, das variantes shadcn
  customizadas) como proxy para verificação visual real — mesma
  limitação documentada em SP1/SP2a.

## Fora de escopo

- `features/input/reports.tsx`'s multi-select nativo.
- Manual do desenvolvedor (SP3).
- Qualquer novo padrão de UI não listado nas 6 tarefas acima.
