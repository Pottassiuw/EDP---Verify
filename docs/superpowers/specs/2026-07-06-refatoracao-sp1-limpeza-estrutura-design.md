# Refatoração — SP1: Limpeza + Estrutura de pastas — Design

**Data:** 2026-07-06
**Status:** Aprovado no brainstorm (aguardando revisão da spec)

## Contexto

O código cresceu e vai crescer mais. O repositório carrega legado morto
(painel Python antigo, cópias de módulos, docs duplicados), um modo demo que
não é mais usado, e um frontend meio feature-first (`coffee/` e `input/` são
features, mas a feature Verificar vive espalhada em `components/`). Além
disso há regras desatualizadas no CLAUDE.md (shadcn intocável, `app.css`
citado mas inexistente).

Esta é a primeira de **três refatorações sequenciais** (cada uma com seu
ciclo spec → plano → implementação):

| # | Sub-projeto | Escopo |
|---|---|---|
| **SP1 (esta spec)** | Limpeza + estrutura | Deletar código morto e modo demo; `features/` no frontend; fundir CSS em `app.css`; atualizar CLAUDE.md |
| SP2 | Tailwind + shadcn | Preflight global (fim do `.ui-reset`); ~385 `style={{}}` → utilities; componentes à mão → shadcn (`ConfirmModal`→`AlertDialog`, modal Gerar→`Dialog`, `LogDrawer`→`Sheet`, badges→`Badge`, selects nativos→`Select`, barras→`Progress`); `.edp-*` → `@layer components` |
| SP3 | Manual do desenvolvedor | `docs/dev/` pt-BR: negócio, arquitetura, frontend, backend (debounce/polling), guia de modificações, mapa de arquivos |

### Decisões globais (valem para os três sub-projetos)

- **shadcn é código nosso**: `src/components/ui/` passa a ser editável
  diretamente (é vendored de propósito). Composições maiores continuam em
  `src/components/branded/`. Novos componentes via `npx shadcn@latest add`.
  O CLAUDE.md será reescrito nesse ponto (dentro do SP1).
- **Tailwind = utilities + camada de componentes**: inline styles viram
  utilities; as classes `.edp-*` (design system da marca) permanecem como
  `@layer components`. Valores dinâmicos (ex.: width de progresso) podem
  continuar inline.
- **Manual em `docs/dev/` multi-arquivo, pt-BR.**

## Estado atual (referência)

- `Input/` (raiz, 7 arquivos) — painel Python antigo; **nenhum import**.
- `backend/new_input_modules/` (9 arquivos + `notas_departamento.db`
  commitado) — cópia morta; **nenhum import**.
- `backend/SQL.py` — **nenhum import**.
- `DESIGN-supabase.md` — byte-idêntico ao `DESIGN.md`.
- `backend/docs/superpowers/plans/2026-06-18-coffee-foundation.md` — cópia
  de arquivo que já existe em `docs/`.
- Modo demo: `frontend/src/data.ts` (`EDP_DEMO`), botão de demo no
  `upload-screen.tsx`, ramos `source === "demo"` no `App.tsx`
  (`loadDemo`, `persistDone`, `persistDup`, chaves `edp_demo_*`).
- CSS: `index.css` (@theme bridge) + `tokens.css` (tokens + primitivos
  `.edp-*`); CLAUDE.md cita `app.css` como source of truth, que não existe.
- Frontend: `components/` mistura feature Verificar (dashboard,
  upload-screen, kpi-drawer, duplicate-compare, shared) com shell
  (app-sidebar) e vendored (ui/, branded/).

## Objetivo

Repositório sem peso morto e com estrutura previsível: uma feature = uma
pasta; CSS com um source of truth; CLAUDE.md refletindo as regras reais.
**Zero mudança visual ou de comportamento**, com uma exceção deliberada: o
modo demo deixa de existir (triagem só via planilha/API).

## A) Deleções

1. `Input/` (raiz), `backend/new_input_modules/`, `backend/SQL.py`,
   `DESIGN-supabase.md`, `backend/docs/` — `git rm -r`.
2. **Modo demo**: remover `frontend/src/data.ts`; em `App.tsx` remover
   `loadDemo`, `persistDone`, `persistDup`, o tipo/ramos `source === "demo"`
   e as chaves `edp_demo_*`; em `upload-screen.tsx` remover o botão/fluxo de
   demonstração; simplificar `Source` em `types.ts` (fica só `"api"`) e as
   props derivadas (`onDemo` etc.). O chip "API/Demo" do cabeçalho do
   CoffeeHub simplifica de acordo.

## B) Estrutura alvo do frontend

```
frontend/src/
  app.css                  ← fusão de index.css + tokens.css (mesma ordem
                              de layers; só concatenação organizada)
  App.tsx  main.tsx  api.ts  types.ts
  features/
    verificar/    ← dashboard.tsx, upload-screen.tsx, kpi-drawer.tsx,
                     duplicate-compare.tsx, shared.tsx, useTriageData.ts
    coffee/       ← conteúdo de src/coffee/
    input/        ← conteúdo de src/input/
    configuracoes/← pages/configuracoes.tsx
  components/
    ui/           ← shadcn (agora editável)
    branded/      ← section.tsx
    app-sidebar.tsx
  context/  hooks/  lib/
```

- Movimentos com `git mv` (preserva história).
- Imports absolutos `@/features/...` nos arquivos movidos; o alias `@` já
  existe no Vite/tsconfig.
- `coffee-verificar.tsx` (wrapper da triagem no hub COFFEE) vai junto com a
  feature coffee e importa de `@/features/verificar`.
- Backend fica como está (`coffee_module`/`input_module` já são modulares).

## C) CLAUDE.md / docs

- Reescrever a seção shadcn: `ui/` editável direto, `branded/` para
  composições, add via CLI, preservar estrutura Radix/acessibilidade.
- Atualizar a seção de arquitetura com o layout `features/` real (o exemplo
  passa a espelhar o repositório).
- `app.css` passa a existir de verdade como source of truth (regra atual do
  CLAUDE.md deixa de estar defasada).
- README: corrigir referências a pastas removidas, sem expandir (manual é
  SP3).

## Ordem de execução e verificação

1. Deleções de legado (build + pytest verdes — nada referencia).
2. Remoção do modo demo (build + smoke da triagem via upload).
3. Fusão CSS → `app.css` (build + conferência visual rápida).
4. `git mv` para `features/`, um bloco por feature, corrigindo imports;
   `tsc -b` verde após cada bloco.
5. CLAUDE.md + README.
6. Smoke final: subir backend+frontend e navegar Verificar, COFFEE (todas as
   sub-abas) e Input (todas as sub-abas).

Commits pequenos por passo. Branch curta a partir de `develop`
(`refactor/sp1-limpeza-estrutura`), merge ao final.

## Tratamento de erros / riscos

- Import quebrado após move → `tsc -b` acusa; nenhum import dinâmico por
  string no projeto (React.lazy usa caminhos estáticos, atualizados junto).
- Remoção do demo toca handlers do `App.tsx` — revisão cuidadosa; o
  comportamento com `source === "api"` não muda.
- Sem testes de frontend: verificação é build + smoke manual (criar testes
  não é escopo do SP1).

## Testes

- `cd backend && .venv/Scripts/python.exe -m pytest -q` (suites existentes;
  nada de backend muda além das deleções sem referência).
- `cd frontend && npm run build` após cada passo.
- Smoke manual guiado (item 6 acima).

## Fora de escopo (SP2/SP3)

- Migração de inline styles para Tailwind; preflight global; troca de
  componentes por shadcn.
- Manual do desenvolvedor.
- Testes de frontend.
