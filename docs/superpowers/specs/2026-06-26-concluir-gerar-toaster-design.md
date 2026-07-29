# Concluir + Marcar p/ Gerar (unificação) + Toasts (sonner)

**Data:** 2026-06-26
**Branch:** develop
**Escopo:** Frontend (`frontend/src`)

## Problema / Motivação

Hoje a triagem tem **dois botões redundantes**: "✓ Concluir" e "⚙ Marcar p/ gerar". Não faz sentido manter ambos — concluir uma nota e marcá-la para geração são, na prática, a mesma intenção do usuário. Além disso, o app dá pouco feedback de ações: mutações de API acontecem em silêncio (vários `.catch(() => {})`), e o único feedback é um banner inline pontual (`gerarMsg` no Detail).

## Objetivos

1. **Unificar:** o botão "Concluir" passa a também marcar a nota para geração; remover os botões "Marcar p/ gerar".
2. **Feedback consistente:** toasts (sonner) em toda ação iniciada pelo usuário que envolva API ou mudança nítida de estado.
3. Não quebrar telas legadas nem o comportamento de toggle (concluir ↔ reabrir).

## Não-objetivos (YAGNI)

- Toasts em GET/refetch/polling de status (seria ruído). Só **ações iniciadas pelo usuário** (mutações e ações notáveis).
- Não remover o "cartão de transição" rico do COFFEE Geradas (é mais que um toast) — apenas complementar com toasts de sucesso/erro.
- Não criar um cliente HTTP central novo. Mantém os `fetch`/`EDPApi`/`InputApi` existentes.

## Decisões (confirmadas com o usuário)

- **Reabrir é simétrico:** reabrir manda `a_gerar=false` (desfaz a marcação de geração), mantendo concluído ⇔ marcado p/ gerar.
- **Rollout completo agora:** instrumentar todas as ações de mutação do app, organizadas por tela.
- **Arquitetura:** helper central `notify` envolvendo o sonner; `notify.promise` para chamadas de API.

## Arquitetura

### 1. Sonner

- Dependência: `sonner` (instalar; hoje não está no `package.json`).
- `<Toaster>` montado **uma vez** em `AppContent` (`App.tsx`), com `theme={resolvedTheme}`, `position="bottom-right"`, `closeButton`.
- O sonner renderiza num portal no `<body>` (fora do `.edp`). Como os tokens já existem no `:root` (ver `tokens.css`), as cores resolvem. Mapear as CSS vars do sonner para os tokens EDP via CSS (escopo `:root`, pois o toaster está no body):
  - `--normal-bg: var(--popover)`, `--normal-text: var(--popover-foreground)`, `--normal-border: var(--border)`.
  - success → verde EDP (`--green`); error → vermelho EDP (`--red`).

### 2. Toasts — chamada direta ao sonner

> **Ponytail-audit (`6455ed0`):** `lib/notify.ts` foi deletado. Os 37 call-sites agora importam e chamam `toast.*` diretamente do `sonner`. Não há wrapper.

Convenções de uso (inalteradas, só muda o símbolo):
- **Chamada de API** (assíncrona): `toast.promise(promise, { loading, success, error })`.
- **Mudança local instantânea** (sem await): `toast.success(...)`.
- **Erro engolido antes** (`.catch(() => {})` em ação do usuário): passa a `.catch((e) => toast.error(...))`.

### 3. Unificação Concluir + Gerar

- Adicionar `marcarGerar(id, aGerar)` ao `EDPApi` (`api.ts`):

```ts
export async function marcarGerar(id: string, aGerar: boolean): Promise<void> {
  const res = await fetch(BASE + "/coffee/marcar-gerar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Number(id), a_gerar: aGerar }),
  });
  if (!res.ok) throw new Error("POST /marcar-gerar -> " + res.status);
}
```

- A regra "concluir também marca p/ gerar" vive nos **handlers centrais** (`App.tsx`), para que o painel Detail e a barra de lote herdem o mesmo comportamento:
  - **`toggleComplete(id)` (single):** alterna concluído. Se `source === "api"` e o id for numérico (`/^\d{5,12}$/`), chama `EDPApi.marcarGerar(id, concluindo)`. Toast:
    - concluindo + numérico → *"Nota {id} concluída e marcada para gerar"*
    - concluindo + não-numérico → *"Nota {id} concluída"*
    - reabrindo → *"Nota {id} reaberta"* (numérico: descrição "desmarcada para gerar")
  - **`markMany(ids, action)` (lote):** marca/reabre em lote. Para `source === "api"`, dispara `marcarGerar(id, action==='done')` para cada id numérico. Toast-resumo: *"{N} notas concluídas"* (descrição: *"{M} marcadas para gerar"* quando houver numéricas) / *"{N} notas reabertas"*.
  - **Demo (`source !== "api"`):** não chama `marcarGerar` (sem backend); o toast não promete geração.
- **Remoções no `dashboard.tsx`:**
  - Botão "⚙ Marcar p/ gerar" no painel Detail (e a função local `onMarcarGerar` + estado `gerarMsg` + o banner inline).
  - Botão "⚙ Marcar p/ gerar" na barra de ações em lote.
  - A função local `marcarParaGerar` (substituída por `EDPApi.marcarGerar` chamada nos handlers do App).
- **Tooltips/labels:** botão permanece "✓ Concluir" / "↺ Reabrir". `title` do Concluir passa a indicar que também marca para gerar (quando aplicável).

### 4. Rollout dos toasts (por tela)

Instrumentar as ações iniciadas pelo usuário. **Não** instrumentar GET/refetch/polling.

- **App.tsx / Triagem:**
  - `toggleComplete`, `markMany` → ver item 3 (concluir/reabrir).
  - `markDuplicate` → *"Nota marcada como duplicata"* / *"Duplicata desfeita"*; erro → toast.
  - `sendToCoffeeQueue` → *"{N} nota(s) enviada(s) para a fila do COFFEE"*.
  - `handleUpload` → `notify.promise` (*"Enviando planilha…"* → *"Planilha carregada"* / erro).
  - `loadDemo` → `notify.info("Dados de demonstração carregados")`.
- **dashboard.tsx:** `EDPApi.openCoffee(...)` → `notify.info("Abrindo no COFFEE…")` (continua respeitando o alerta de muitos popups).
- **coffee-geradas.tsx:** `regerar`/`gerar` (single), `gerarLote`, `arquivar`, `desmarcar` → toasts de sucesso/erro (mantendo o cartão de transição existente).
- **coffee-pendentes.tsx:** `buscar`, `arquivar` → toasts de sucesso/erro.
- **input/ (manage, settings, overview, reports):** mutações via `InputApi` (export, exclusão de base, salvar responsável/nota, definir usuário) → toasts de sucesso/erro. As ações concretas serão enumeradas por arquivo no plano de implementação.

### 5. Tratamento de erro

- Toda ação de usuário que hoje engole erro (`.catch(() => {})`) e é uma mutação passa a notificar via `notify.error` com a mensagem do erro (`e instanceof Error ? e.message : String(e)`).

## Verificação

- `npm run build` (= `tsc -b && vite build`) passa sem erros.
- Manual (dev server):
  1. Concluir nota numérica → toast "concluída e marcada para gerar"; reabrir → "reaberta"; confirmar chamada `marcar-gerar` (true/false) no Network.
  2. Concluir nota não-numérica → toast "concluída" (sem chamada marcar-gerar).
  3. Lote: concluir/reabrir → toast-resumo.
  4. Botões "Marcar p/ gerar" sumiram (Detail + lote); banner `gerarMsg` sumiu.
  5. Duplicata, enviar p/ fila, upload, demo, abrir COFFEE → toasts corretos.
  6. Forçar erro de API → toast de erro (não silencioso).
  7. Toast com aparência coerente ao tema (claro/escuro).
  8. Telas legadas (Coffee/Input) sem regressão visual.

## Arquivos afetados

- `frontend/package.json` / lockfile — dependência `sonner`.
- ~~`frontend/src/lib/notify.ts`~~ — deletado no ponytail-audit; `toast.*` usado diretamente.
- `frontend/src/App.tsx` — `<Toaster>`, handlers (toggleComplete, markMany, markDuplicate, sendToCoffeeQueue, handleUpload, loadDemo).
- `frontend/src/api.ts` — `marcarGerar`.
- `frontend/src/components/dashboard.tsx` — remover botões/banner "Marcar p/ gerar"; toast no openCoffee.
- `frontend/src/tokens.css` — CSS vars do sonner mapeadas aos tokens EDP.
- `frontend/src/coffee/coffee-geradas.tsx`, `coffee-pendentes.tsx` — toasts nas mutações.
- `frontend/src/input/*` (manage, settings, overview, reports) — toasts nas mutações.
