# Design: Enviar Candidatas para a Fila COFFEE

**Date:** 2026-06-08
**Scope:** Botão "→ Fila COFFEE" no painel de duplicatas + botão rápido no item da fila de triagem.
**Approach:** localStorage bridge + navigate (Option A).

---

## Contexto

O `DuplicateCompare` já tem "☕ Abrir todas no COFFEE" (abre janelas imediatamente).
O `CoffeeSection` tem fila com tracking (aberta/pendente, modos bloco/links), lê `edp_coffee_ids` do localStorage na montagem.
A lacuna: não há como enviar candidatas para a fila sem abrir janelas agora.

---

## Mudanças

### 1. `App.tsx` — `sendToCoffeeQueue`

Nova função pública do componente `App`:

```typescript
function sendToCoffeeQueue(ids: string[]): void {
  const existing = JSON.parse(localStorage.getItem("edp_coffee_ids") ?? "[]") as string[];
  const valid = ids.filter((id) => /^\d{5,12}$/.test(id));
  const merged = [...new Set([...existing, ...valid])];
  localStorage.setItem("edp_coffee_ids", JSON.stringify(merged));
  setSection("coffee");
}
```

Passa para `<Dashboard onSendToCoffee={sendToCoffeeQueue}>`.

### 2. `DashboardProps` + `Dashboard`

Novo prop opcional: `onSendToCoffee?: (ids: string[]) => void`.

Dashboard repassa para `<Detail onSendToCoffee={onSendToCoffee}>`.

Também: no item da fila, se a nota tem `duplicates.length > 0` e `!isDup` (não resolvida), mostra um pequeno botão `→ ☕` que chama `onSendToCoffee(n.duplicates.map(d => d.id))`.

### 3. `DetailProps` + `Detail`

Novo prop opcional: `onSendToCoffee?: (ids: string[]) => void`.

Detail repassa para `<DuplicateCompare onSendToCoffee={onSendToCoffee}>`.

### 4. `DuplicateCompareProps` + `DuplicateCompare`

Novo prop opcional: `onSendToCoffee?: (ids: string[]) => void`.

Na barra de ação do topo, ao lado de "☕ Abrir todas no COFFEE":

```tsx
{onSendToCoffee && (
  <button className="edp-btn sm" onClick={() => onSendToCoffee(allIds)}>
    → Fila COFFEE
  </button>
)}
```

### 5. `CoffeeSection` — sem mudanças

Já lê `edp_coffee_ids` do localStorage na montagem (`useState(() => { return localStorage... })`).
Quando App muda `section` para `"coffee"`, CoffeeSection monta e pega os IDs atualizados.

---

## Fluxo completo

```
[DuplicateCompare] clica "→ Fila COFFEE"
  → onSendToCoffee(allIds)
  → App.sendToCoffeeQueue(ids)
    → merge no localStorage["edp_coffee_ids"]
    → setSection("coffee")
  → CoffeeSection monta, lê localStorage, mostra IDs na fila
```

```
[Queue row, nota com ⧉] clica "→ ☕"
  → onSendToCoffee(nota.duplicates.map(d => d.id))
  → mesmo fluxo acima
```

---

## Arquivo de mudanças

| Arquivo | Mudança |
|---|---|
| `src/App.tsx` | `sendToCoffeeQueue`; prop `onSendToCoffee` para Dashboard |
| `src/App.tsx` (Dashboard) | prop `onSendToCoffee`; botão `→ ☕` no item da fila |
| `src/App.tsx` (Detail) | prop `onSendToCoffee`; passa para DuplicateCompare |
| `src/components/duplicate-compare.tsx` | prop `onSendToCoffee`; botão "→ Fila COFFEE" |
| `src/types.ts` | `DuplicateCompareProps.onSendToCoffee?: (ids: string[]) => void` |
| `src/components/coffee-section.tsx` | sem mudanças |
