# Modal Gerar/Consultar — UX por linha + persistência em sessão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No modal de gerar/consultar, tornar o local de instalação read-only com edição sob botão, permitir remover linhas, e persistir a lista em `sessionStorage`.

**Architecture:** Mudança contida em um único componente React (`coffee-gerar-modal.tsx`). Task 1 reorganiza o render por linha (coluna de Ações: Alterar local/Salvar/Cancelar + ✕ Remover; local read-only por padrão). Task 2 adiciona persistência em sessão (hidratar ao abrir, gravar a cada mudança, botão Limpar).

**Tech Stack:** React 18 + TypeScript + Vite; `sonner` para toasts.

## Global Constraints

- Sem test runner no frontend. Check de cada task = `cd frontend && npm run build` (`tsc -b && vite build`) sem erros + verificação manual.
- Não mexer no backend nem em outras telas (só `coffee-gerar-modal.tsx`).
- `toast` vem direto do `sonner` (não existe `lib/notify`).
- Persistência é **`sessionStorage`** (não `localStorage`), padrão dos snapshots em `App.tsx` (`try/catch` silencioso).
- Reaproveitar `maskLocal`/`unmaskLocal` existentes sem alterá-las.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `frontend/src/coffee/coffee-gerar-modal.tsx` — único arquivo. Task 1: tipo `Row` ganha `editando`; novos handlers `removerLinha`/`iniciarEdicao`/`cancelarEdicao`; `salvarLocal` sai do modo edição; render da coluna Local + nova coluna Ações. Task 2: helpers de `sessionStorage` (nível de módulo), efeito de hidratação ao abrir, efeito de gravação, botão Limpar.

---

### Task 1: Ações por linha — local read-only, Alterar/Salvar/Cancelar, Remover

**Files:**
- Modify: `frontend/src/coffee/coffee-gerar-modal.tsx`

**Interfaces:**
- Consumes: `maskLocal`, `unmaskLocal`, `STATUS_COR`, `salvarLocal` (existentes); tipo `Row`.
- Produces: `Row` com campo `editando?: boolean`; handlers `removerLinha(id: number)`, `iniciarEdicao(row: Row)`, `cancelarEdicao(id: number)`; coluna "Ações" no `<thead>`/`<tbody>`.

- [ ] **Step 1: Adicionar `editando` ao tipo `Row`**

Em `frontend/src/coffee/coffee-gerar-modal.tsx`, no `interface Row`, adicionar o campo após `salvandoLocal?: boolean;`:

```ts
interface Row {
  id: number;
  estado: "consultando" | "ok" | "erro";
  pk?: number;
  idSap?: number | null;
  classificacao?: string;
  arquivado?: boolean | null;
  localAtual?: string;          // sem máscara (como veio do backend)
  localEditado?: string;        // mascarado, no input
  salvandoLocal?: boolean;
  editando?: boolean;
  erro?: string;
}
```

- [ ] **Step 2: Adicionar os handlers de linha e ajustar `salvarLocal`**

Substituir a função `salvarLocal` inteira por esta versão (sai do modo edição em sucesso) e adicionar os três handlers logo acima dela:

```tsx
  function removerLinha(id: number): void {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function iniciarEdicao(row: Row): void {
    setRows((rs) => rs.map((r) => r.id === row.id
      ? { ...r, editando: true, localEditado: r.localAtual ? maskLocal(r.localAtual) : "" }
      : r));
  }

  function cancelarEdicao(id: number): void {
    setRows((rs) => rs.map((r) => r.id === id
      ? { ...r, editando: false, localEditado: r.localAtual ? maskLocal(r.localAtual) : "" }
      : r));
  }

  function salvarLocal(row: Row): void {
    const local = unmaskLocal(row.localEditado ?? "");
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, salvandoLocal: true } : r));
    fetch(`${BASE}/coffee/local-instalacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, local }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /local-instalacao -> ${res.status}`); })
      .then(() => {
        setRows((rs) => rs.map((r) => r.id === row.id
          ? { ...r, salvandoLocal: false, editando: false, localAtual: local } : r));
        toast.success("Local de instalação atualizado");
      })
      .catch((e: unknown) => {
        setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, salvandoLocal: false } : r));
        toast.error("Falha ao salvar local", { description: e instanceof Error ? e.message : String(e) });
      });
  }
```

- [ ] **Step 3: Renomear o cabeçalho da última coluna para "Ações"**

No `<thead>`, trocar a última `<th>` vazia:

```tsx
                <th style={th}>Status</th>
                <th style={th}>Ações</th>
```

- [ ] **Step 4: Reescrever o render de cada linha (`rows.map`)**

Substituir todo o bloco `{rows.map((r) => ( ... ))}` por:

```tsx
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}><span className="edp-mono" style={{ fontWeight: 600 }}>{r.pk ?? r.id}</span></td>
                  <td style={td}>
                    {r.estado === "consultando" ? "…"
                     : r.estado === "erro" ? <span style={{ color: "var(--red)" }}>erro</span>
                     : <span className="edp-mono">{r.idSap ?? "—"}</span>}
                  </td>
                  <td style={td}>
                    {r.editando ? (
                      <input value={r.localEditado ?? ""} autoFocus
                             onChange={(e) => {
                               const m = maskLocal(e.target.value);
                               setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, localEditado: m } : x));
                             }}
                             style={{ width: 150, padding: "4px 8px", borderRadius: 6,
                                      border: "1px solid var(--line)", background: "var(--surface-2)",
                                      color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12 }} />
                    ) : r.estado === "ok" ? (
                      <span className="edp-mono">{r.localAtual ? maskLocal(r.localAtual) : "—"}</span>
                    ) : (
                      <span style={{ color: "var(--text-mute)" }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    {r.estado === "erro"
                      ? <span style={{ color: "var(--red)", fontSize: 11 }}>{r.erro}</span>
                      : r.classificacao
                        ? <span style={{ color: STATUS_COR[r.classificacao] ?? "var(--text-mute)", fontWeight: 600 }}>
                            {r.arquivado ? "arquivada" : r.classificacao}
                          </span>
                        : null}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {r.estado === "ok" && !r.editando && (
                        <button className="edp-btn sm" onClick={() => iniciarEdicao(r)}
                                style={{ fontSize: 11, padding: "3px 6px", color: "var(--accent)", borderColor: "var(--accent)" }}>
                          Alterar local
                        </button>
                      )}
                      {r.editando && (
                        <>
                          <button className="edp-btn sm"
                                  disabled={r.salvandoLocal || unmaskLocal(r.localEditado ?? "") === (r.localAtual ?? "")}
                                  onClick={() => salvarLocal(r)}
                                  style={{ fontSize: 11, padding: "3px 6px", color: "var(--accent)", borderColor: "var(--accent)" }}>
                            {r.salvandoLocal ? "…" : "Salvar"}
                          </button>
                          <button className="edp-btn sm" disabled={r.salvandoLocal}
                                  onClick={() => cancelarEdicao(r.id)}
                                  style={{ fontSize: 11, padding: "3px 6px" }}>
                            Cancelar
                          </button>
                        </>
                      )}
                      {!r.editando && (
                        <button className="edp-btn sm" onClick={() => removerLinha(r.id)}
                                title="Remover da lista"
                                style={{ fontSize: 11, padding: "3px 6px", color: "var(--red)" }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
```

(A linha vazia `colSpan={5}` permanece igual — continuam 5 colunas.)

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros. Conferir que não sobrou referência ao antigo Salvar inline na célula de local (foi movido para a coluna Ações) nem variável não usada.

- [ ] **Step 6: Verificação manual (dev server)**

Run: `cd frontend && npm run dev` (backend rodando).
Conferir:
- Linha consultada mostra o local como **texto** (mascarado), não input.
- "Alterar local" → vira input editável + botões "Salvar"/"Cancelar"; Salvar desabilitado enquanto não muda.
- Salvar chama `/local-instalacao` e volta a texto; Cancelar reverte e sai do modo edição.
- "✕" remove a linha (inclusive linhas de erro/502); backend não é chamado.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/coffee/coffee-gerar-modal.tsx
git commit -m "feat(ui): modal — local read-only + Alterar/Salvar/Cancelar e remover linha

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Persistência da lista em sessão

**Files:**
- Modify: `frontend/src/coffee/coffee-gerar-modal.tsx`

**Interfaces:**
- Consumes: `Row` (de Task 1), `setRows`, `consultar`, estado `rows`/`open`/`gerando`/`idsIniciais`.
- Produces: helpers de módulo `lerRows()`/`gravarRows(rows)`; efeito de hidratação ao abrir; efeito de gravação; handler `limpar()`; botão "Limpar" no rodapé.

- [ ] **Step 1: Adicionar helpers de sessão no nível de módulo**

No topo de `coffee-gerar-modal.tsx`, logo após `unmaskLocal` (antes de `interface Row`), adicionar:

```ts
const STORAGE_ROWS = "edp_coffee_gerar_rows";
function lerRows(): Row[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_ROWS);
    return raw ? (JSON.parse(raw) as Row[]) : [];
  } catch { return []; }
}
function gravarRows(rows: Row[]): void {
  try { sessionStorage.setItem(STORAGE_ROWS, JSON.stringify(rows)); } catch { /* ignore */ }
}
```

(`Row` é declarado logo abaixo; como `lerRows`/`gravarRows` só usam o tipo em anotação, o `tsc` resolve por hoisting do tipo. Se o build reclamar de uso-antes-de-declaração do tipo, mover o `interface Row` para acima destes helpers.)

- [ ] **Step 2: Substituir o efeito de abertura (hidratar em vez de zerar)**

Trocar o efeito atual:

```tsx
  // Ao abrir: zera e consulta os ids iniciais.
  React.useEffect(() => {
    if (!open) return;
    setRows([]); setInput(""); setGerando({ rodando: false, feitas: 0, total: 0 });
    (idsIniciais ?? []).forEach(consultar);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
```

por:

```tsx
  // Ao abrir: hidrata da sessão, re-consulta linhas interrompidas e soma a fila.
  React.useEffect(() => {
    if (!open) return;
    setInput(""); setGerando({ rodando: false, feitas: 0, total: 0 });
    const salvas = lerRows().map((r) => ({ ...r, salvandoLocal: false }));
    setRows(salvas);
    salvas.filter((r) => r.estado === "consultando").forEach((r) => consultar(r.id));
    const existentes = new Set(salvas.map((r) => r.id));
    (idsIniciais ?? []).filter((id) => !existentes.has(id)).forEach(consultar);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Adicionar o efeito de gravação**

Logo após o efeito de abertura, adicionar:

```tsx
  // Persiste a lista em sessão a cada mudança (enquanto o modal está aberto).
  React.useEffect(() => {
    if (open) gravarRows(rows);
  }, [rows, open]);
```

- [ ] **Step 4: Adicionar o handler `limpar`**

Adicionar perto dos outros handlers (ex. após `removerLinha`):

```tsx
  function limpar(): void {
    setRows([]);
    try { sessionStorage.removeItem(STORAGE_ROWS); } catch { /* ignore */ }
  }
```

- [ ] **Step 5: Adicionar o botão "Limpar" no rodapé**

No rodapé, antes do botão "Fechar":

```tsx
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="edp-btn sm" onClick={limpar}
                  disabled={rows.length === 0 || gerando.rodando}>Limpar</button>
          <button className="edp-btn sm" onClick={onClose} disabled={gerando.rodando}>Fechar</button>
          <button className="edp-btn sm" onClick={reconsultarTodas}
                  disabled={rows.length === 0 || gerando.rodando}>Consultar</button>
          <button className="edp-btn sm" onClick={gerar}
                  disabled={rows.length === 0 || gerando.rodando}
                  style={{ fontWeight: 600, color: "var(--accent)", borderColor: "var(--accent)" }}>
            Gerar ({rows.length})
          </button>
        </div>
```

- [ ] **Step 6: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 7: Verificação manual (dev server)**

Conferir:
- Consultar ids, fechar o modal e reabrir → a lista continua lá.
- "Gerar fila (N)" com o modal já populado → soma os ids da fila sem duplicar os existentes.
- "Limpar" esvazia a lista e a sessão.
- F5 (recarregar a aba) mantém a lista; abrir nova aba começa vazio (é `sessionStorage`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/coffee/coffee-gerar-modal.tsx
git commit -m "feat(ui): modal — persiste lista de notas em sessionStorage + botao Limpar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Remover linha do modal → Task 1 (`removerLinha` + ✕). ✓
- Local read-only por padrão → Task 1 (render texto vs input). ✓
- Botão "Alterar local" (cor de destaque) habilita edição; vira Salvar; Cancelar → Task 1. ✓
- Persistência em sessão (hidratar, gravar, sem reset automático) → Task 2. ✓
- "Gerar fila" soma ids sem duplicar → Task 2 (filtro `existentes`). ✓
- Botão "Limpar" → Task 2. ✓
- Linhas "consultando" interrompidas re-consultadas ao abrir → Task 2 (filtro + `consultar`). ✓
- `sessionStorage` em `try/catch` silencioso → Task 2 (helpers). ✓

**Placeholder scan:** sem TBD/TODO; todo passo com código concreto.

**Type consistency:** `Row.editando` (Task 1) usado por `iniciarEdicao`/`cancelarEdicao`/`salvarLocal`/render (Task 1) e persistido como parte de `Row` (Task 2). `lerRows(): Row[]`/`gravarRows(rows: Row[])` (Task 2) ↔ `setRows`/`rows: Row[]` existentes. `removerLinha`/`iniciarEdicao`/`cancelarEdicao`/`limpar` nomes consistentes entre definição e uso no render/rodapé. ✓
