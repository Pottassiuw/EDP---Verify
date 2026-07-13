# SP3: Manual do Desenvolvedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write 8 developer-manual documents under `docs/dev/`, organized by feature/module, covering frontend and backend, in pt-BR, each ending with a factual "Pontos de atenção" section.

**Architecture:** Each task is independent (no shared files, no cross-task ordering dependency except that `07-fluxos-de-negocio.md` benefits from the other 7 already existing so it can link to them — written last for that reason, not a hard requirement). Each task's implementer reads the actual source files listed, writes the doc following the section structure given, and verifies every factual/numeric claim against the code before writing it down.

**Tech Stack:** N/A — this is documentation, not code. No build/test verification; verification is that every claim in the doc is traceable to a real file:line in the repo.

## Global Constraints

- **pt-BR**, matching the rest of the repo's docs/specs/plans.
- **Facts, not meta-commentary.** Describe what the code does and why (when a real reason is discoverable — commit message, code comment, or an existing spec), never a generic "this could be improved by X" as a factual statement. Improvement observations belong only in the "Pontos de atenção" section, and must be concrete (exact location + concrete problem), never speculative ("consider refactoring").
- **Every debounce/polling/timeout value must have a file:line citation.** Never state a timing value without pointing to where it's set in the code. A pre-extracted table of every such value found in this codebase is included in Task 8 below — use those exact values, don't re-derive or guess.
- **Don't duplicate existing specs.** Where a flow already has its own detailed doc (e.g. `docs/coffee/fluxo-transicao-notas.md` for the COFFEE generation rule), summarize in 2-4 sentences and link to it — don't reproduce its content.
- **No visual diagrams** (Mermaid, images) — text and tables only, per the design spec's explicit scope cut.
- **No API reference duplication** — FastAPI already auto-generates OpenAPI docs; don't write a manual endpoint-by-endpoint reference.
- Each task's doc must end with a "## Pontos de atenção" section: 3-6 items, each with an exact file:line and a concrete, specific observation (not a vague suggestion).

---

## Task 1: `docs/dev/00-overview.md`

**Files:**
- Create: `docs/dev/00-overview.md`

**Interfaces:**
- Produces: the entry-point doc other docs (Tasks 2-8) can link back to for architecture/stack context — use the exact heading `## Arquitetura` and `## Stack` so later docs can link `[Arquitetura](00-overview.md#arquitetura)`.

- [ ] **Step 1: Read the source material**

Read (don't skim — this task's content depends on getting the real reasoning right, not inventing generic justifications):
- `CLAUDE.md` (root) — full file, this is the governing engineering-rules doc.
- `README.md` (root) — current project description and structure diagram.
- `frontend/src/App.tsx` — top-level component, how the 4 features + sidebar wire together.
- `frontend/src/components/app-sidebar.tsx` — navigation structure.
- `backend/main.py` — how the FastAPI app assembles `coffee_module`/`input_module` routers.
- `docs/superpowers/specs/2026-07-06-refatoracao-sp1-limpeza-estrutura-design.md` — the SP1 spec that established the `features/` architecture; use this for the REAL reasoning behind the feature-first structure (not a generic "feature-first is good practice" statement).

- [ ] **Step 2: Write `docs/dev/00-overview.md`**

Structure (exact headings):

```markdown
# Manual do Desenvolvedor — Visão Geral

## O que é este projeto
[2-4 frases: o que o EDP Verify faz, para quem, os 3 módulos principais
(Verificar, COFFEE, Input) e como se relacionam no fluxo de trabalho do
usuário.]

## Arquitetura
[Feature-first: features/{verificar,coffee,input,configuracoes} +
components/{ui,branded} global. Explicar a regra "lógica de negócio
dentro de features/, componentes globais só se forem genéricos" —
citar CLAUDE.md. Mencionar que essa estrutura veio do SP1 (linkar o
spec) e por que (o estado anterior, antes do SP1, tinha código
espalhado — usar o que o spec SP1 realmente documentou como motivação,
não invente).]

## Stack
### Frontend
[React 18, TypeScript, Vite, Tailwind v4, Radix UI via shadcn
(components/ui/, editável — linkar para 04-frontend-shared.md), React
Query, Lucide, Sonner. Para cada um, 1 frase do porquê NESTE projeto
especificamente, se houver uma razão real encontrada (ex.: Tailwind v4
+ preflight global foi decisão do SP2a; shadcn é editável por decisão
explícita registrada no CLAUDE.md).]

### Backend
[FastAPI, Python, Pandas, OpenPyXL, httpx. 1 frase cada, com motivo
real quando houver (ex.: Pandas para cruzamento de bases IW28/IW38/
IW66, cache SQLite substituindo leitura direta de Excel — mencionar
que isso é detalhado em 06-backend-input-module.md).]

## Como rodar localmente
[Comandos reais extraídos de package.json/requirements.txt/README —
não invente comandos. cd frontend && npm install && npm run dev; cd
backend && pip install -r requirements.txt && (comando real de start,
verificar main.py/README para o comando uvicorn exato).]

## Mapa dos módulos
[Tabela: módulo | caminho | o que faz | doc detalhado (link para
01-07).]

## Pontos de atenção
[3-6 itens, cada um com arquivo:linha + observação concreta.]
```

- [ ] **Step 2: Self-check before finishing**

For every claim about "why" a technical choice was made, confirm it traces to something real (a CLAUDE.md rule, a spec file, a code comment) — if you can't find a real reason, state the fact without inventing a justification (e.g. "usa Sonner para toasts" without a fabricated "porque é leve e simples" unless that reasoning is actually documented somewhere).

- [ ] **Step 3: Commit**

```bash
git add docs/dev/00-overview.md
git commit -m "docs(dev): add developer manual overview

Architecture, stack, and local setup — entry point for the rest of
the developer manual (docs/dev/01-07)."
```

---

## Task 2: `docs/dev/01-frontend-verificar.md`

**Files:**
- Create: `docs/dev/01-frontend-verificar.md`

- [ ] **Step 1: Read the source material**

Read in full:
- `frontend/src/features/verificar/dashboard.tsx`
- `frontend/src/features/verificar/upload-screen.tsx`
- `frontend/src/features/verificar/kpi-drawer.tsx`
- `frontend/src/features/verificar/duplicate-compare.tsx`
- `frontend/src/features/verificar/shared.tsx`
- `frontend/src/hooks/useTriageData.ts` (if present under this path — check `features/verificar/` too, it may have moved there in SP1; search before assuming the path)

- [ ] **Step 2: Write `docs/dev/01-frontend-verificar.md`**

Structure (exact headings):

```markdown
# Módulo Verificar

## O que faz
[2-3 frases: triagem de notas, upload de planilha, detecção de
duplicatas, KPIs de conformidade.]

## Arquivos principais
[Tabela: arquivo | responsabilidade — um por arquivo lido no Step 1.]

## Fluxo de dados
[Como o upload alimenta o dashboard, como o hook de dados (useTriageData
ou equivalente) busca/mantém estado, como duplicate-compare e
kpi-drawer consomem esse estado.]

## Lógica de negócio notável
[PriorityChip's prioMeta() thresholds (p>=99 "none", p<=2 "high", p<=4
"med", else "low") — valores reais do código, não aproximados. Regras
de status (StatusTag: dup > done > ok/err, nessa ordem de precedência
— confirmar a ordem real lendo o componente). Qualquer outra regra de
negócio explícita no código desta feature.]

## Timings
[upload-screen.tsx's fake-progress setTimeout (220ms, linha real) — o
que ele simula e por quê existe (progress bar sem long-polling real do
upload). Qualquer outro debounce/timeout desta feature.]

## Pontos de atenção
[3-6 itens, cada um com arquivo:linha + observação concreta.]
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/01-frontend-verificar.md
git commit -m "docs(dev): add Verificar module developer doc"
```

---

## Task 3: `docs/dev/02-frontend-coffee.md`

**Files:**
- Create: `docs/dev/02-frontend-coffee.md`

- [ ] **Step 1: Read the source material**

Read in full:
- `frontend/src/features/coffee/coffee-hub.tsx`
- `frontend/src/features/coffee/coffee-gerar-modal.tsx`
- `frontend/src/features/coffee/coffee-pendentes.tsx`
- `frontend/src/features/coffee/coffee-geradas.tsx`
- `frontend/src/features/coffee/coffee-corrigidas.tsx`
- `frontend/src/features/coffee/coffee-abrir.tsx`
- `frontend/src/features/coffee/coffee-logs.tsx`
- `frontend/src/features/coffee/confirm-modal.tsx`
- `frontend/src/features/coffee/coffee-log-drawer.tsx`
- `frontend/src/features/coffee/coffee-verificar.tsx`
- `frontend/src/features/coffee/coffee-notas-table.tsx`
- `frontend/src/features/coffee/coffee-log-table.tsx`

Known exact timing values in this feature (already extracted — cite these, don't re-derive):
- `frontend/src/features/coffee/coffee-gerar-modal.tsx:162,166` — polling de status de uma consulta em lote, retry a cada `600ms` (`window.setTimeout(tick, 600)`), até 10 falhas consecutivas antes de desistir (`falhas >= 10` no mesmo bloco).
- `frontend/src/features/coffee/coffee-pendentes.tsx:87-111` — polling de status de job de busca em lote, a cada `2000ms` (`window.setInterval(..., 2000)`), até `job.estado === "concluido"`.
- `frontend/src/features/coffee/coffee-pendentes.tsx:103` — após concluir, o banner "Busca concluída" volta ao estado `idle` depois de `3000ms` (`setTimeout(() => setBuscaEstado("idle"), 3000)`).
- `frontend/src/features/coffee/coffee-logs.tsx:60` — quando o toggle "ao vivo" está ligado, refresh automático dos logs a cada `10_000ms` (`window.setInterval(refresh, 10_000)`).
- `frontend/src/api.ts:20` — ao abrir várias notas no COFFEE de uma vez, cada `window.open` é escalonado `250ms` depois do anterior (`i * 250`), pra não disparar o bloqueador de pop-up do navegador.

- [ ] **Step 2: Write `docs/dev/02-frontend-coffee.md`**

Structure (exact headings):

```markdown
# Módulo COFFEE

## O que faz
[2-3 frases: geração de notas no SAP via COFFEE, consulta de status,
correção de notas com erro, histórico de logs por passo.]

## Arquivos principais
[Tabela: arquivo | responsabilidade — um por arquivo lido no Step 1.]

## Navegação e sub-abas
[Como coffee-hub.tsx organiza pendentes/geradas/corrigidas/logs, o que
cada aba mostra.]

## Fluxo: Gerar / Consultar notas
[coffee-gerar-modal.tsx: como o usuário cola IDs, o que "consultar"
faz (chama qual endpoint), o fluxo de edição local de "local" (campo
mascarado 3-2-resto — citar maskLocal/unmaskLocal), o fluxo de geração
em lote com polling (usar os valores exatos do Step 1).]

## Fluxo: Pendentes / Buscar
[coffee-pendentes.tsx: o job de busca em lote, o polling (valores
exatos do Step 1), o ConfirmModal usado para justificativa antes de
uma ação — linkar para 04-frontend-shared.md se ConfirmModal/AlertDialog
for documentado lá, ou descrever aqui se for específico desta feature.]

## Timings (tabela consolidada desta feature)
[Tabela: valor | onde | o que faz — os 5 valores do Step 1, mais
qualquer outro encontrado nos demais arquivos.]

## Pontos de atenção
[3-6 itens, cada um com arquivo:linha + observação concreta.]
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/02-frontend-coffee.md
git commit -m "docs(dev): add COFFEE module developer doc"
```

---

## Task 4: `docs/dev/03-frontend-input.md`

**Files:**
- Create: `docs/dev/03-frontend-input.md`

- [ ] **Step 1: Read the source material**

Read in full:
- `frontend/src/features/input/input-section.tsx`
- `frontend/src/features/input/overview.tsx`
- `frontend/src/features/input/manage.tsx`
- `frontend/src/features/input/ramal.tsx`
- `frontend/src/features/input/filters.tsx`
- `frontend/src/features/input/reports.tsx`
- `frontend/src/features/input/logs.tsx`
- `frontend/src/features/input/settings.tsx`
- `frontend/src/features/input/notes-table.tsx`
- `frontend/src/features/input/hierarquia-card.tsx`
- `frontend/src/features/input/data-grid.tsx`
- `frontend/src/features/input/use-input-data.ts`

Known exact timing value in this feature (already extracted — cite this, don't re-derive):
- `frontend/src/features/input/use-input-data.ts:29-35` — verificação de dados desatualizados: a cada `60_000ms` (`window.setInterval(..., 60_000)`), chama `InputApi.sync()` e compara `s.ultima_alteracao` com o valor conhecido; se mudou, marca `desatualizado = true` (usado para avisar o usuário que a base pode ter sido sincronizada em outra aba/sessão).

- [ ] **Step 2: Write `docs/dev/03-frontend-input.md`**

Structure (exact headings):

```markdown
# Módulo Input

## O que faz
[2-3 frases: visão consolidada de notas de manutenção (IW28/IW38/
IW66), edição em lote, filtros, relatórios, sincronização com SAP.]

## Arquivos principais
[Tabela: arquivo | responsabilidade — um por arquivo lido no Step 1.]

## Fluxo: Overview e sub-navegação
[input-section.tsx organiza overview/manage/ramal/filters/reports/
logs/settings — como a navegação entre sub-abas funciona.]

## Fluxo: Edição em lote (manage.tsx)
[Como a seleção múltipla + Select de status/prioridade em lote
funciona (produto do SP2b — pode linkar para 04-frontend-shared.md se
o Select customizado for documentado lá).]

## Fluxo: Filtros (filters.tsx)
[O padrão "adicionar campo de filtro" que reseta pra vazio depois de
cada escolha (produto do SP2b Task 4) — citar o arquivo:linha real.]

## Sincronização SAP
[O botão "Sincronizar SAP" em overview.tsx: o que ele chama
(InputApi.syncSap()), o que dispara no backend (linkar para
06-backend-input-module.md), e o polling de use-input-data.ts (valor
exato do Step 1) que detecta quando uma sincronização de OUTRA sessão
mudou os dados.]

## Timings (tabela consolidada desta feature)
[Tabela: valor | onde | o que faz.]

## Pontos de atenção
[3-6 itens, cada um com arquivo:linha + observação concreta.]
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/03-frontend-input.md
git commit -m "docs(dev): add Input module developer doc"
```

---

## Task 5: `docs/dev/04-frontend-shared.md`

**Files:**
- Create: `docs/dev/04-frontend-shared.md`

- [ ] **Step 1: Read the source material**

Read in full:
- `frontend/src/features/configuracoes/configuracoes.tsx`
- `frontend/src/components/branded/` (all files in this directory)
- `frontend/src/components/section.tsx`
- `frontend/src/components/app-sidebar.tsx`
- `frontend/src/context/settings-context.tsx`
- `frontend/src/hooks/use-mobile.ts`
- `frontend/src/hooks/use-persisted-state.ts`
- `frontend/src/app.css` (full file — the token system, `@theme inline` bridge, `.edp[data-density]`, `@layer` ordering)
- `frontend/src/lib/utils.ts`
- `frontend/src/components/ui/badge.tsx`, `progress.tsx`, `select.tsx`, `sheet.tsx`, `dialog.tsx`, `alert-dialog.tsx` — skim each, note which have project-specific customizations vs. stock shadcn output (badge.tsx and progress.tsx have real customizations from SP2b; note what specifically was added).
- `docs/superpowers/specs/2026-07-06-sp2a-preflight-tailwind-utilities-design.md` and `docs/superpowers/specs/2026-07-08-sp2b-shadcn-component-swaps-design.md` — for the REAL reasoning behind the token system and the shadcn customization approach (don't invent generic reasoning, use what these specs actually say).

- [ ] **Step 2: Write `docs/dev/04-frontend-shared.md`**

Structure (exact headings):

```markdown
# Componentes e infraestrutura compartilhada

## Configurações (features/configuracoes/)
[Tema (light/dark), densidade (cozy/compact), accent color — como
cada preferência é persistida (settings-context.tsx +
use-persisted-state.ts) e aplicada (atributos data-* no elemento
.edp).]

## components/branded/
[O que existe aqui, por que é diferente de components/ui/ — CLAUDE.md
define "compositions built on top of ui/" — listar as composições
reais encontradas e o que cada uma faz.]

## components/ui/ (shadcn)
[Regra do projeto: editável diretamente (decisão registrada em
CLAUDE.md desde o SP1). Quais componentes têm customização real além
do que `npx shadcn add` gera: badge.tsx (variantes tagOk/tagErr/
tagDone/tagDup/prioHigh/prioMed/prioLow/prioNone, adicionadas no
SP2b), progress.tsx (prop indicatorClassName, adicionada no SP2b).
Para os demais (select, sheet, dialog, alert-dialog, etc.), citar que
são majoritariamente stock, consumidos como vieram do CLI.]

## Sistema de tokens (app.css)
[O bridge @theme inline (tokens EDP → utilities Tailwind), por que
--pad/--gap/--row-py/--tile-py ficam de fora do bridge (reativos a
data-density), a ordem @layer theme,base,components,utilities e por
que importa (utilities sempre vence components na mesma
especificidade — a regra que motivou mover .edp-* para @layer
components no SP2a), preflight global (ligado no SP2a, substituiu o
hack .ui-reset).]

## Hooks compartilhados
[use-mobile.ts, use-persisted-state.ts — o que cada um faz.]

## Pontos de atenção
[3-6 itens, cada um com arquivo:linha + observação concreta.]
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/04-frontend-shared.md
git commit -m "docs(dev): add shared frontend infrastructure developer doc"
```

---

## Task 6: `docs/dev/05-backend-coffee-module.md`

**Files:**
- Create: `docs/dev/05-backend-coffee-module.md`

- [ ] **Step 1: Read the source material**

Read in full:
- `backend/coffee_module/client.py`
- `backend/coffee_module/jobs.py`
- `backend/coffee_module/classify.py`
- `backend/coffee_module/db.py`
- `backend/coffee_module/routes.py`
- `backend/coffee_module/config.py`
- `docs/coffee/fluxo-transicao-notas.md` — the existing detailed spec for the generation rule; summarize and link, don't reproduce.
- `backend/test_coffee_module.py` — skim test names/docstrings to confirm your understanding of the module's behavior matches what's actually tested (a good cross-check against inventing behavior).

- [ ] **Step 2: Write `docs/dev/05-backend-coffee-module.md`**

Structure (exact headings):

```markdown
# Backend: coffee_module

## O que faz
[2-3 frases: integração com o sistema COFFEE/SAP para geração de
notas, jobs em background, classificação de notas.]

## Arquivos principais
[Tabela: arquivo | responsabilidade — um por arquivo lido no Step 1.]

## client.py — integração externa
[Como a comunicação com COFFEE/SAP acontece — funções principais,
o que cada uma chama.]

## jobs.py — geração em background
[A regra de geração (resumir e linkar docs/coffee/fluxo-transicao-notas.md
— não reproduzir): nota precisa estar desarquivada antes do COFFEE
processar, então "forçar geração" sempre chama definir_sap +
desarquivar juntos, nunca só um dos dois. O que dispara um job, como o
status é consultado (rota que coffee-pendentes.tsx/coffee-gerar-modal.tsx
fazem polling).]

## classify.py
[O que classifica e com que critério.]

## db.py
[Schema/tabelas relevantes, se houver algo notável no acesso a dados.]

## routes.py
[Endpoints principais e o que cada um expõe pro frontend (mapear para
as chamadas do frontend documentadas em 02-frontend-coffee.md, sem
duplicar um Swagger completo).]

## Pontos de atenção
[3-6 itens, cada um com arquivo:linha + observação concreta.]
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/05-backend-coffee-module.md
git commit -m "docs(dev): add backend coffee_module developer doc"
```

---

## Task 7: `docs/dev/06-backend-input-module.md`

**Files:**
- Create: `docs/dev/06-backend-input-module.md`

- [ ] **Step 1: Read the source material**

Read in full:
- `backend/input_module/engine.py`
- `backend/input_module/db.py`
- `backend/input_module/routes.py`
- `backend/input_module/config.py`
- `backend/test_input_module.py` — skim test names/docstrings, same cross-check purpose as Task 6.

- [ ] **Step 2: Write `docs/dev/06-backend-input-module.md`**

Structure (exact headings):

```markdown
# Backend: input_module

## O que faz
[2-3 frases: cruzamento das bases IW28/IW38/IW66, cache local via
SQLite, exposição de dados consolidados/filtrados pro frontend.]

## Arquivos principais
[Tabela: arquivo | responsabilidade.]

## engine.py — cruzamento de bases
[Como IW28/IW38/IW66 são cruzadas (citar as funções reais, não
genérico), quais colunas/chaves usa para o merge.]

## Cache SQLite (db.py)
[salvar_base_dataframe / carregar_base_dataframe — o que substituíram
(leitura direta de Excel via pd.read_excel(config.CAMINHO_*), citar
que essa mudança veio de uma feature de sincronização SAP feita pelo
usuário, mergeada durante o SP1). Schema das tabelas relevantes se
houver algo notável.]

## routes.py
[Endpoints principais, incluindo o de sincronização SAP (o que
overview.tsx's "Sincronizar SAP" button dispara — linkar
03-frontend-input.md).]

## Pontos de atenção
[3-6 itens, cada um com arquivo:linha + observação concreta.]
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/06-backend-input-module.md
git commit -m "docs(dev): add backend input_module developer doc"
```

---

## Task 8: `docs/dev/07-fluxos-de-negocio.md` (última — referencia os outros 7)

**Files:**
- Create: `docs/dev/07-fluxos-de-negocio.md`

**Interfaces:**
- Consumes: all 7 previous docs should already exist (Tasks 1-7) so this doc's cross-links resolve — if run out of order, the links can be added as relative paths regardless (`./01-frontend-verificar.md` etc.) since the filenames are fixed by this plan, but writing this task last means the content of those docs is available to cross-check against, not just their filenames.

- [ ] **Step 1: Read the source material**

Read (in addition to everything already read in Tasks 1-7, if this task's implementer is a fresh subagent without that context):
- `docs/coffee/fluxo-transicao-notas.md` — full file, the COFFEE generation rule.
- `backend/coffee_module/jobs.py` — the `_rodar_geracao()` function specifically (the desarquivar-before-generate rule).
- `backend/coffee_module/routes.py` — the `/regerar` endpoint (parity with the batch job).
- `frontend/src/features/input/use-input-data.ts` and `frontend/src/features/input/overview.tsx` — the SAP sync trigger and staleness-detection flow.

Consolidated debounce/polling table (every timing value found in this codebase during plan authoring — use this table verbatim as the doc's own timing table, don't re-derive):

| Valor | Onde (arquivo:linha) | O que faz |
|---|---|---|
| 220ms | `frontend/src/features/verificar/upload-screen.tsx:23` | Progresso "falso" da barra de upload (`setPct(65)` depois de 220ms) — não é polling real, é feedback visual enquanto o upload real roda. |
| 250ms × índice | `frontend/src/api.ts:20` | Ao abrir N notas no COFFEE de uma vez, cada `window.open` é escalonado 250ms depois do anterior, para não disparar o bloqueador de pop-up do navegador. |
| 600ms | `frontend/src/features/coffee/coffee-gerar-modal.tsx:162,166` | Retry de polling de status durante geração em lote; desiste após 10 falhas consecutivas. |
| 2000ms (2s) | `frontend/src/features/coffee/coffee-pendentes.tsx:87-111` | Polling de status de um job de busca em lote, até `job.estado === "concluido"`. |
| 3000ms (3s) | `frontend/src/features/coffee/coffee-pendentes.tsx:103` | Banner "Busca concluída" volta ao estado `idle` automaticamente. |
| 10_000ms (10s) | `frontend/src/features/coffee/coffee-logs.tsx:60` | Refresh automático dos logs quando o toggle "ao vivo" está ligado. |
| 60_000ms (60s) | `frontend/src/features/input/use-input-data.ts:29-35` | Verifica se a base de dados do Input foi sincronizada em outra sessão (compara `ultima_alteracao`); se sim, marca `desatualizado = true`. |

- [ ] **Step 2: Write `docs/dev/07-fluxos-de-negocio.md`**

Structure (exact headings):

```markdown
# Fluxos de negócio (cross-cutting)

## Ciclo de vida de uma nota
[Verificar (triagem, upload, detecção de duplicata) → fila COFFEE
(pendente) → geração (COFFEE processa, precisa estar desarquivada) →
gerada/corrigida → nota real no SAP. Diagrama em texto (lista
numerada), não Mermaid.]

## Regra de geração COFFEE: desarquivar antes de gerar
[Resumo de 3-5 frases + link para docs/coffee/fluxo-transicao-notas.md
(não reproduzir o conteúdo). A regra central: forçar geração sempre
chama definir_sap(ident, SAP_PENDENTE) E desarquivar(ident) juntos,
nunca só um — se a nota está arquivada com SAP pendente, o COFFEE não
processa até desarquivar.]

## Sincronização com SAP
[De onde vêm os dados (extração real do SAP, disparada pelo botão
"Sincronizar SAP" em overview.tsx), o que muda no backend (cache
SQLite via salvar_base_dataframe, substituindo leitura direta de
Excel — mudança que veio de uma feature separada do usuário, mergeada
durante o SP1), como outras sessões descobrem que os dados mudaram
(polling de 60s em use-input-data.ts).]

## Debounce e polling — tabela consolidada
[A tabela completa do Step 1, reproduzida aqui.]

## Pontos de atenção
[3-6 itens — aqui pode ser mais cross-cutting: ex. múltiplos pontos
de polling independentes sem um mecanismo central de controle, se essa
observação for real ao ler o código.]
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/07-fluxos-de-negocio.md
git commit -m "docs(dev): add cross-cutting business-flows developer doc"
```

---

## Self-review notes (from plan authoring)

- **Spec coverage:** all 8 docs from the design spec have a task (1:1 mapping). The debounce/polling table (spec's explicit requirement: "extraídos do código, não inventados") was pre-extracted by grepping the actual codebase during plan authoring (7 real values found, each with file:line) and is handed to Task 8 verbatim, with the same values also cited inline in Tasks 2 and 4 where they're feature-specific.
- **Placeholder scan:** no TBD/"add appropriate"/vague instructions. Every task gives an exact file list to read and an exact heading structure to fill — the *content* within each heading is necessarily open (that's the nature of a documentation-writing task, not a code-writing task where exact diffs can be pre-specified), but the facts that must anchor that content (debounce values, the desarquivar rule, the SQLite cache migration, the shadcn customization list) are given directly wherever they were already known from this project's own history, rather than left for the implementer to guess or invent.
- **Duplication check:** Task 6 and Task 8 both touch the COFFEE generation rule — Task 6 documents it from the module's internal perspective (jobs.py/routes.py), Task 8 documents it from the cross-cutting business-flow perspective (nota lifecycle); both are instructed to summarize-and-link to `docs/coffee/fluxo-transicao-notas.md` rather than reproduce it, so they won't duplicate each other's full explanation, only cross-reference.
- **Ordering:** Task 8 is last because it benefits from the other 7 existing (for cross-links and to avoid re-deriving facts already established), but each task's file-reading list is self-contained enough that any task could technically run standalone if dispatched out of order.
