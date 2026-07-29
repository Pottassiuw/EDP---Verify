# Carteira de Notas — Fase 4c (Migração Visual Supabaze) — Spec

Data: 2026-07-29
Status: aprovado para planejamento (decisões confirmadas em 2026-07-29)
Base: design geral (`2026-07-22-carteira-de-notas-design.md`, §8 "O restante
do app migra depois (fase 4)"), [[design-md-supabaze-authoritative]],
`docs/dev/11-frontend-carteira.md` (armadilhas do `.carteira-scope`).

Terceira fatia da Convergência: migrar o resto do app da direção visual
legada (`app.css` `.edp`) para a Supabaze (DESIGN.md), que hoje só vale em
telas novas (Carteira). Elimina a inconsistência visual aceita nas Fases 1–3.

---

## 1. Problema

DESIGN.md (Supabaze) é a direção autoritativa; `app.css` (`.edp`) é legado a
migrar. Hoje só a Carteira aplica Supabaze (via `.carteira-scope`, 4 arquivos).
O restante — **61 arquivos** `.tsx` usam classes `edp-*` — segue no visual
legado, incluindo o **Relatórios recém-recomposto** (o codex reusou
`.edp-page`/`.edp-panel`/`.edp-stat`/`.edp-table` de propósito) e partes da
própria Carteira (Explorador, Mover, Divergências).

Distribuição da dívida (`rg -l "edp-" frontend/src --glob "*.tsx"`):
- `features/input` (10), `features/relatorios` (20),
  `features/verificar` (6), `features/coffee` (14), `features/carteira` (10)
  e `components/branded` (1). Explorador/Dashboard/Mover/Divergências ainda
  carregam resíduo `.edp` dentro da Carteira.

## 2. Decisões confirmadas

| Decisão | Escolha |
|---|---|
| Estratégia de escopo | Promover Supabaze a padrão global em `:root` desde a fundação 4c-0, com a ponte completa do shadcn. |
| Compatibilidade | Manter `.edp` como adaptador temporário para features ainda não migradas; remover `.carteira-scope` e o adaptador somente no lote final. |
| Ordem | `4c-0` fundação → `4c-1` Carteira → `4c-2` Relatórios → `4c-3` Input → `4c-4` COFFEE → `4c-5` Verificar → `4c-fim` limpeza. |
| Empacotamento | Lotes independentes e sequenciais. A Fase 4b é concluída antes da 4c; a 4c nunca vira um único commit. |
| Cores | Somente tokens de design. Toda cor legada vira token Supabaze equivalente; nenhum hex arbitrário novo. |
| Componentes | Onde `.edp-*` reimplementa um primitivo, usar `components/ui/`; composições maiores e reutilizáveis ficam em `components/branded/`. |
| Tema e densidade | Preservar `Sistema`/`Claro`/`Escuro`, os acentos configuráveis e `compact`/`cozy`. O claro segue o canvas branco autoritativo; o escuro traduz a mesma linguagem neutra/verde usando os tokens `canvas-night` do DESIGN.md, sem manter a antiga paleta índigo/ciano. |
| Limite funcional | A migração altera somente a pele. Comportamento, fluxo, conteúdo e acessibilidade permanecem iguais. |

## 3. Estado atual (armadilhas já mapeadas)

Do `docs/dev/11-frontend-carteira.md` (aprendidas na Fase 1b — **repetir na
migração**):
1. O bloco de tokens Supabaze precisa ficar **FORA de `@layer components`**
   — CSS sem layer sempre vence CSS em layer, independente de especificidade.
2. Precisa **redeclarar a ponte inteira do shadcn** (`--background`,
   `--foreground`, `--card`, `--popover`, …), não só os tokens crus
   (`--bg`/`--text`) — custom property herdada já resolveu no ancestral e não
   recalcula.
3. `useRelatoriosPortalTheme`/`useCarteira…` já lidam com portais Radix
   (Select/Sheet/Tooltip) que escapam do scope — ao globalizar os tokens,
   revisar se esses helpers ainda são necessários ou simplificam.

## 4. Escopo

**Entra:** migração visual, feature-a-feature, sem mudança de comportamento
— só troca de tokens/classes `.edp-*` → Supabaze (tokens globais +
`ui/`/`branded/`). Cada feature é um entregável isolado, auditável (build +
paridade visual antes/depois com screenshot real).

**NÃO entra:** mudança de layout/UX, novos componentes, refatoração de lógica.
Migração é de **pele**, não de esqueleto. Se uma tela precisa de redesign de
UX, isso é trabalho à parte (não 4c).

## 5. Arquitetura da migração

- **Passo 0 (fundação):** promover os tokens Supabaze de `.carteira-scope`
  para `:root` em `app.css`, respeitando as 3 armadilhas. `.edp` referencia
  esses tokens como camada de compatibilidade para as telas ainda legadas,
  sem manter uma segunda fonte de verdade. Como o App inteiro nasce dentro de
  `<div className="edp" data-theme data-density>`, a fundação também define
  os variantes Supabaze de tema/densidade nesse adaptador. No lote final, os
  atributos permanecem no container raiz mesmo após a classe `.edp` sair.
  Ponto de não-regressão: a Carteira (que já é Supabaze) deve ficar
  **idêntica** após a promoção.
- **Impacto deliberado da fundação:** a troca de tokens recolore todas as
  features já em `4c-0`; os lotes seguintes substituem a anatomia `.edp-*`.
  Por isso a fundação exige smoke visual de todas as seções e de pelo menos um
  portal crítico por seção, não apenas da Carteira.
- **Passo N (por feature):** para cada feature, substituir `edp-page`/
  `edp-panel`/`edp-stat`/`edp-table`/… pelos equivalentes
  `branded/section` (PageHeader/StatTile/SegTabs) + `ui/` (Table/Card/…) já
  usados na Carteira. Rodar build + comparar screenshot antes/depois.
- **Passo final:** quando
  `rg -n "edp-" frontend/src --glob "*.tsx"` não retornar ocorrências,
  remover as classes `.edp-*` órfãs de `app.css`, aposentar
  `.carteira-scope`, remover a classe raiz `.edp` e seu adaptador temporário.
  `data-theme` e `data-density` permanecem no container raiz. Helpers de
  portal só saem se não tiverem mais função e depois de validar Select, Sheet,
  Tooltip, Dialog e Sonner no lote correspondente.

## 6. Impacto nos módulos

| Módulo | Mudança |
|---|---|
| `app.css` | tokens Supabaze globais; classes `.edp-*` removidas ao final |
| features (todas) | classes `.edp-*` → `branded/`+`ui/` + tokens; sem mudança de lógica |
| Docs | `04-frontend-shared.md` (tokens globais), `11-frontend-carteira.md` (aposentar scope), docs por feature migrada |

## 7. Divisão em planos

Um plano e um commit revisável por lote, na ordem do §2:
- **4c-0:** globalizar tokens Supabaze, aceitar a recoloração controlada do app
  inteiro e executar smoke visual de todas as seções; Carteira deve permanecer
  idêntica.
- **4c-1:** Carteira (fechar resíduo Explorador/Mover/Divergências).
- **4c-2:** Relatórios (6 telas). **4c-3:** Input. **4c-4:** COFFEE.
  **4c-5:** Verificar.
- **4c-fim:** remover `.edp-*`, `.carteira-scope`, a classe raiz `.edp` e seu
  adaptador; preservar `data-theme`/`data-density`; atualizar docs.

Cada lote começa somente após o anterior passar pelos gates do §8. Não há
execução paralela entre lotes.

## 8. Critérios de aceite (por lote)

- Escopo confirmado como visual; lógica, conteúdo, navegação e ações
  permanecem inalterados.
- Build, vitest e tipagem verdes.
- Em `4c-0`, screenshots smoke de Carteira, Relatórios, Input, COFFEE e
  Verificar em claro e escuro; Carteira deve permanecer idêntica e as demais
  seções podem mudar apenas por causa do novo mapeamento de tokens.
- Paridade/upgrade visual validado com screenshot real (Puppeteer + Chrome,
  padrão das Fases 1b/2b/3b) contra o design Supabaze, incluindo os portais
  usados pela feature.
- Nenhuma cor arbitrária; só tokens (CLAUDE.md).
- Acessibilidade Radix preservada (CLAUDE.md).
- Manual da feature e `docs/dev/04-frontend-shared.md` atualizados no mesmo
  commit quando o lote alterar seu contrato visual compartilhado.
- Ao final: `rg -n "edp-" frontend/src --glob "*.tsx"` sem saída; `app.css`
  sem classes `.edp-*`, `.carteira-scope` ou adaptador raiz `.edp`; o
  container raiz continua expondo `data-theme` e `data-density`.

## 9. Riscos

- **Escala (61 arquivos):** fazer em lotes pequenos e auditáveis; nunca
  migrar tudo num commit. Cada lote reversível.
- **Blast radius da fundação global:** a recoloração acontece antes da troca
  de anatomia das features; mitigar com screenshots smoke de todas as seções,
  validação de portais e rollback isolado do lote 4c-0.
- **Regressão de portal Radix** (tema não desce no Select/Sheet/Tooltip):
  as 3 armadilhas do §3 são o guia; validar portais explicitamente.
- **Relatórios acabou de ser recomposto** — migrar cedo (4c-2) evita
  retrabalho, mas coordenar com qualquer trabalho em voo do codex nessa
  feature.
