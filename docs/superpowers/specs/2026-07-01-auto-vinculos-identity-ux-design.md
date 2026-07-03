# Auto-Vínculos, Identity e UX Fixes — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminar fricção de identidade de usuário, tornar o Detetive de Vínculos automático, mover hierarquia para Visão Geral, e corrigir a coluna de índice do DataGrid.

**Architecture:** Backend expõe `/me` para auto-detectar usuário do SO. Frontend auto-inicializa identidade no mount. Hook dedicado `use-auto-vinculos` aplica Nota_Mae silenciosamente quando dados carregam. IdentityModal deletado.

**Tech Stack:** FastAPI (Python), React 18, TypeScript, React Query, Sonner (toasts), react-datasheet-grid.

## Global Constraints

- Nunca usar `any` — prefer `unknown` ou tipos explícitos
- Sem comentários desnecessários — apenas WHY não-óbvio
- Sem abstrações especulativas — mínimo necessário
- Seguir feature-first: código de input fica em `frontend/src/input/`
- Build deve passar sem erros TS antes de cada commit
- Backend em `backend/input_module/`

---

## Mudança 1: Gutter column width no DataGrid

**Arquivo:** `frontend/src/input/data-grid.tsx`

**Problema:** Coluna de numeração de linhas (gutter) é 40px por padrão. Números de 5 dígitos (ex: 16244) ficam cortados.

**Fix:** Passar `gutterColumn={{ basis: 70, grow: 0 }}` para `DataSheetGrid`.

---

## Mudança 2: Auto-identity — username do SO

**Backend:** `GET /api/input/me`
- Retorna `{ "usuario": str }` onde `usuario = os.environ.get("USERNAME") or os.environ.get("USER") or "sistema"`
- Windows usa `USERNAME`, Linux/Mac usa `USER`
- Endpoint público (sem `Depends(usuario_atual)`)

**Frontend `api.ts`:** Adicionar `me: () => req<{ usuario: string }>('/me')`

**Frontend `input-section.tsx`:** `useEffect` no mount:
```ts
useEffect(() => {
  if (!getUsuario()) {
    InputApi.me().then(({ usuario }) => setUsuario(usuario)).catch(() => {});
  }
}, []);
```

**Deletar:** `frontend/src/input/identity-modal.tsx`

**Limpar `acaoPendente` de:**
- `frontend/src/input/overview.tsx` — remover state + IdentityModal JSX
- `frontend/src/input/manage.tsx` — remover state + IdentityModal JSX + import
- `frontend/src/input/ramal.tsx` — remover state + IdentityModal JSX + import

**Impacto em escrita:** Zero. `escrita()` em `api.ts` já lê `getUsuario()` do localStorage e envia `X-User`. Com auto-init, o header sempre estará presente.

---

## Mudança 3: Detetive automático com status line

**Arquivo novo:** `frontend/src/input/use-auto-vinculos.ts`

Hook `useAutoVinculos(registros: NotaInput[])`:
1. `useEffect` dispara quando `registros` muda (identidade de referência, via React Query)
2. Chama `varrerVinculos(registros)` — função pura existente em `overview.tsx` (mover para `lib.ts` ou exportar de `overview.tsx`)
3. Se `sugestoes.length === 0`: atualiza status "Nenhum vínculo pendente" sem fazer request
4. Se `sugestoes.length > 0`: chama `InputApi.vincularHierarquia(payload)`, depois `invalidateQueries`
5. Retorna `{ status: VinculoStatus | null }` onde `VinculoStatus = { atualizadas: number; hora: string }`
6. Loop infinito prevenido: após aplicar vínculos, novas notas terão `Nota_Mae !== '-'` → `varrerVinculos` retorna zero → effect não chama API

**`overview.tsx`:**
- Importar e chamar `useAutoVinculos(dados.registros)`
- Remover `varrerVinculos` de `overview.tsx` (mover para `lib.ts`)
- Remover o Card/button de detetive
- Adicionar status line abaixo do DataGrid:
  ```
  🔗 Última varredura: 3 vínculos Nota_Mae aplicados às 14:32  (se atualizadas > 0)
  ✓ Nenhum vínculo pendente                                     (se atualizadas === 0)
  ```

---

## Mudança 4: Hierarquia manual — Visão Geral

**Remove de:** `frontend/src/input/ramal.tsx` — modo `hierarquia` inteiro (`ModoRamal` passa de 7 para 6 valores)

**Adiciona em:** `frontend/src/input/overview.tsx` — Card colapsável após o status do detetive

Comportamento do card de hierarquia manual:
- Input: número da Nota Mãe (digita e confirma com Enter ou botão "Buscar")
- Ao buscar: chama `InputApi.obterHierarquia(numero)` → exibe `{ nota_mae, filhas }`
- Lista as filhas atuais + lista de orphans do mesmo Conjunto disponíveis para adicionar
- Checkboxes nas orphans candidatas
- Botão "Vincular selecionadas" → `InputApi.vincularHierarquia({ [mae]: [filhaSelecionadas] })`
- Após vincular: invalidate query + limpa seleção

**`ModoRamal`** passa a ser: `'visao' | 'rapida' | 'lote' | 'exclusao' | 'cadastro' | 'colagem'`

---

## Spec Self-Review

1. **Placeholder scan:** Nenhum TBD. Todas as assinaturas explícitas.
2. **Consistência interna:** `varrerVinculos` é movida para `lib.ts` — tanto `use-auto-vinculos.ts` quanto `overview.tsx` importam de lá. Não há duplicação.
3. **Escopo:** 5 mudanças relacionadas por tema (identidade + vínculos + UX). Implementáveis em sequência num plano.
4. **Ambiguidade:** Status line — "Última varredura" aparece mesmo quando há zero sugestões? Sim: mostra "Nenhum vínculo pendente" para confirmar que o sistema rodou.
