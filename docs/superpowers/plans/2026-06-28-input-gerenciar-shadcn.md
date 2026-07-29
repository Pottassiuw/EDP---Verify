# Input — Redesenho do Gerenciar em shadcn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a casca visual da aba Gerenciar (`manage.tsx`) com componentes shadcn (ToggleGroup, Cards, Input/Select/Textarea/Label/Button), sem tocar em nenhuma lógica de negócio.

**Architecture:** Task 1 adiciona três primitivos shadcn que faltam (`select`, `textarea`, `label`) no estilo `data-slot`, com Radix do pacote unificado já instalado. Task 2 troca, região por região, os controles inline do `manage.tsx` pelos componentes shadcn e envolve os blocos de modo em `Card`s, preservando todos os handlers e estados.

**Tech Stack:** React 18 + TS + Vite; shadcn (`data-slot` + Radix unificado `radix-ui`). Sem test runner → check = `cd frontend && npm run build` + manual.

## Global Constraints

- **Só casca visual.** Nenhum handler/estado de negócio muda: `salvarRapida`, `aplicarLote`, `excluirSelecionadas`, `cadastrar`, `salvarColagem`, `desfazer`, `executar`, `comIdentidade`, `onEditar`, seleção, `NOTA_VAZIA`, `previewColagem`, `filtrados` ficam idênticos. (spec §Não-objetivos)
- **Não tocar** em `NotesTable`, `Filters`, `IdentityModal`, nem no `.edp-seg` do topo da seção (`input-section.tsx` — isso é o sub-projeto D).
- **Sem dependência nova:** `radix-ui` (unificado) já está no `package.json`. Importar como `import { Select as SelectPrimitive } from "radix-ui"` / `import { Label as LabelPrimitive } from "radix-ui"` (igual ao `ui/toggle-group.tsx`/`ui/collapsible.tsx`).
- Ícones de `lucide-react` pelos nomes **sem** sufixo `Icon` (`ChevronDown`, `ChevronUp`, `Check`) — é o que o repo já usa (ex.: `app-sidebar.tsx`).
- Componentes novos no estilo **`data-slot`** (função + `React.ComponentProps`), igual ao `ui/input.tsx`.
- Build sem erros (`cd frontend && npm run build`) + verificação manual a cada task.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `frontend/src/components/ui/label.tsx` — **novo**: `Label` (Radix `Label.Root`).
- `frontend/src/components/ui/textarea.tsx` — **novo**: `Textarea` (`<textarea>` estilizado).
- `frontend/src/components/ui/select.tsx` — **novo**: `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (+ scroll buttons), Radix `Select`.
- `frontend/src/input/manage.tsx` — redesenho da apresentação (ToggleGroup + Cards + controles shadcn); remove `estiloCampo`; lógica intocada.

---

### Task 1: Primitivos shadcn `select`, `textarea`, `label`

**Files:**
- Create: `frontend/src/components/ui/label.tsx`
- Create: `frontend/src/components/ui/textarea.tsx`
- Create: `frontend/src/components/ui/select.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils`; `radix-ui` (`Select`, `Label`); `lucide-react` (`Check`, `ChevronDown`, `ChevronUp`).
- Produces (exports): `Label`; `Textarea`; `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectScrollUpButton`, `SelectScrollDownButton`. Consumido pela Task 2.

- [ ] **Step 1: `label.tsx`**

Criar `frontend/src/components/ui/label.tsx`:

```tsx
import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
```

- [ ] **Step 2: `textarea.tsx`**

Criar `frontend/src/components/ui/textarea.tsx`:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
```

- [ ] **Step 3: `select.tsx`**

Criar `frontend/src/components/ui/select.tsx`:

```tsx
import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative z-50 max-h-96 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUp className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
}
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros (componentes ainda não usados). Se o TS reclamar de algum subcomponente Radix inexistente no pacote unificado, conferir o named import — `SelectPrimitive.Root/Trigger/Value/Content/Portal/Viewport/Item/ItemText/ItemIndicator/Icon/ScrollUpButton/ScrollDownButton` e `LabelPrimitive.Root` existem no `radix-ui`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/label.tsx frontend/src/components/ui/textarea.tsx frontend/src/components/ui/select.tsx
git commit -m "feat(ui): primitivos shadcn select, textarea e label (Radix unificado, data-slot)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Redesenho do `manage.tsx`

**Files:**
- Modify: `frontend/src/input/manage.tsx`

**Interfaces:**
- Consumes: `Card`/`CardHeader`/`CardTitle`/`CardContent` (`@/components/ui/card`), `Button` (`@/components/ui/button`), `Input` (`@/components/ui/input`), `ToggleGroup`/`ToggleGroupItem` (`@/components/ui/toggle-group`), `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (`@/components/ui/select`, Task 1), `Textarea` (`@/components/ui/textarea`, Task 1), `Label` (`@/components/ui/label`, Task 1). Todos os handlers/estados existentes do componente.
- Produces: `Manage` redesenhado (mesma assinatura `{ dados }: { dados: InputDataset }`); `estiloCampo` removido.

> **Importante:** os handlers e estados (`modo`, `setModo`, `edicoes`, `selecionados`, `msg`, `salvando`, `loteStatus`, `lotePrioridade`, `loteMes`, `novaNota`, `textoColagem`, `salvarRapida`, `aplicarLote`, `excluirSelecionadas`, `desfazer`, `cadastrar`, `salvarColagem`, `comIdentidade`, `executar`, `onEditar`, `toggleSelecionado`, `toggleTodos`, `comSelecao`, `filtrados`, `previewColagem`) **não mudam**. Só o JSX e os imports.

- [ ] **Step 1: Imports dos componentes shadcn**

Em `frontend/src/input/manage.tsx`, logo após `import { IdentityModal } from './identity-modal';` (fim do bloco de imports), adicionar:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
```

- [ ] **Step 2: Helper `trocarModo` e remoção do `estiloCampo`**

Ainda em `manage.tsx`, **remover** a linha do `estiloCampo`:

```tsx
  const comSelecao = modo === 'lote' || modo === 'exclusao';
  const estiloCampo: React.CSSProperties = { padding: '7px 10px', borderRadius: 7,
    border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--text)' };
```

passa a (mantém o `comSelecao`, troca o `estiloCampo` por um helper de modo):

```tsx
  const comSelecao = modo === 'lote' || modo === 'exclusao';

  function trocarModo(m: Modo): void {
    setModo(m); setMsg(null); setSelecionados(new Set());
  }
```

- [ ] **Step 3: Cabeçalho — ToggleGroup + Button**

Trocar o bloco do seletor de modos + botão Reverter. Hoje:

```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="edp-seg">
          {MODOS.map((m) => (
            <button key={m.id} className={modo === m.id ? 'on' : ''}
                    onClick={() => { setModo(m.id); setMsg(null); setSelecionados(new Set()); }}>{m.rotulo}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="edp-btn ghost sm" disabled={salvando} onClick={desfazer}>↩ Reverter último salvamento</button>
      </div>
```

Passa a:

```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <ToggleGroup type="single" value={modo} variant="outline"
                     onValueChange={(v) => { if (v) trocarModo(v as Modo); }}>
          {MODOS.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id}>{m.rotulo}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" disabled={salvando} onClick={desfazer}>
          ↩ Reverter último salvamento
        </Button>
      </div>
```

- [ ] **Step 4: Banner `msg` — restilizar sem mudar a lógica**

Trocar o bloco do `msg`. Hoje:

```tsx
      {msg && (
        <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13,
                      background: msg.tipo === 'ok' ? 'var(--tint-green)' : 'var(--tint-amber)' }}>
          {msg.texto}
        </div>
      )}
```

Passa a (mesma condição/texto; faixa com borda à esquerda):

```tsx
      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13,
                      borderLeft: `3px solid ${msg.tipo === 'ok' ? 'var(--green)' : 'var(--amber)'}`,
                      background: msg.tipo === 'ok' ? 'var(--tint-green)' : 'var(--tint-amber)' }}>
          {msg.texto}
        </div>
      )}
```

- [ ] **Step 5: Bloco rápida/lote/exclusão — Cards + controles**

Trocar todo o bloco `{(modo === 'rapida' || comSelecao) && ( … )}`. Hoje:

```tsx
      {(modo === 'rapida' || comSelecao) && (
        <React.Fragment>
          <Filters registros={dados.registros} registrosFiltrados={filtrados}
                   estado={estadoFiltros} setEstado={setEstadoFiltros} />

          {modo === 'lote' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={loteStatus} onChange={(e) => setLoteStatus(e.target.value)} style={estiloCampo}>
                <option value="">Status: (manter atual)</option>
                {dados.meta.status_opcoes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={lotePrioridade} onChange={(e) => setLotePrioridade(e.target.value)} style={estiloCampo}>
                <option value="">Prioridade: (manter atual)</option>
                {dados.meta.prioridade_opcoes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input value={loteMes} placeholder="Novo mês execução (ex: jun-2026)"
                     onChange={(e) => setLoteMes(e.target.value)} style={estiloCampo} />
              <button className="edp-btn sm" disabled={salvando} onClick={aplicarLote}
                      style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                Aplicar e salvar lote ({selecionados.size})
              </button>
            </div>
          )}
          {modo === 'exclusao' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                Marque as notas e confirme a exclusão. {selecionados.size} selecionada(s).
              </span>
              <button className="edp-btn sm" disabled={salvando} onClick={excluirSelecionadas}>🗑 Excluir selecionadas</button>
            </div>
          )}
          {modo === 'rapida' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                Duplo clique numa célula para editar. {edicoes.size} nota(s) com alterações pendentes.
              </span>
              <button className="edp-btn sm" disabled={salvando || edicoes.size === 0} onClick={salvarRapida}
                      style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                💾 Salvar edições
              </button>
              <button className="edp-btn ghost sm" disabled={edicoes.size === 0}
                      onClick={() => setEdicoes(new Map())}>❌ Descartar</button>
            </div>
          )}

          <NotesTable registros={filtrados} colunas={COLUNAS}
                      selecionados={comSelecao ? selecionados : undefined}
                      onToggleSelecionado={comSelecao ? toggleSelecionado : undefined}
                      onToggleTodos={comSelecao ? toggleTodos : undefined}
                      edicoes={modo === 'rapida' ? edicoes : undefined}
                      onEditar={modo === 'rapida' ? onEditar : undefined}
                      statusOpcoes={dados.meta.status_opcoes}
                      prioridadeOpcoes={dados.meta.prioridade_opcoes} />
        </React.Fragment>
      )}
```

Passa a (Filters num Card, ação num Card, tabela num Card; controles shadcn):

```tsx
      {(modo === 'rapida' || comSelecao) && (
        <React.Fragment>
          <Card>
            <CardContent className="pt-6">
              <Filters registros={dados.registros} registrosFiltrados={filtrados}
                       estado={estadoFiltros} setEstado={setEstadoFiltros} />
            </CardContent>
          </Card>

          {modo === 'lote' && (
            <Card>
              <CardHeader><CardTitle>Edição em lote</CardTitle></CardHeader>
              <CardContent>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Select value={loteStatus || undefined}
                          onValueChange={(v) => setLoteStatus(v === '__manter' ? '' : v)}>
                    <SelectTrigger style={{ width: 220 }}>
                      <SelectValue placeholder="Status: (manter atual)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manter">Status: (manter atual)</SelectItem>
                      {dados.meta.status_opcoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={lotePrioridade || undefined}
                          onValueChange={(v) => setLotePrioridade(v === '__manter' ? '' : v)}>
                    <SelectTrigger style={{ width: 220 }}>
                      <SelectValue placeholder="Prioridade: (manter atual)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manter">Prioridade: (manter atual)</SelectItem>
                      {dados.meta.prioridade_opcoes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={loteMes} placeholder="Novo mês execução (ex: jun-2026)"
                         onChange={(e) => setLoteMes(e.target.value)} style={{ width: 240 }} />
                  <Button disabled={salvando} onClick={aplicarLote}>
                    Aplicar e salvar lote ({selecionados.size})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {modo === 'exclusao' && (
            <Card>
              <CardContent className="pt-6">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                    Marque as notas e confirme a exclusão. {selecionados.size} selecionada(s).
                  </span>
                  <Button variant="destructive" size="sm" disabled={salvando} onClick={excluirSelecionadas}>
                    🗑 Excluir selecionadas
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {modo === 'rapida' && (
            <Card>
              <CardContent className="pt-6">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                    Duplo clique numa célula para editar. {edicoes.size} nota(s) com alterações pendentes.
                  </span>
                  <Button size="sm" disabled={salvando || edicoes.size === 0} onClick={salvarRapida}>
                    💾 Salvar edições
                  </Button>
                  <Button variant="ghost" size="sm" disabled={edicoes.size === 0}
                          onClick={() => setEdicoes(new Map())}>❌ Descartar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <NotesTable registros={filtrados} colunas={COLUNAS}
                          selecionados={comSelecao ? selecionados : undefined}
                          onToggleSelecionado={comSelecao ? toggleSelecionado : undefined}
                          onToggleTodos={comSelecao ? toggleTodos : undefined}
                          edicoes={modo === 'rapida' ? edicoes : undefined}
                          onEditar={modo === 'rapida' ? onEditar : undefined}
                          statusOpcoes={dados.meta.status_opcoes}
                          prioridadeOpcoes={dados.meta.prioridade_opcoes} />
            </CardContent>
          </Card>
        </React.Fragment>
      )}
```

- [ ] **Step 6: Bloco cadastro — Card + Label/Input/Select + Button**

Trocar todo o bloco `{modo === 'cadastro' && ( … )}`. Hoje:

```tsx
      {modo === 'cadastro' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 320px))', gap: 10 }}>
          {Object.keys(NOTA_VAZIA).map((campo) => (
            <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>{ROTULOS[campo] ?? campo}</span>
              {campo === 'Status_Nota' || campo === 'Prioridade_Nota' ? (
                <select value={novaNota[campo]} style={estiloCampo}
                        onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })}>
                  {(campo === 'Status_Nota' ? dados.meta.status_opcoes : dados.meta.prioridade_opcoes)
                    .map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={novaNota[campo]} style={estiloCampo}
                       onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
              )}
            </label>
          ))}
          <div style={{ alignSelf: 'end' }}>
            <button className="edp-btn sm" disabled={salvando} onClick={cadastrar}
                    style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
              💾 Salvar nova nota
            </button>
          </div>
        </div>
      )}
```

Passa a:

```tsx
      {modo === 'cadastro' && (
        <Card>
          <CardHeader><CardTitle>Cadastrar nota</CardTitle></CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 14 }}>
              {Object.keys(NOTA_VAZIA).map((campo) => (
                <div key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Label htmlFor={`nova-${campo}`} className="text-muted-foreground">
                    {ROTULOS[campo] ?? campo}
                  </Label>
                  {campo === 'Status_Nota' || campo === 'Prioridade_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(campo === 'Status_Nota' ? dados.meta.status_opcoes : dados.meta.prioridade_opcoes)
                          .map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={`nova-${campo}`} value={novaNota[campo]}
                           onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <Button disabled={salvando} onClick={cadastrar}>💾 Salvar nova nota</Button>
            </div>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 7: Bloco colagem — Card + Textarea + Button**

Trocar todo o bloco `{modo === 'colagem' && ( … )}`. Hoje:

```tsx
      {modo === 'colagem' && (
        <React.Fragment>
          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
            Cole aqui as linhas copiadas do Excel (sem cabeçalho). Ordem das colunas:{' '}
            {COLUNAS_COLAGEM.map((c) => ROTULOS[c] ?? c).join(' · ')}
          </p>
          <textarea value={textoColagem} rows={8} placeholder="Ctrl+V com as linhas do Excel…"
                    onChange={(e) => setTextoColagem(e.target.value)}
                    style={{ ...estiloCampo, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          {previewColagem.length > 0 && (
            <React.Fragment>
              <span style={{ fontSize: 12.5 }}>{previewColagem.length} linha(s) reconhecida(s) — confira antes de salvar:</span>
              <NotesTable colunas={COLUNAS.filter((c) => COLUNAS_COLAGEM.includes(c.key))}
                          registros={previewColagem.map((r, i) => ({ ...r, Numero_Nota: Number(r.Numero_Nota) || -(i + 1) })) as NotaInput[]}
                          altura={240} />
              <div>
                <button className="edp-btn sm" disabled={salvando} onClick={salvarColagem}
                        style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                  💾 Salvar lote ({previewColagem.length})
                </button>
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}
```

Passa a:

```tsx
      {modo === 'colagem' && (
        <Card>
          <CardHeader><CardTitle>Colar planilha</CardTitle></CardHeader>
          <CardContent>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '0 0 10px' }}>
              Cole aqui as linhas copiadas do Excel (sem cabeçalho). Ordem das colunas:{' '}
              {COLUNAS_COLAGEM.map((c) => ROTULOS[c] ?? c).join(' · ')}
            </p>
            <Textarea value={textoColagem} rows={8} placeholder="Ctrl+V com as linhas do Excel…"
                      onChange={(e) => setTextoColagem(e.target.value)}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
            {previewColagem.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 12.5 }}>{previewColagem.length} linha(s) reconhecida(s) — confira antes de salvar:</span>
                <NotesTable colunas={COLUNAS.filter((c) => COLUNAS_COLAGEM.includes(c.key))}
                            registros={previewColagem.map((r, i) => ({ ...r, Numero_Nota: Number(r.Numero_Nota) || -(i + 1) })) as NotaInput[]}
                            altura={240} />
                <div>
                  <Button disabled={salvando} onClick={salvarColagem}>
                    💾 Salvar lote ({previewColagem.length})
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 8: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros. Conferir que `estiloCampo` não é mais referenciado e que nenhum `<select>`/`<textarea>`/`<input style={estiloCampo}>`/`.edp-seg`/`.edp-btn` sobrou em `manage.tsx`.

- [ ] **Step 9: Verificação manual (dev server)**

Run: `cd frontend && npm run dev` (backend rodando). Input → Gerenciar:
1. Modos em ToggleGroup; trocar de modo limpa msg/seleção.
2. **Lote:** Selects de Status/Prioridade (com "manter atual" via placeholder + item), Input de Mês, "Aplicar e salvar lote (n)" aplica e salva.
3. **Rápida:** Salvar/Descartar; tabela editável por duplo clique.
4. **Exclusão:** seleção + "🗑 Excluir" com confirmação.
5. **Cadastrar:** grade Label+Input/Select; "💾 Salvar nova nota" cria.
6. **Colar:** Textarea monoespaçada; preview; "💾 Salvar lote (n)".
7. Filtros, tabela e IdentityModal inalterados; toasts + banner `msg` como antes.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/input/manage.tsx
git commit -m "feat(ui): Gerenciar redesenhado em shadcn (ToggleGroup + Cards + Input/Select/Textarea)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Modos → ToggleGroup → Task 2 Step 3. ✓
- Cada bloco de modo num Card → Task 2 Steps 5–7. ✓
- Campos `estiloCampo` → Input/Select/Textarea/Label; botões → Button → Task 2 Steps 3,5,6,7. ✓
- Componentes novos `select`/`textarea`/`label` (data-slot, Radix unificado) → Task 1. ✓
- Adaptador de valor vazio do Radix Select no lote (`__manter` → `''`, `value || undefined`) → Task 2 Step 5 (lógica `aplicarLote` intocada). ✓
- `estiloCampo` removido → Task 2 Step 2. ✓
- NotesTable/Filters/IdentityModal/handlers intocados → Steps preservam props e lógica; só JSX/estilo muda. ✓
- Sem dep nova (radix-ui instalado), sem backend, `.edp-seg` do topo intocado → respeitado. ✓

**Placeholder scan:** sem TBD/TODO; todo step de código tem before/after concreto; comandos com saída esperada.

**Type consistency:** `trocarModo(m: Modo)` (Step 2) usado no `onValueChange` do ToggleGroup (Step 3) com `v as Modo`. `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` exportados na Task 1 e usados na Task 2 com os mesmos nomes. `Label`/`Textarea`/`Button`/`Input`/`Card*`/`ToggleGroup*` idem. Estados (`loteStatus`/`lotePrioridade` como `string`, `novaNota[campo]` como `string`) compatíveis com `value`/`onValueChange` dos Selects. O sentinela `__manter` nunca chega ao estado (mapeado pra `''`), então `aplicarLote` (`if (loteStatus)`) continua válido. ✓
