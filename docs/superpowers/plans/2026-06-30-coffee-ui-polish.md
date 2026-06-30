# COFFEE UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir HTML/style injetado em `coffee-notas-table.tsx` por shadcn Table e remover todos inline style overrides de botões nas páginas COFFEE.

**Architecture:** Task 1 reescreve o componente de tabela isolado sem tocar callers. Task 2 faz sweep cirúrgico nos 3 callers (pendentes/geradas/corrigidas) trocando variantes dos botões. Dois commits, zero lógica alterada.

**Tech Stack:** React 18, TypeScript, shadcn/ui Table, shadcn/ui Button variants (destructive, ghost, outline, coffee)

## Global Constraints

- Branch: `develop`
- Tailwind sem preflight global — usar inline style para tokens `var(--)`, classes Tailwind para layout/spacing
- Shadcn components já instalados: `Table`, `Button` — sem novos pacotes
- Props interface de `CoffeeNotasTable` inalterada — zero breaking change
- Build deve passar: `npm run build` (TypeScript strict)
- Nenhuma lógica de negócio alterada

---

### Task 1: Reescrever `coffee-notas-table.tsx` com shadcn Table

**Files:**
- Modify: `frontend/src/coffee/coffee-notas-table.tsx`

**Interfaces:**
- Produz: `CoffeeNotasTable` com mesma assinatura de props — callers não mudam
- Produz: `formatRelativeTime` (reexportado — coffee-log-table importa isso)

- [ ] **Step 1: Verificar import de formatRelativeTime**

```bash
grep -r "formatRelativeTime" frontend/src --include="*.tsx" -l
```

Esperado: `coffee-log-table.tsx` importa de `./coffee-notas-table`. Confirmar antes de mexer.

- [ ] **Step 2: Substituir o arquivo completo**

Novo conteúdo de `frontend/src/coffee/coffee-notas-table.tsx`:

```tsx
import React from 'react';
import type { CoffeeNota } from './types';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const SAP_PENDENTE = 10000000;

// ponytail: sticky inline — var(--surface) não mapeado em Tailwind
const STICKY_TH: React.CSSProperties = {
  position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
  boxShadow: "inset 0 -1px 0 var(--line)",
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  gerada:     { background: "var(--tint-green)", color: "var(--green)" },
  corrigida:  { background: "rgba(31,159,214,0.14)", color: "#1f9fd6" },
  pendente:   { background: "var(--tint-amber)", color: "var(--amber)" },
  nao_gerada: { background: "rgba(148,163,184,0.16)", color: "#94a3b8" },
};

function StatusBadge({ classificacao }: { classificacao: string }): React.JSX.Element {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: ".03em",
      ...STATUS_STYLE[classificacao],
    }}>
      {classificacao}
    </span>
  );
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `ha ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `ha ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `ha ${days}d`;
  return d.toLocaleDateString("pt-BR");
}

interface CoffeeNotasTableProps {
  notas: CoffeeNota[];
  isLoading: boolean;
  emptyMessage?: string;
  actionColumn?: (nota: CoffeeNota) => React.ReactNode;
  selectable?: boolean;
  selectedPks?: Set<number>;
  onToggleSelect?: (pk: number) => void;
  onToggleAll?: () => void;
}

export function CoffeeNotasTable({
  notas, isLoading, emptyMessage, actionColumn,
  selectable, selectedPks, onToggleSelect, onToggleAll,
}: CoffeeNotasTableProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        Carregando notas...
      </div>
    );
  }

  if (notas.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontSize: 13, textAlign: "center", padding: 32 }}>
        {emptyMessage ?? "Nenhuma nota encontrada."}
      </div>
    );
  }

  const allSelected = notas.length > 0 && selectedPks?.size === notas.length;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 22px 24px" }}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b-2">
            {selectable && (
              <TableHead style={{ ...STICKY_TH, width: 36, textAlign: "center" }}>
                <input type="checkbox" aria-label="Selecionar todas"
                       checked={allSelected} onChange={() => onToggleAll?.()} />
              </TableHead>
            )}
            <TableHead style={STICKY_TH}>ID</TableHead>
            <TableHead style={STICKY_TH}>SAP</TableHead>
            <TableHead style={STICKY_TH}>Status</TableHead>
            <TableHead style={STICKY_TH}>Última busca</TableHead>
            {actionColumn && <TableHead style={STICKY_TH}>Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {notas.map((n) => (
            <TableRow key={n.pk}>
              {selectable && (
                <TableCell style={{ textAlign: "center" }}>
                  <input type="checkbox" aria-label={`Selecionar nota ${n.pk}`}
                         checked={selectedPks?.has(n.pk) ?? false}
                         onChange={() => onToggleSelect?.(n.pk)} />
                </TableCell>
              )}
              <TableCell>
                <span className="edp-mono" style={{ fontWeight: 600 }}>{n.pk}</span>
              </TableCell>
              <TableCell>
                <span className="edp-mono">{n.id_sap}</span>
                {n.id_sap === SAP_PENDENTE && (
                  <span style={{ marginLeft: 8 }}><StatusBadge classificacao="pendente" /></span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge classificacao={n.classificacao} />
              </TableCell>
              <TableCell style={{ color: "var(--text-mute)", fontSize: 12 }}>
                {n.buscado_em ? formatRelativeTime(n.buscado_em) : "—"}
              </TableCell>
              {actionColumn && (
                <TableCell>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {actionColumn(n)}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Esperado: zero erros TS. Se aparecer erro de prop em caller → o caller passou `arquivado` (já removido do backend) ou outra prop extinta — fixar o caller nessa task.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/coffee-notas-table.tsx
git commit -m "refactor(coffee): coffee-notas-table → shadcn Table, remove style injection"
```

---

### Task 2: Sweep botões nas páginas COFFEE

**Files:**
- Modify: `frontend/src/coffee/coffee-pendentes.tsx`
- Modify: `frontend/src/coffee/coffee-geradas.tsx`
- Modify: `frontend/src/coffee/coffee-corrigidas.tsx`

**Interfaces:**
- Nenhuma interface nova. Só troca de props em `<Button>`.

**Regra:**
| Papel do botão | variant antes | variant depois | size |
|---|---|---|---|
| Arquivar / Remover (destrutivo) | `outline` + style color red | `destructive` | `sm` |
| Logs / secundário | `outline` + style padding/font | `ghost` | `sm` |
| Ação primária (Gerar fila, Atualizar) | `outline` + style fontWeight | `outline` | `sm` |
| Abrir ☕ | `coffee` | `coffee` | sem mudança |

- [ ] **Step 1: `coffee-pendentes.tsx` — 3 botões**

Localizar e substituir:

```tsx
// ANTES (linha ~100) — botão principal
<Button variant="outline" size="sm" style={{ fontWeight: 600 }}
        disabled={buscaEstado === "rodando" || isLoading || notas.length === 0}
        onClick={iniciarBusca}>
  {buscaEstado === "rodando" ? "Buscando..." : "Atualizar notas"}
</Button>

// DEPOIS
<Button variant="outline" size="sm"
        disabled={buscaEstado === "rodando" || isLoading || notas.length === 0}
        onClick={iniciarBusca}>
  {buscaEstado === "rodando" ? "Buscando..." : "Atualizar notas"}
</Button>
```

```tsx
// ANTES (linha ~146) — Arquivar
<Button variant="outline" size="sm"
        onClick={() => setArquivarPk(nota.pk)}
        title="Arquivar nota" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
  Arquivar
</Button>

// DEPOIS
<Button variant="destructive" size="sm"
        onClick={() => setArquivarPk(nota.pk)}
        title="Arquivar nota">
  Arquivar
</Button>
```

```tsx
// ANTES (linha ~151) — Logs
<Button variant="outline" size="sm" onClick={() => setDrawerPk(nota.pk)}
        title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
  Logs
</Button>

// DEPOIS
<Button variant="ghost" size="sm" onClick={() => setDrawerPk(nota.pk)}
        title="Ver logs">
  Logs
</Button>
```

- [ ] **Step 2: `coffee-geradas.tsx` — 7 botões (inclui AbrirCoffeeBtn)**

```tsx
// ANTES (linha ~15) — AbrirCoffeeBtn inline style
function AbrirCoffeeBtn({ pk }: { pk: number }): React.JSX.Element {
  return (
    <Button asChild variant="coffee" size="sm" title="Abrir no COFFEE" style={{ fontSize: 12, padding: "4px 6px" }}>
      <a target="_blank" rel="noopener" href={coffeeUrl(String(pk))}>☕</a>
    </Button>
  );
}

// DEPOIS — remove inline style
function AbrirCoffeeBtn({ pk }: { pk: number }): React.JSX.Element {
  return (
    <Button asChild variant="coffee" size="sm" title="Abrir no COFFEE">
      <a target="_blank" rel="noopener" href={coffeeUrl(String(pk))}>☕</a>
    </Button>
  );
}
```

```tsx
// ANTES (linha ~87) — Gerar / Consultar
<Button variant="outline" size="sm" style={{ fontWeight: 600 }} onClick={() => abrirModal(undefined)}>
  Gerar / Consultar notas
</Button>

// DEPOIS
<Button variant="outline" size="sm" onClick={() => abrirModal(undefined)}>
  Gerar / Consultar notas
</Button>
```

```tsx
// ANTES (linha ~101) — Gerar fila
<Button variant="outline" size="sm" style={{ fontWeight: 600 }}
        onClick={() => abrirModal(aGerar.notas.map((n) => n.pk))}>
  Gerar fila ({aGerar.notas.length})
</Button>

// DEPOIS
<Button variant="outline" size="sm"
        onClick={() => abrirModal(aGerar.notas.map((n) => n.pk))}>
  Gerar fila ({aGerar.notas.length})
</Button>
```

```tsx
// ANTES (linha ~115) — Remover da fila (zona A gerar)
<Button variant="outline" size="sm"
        onClick={() => setPending({ kind: "remover", pk: nota.pk })}
        title="Remover da fila" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
  Remover
</Button>

// DEPOIS
<Button variant="destructive" size="sm"
        onClick={() => setPending({ kind: "remover", pk: nota.pk })}
        title="Remover da fila">
  Remover
</Button>
```

```tsx
// ANTES (linha ~120) — Logs (zona A gerar)
<Button variant="outline" size="sm" onClick={() => setDrawerPk(nota.pk)}
        title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
  Logs
</Button>

// DEPOIS
<Button variant="ghost" size="sm" onClick={() => setDrawerPk(nota.pk)}
        title="Ver logs">
  Logs
</Button>
```

```tsx
// ANTES (linha ~147) — Arquivar (zona Geradas)
<Button variant="outline" size="sm"
        onClick={() => setPending({ kind: "arquivar", pk: nota.pk })}
        title="Arquivar nota" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
  Arquivar
</Button>

// DEPOIS
<Button variant="destructive" size="sm"
        onClick={() => setPending({ kind: "arquivar", pk: nota.pk })}
        title="Arquivar nota">
  Arquivar
</Button>
```

```tsx
// ANTES (linha ~152) — Logs (zona Geradas)
<Button variant="outline" size="sm" onClick={() => setDrawerPk(nota.pk)}
        title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
  Logs
</Button>

// DEPOIS
<Button variant="ghost" size="sm" onClick={() => setDrawerPk(nota.pk)}
        title="Ver logs">
  Logs
</Button>
```

- [ ] **Step 3: `coffee-corrigidas.tsx` — 1 botão**

```tsx
// ANTES (linha ~38)
<Button variant="outline" size="sm" onClick={() => setDrawerPk(nota.pk)}
        title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
  Logs
</Button>

// DEPOIS
<Button variant="ghost" size="sm" onClick={() => setDrawerPk(nota.pk)}
        title="Ver logs">
  Logs
</Button>
```

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Esperado: zero erros TS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/coffee/coffee-pendentes.tsx \
        frontend/src/coffee/coffee-geradas.tsx \
        frontend/src/coffee/coffee-corrigidas.tsx
git commit -m "refactor(coffee): botoes — destructive/ghost, remove inline style overrides"
```

- [ ] **Step 6: Push**

```bash
git push
```
