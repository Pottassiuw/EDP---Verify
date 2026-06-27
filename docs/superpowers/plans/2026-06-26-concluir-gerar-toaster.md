# Concluir + Gerar (unificação) + Toasts (sonner) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar "Concluir" com "Marcar p/ gerar" (concluir também marca para gerar; reabrir desmarca) e adicionar toasts (sonner) em todas as ações de mutação iniciadas pelo usuário.

**Architecture:** Um helper central `lib/notify.ts` envolve o sonner (único import). Um `<Toaster>` é montado uma vez no `AppContent`. A regra concluir↔gerar vive nos handlers centrais do `App.tsx` (`toggleComplete`/`markMany`), então o painel Detail e a barra de lote herdam. O rollout de toasts instrumenta os handlers/funções de ação existentes (incluindo os helpers `executar`/`agir` do Input), nunca GET/refetch/polling.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind v4, shadcn/ui, sonner.

## Global Constraints

- Trabalhar só em `frontend/`. Comandos a partir de `frontend/`.
- Toasts apenas em **ações iniciadas pelo usuário** (mutações e ações notáveis). NUNCA em GET/refetch/polling de status.
- `sonner` é o único lib de toast; só `lib/notify.ts` importa o sonner. Todo resto chama `notify.*`.
- ID "gerável" = numérico de 5 a 12 dígitos: `/^\d{5,12}$/`.
- Marcação de geração só chama API quando `source === "api"` (no demo não há backend; o toast não promete geração).
- Reabrir é simétrico: manda `a_gerar=false`.
- Não instrumentar com toast os GETs; não remover o cartão de transição do COFFEE Geradas.
- Gate automatizado por task: `npm run build` (= `tsc -b && vite build`) passa sem erros.
- Gate visual por task: `npm run dev` + checagem manual.
- Commits frequentes, um por task.

---

## File Structure

- `frontend/src/lib/notify.ts` — **novo.** Wrapper do sonner (success/error/info/promise).
- `frontend/src/App.tsx` — **modify.** `<Toaster>`; handlers (toggleComplete, markMany, markDuplicate, sendToCoffeeQueue, handleUpload, loadDemo).
- `frontend/src/api.ts` — **modify.** `marcarGerar(id, aGerar)` + export.
- `frontend/src/components/dashboard.tsx` — **modify.** Remover botões/banner "Marcar p/ gerar"; toast no openCoffee.
- `frontend/src/tokens.css` — **modify.** Mapear CSS vars do sonner aos tokens EDP.
- `frontend/src/coffee/coffee-geradas.tsx`, `coffee-pendentes.tsx` — **modify.** Toasts nas mutações.
- `frontend/src/input/manage.tsx`, `settings.tsx`, `overview.tsx`, `reports.tsx`, `input-section.tsx` — **modify.** Toasts nas mutações (via helpers centrais + export/migrar).

Não há testes automatizados de UI neste projeto. Gate automatizado = `npm run build`; gate de aceitação = checklist visual. Cada task: definir resultado esperado → confirmar estado atual → aplicar → build + visual → commit.

---

## Task 1: Infra do sonner (notify + Toaster + tema)

**Files:**
- Create: `frontend/src/lib/notify.ts`
- Modify: `frontend/src/App.tsx` (montar `<Toaster>`)
- Modify: `frontend/src/tokens.css` (CSS vars do sonner)
- Modify: `frontend/package.json` (dependência `sonner`)

**Interfaces:**
- Consumes: nada.
- Produces: `notify` (`success(message: string, description?: string)`, `error(message, description?)`, `info(message, description?)`, `promise<T>(p: Promise<T>, msgs: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) })`).

- [ ] **Step 1: Instalar sonner**

Run: `cd frontend && npm install sonner`
Expected: `sonner` adicionado a `dependencies` no `package.json`.

- [ ] **Step 2: Criar o helper `notify`**

Criar `frontend/src/lib/notify.ts`:

```ts
import { toast } from 'sonner';

export const notify = {
  success: (message: string, description?: string): void => { toast.success(message, { description }); },
  error:   (message: string, description?: string): void => { toast.error(message, { description }); },
  info:    (message: string, description?: string): void => { toast(message, { description }); },
  promise: <T>(
    p: Promise<T>,
    msgs: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) },
  ): void => { toast.promise(p, msgs); },
};
```

- [ ] **Step 3: Montar o `<Toaster>` no AppContent**

Em `frontend/src/App.tsx`, adicionar o import e montar o `<Toaster>` dentro do `<div className="edp ...">`, logo após o `<SidebarProvider>...</SidebarProvider>` fechar (antes de fechar o div externo). O `resolvedTheme` já está disponível em `AppContent` (linha ~63: `const { settings, resolvedTheme } = useSettings();`).

Adicionar ao bloco de imports (junto dos outros imports de componentes):

```tsx
import { Toaster } from 'sonner';
```

E dentro do `return (...)` de `AppContent`, logo após `</SidebarProvider>`:

```tsx
        </SidebarProvider>
        <Toaster theme={resolvedTheme} position="bottom-right" richColors closeButton />
      </div>
```

(O `</div>` mostrado é o fechamento do `<div className="edp triage" ...>` já existente — inserir o `<Toaster/>` entre o `</SidebarProvider>` e esse `</div>`.)

- [ ] **Step 4: Tematizar o sonner com os tokens EDP**

O sonner renderiza num portal no `<body>` (fora do `.edp`), mas os tokens já existem no `:root` (ver bloco `:root, .edp` em `tokens.css`). Adicionar ao **final** de `frontend/src/tokens.css` (unlayered):

```css
/* Sonner (toaster) — portaliza no body; herda os tokens via :root.
   Mapeia as cores base do toast aos tokens EDP. */
[data-sonner-toaster] {
  --normal-bg: var(--popover);
  --normal-text: var(--popover-foreground);
  --normal-border: var(--border);
}
```

- [ ] **Step 5: Gate automatizado**

Run: `cd frontend && npm run build`
Expected: build sem erros de TypeScript nem bundle.

- [ ] **Step 6: Gate visual (smoke)**

Run: `cd frontend && npm run dev`. No DevTools Console, rodar:
`window.dispatchEvent(new Event('x'))` não aplica — em vez disso, validar no Step seguinte das tasks que usam `notify`. Aqui basta confirmar que o app sobe sem erro de console e que `import 'sonner'` resolve (sem erro de módulo). Parar o dev server.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add package.json package-lock.json src/lib/notify.ts src/App.tsx src/tokens.css
git commit -m "feat(ui): infra de toasts (sonner) — notify helper + Toaster temado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Unificar Concluir + Gerar

**Files:**
- Modify: `frontend/src/api.ts` (`marcarGerar`)
- Modify: `frontend/src/App.tsx` (`toggleComplete`, `markMany`)
- Modify: `frontend/src/components/dashboard.tsx` (remover botões/banner "Marcar p/ gerar")

**Interfaces:**
- Consumes: `notify` (Task 1); `EDPApi`.
- Produces: `EDPApi.marcarGerar(id: string, aGerar: boolean): Promise<void>`.

- [ ] **Step 1: Definir resultado esperado**

Concluir uma nota numérica (source api) → status concluído + `POST /coffee/marcar-gerar {a_gerar:true}` + toast "Nota X concluída / Marcada para gerar". Reabrir → `a_gerar:false` + toast "reaberta / Desmarcada para gerar". Não-numérica ou demo → só conclui, sem chamada de geração; toast sem a promessa de gerar. Botões "⚙ Marcar p/ gerar" (Detail + lote) e o banner `gerarMsg` somem.

- [ ] **Step 2: Adicionar `marcarGerar` ao EDPApi**

Em `frontend/src/api.ts`, adicionar a função (após `markDuplicate`, antes do `export const EDPApi`):

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

E incluir no objeto exportado:

```ts
export const EDPApi = { BASE, fetchData, upload, toggleComplete, markDuplicate, marcarGerar, coffeeUrl, mapsUrl, openCoffee };
```

- [ ] **Step 3: Importar `notify` e definir o regex de ID no App**

Em `frontend/src/App.tsx`, adicionar ao topo (junto dos imports):

```tsx
import { notify } from './lib/notify';
```

E perto das outras consts de módulo (ex. após `TRIAGE_SNAPSHOT_KEY`):

```tsx
const NUMERIC_ID_RE = /^\d{5,12}$/;
```

- [ ] **Step 4: Reescrever `toggleComplete`**

Substituir a função `toggleComplete` em `App.tsx` por:

```tsx
  function toggleComplete(id: string): void {
    const reopening = completed.has(id);
    const concluding = !reopening;
    setCompleted((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); persistDone(s); return s; });
    if (reopening) setDupResolved((prev) => { const s = new Set(prev); s.delete(id); persistDup(s); return s; });

    const numeric = NUMERIC_ID_RE.test(id);
    const willGenerate = source === "api" && numeric;
    if (source === "api") {
      EDPApi.toggleComplete(id).catch((e) => notify.error("Falha ao atualizar nota", e instanceof Error ? e.message : String(e)));
      if (numeric) EDPApi.marcarGerar(id, concluding).catch((e) => notify.error("Falha ao marcar para gerar", e instanceof Error ? e.message : String(e)));
    }
    notify.success(
      concluding ? `Nota ${id} concluída` : `Nota ${id} reaberta`,
      willGenerate ? (concluding ? "Marcada para gerar" : "Desmarcada para gerar") : undefined,
    );
  }
```

- [ ] **Step 5: Reescrever `markMany`**

Substituir a função `markMany` em `App.tsx` por:

```tsx
  function markMany(ids: string[], action: "done" | "reopen"): void {
    const marking = action === "done";
    const targets = ids.filter((id) => completed.has(id) !== marking);
    setCompleted((prev) => {
      const s = new Set(prev);
      targets.forEach((id) => { if (marking) s.add(id); else s.delete(id); });
      persistDone(s);
      return s;
    });
    const numericTargets = targets.filter((id) => NUMERIC_ID_RE.test(id));
    if (source === "api") {
      targets.forEach((id) => EDPApi.toggleComplete(id).catch(() => {}));
      numericTargets.forEach((id) => EDPApi.marcarGerar(id, marking).catch(() => {}));
    }
    if (targets.length === 0) return;
    const gerarInfo = source === "api" && numericTargets.length > 0
      ? `${numericTargets.length} ${marking ? "marcada(s) para gerar" : "desmarcada(s)"}`
      : undefined;
    notify.success(`${targets.length} nota(s) ${marking ? "concluída(s)" : "reaberta(s)"}`, gerarInfo);
  }
```

- [ ] **Step 6: Remover "Marcar p/ gerar" do dashboard (lote)**

Em `frontend/src/components/dashboard.tsx`, remover o botão da barra de lote (o bloco que filtra por `COFFEE_ID_RE` e chama `marcarParaGerar`):

```tsx
                <button className="edp-btn sm" onClick={() => {
                  ids.filter((id) => COFFEE_ID_RE.test(id)).forEach((id) => { marcarParaGerar(id).catch(() => {}); });
                  setSelBatch(new Set());
                }}>⚙ Marcar p/ gerar</button>
```

Deletar esse `<button>` inteiro.

- [ ] **Step 7: Remover "Marcar p/ gerar" e o banner do Detail**

Em `dashboard.tsx`, no componente `Detail`:

1. Remover o botão (linhas ~357-360):

```tsx
          <button className="edp-btn sm" disabled={!podeGerar} onClick={onMarcarGerar}
                  title={podeGerar ? "Marcar para gerar no COFFEE" : "ID nao numerico: nao pode ser gerado"}>
            ⚙ Marcar p/ gerar
          </button>
```

2. Remover o banner `gerarMsg` (linhas ~369-376):

```tsx
      {gerarMsg && (
        <div style={{ flexShrink: 0, padding: "8px 24px", fontSize: 12.5,
                      color: gerarMsg.ok ? "var(--green)" : "var(--red)",
                      background: gerarMsg.ok ? "var(--tint-green)" : "var(--tint-red)",
                      borderBottom: "1px solid var(--line)" }}>
          {gerarMsg.txt}
        </div>
      )}
```

3. Remover o estado e a função locais agora sem uso: `const [gerarMsg, setGerarMsg] = ...`, `const podeGerar = ...`, e a função `onMarcarGerar`.

- [ ] **Step 8: Remover utilitários órfãos do dashboard**

Após o Step 7, `marcarParaGerar` (função de módulo, ~linhas 15-22), `COFFEE_ID_RE` (linha 13) e `API_BASE` (linha 12) ficam sem uso. Removê-los. (Se o build acusar algum ainda em uso, manter só o que for usado.)

- [ ] **Step 9: Toast no "Abrir no COFFEE"**

Em `dashboard.tsx`, os dois botões `☕ COFFEE` (lote e Detail) passam a avisar. Trocar:

`onClick={() => EDPApi.openCoffee(ids)}` → `onClick={() => { notify.info("Abrindo no COFFEE…"); EDPApi.openCoffee(ids); }}`
`onClick={() => EDPApi.openCoffee(sel.id)}` → `onClick={() => { notify.info("Abrindo no COFFEE…"); EDPApi.openCoffee(sel.id); }}`

Adicionar `import { notify } from '../lib/notify';` no topo do `dashboard.tsx`.

- [ ] **Step 10: Gate automatizado**

Run: `cd frontend && npm run build`
Expected: build sem erros (inclusive sem variáveis não usadas).

- [ ] **Step 11: Gate visual**

Run: `cd frontend && npm run dev`. Na triagem (COFFEE → Verificar com dados):
- Concluir uma nota numérica → toast "concluída / Marcada para gerar"; reabrir → "reaberta / Desmarcada para gerar".
- Selecionar várias e Concluir/Reabrir → toast-resumo.
- Botões "⚙ Marcar p/ gerar" sumiram (Detail e lote); banner inline sumiu.
- Abrir no COFFEE → toast "Abrindo no COFFEE…".
Parar o dev server.

- [ ] **Step 12: Commit**

```bash
cd frontend && git add src/api.ts src/App.tsx src/components/dashboard.tsx
git commit -m "feat(ui): Concluir tambem marca p/ gerar (reabrir desmarca) + remove botao redundante

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Toasts nas demais ações da triagem (App.tsx)

**Files:**
- Modify: `frontend/src/App.tsx` (`markDuplicate`, `sendToCoffeeQueue`, `handleUpload`, `loadDemo`)

**Interfaces:**
- Consumes: `notify` (Task 1, já importado na Task 2).

- [ ] **Step 1: Toast em `markDuplicate`**

Em `App.tsx`, na função `markDuplicate`, adicionar toasts. Trocar o bloco da API e o final por:

```tsx
    if (source === "api") {
      if (undo) EDPApi.toggleComplete(id).catch((e) => notify.error("Falha ao desfazer duplicata", e instanceof Error ? e.message : String(e)));
      else EDPApi.markDuplicate(id).catch((e) => notify.error("Falha ao marcar duplicata", e instanceof Error ? e.message : String(e)));
    }
    notify.success(undo ? "Duplicata desfeita" : "Nota marcada como duplicata");
```

(Manter as chamadas `setDupResolved`/`setCompleted` existentes acima; só ajustar o bloco `if (source === "api")` e adicionar o `notify.success` ao final da função.)

- [ ] **Step 2: Toast em `sendToCoffeeQueue`**

Em `App.tsx`, no fim de `sendToCoffeeQueue`, após `setSection("coffee");`, adicionar:

```tsx
    if (valid.length > 0) notify.success(`${valid.length} nota(s) enviada(s) para a fila do COFFEE`);
```

- [ ] **Step 3: Toast em `handleUpload`**

Substituir a função `handleUpload` por:

```tsx
  async function handleUpload(f: File): Promise<void> {
    limparFiltrosVerify();
    limparSnapshot();
    const p = (async () => { await EDPApi.upload(f); return EDPApi.fetchData(); })();
    notify.promise(p, {
      loading: "Enviando planilha…",
      success: "Planilha carregada",
      error: (e) => `Falha no upload: ${e instanceof Error ? e.message : String(e)}`,
    });
    try {
      const d = await p;
      setNotes(d.notes); setCompleted(d.completed); setSource("api");
      setFile(f.name); localStorage.setItem("edp_file", f.name);
      setScreen("dashboard");
    } catch { /* toast já informou o erro */ }
  }
```

- [ ] **Step 4: Toast em `loadDemo`**

Em `App.tsx`, no fim de `loadDemo` (após `setSource("demo"); setFile(...); setScreen("dashboard");`), adicionar:

```tsx
    notify.info("Dados de demonstração carregados");
```

- [ ] **Step 5: Gate automatizado**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 6: Gate visual**

Run: `cd frontend && npm run dev`.
- Marcar/desmarcar duplicata → toast.
- Enviar candidatas → fila COFFEE → toast com contagem.
- Carregar demo → toast info.
- (Upload exige backend; se disponível, ver "Enviando… → Planilha carregada".)
Parar o dev server.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/App.tsx
git commit -m "feat(ui): toasts em duplicata, envio p/ COFFEE, upload e demo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Toasts no COFFEE (Geradas + Pendentes)

**Files:**
- Modify: `frontend/src/coffee/coffee-geradas.tsx`
- Modify: `frontend/src/coffee/coffee-pendentes.tsx`

**Interfaces:**
- Consumes: `notify` (Task 1).

- [ ] **Step 1: Importar notify nos dois arquivos**

Adicionar no topo de cada arquivo:

```tsx
import { notify } from '../lib/notify';
```

- [ ] **Step 2: Toasts em `coffee-geradas.tsx`**

Adicionar sucesso/erro nas mutações (mantendo o cartão de transição existente):

- Em `gerarLote`, no `.then` de sucesso (onde há `aGerar.refetch(); refetch();`), adicionar ao final do bloco:
  ```tsx
  notify.success(`${pks.length} nota(s) enviada(s) para geração`);
  ```
  e no `.catch` da cadeia (ou no `.catch(() => {})` do chamador em `confirmAction`), trocar para:
  ```tsx
  .catch((e) => notify.error("Falha ao gerar em lote", e instanceof Error ? e.message : String(e)))
  ```
- Em `desmarcar` (POST `/coffee/marcar-gerar` com `a_gerar:false`), trocar o `.then(() => { aGerar.refetch(); })` por:
  ```tsx
  .then(() => { aGerar.refetch(); notify.success("Nota desmarcada para geração"); })
  .catch((e) => notify.error("Falha ao desmarcar", e instanceof Error ? e.message : String(e)))
  ```
- Em `arquivar` (POST `/coffee/arquivar`), trocar `.then(() => { refetch(); })` por:
  ```tsx
  .then(() => { refetch(); notify.success("Nota arquivada"); })
  .catch((e) => notify.error("Falha ao arquivar", e instanceof Error ? e.message : String(e)))
  ```
- Em `regerar` (fluxo single via confirmAction), no `.catch` existente que seta `regerarErro`, adicionar também `notify.error("Falha ao gerar", ...)`; no sucesso single (`setRegerarResult(result); setRegerarEstado("ok");`) adicionar `notify.success("Nota gerada");`.

- [ ] **Step 3: Toasts em `coffee-pendentes.tsx`**

- Em `buscar` (POST `/coffee/buscar` + polling de job): adicionar `notify.error("Falha na busca", ...)` no `.catch` da requisição; e `notify.success("Busca concluída")` quando o job finalizar com sucesso (no ponto onde hoje chama `refetch()` após o job ok).
- Em `arquivar` (POST `/coffee/arquivar`, ~linha 169-175): trocar `.then(() => refetch())` por:
  ```tsx
  .then(() => { refetch(); notify.success("Nota arquivada"); })
  .catch((e) => notify.error("Falha ao arquivar", e instanceof Error ? e.message : String(e)))
  ```

- [ ] **Step 4: Gate automatizado**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 5: Gate visual**

Run: `cd frontend && npm run dev`. Em COFFEE → Gerar / Pendentes (se backend disponível), executar uma ação (desmarcar/arquivar) e ver o toast; forçar um erro (ex. backend off) e ver toast de erro. Parar o dev server.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/coffee/coffee-geradas.tsx src/coffee/coffee-pendentes.tsx
git commit -m "feat(ui): toasts nas acoes do COFFEE (gerar/desmarcar/arquivar/buscar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Toasts no Input

**Files:**
- Modify: `frontend/src/input/manage.tsx` (helper `executar`)
- Modify: `frontend/src/input/settings.tsx` (helper `agir` + caso "Nome atualizado")
- Modify: `frontend/src/input/overview.tsx` (`exportar`)
- Modify: `frontend/src/input/reports.tsx` (`exportar`)
- Modify: `frontend/src/input/input-section.tsx` (`migrar`)

**Interfaces:**
- Consumes: `notify` (Task 1).

- [ ] **Step 1: Instrumentar `executar` em manage.tsx**

Adicionar `import { notify } from '../lib/notify';` no topo. Substituir o corpo de `executar` por (mantém o banner inline existente + adiciona toast):

```tsx
  async function executar(rotuloOk: string, fn: () => Promise<unknown>): Promise<void> {
    setSalvando(true); setMsg(null);
    try {
      await fn();
      await recarregar();
      setMsg({ tipo: 'ok', texto: rotuloOk });
      notify.success(rotuloOk);
    } catch (e) {
      const txt = e instanceof Error ? e.message : String(e);
      setMsg({ tipo: 'erro', texto: txt });
      notify.error('Falha na operação', txt);
    } finally {
      setSalvando(false);
    }
  }
```

(Cobre editar, criar, criarLote, excluir, desfazer — todos passam por `executar` com a mensagem já definida.)

- [ ] **Step 2: Instrumentar `agir` em settings.tsx**

Adicionar `import { notify } from '../lib/notify';` no topo. Substituir o corpo de `agir` por:

```tsx
  async function agir(fn: () => Promise<unknown>, ok: string): Promise<void> {
    setMsg('');
    try { await fn(); setMsg(ok); notify.success(ok); }
    catch (e) { const t = e instanceof Error ? e.message : String(e); setMsg(`Erro: ${t}`); notify.error('Falha na operação', t); }
  }
```

E no botão "Salvar" do nome (que hoje faz `setUsuario(nome); setMsg('Nome atualizado.')`), adicionar `notify.success('Nome atualizado.')`:

```tsx
                  onClick={() => { setUsuario(nome); setMsg('Nome atualizado.'); notify.success('Nome atualizado.'); }}
```

(Cobre salvarResponsaveis e substituirBase via `agir`.)

- [ ] **Step 3: Toast no export de overview.tsx**

Adicionar `import { notify } from './api';`? Não — `notify` vem de `../lib/notify`. Adicionar `import { notify } from '../lib/notify';`. Envolver o `exportar` com sucesso/erro:

```tsx
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        filtrados.map((r) => r.Numero_Nota), COLUNAS.map((c) => c.key));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      baixarBlob(blob, `export_notas_${stamp}.xlsx`);
      notify.success('Exportação concluída');
    } catch (e) {
      notify.error('Falha na exportação', e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
```

- [ ] **Step 4: Toast no export de reports.tsx**

Adicionar `import { notify } from '../lib/notify';`. Envolver o `exportar` análogo ao Step 3:

```tsx
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        auditadas.map((n) => n.Numero_Nota), COLUNAS_AUDITORIA.map((c) => c.key));
      baixarBlob(blob, `Auditoria_Prazos_${new Date().toISOString().slice(0, 10)}.xlsx`);
      notify.success('Exportação concluída');
    } catch (e) {
      notify.error('Falha na exportação', e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
```

- [ ] **Step 5: Toast no `migrar` (input-section.tsx)**

Adicionar `import { notify } from '../lib/notify';`. Envolver o handler do botão "Tentar importar de novo":

```tsx
          <button className="edp-btn sm" onClick={() => { void (async () => {
            const { InputApi } = await import('./api');
            try { await InputApi.migrar(); await recarregar(); notify.success('Importação reprocessada'); }
            catch (e) { notify.error('Falha na importação', e instanceof Error ? e.message : String(e)); }
          })(); }}>Tentar importar de novo</button>
```

- [ ] **Step 6: Gate automatizado**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 7: Gate visual**

Run: `cd frontend && npm run dev`. Em Input (se backend disponível): salvar uma edição → toast; exportar → toast; forçar erro → toast de erro. Parar o dev server.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/input/manage.tsx src/input/settings.tsx src/input/overview.tsx src/input/reports.tsx src/input/input-section.tsx
git commit -m "feat(ui): toasts nas mutacoes do Input (editar/criar/excluir/responsaveis/bases/export/migrar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Sonner setup + Toaster temado (spec §1) → Task 1. ✓
- `lib/notify.ts` (spec §2) → Task 1. ✓
- Unificação Concluir+Gerar, reabrir simétrico, demo/não-numérico, remoção de botões+banner, `marcarGerar` (spec §3) → Task 2. ✓
- Rollout: triagem (duplicata, fila COFFEE, upload, demo, openCoffee) → Tasks 2 (openCoffee) + 3. ✓
- Rollout: COFFEE Geradas/Pendentes (spec §4) → Task 4. ✓
- Rollout: Input (spec §4) → Task 5. ✓
- Erros antes silenciosos viram notify.error (spec §5) → coberto em Tasks 2–5. ✓

**Placeholder scan:** Sem TBD/TODO. Tasks 4 e 5 mostram o código exato das inserções; as mensagens do Input já existem nos helpers `executar`/`agir`, então instrumentá-los reaproveita-as. ✓

**Type/nomes consistentes:** `notify` mesmo shape em todas as tasks; `EDPApi.marcarGerar(id: string, aGerar: boolean)` definido na Task 2 e usado em App.tsx; `NUMERIC_ID_RE` definido uma vez em App.tsx. ✓

**Nota de escopo:** Task 5 mantém os banners inline do Input e adiciona toasts (feedback duplo, aceitável v1). Se o usuário quiser só toast, é um follow-up simples (remover estado `msg` + render). Registrado aqui para o review final triar.
