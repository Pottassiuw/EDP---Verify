# Input — Redesenho do Gerenciar em shadcn (Cards + controles)

**Data:** 2026-06-28
**Branch:** develop
**Escopo:** Frontend (`frontend/src/input/manage.tsx`; novos `frontend/src/components/ui/{select,textarea,label}.tsx`)

> Sub-projeto **C** do overhaul da seção Input. Ordem: A (tabela ✓) → B (navegação ✓) → **C** (formulários do Gerenciar) → D (sweep dos `.edp-seg`/`.edp-btn`).

## Problema / Motivação

A aba **Gerenciar** (`manage.tsx`) é o que o usuário chamou de "inputAreas horríveis": o seletor de modos é um `.edp-seg`, e os campos (selects de status/prioridade, input de mês, grade de cadastro, textarea de colagem) usam um objeto `estiloCampo` inline solto. Sem hierarquia visual, sem o padrão shadcn que o resto do app está adotando.

## Objetivo

Redesenhar a **casca visual** do Gerenciar: modos em `ToggleGroup`, cada bloco de modo num `Card`, e todos os campos/botões trocados pelos componentes shadcn. **Sem tocar na lógica** de salvar/lote/excluir/cadastrar/colar.

## Não-objetivos (YAGNI)

- **Não** mexer na `NotesTable` (sub-projeto A), no componente `Filters`, no `IdentityModal`, nem em nenhum handler/estado de negócio (`salvarRapida`, `aplicarLote`, `excluirSelecionadas`, `cadastrar`, `salvarColagem`, `desfazer`, `executar`, `comIdentidade`, edições/seleção). Só a apresentação.
- **Não** migrar o `.edp-seg` do topo da seção (`input-section.tsx`) — isso é o sub-projeto D.
- **Sem dependência nova:** `radix-ui` (unificado) já está instalado → `Select`/`Label` shadcn de verdade sem npm install.
- Sem backend, sem rota nova.

## Decisões (confirmadas com o usuário)

- Redesenho **completo** (componentes **+** layout em Cards), não só troca de componentes.
- Modos → **`ToggleGroup`** shadcn (já existe `ui/toggle-group.tsx`).
- Adicionar `ui/select.tsx`, `ui/textarea.tsx`, `ui/label.tsx` no estilo **`data-slot`** (igual ao `ui/input.tsx` mais recente), importando Radix do pacote unificado (`import { Select as SelectPrimitive } from "radix-ui"`, idem `Label`).
- Reusar os existentes: `Input`, `Button`, `Card`/`CardHeader`/`CardTitle`/`CardContent`.

## Design

Layout-alvo (Card por seção):

```
[ToggleGroup: Rápida|Lote|Exclusão|Cadastrar|Colar]      [Button ghost: ↩ Reverter]

(rápida/lote/exclusão)   Card·Filtros (Filters intocado)
                         Card·Ação (controles do modo)
                         Card·Notas (NotesTable intocada)

(cadastrar)              Card·Cadastrar nota (grade Label+Input/Select + Button)
(colar)                  Card·Colar planilha (instruções + Textarea + preview + Button)
```

### Mapeamento de componentes (em `manage.tsx`)

- **Seletor de modos:** `<div className="edp-seg">…</div>` → `<ToggleGroup type="single" value={modo} onValueChange={(v) => v && trocarModo(v as Modo)}>` com um `ToggleGroupItem` por modo. (O `onClick` atual já fazia `setModo(m.id); setMsg(null); setSelecionados(new Set())` — encapsular num helper `trocarModo(m: Modo)` que faz exatamente isso. Guard `v && …` porque o ToggleGroup single pode emitir `""` ao desmarcar.)
- **Botão Reverter** e demais ações (`Aplicar e salvar lote`, `🗑 Excluir`, `💾 Salvar edições`, `❌ Descartar`, `💾 Salvar nova nota`, `💾 Salvar lote`) → `<Button>` shadcn (variantes: `ghost` pro Reverter/Descartar; default/accent pros salvar). Mantêm `disabled`/`onClick` atuais.
- **Banner `msg`:** mantido (toasts continuam), só restilizado como faixa simples dentro do fluxo (sem componente Alert novo — YAGNI).
- **Selects de lote (status/prioridade):** `<select>` nativo → `<Select>` shadcn. *Adaptador de valor vazio:* o Radix Select não aceita item com `value=""`, mas o estado `loteStatus`/`lotePrioridade` usa `""` = "manter atual". Solução sem tocar na lógica: `value={loteStatus || undefined}` (placeholder "Status: (manter atual)") + um item sentinela "Manter atual" com value `"__manter"`, e `onValueChange={(v) => setLoteStatus(v === "__manter" ? "" : v)}`. O estado continua `""` quando "manter", então `aplicarLote` (`if (loteStatus) …`) fica intocado.
- **Input de mês (lote) e campos de texto do cadastro:** `<input style={estiloCampo}>` → `<Input>` shadcn.
- **Selects do cadastro (Status_Nota/Prioridade_Nota):** valores sempre não-vazios → `<Select>` shadcn direto (sem adaptador).
- **Grade do cadastro:** cada campo vira `<Label>` + `<Input>`/`<Select>` num item de grade; a grade responsiva (`grid` Tailwind) dentro de um `Card`.
- **Textarea da colagem:** `<textarea style={estiloCampo}>` → `<Textarea>` shadcn (mantém `font-mono` via className).
- **`estiloCampo`** é removido ao final (todos os usos migrados).

### Componentes novos (`components/ui/`)

- `label.tsx` — `Label` (Radix `Label.Root`, data-slot).
- `textarea.tsx` — `Textarea` (`<textarea>` nativo estilizado, data-slot; espelha o `input.tsx`).
- `select.tsx` — `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (Radix `Select`, data-slot), ícones `ChevronDown`/`Check` de `lucide-react` (nomes sem sufixo `Icon`, que é o que funciona nesta versão da lib). Conjunto mínimo usado pelo Gerenciar.

## Tratamento de erro / casos de borda

- Toda a lógica (validações, `window.confirm`, toasts, `msg`) **permanece idêntica** — o redesenho não altera fluxo nem mensagens.
- Tailwind aqui roda **sem preflight**; os componentes shadcn já trazem suas classes de borda/cor próprias (`border-input`, etc.), e o `.ui-reset`/bridge de tokens cobre as superfícies shadcn. Conferir no manual que bordas/foco aparecem (mesmo cuidado do sub-projeto A).
- Radix Select com lista vazia de opções (ex.: `status_opcoes` ausente) renderiza o trigger com placeholder e nenhum item — sem crash.
- O ToggleGroup `type="single"` pode emitir `""` ao reclicar o item ativo; o guard `v && …` evita trocar pra modo inválido (mantém o modo atual).

## Verificação

Sem test runner → `cd frontend && npm run build` (`tsc -b && vite build`) sem erros + manual no dev server (Input → Gerenciar):

1. Seletor de modos em ToggleGroup; trocar de modo limpa `msg`/seleção como antes.
2. **Edição em Lote:** selects de Status/Prioridade (com "Manter atual"), input de Mês, botão "Aplicar e salvar lote (n)" — aplica e salva igual a antes.
3. **Edição Rápida:** Salvar/Descartar funcionam; tabela editável (duplo clique) intacta.
4. **Exclusão:** seleção + "🗑 Excluir" com confirmação.
5. **Cadastrar Nota:** grade de Label+campos, selects de status/prioridade, "💾 Salvar nova nota" cria a nota.
6. **Colar Planilha:** instruções + Textarea + preview (NotesTable) + "💾 Salvar lote (n)".
7. Filtros, tabela e modal de identidade inalterados; toasts e banner `msg` aparecem como antes.
8. Visual shadcn consistente (Cards, foco, bordas) e responsivo.

## Arquivos afetados

- `frontend/src/components/ui/select.tsx` — **novo** (Radix Select, data-slot).
- `frontend/src/components/ui/textarea.tsx` — **novo**.
- `frontend/src/components/ui/label.tsx` — **novo** (Radix Label).
- `frontend/src/input/manage.tsx` — redesenho da casca: ToggleGroup, Cards, Input/Select/Textarea/Label/Button; remove `estiloCampo`. Lógica/handlers inalterados.
