# Spec: COFFEE UI Polish — Tabelas shadcn + Botões limpos

**Data:** 2026-06-30
**Branch:** develop
**Escopo:** `coffee-notas-table.tsx` + sweep de botões em todas as páginas COFFEE

---

## Problema

1. `coffee-notas-table.tsx` injeta um bloco `<style>` em runtime com CSS hardcoded. Não obedece os tokens do tema, não é reutilizável via shadcn, e duplica esforço de manutenção.
2. Botões de ação nas páginas COFFEE (Pendentes, Geradas, Corrigidas) usam `variant="outline"` com inline style overrides (`style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}`). Inconsistente com o sistema shadcn.

## Fora do escopo

- `notes-table.tsx` (Input Gerenciar) — já usa shadcn Table, sem problema.
- Lógica de negócio COFFEE.
- `coffee-log-table.tsx` — timeline, não é uma data table.
- Qualquer nova feature.

---

## Design

### A: Substituição de `coffee-notas-table.tsx`

**Remover:**
- Constante `TABLE_STYLE` (string CSS multiline)
- `<style>{TABLE_STYLE}</style>` dentro do render
- Classes `.cnt-tbl`, `.cnt-wrap`, `.cnt-tbl th/td/tr`

**Adicionar:**
- Import: `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` de `@/components/ui/table`
- Componente interno `StatusBadge({ classificacao })` — 8 linhas, inline no arquivo — substitui `.cnt-tag`
- Wrapper da tabela com `overflow-auto` via className Tailwind

**Interface de props: inalterada.** Zero breaking changes para callers.

**Sticky header:** via `TableHead` com `sticky top-0 bg-background z-10` (classes Tailwind, não inline style).

**Hover row:** `TableRow` com `hover:bg-muted/50 transition-colors`.

**Checkbox select:** `TableHead`/`TableCell` com `w-9 text-center`.

---

### B: Sweep de botões COFFEE

Regra única aplicada a `coffee-pendentes.tsx`, `coffee-geradas.tsx`, `coffee-corrigidas.tsx`:

| Botão | Antes | Depois |
|---|---|---|
| Arquivar | `variant="outline" style={{color:"var(--red)"}}` | `variant="destructive" size="sm"` |
| Remover da fila | idem | `variant="destructive" size="sm"` |
| Logs / Detalhes | `variant="outline" style={{fontSize:12,padding:"4px 6px"}}` | `variant="ghost" size="sm"` |
| Abrir ☕ | `variant="coffee"` | sem mudança |
| Ações primárias | `variant="outline" style={{fontWeight:600}}` | `variant="outline" size="sm"` (remove style) |

---

## Arquivos afetados

| Arquivo | Tipo de mudança |
|---|---|
| `frontend/src/coffee/coffee-notas-table.tsx` | Rewrite (shadcn Table) |
| `frontend/src/coffee/coffee-pendentes.tsx` | Sweep botões |
| `frontend/src/coffee/coffee-geradas.tsx` | Sweep botões |
| `frontend/src/coffee/coffee-corrigidas.tsx` | Sweep botões |

---

## Critérios de conclusão

- `coffee-notas-table.tsx` sem `<style>` injetado
- Zero inline `style` overrides em botões nas páginas COFFEE
- Build sem erros TypeScript
- Visual verificado no browser (pendentes, geradas, corrigidas)
