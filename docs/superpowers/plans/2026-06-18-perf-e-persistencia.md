# Performance e persistência de estado — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acelerar o first paint, desacoplar a seção COFFEE da planilha do Verify, persistir os filtros do Verify ao trocar de seção e eliminar refetch desnecessário do Input.

**Architecture:** Quatro ajustes independentes. Backend ganha compressão GZip. Frontend ganha code-splitting (`React.lazy`) de Input/COFFEE, render do COFFEE independente do estado de upload, um hook `usePersistedState` sobre `sessionStorage` para os filtros do `Dashboard`, e `staleTime` maior no hook de dados do Input.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, FastAPI/Starlette. **Nenhuma dependência nova** (`GZipMiddleware` já vem no Starlette).

**Spec:** `docs/superpowers/specs/2026-06-18-perf-e-persistencia-design.md`

## Global Constraints

- Nenhuma dependência nova em nenhum dos lados.
- Sem framework de testes no frontend: a verificação de tarefas frontend é build limpo (`cd frontend; npm run build` = `tsc -b` + `vite build`) + checklist manual.
- Backend usa pytest, rodado de dentro de `backend/` (Windows/PowerShell).
- Comandos de verificação:
  - Backend: `cd backend; python -m pytest test_input_module.py test_upload.py -v`
  - Frontend: `cd frontend; npm run build`

---

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `backend/main.py` | Adiciona `GZipMiddleware`. |
| `backend/test_upload.py` | Teste de regressão de compressão. |
| `frontend/src/App.tsx` | Imports lazy + `Suspense`; render do COFFEE independente de `screen`; reset dos filtros em `handleUpload`/`loadDemo`. |
| `frontend/src/hooks/use-persisted-state.ts` | **Novo.** Hook `useState`-like sobre `sessionStorage`. |
| `frontend/src/components/dashboard.tsx` | Sete filtros migram de `useState` para estado persistido. |
| `frontend/src/input/use-input-data.ts` | `staleTime` 60s → 5 min. |

---

### Task 1: Compressão GZip no backend

**Files:**
- Modify: `backend/main.py:7-18` (imports + middlewares)
- Test: `backend/test_upload.py`

**Interfaces:**
- Consumes: `app` (FastAPI), endpoint existente `GET /api/data` (`main.get_data`), global `main.RECORDS`.
- Produces: respostas grandes passam a vir com `Content-Encoding: gzip` quando o cliente aceita.

- [ ] **Step 1: Escrever o teste (falha)**

Adicionar ao final de `backend/test_upload.py`:

```python
def test_gzip_comprime_resposta_grande(monkeypatch):
    """Respostas acima do limite saem comprimidas quando o cliente aceita gzip."""
    from fastapi.testclient import TestClient
    import main

    grande = [{"id": str(i), "errors": [], "uf": "SP", "setor": "Centro"}
              for i in range(500)]
    monkeypatch.setattr(main, "RECORDS", grande)
    client = TestClient(main.app)
    r = client.get("/api/data", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"
    # httpx descomprime transparentemente: o corpo continua íntegro
    assert len(r.json()["records"]) == 500
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_upload.py::test_gzip_comprime_resposta_grande -v`
Expected: FAIL — `assert None == "gzip"` (middleware ainda não instalado).

- [ ] **Step 3: Implementar**

Em `backend/main.py`, adicionar o import junto aos outros de middleware (logo após a linha 9, `from fastapi.staticfiles import StaticFiles`):

```python
from fastapi.middleware.gzip import GZipMiddleware
```

E registrar o middleware logo após o bloco `app.add_middleware(CORSMiddleware, ...)` (que termina na linha 18):

```python
app.add_middleware(GZipMiddleware, minimum_size=500)
```

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_upload.py -v`
Expected: todos PASSED (o novo + a regressão dos existentes).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_upload.py
git commit -m "feat: comprime respostas com GZipMiddleware"
```

---

### Task 2: Code-splitting de Input e COFFEE

**Files:**
- Modify: `frontend/src/App.tsx:8` e `:12` (imports), `:148-180` (render)

**Interfaces:**
- Consumes: named exports `InputSection` (`./input/input-section`) e `CoffeeSection` (`./components/coffee-section`).
- Produces: `InputSection`/`CoffeeSection` viram componentes `React.lazy`; toda a área de conteúdo passa a estar dentro de um `<React.Suspense>`. A ordem dos condicionais de render **não muda** nesta task (muda na Task 3).

- [ ] **Step 1: Trocar os imports estáticos por lazy**

Em `App.tsx`, **remover** estas duas linhas de import:

```tsx
import { CoffeeSection } from './components/coffee-section';
```
```tsx
import { InputSection } from './input/input-section';
```

E adicionar, logo abaixo do bloco de imports (após a linha `import { InputSection } ...` que foi removida), as declarações lazy:

```tsx
const InputSection = React.lazy(() =>
  import('./input/input-section').then((m) => ({ default: m.InputSection })));
const CoffeeSection = React.lazy(() =>
  import('./components/coffee-section').then((m) => ({ default: m.CoffeeSection })));
```

- [ ] **Step 2: Adicionar um fallback leve**

Em `App.tsx`, acima de `export default function App()`, adicionar:

```tsx
function SectionLoading(): React.JSX.Element {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
      Carregando…
    </div>
  );
}
```

- [ ] **Step 3: Envolver a área de conteúdo em `Suspense`**

Em `App.tsx`, o bloco de render atual (linhas ~148-180) começa com `{section === "input" ? (` e termina com `)}` antes de `</div>`. Envolver **todo** esse bloco ternário em um `<React.Suspense>`:

```tsx
        <React.Suspense fallback={<SectionLoading />}>
          {section === "input" ? (
            <InputSection t={t} />
          ) : screen === "upload" ? (
            <UploadScreen theme={t.theme} onDemo={loadDemo} onUpload={handleUpload} />
          ) : (
            <React.Fragment>
              <TopBar t={t} setTweak={setTweak} file={file} source={source} onReset={() => { setCoffeeReturn(null); setScreen("upload"); }} />
              {section === "coffee" && coffeeReturn && (
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "8px 18px",
                              background: "var(--tint-amber)", borderBottom: "1px solid rgba(240,169,59,.3)",
                              fontSize: 13, color: "var(--text)" }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>←</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    Você estava na{" "}
                    <strong className="edp-mono" style={{ fontSize: 13 }}>Nota {coffeeReturn.noteId}</strong>
                    {coffeeReturn.noteRef ? <span style={{ color: "var(--text-dim)" }}> · {coffeeReturn.noteRef}</span> : null}
                  </span>
                  <button className="edp-btn sm" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 600 }}
                          onClick={() => { changeSection("triagem"); }}>
                    ← Voltar à triagem
                  </button>
                  <button onClick={() => setCoffeeReturn(null)}
                          style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--text-mute)", padding: "2px 6px" }}
                          title="Dispensar" aria-label="Dispensar">×</button>
                </div>
              )}
              {section === "triagem"
                ? <Dashboard t={t} notes={notes} completed={completed} dupResolved={dupResolved}
                             onToggleComplete={toggleComplete} onMarkMany={markMany} onMarkDuplicate={markDuplicate}
                             onSendToCoffee={sendToCoffeeQueue} />
                : <CoffeeSection notes={notes} layout={t.coffeeLayout} />}
            </React.Fragment>
          )}
        </React.Suspense>
```

(É o mesmo conteúdo de antes, apenas indentado dentro do `<React.Suspense>`.)

- [ ] **Step 4: Verificar o build e os chunks separados**

Run: `cd frontend; npm run build`
Expected: build sem erros de TypeScript. Na listagem final do Vite, agora há **mais de um** `dist/assets/*.js` (o chunk principal menor + chunks separados para `input-section` e `coffee-section`), em vez de um único arquivo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "perf: code-splitting de Input e COFFEE com React.lazy"
```

---

### Task 3: COFFEE independente da planilha do Verify

**Files:**
- Modify: `frontend/src/App.tsx:148-180` (ordem dos condicionais de render, dentro do `Suspense` da Task 2)

**Interfaces:**
- Consumes: o `<React.Suspense>` e os componentes lazy criados na Task 2; estados `section`, `screen`, `notes`, `coffeeReturn` já existentes no `App`.
- Produces: `section === "coffee"` renderiza o `CoffeeSection` independentemente de `screen`. `TopBar` e a faixa `coffeeReturn` só aparecem no COFFEE quando `screen === "dashboard"`.

- [ ] **Step 1: Reordenar os condicionais de render**

Em `App.tsx`, substituir **todo** o conteúdo dentro do `<React.Suspense fallback={<SectionLoading />}>` (introduzido na Task 2) por:

```tsx
          {section === "input" ? (
            <InputSection t={t} />
          ) : section === "coffee" ? (
            <React.Fragment>
              {screen === "dashboard" && (
                <TopBar t={t} setTweak={setTweak} file={file} source={source} onReset={() => { setCoffeeReturn(null); setScreen("upload"); }} />
              )}
              {screen === "dashboard" && coffeeReturn && (
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "8px 18px",
                              background: "var(--tint-amber)", borderBottom: "1px solid rgba(240,169,59,.3)",
                              fontSize: 13, color: "var(--text)" }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>←</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    Você estava na{" "}
                    <strong className="edp-mono" style={{ fontSize: 13 }}>Nota {coffeeReturn.noteId}</strong>
                    {coffeeReturn.noteRef ? <span style={{ color: "var(--text-dim)" }}> · {coffeeReturn.noteRef}</span> : null}
                  </span>
                  <button className="edp-btn sm" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 600 }}
                          onClick={() => { changeSection("triagem"); }}>
                    ← Voltar à triagem
                  </button>
                  <button onClick={() => setCoffeeReturn(null)}
                          style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--text-mute)", padding: "2px 6px" }}
                          title="Dispensar" aria-label="Dispensar">×</button>
                </div>
              )}
              <CoffeeSection notes={notes} layout={t.coffeeLayout} />
            </React.Fragment>
          ) : screen === "upload" ? (
            <UploadScreen theme={t.theme} onDemo={loadDemo} onUpload={handleUpload} />
          ) : (
            <React.Fragment>
              <TopBar t={t} setTweak={setTweak} file={file} source={source} onReset={() => { setCoffeeReturn(null); setScreen("upload"); }} />
              <Dashboard t={t} notes={notes} completed={completed} dupResolved={dupResolved}
                         onToggleComplete={toggleComplete} onMarkMany={markMany} onMarkDuplicate={markDuplicate}
                         onSendToCoffee={sendToCoffeeQueue} />
            </React.Fragment>
          )}
```

Mudanças em relação à Task 2: o ramo `section === "coffee"` saiu de dentro do bloco `dashboard` e virou um ramo próprio antes de `screen === "upload"`; o `TopBar` e a faixa `coffeeReturn` do COFFEE ficam condicionados a `screen === "dashboard"`; o ramo final (`else`) agora só trata a triagem.

- [ ] **Step 2: Verificar o build**

Run: `cd frontend; npm run build`
Expected: sem erros de TypeScript.

- [ ] **Step 3: Verificação manual — COFFEE sem planilha**

Run: `cd frontend; npm run dev` e abrir `http://localhost:5173`.
Conferir, **sem** fazer upload nem carregar a demo:
1. Clicar em COFFEE na sidebar → a seção abre (não cai na tela de upload).
2. Digitar um ID válido (5–12 dígitos) + Enter → o chip aparece com o ID; "Adicionar" funciona.
3. Sem planilha, o chip mostra só o ID (sem tipo/referência) — comportamento esperado.
4. Carregar a demo, ir ao Verify, voltar ao COFFEE → os chips agora mostram tipo/referência das notas conhecidas, e (vindo da triagem via "enviar ao COFFEE") a faixa "voltar à triagem" aparece.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "fix: COFFEE acessivel sem planilha do Verify carregada"
```

---

### Task 4: Filtros do Verify persistentes em sessionStorage

**Files:**
- Create: `frontend/src/hooks/use-persisted-state.ts`
- Modify: `frontend/src/components/dashboard.tsx:24-31` (filtros)
- Modify: `frontend/src/App.tsx` (`handleUpload`, `loadDemo`)

**Interfaces:**
- Produces: `usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>]` — igual a `useState`, mas hidrata de e grava em `sessionStorage`.
- Consumes: estado de filtros do `Dashboard` (`q`, `uf`, `setor`, `urg`, `status`, `situacao`, `rules`).

- [ ] **Step 1: Criar o hook**

Criar `frontend/src/hooks/use-persisted-state.ts`:

```tsx
import React from 'react';

/** useState que hidrata de e grava em sessionStorage (defensivo a JSON/quota). */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  React.useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sessionStorage indisponível ou cheio: ignora */
    }
  }, [key, value]);
  return [value, setValue];
}
```

- [ ] **Step 2: Migrar os filtros do Dashboard**

Em `frontend/src/components/dashboard.tsx`:

Adicionar ao bloco de imports (após a linha 6, `import { KpiDrawer } from './kpi-drawer';`):

```tsx
import { usePersistedState } from '../hooks/use-persisted-state';
```

Substituir as seis linhas de filtros de texto (linhas 24-29):

```tsx
  const [q, setQ] = React.useState("");
  const [uf, setUf] = React.useState("all");
  const [setor, setSetor] = React.useState("all");
  const [urg, setUrg] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [situacao, setSituacao] = React.useState("all");
```

por:

```tsx
  const [q, setQ] = usePersistedState("edp_verify_q", "");
  const [uf, setUf] = usePersistedState("edp_verify_uf", "all");
  const [setor, setSetor] = usePersistedState("edp_verify_setor", "all");
  const [urg, setUrg] = usePersistedState("edp_verify_urg", "all");
  const [status, setStatus] = usePersistedState("edp_verify_status", "all");
  const [situacao, setSituacao] = usePersistedState("edp_verify_situacao", "all");
```

Substituir a linha de `rules` (linha 30):

```tsx
  const [rules, setRules] = React.useState<Set<RuleKey>>(() => new Set());
```

por (persiste como array e reconstrói o `Set`, mantendo a assinatura `setRules(Set)` que o resto do arquivo já usa):

```tsx
  const [rulesArr, setRulesArr] = usePersistedState<RuleKey[]>("edp_verify_rules", []);
  const rules = React.useMemo(() => new Set(rulesArr), [rulesArr]);
  const setRules = React.useCallback((s: Set<RuleKey>) => setRulesArr([...s]), [setRulesArr]);
```

Nenhuma outra linha muda: `rules.has`, `rules.size`, `rules.forEach`, `setRules(s)` e `setRules(new Set())` continuam válidos.

- [ ] **Step 3: Resetar os filtros ao carregar nova planilha**

Em `frontend/src/App.tsx`, adicionar um helper acima de `export default function App()` (junto de `SectionLoading`):

```tsx
const VERIFY_FILTER_KEYS = [
  "edp_verify_q", "edp_verify_uf", "edp_verify_setor", "edp_verify_urg",
  "edp_verify_status", "edp_verify_situacao", "edp_verify_rules",
];
function limparFiltrosVerify(): void {
  try { VERIFY_FILTER_KEYS.forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
}
```

Em `loadDemo`, antes de `setSource("demo")` (linha ~88), adicionar:

```tsx
    limparFiltrosVerify();
```

Em `handleUpload`, depois de `const d = await EDPApi.fetchData();` e antes de `setNotes(d.notes)` (linha ~94), adicionar:

```tsx
    limparFiltrosVerify();
```

(O `Dashboard` está desmontado durante o upload — `screen === "upload"` —, então ao montar de novo ele hidrata as chaves já limpas e cai nos defaults.)

- [ ] **Step 4: Verificar o build**

Run: `cd frontend; npm run build`
Expected: sem erros de TypeScript.

- [ ] **Step 5: Verificação manual — persistência dos filtros**

Run: `cd frontend; npm run dev`. Carregar a demo e ir ao Verify.
1. Aplicar busca + filtro de UF + um chip de Bloqueio.
2. Ir ao COFFEE e voltar à triagem → filtros intactos.
3. Recarregar a aba (F5) → filtros ainda intactos.
4. Carregar nova planilha (botão "↑ Nova" → demo/upload) → filtros zerados.
5. Fechar a aba e abrir de novo `http://localhost:5173` → filtros zerados (sessionStorage não sobrevive à sessão).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/use-persisted-state.ts frontend/src/components/dashboard.tsx frontend/src/App.tsx
git commit -m "feat: filtros do Verify persistidos em sessionStorage"
```

---

### Task 5: staleTime maior no Input

**Files:**
- Modify: `frontend/src/input/use-input-data.ts:6-11`

**Interfaces:**
- Consumes: `useQuery` com `queryKey: ['input-dados']`.
- Produces: trocar de seção e voltar dentro de 5 min não dispara refetch.

- [ ] **Step 1: Subir o staleTime**

Em `frontend/src/input/use-input-data.ts`, na configuração do `useQuery` (linhas 6-11), trocar:

```tsx
    staleTime: 60_000,
```

por:

```tsx
    staleTime: 300_000, // 5 min: alinhado ao gcTime; evita refetch ao trocar de seção
```

- [ ] **Step 2: Verificar o build**

Run: `cd frontend; npm run build`
Expected: sem erros de TypeScript.

- [ ] **Step 3: Verificação manual — cache do Input**

Run: `cd frontend; npm run dev` (com o backend de pé). Abrir o DevTools → Network.
1. Entrar no Input (a 1ª carga é lenta — leitura da rede, esperado).
2. Ir ao Verify e voltar ao Input em < 5 min → carrega instantâneo, **sem** nova requisição a `/api/input/notas` na aba Network.
3. O botão "Recarregar" e o aviso de sincronização continuam forçando atualização normalmente.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/input/use-input-data.ts
git commit -m "perf: staleTime do Input em 5min para evitar refetch ao navegar"
```

---

## Verificação final

- [ ] Backend: `cd backend; python -m pytest test_input_module.py test_upload.py -v` → todos PASSED.
- [ ] Frontend: `cd frontend; npm run build` → sem erros; múltiplos chunks em `dist/assets/`.
- [ ] Checklist manual consolidado: first paint pinta antes de o Input carregar e o JS principal vem `Content-Encoding: gzip` (DevTools → Network); COFFEE abre sem planilha; filtros do Verify sobrevivem a troca de seção e reload, e zeram em nova planilha; Input não refaz fetch ao voltar em < 5 min.
