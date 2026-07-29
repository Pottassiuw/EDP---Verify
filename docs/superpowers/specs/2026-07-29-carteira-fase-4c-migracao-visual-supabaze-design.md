# Carteira de Notas — Fase 4c (Migração Visual Supabaze) — Spec

Data: 2026-07-29
Status: rascunho para brainstorm (decisões-chave marcadas "a confirmar")
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
O restante — **63 arquivos** `.tsx` usam classes `edp-*` — segue no visual
legado, incluindo o **Relatórios recém-recomposto** (o codex reusou
`.edp-page`/`.edp-panel`/`.edp-stat`/`.edp-table` de propósito) e partes da
própria Carteira (Explorador, Mover, Divergências).

Distribuição da dívida (`grep edp- **/*.tsx`):
- `features/input` (12), `features/relatorios/*` (~17 somando subpastas),
  `features/verificar` (6), `features/coffee/*` (~10), `features/carteira/*`
  (~11 — Explorador/Dashboard/Mover/Divergências ainda com resíduo `.edp`).

## 2. Decisões (a confirmar com o usuário)

| Decisão | Proposta (recomendada) | Alternativa |
|---|---|---|
| Estratégia de escopo | **Promover Supabaze a padrão global** (mover os tokens Supabaze para `:root` em `app.css`) e migrar feature-a-feature, aposentando o `.carteira-scope` no fim. | Manter escopos por feature (`.input-scope`, etc.) — mais isolado, mas multiplica a armadilha do scope |
| Ordem de migração | Por feature, guiada por risco/visibilidade: **1) Carteira (fechar resíduo)** → 2) Relatórios (acabou de mudar, alinhar) → 3) Input → 4) COFFEE → 5) Verificar | outra ordem |
| `app.css` `.edp` | Manter durante a transição; **remover só quando 0 arquivos referenciarem** (evita quebrar meio-migrado) | remover cedo (arriscado) |
| Cores | Só tokens de design (CLAUDE.md proíbe cor arbitrária). Toda cor `.edp` vira token Supabaze equivalente; nenhum hex novo. | — |
| shadcn | Onde `.edp-*` reimplementa um primitivo (tabela, painel, stat), trocar por `ui/`/`branded/` correspondente, não recriar. | manter `.edp` classes só re-tematizadas |

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
  para `:root`/`.edp` global em `app.css`, respeitando as 3 armadilhas.
  Ponto de não-regressão: a Carteira (que já é Supabaze) deve ficar
  **idêntica** após a promoção.
- **Passo N (por feature):** para cada feature, substituir `edp-page`/
  `edp-panel`/`edp-stat`/`edp-table`/… pelos equivalentes
  `branded/section` (PageHeader/StatTile/SegTabs) + `ui/` (Table/Card/…) já
  usados na Carteira. Rodar build + comparar screenshot antes/depois.
- **Passo final:** quando `grep edp- **/*.tsx` = 0, remover as classes
  `.edp-*` órfãs de `app.css` e aposentar `.carteira-scope`.

## 6. Impacto nos módulos

| Módulo | Mudança |
|---|---|
| `app.css` | tokens Supabaze globais; classes `.edp-*` removidas ao final |
| features (todas) | classes `.edp-*` → `branded/`+`ui/` + tokens; sem mudança de lógica |
| Docs | `04-frontend-shared.md` (tokens globais), `11-frontend-carteira.md` (aposentar scope), docs por feature migrada |

## 7. Divisão em planos (quando greenlit)

Um plano por lote, na ordem do §2:
- **4c-0:** globalizar tokens Supabaze (fundação) + validar Carteira idêntica.
- **4c-1:** Carteira (fechar resíduo Explorador/Mover/Divergências).
- **4c-2:** Relatórios (6 telas). **4c-3:** Input. **4c-4:** COFFEE.
  **4c-5:** Verificar.
- **4c-fim:** remover `.edp-*` e `.carteira-scope`; docs.

## 8. Critérios de aceite (por lote)

- Zero mudança de comportamento (só visual); build + vitest verdes.
- Paridade/upgrade visual validado com screenshot real (Puppeteer + Chrome,
  padrão das Fases 1b/2b/3b) contra o design Supabaze.
- Nenhuma cor arbitrária; só tokens (CLAUDE.md).
- Acessibilidade Radix preservada (CLAUDE.md).
- Ao final: `grep edp- **/*.tsx` = 0; `app.css` sem classes `.edp-*` órfãs.

## 9. Riscos

- **Escala (63 arquivos):** fazer em lotes pequenos e auditáveis; nunca
  migrar tudo num commit. Cada lote reversível.
- **Regressão de portal Radix** (tema não desce no Select/Sheet/Tooltip):
  as 3 armadilhas do §3 são o guia; validar portais explicitamente.
- **Relatórios acabou de ser recomposto** — migrar cedo (4c-2) evita
  retrabalho, mas coordenar com qualquer trabalho em voo do codex nessa
  feature.
