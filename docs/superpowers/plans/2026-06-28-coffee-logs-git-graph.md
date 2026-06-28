# Logs COFFEE — árvore git-graph, toggle de Dev e filtro por passo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a timeline plana de logs COFFEE numa árvore `git log --graph` (ação-cabeçalho → eventos filhos), com toggle "Logs de Dev" e filtro por passo do fluxo.

**Architecture:** Backend só adiciona o vínculo explícito (`trace_id` por requisição via `contextvars` + middleware) e dois cabeçalhos que faltavam; o frontend faz todo o agrupamento, filtro e render. Função pura `agruparLogs` agrupa por `trace_id`; `LogTable` renderiza o git-graph; o toggle de Dev (em Configurações) controla a profundidade.

**Tech Stack:** Backend FastAPI + SQLite (`contextvars`, `pytest`). Frontend React 18 + TypeScript + Vite (sem test runner → check = `npm run build` + manual).

## Global Constraints

- **Sem endpoint novo.** `GET /logs` só ganha `trace_id` no retorno e um ajuste no filtro `nota_pk`. (spec §Não-objetivos)
- Vínculo é **explícito** via `trace_id` (não heurística por janela de tempo).
- Agrupamento, filtro de passo e toggle de Dev são **client-side**.
- `corrigidas`/`pendentes` filtram pelo **evento de transição** (`transicao classificar`, `detalhes.novo`), não pelo estado atual.
- Filtro de passo entra **nas duas** telas: `CoffeeLogs` e `LogDrawer`.
- Toggle de Dev esconde **só** `api_call` + `transicao`; `acao_usuario` aparece sempre (cabeçalho ou filho).
- `registrar_log` continua best-effort (nunca levanta). `sessionStorage`/`localStorage` em `try/catch` silencioso (o `settings-context` já faz).
- Backend: `cd backend && python -m pytest test_coffee_module.py` continua verde.
- Frontend: `cd frontend && npm run build` (`tsc -b && vite build`) sem erros; verificação manual no dev server.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**Backend**
- `backend/coffee_module/db.py` — contextvar `_trace_atual` + `definir_trace`; `registrar_log` carimba `trace_id`; `_COLUNAS_LOG`/CREATE/ALTER ganham a coluna; `listar_logs` ajusta o filtro `nota_pk`.
- `backend/main.py` — middleware que gera um `trace_id` por requisição.
- `backend/coffee_module/jobs.py` — `iniciar_busca`/`iniciar_geracao` recebem o trace e setam no início da thread.
- `backend/coffee_module/routes.py` — `/buscar` e `/gerar-lote` passam o trace; `/consultar` (sucesso) e `/local-instalacao` logam `acao_usuario`.
- `backend/test_coffee_module.py` — testes do trace, dos cabeçalhos novos e do filtro `nota_pk`.

**Frontend**
- `frontend/src/coffee/types.ts` — `trace_id` em `CoffeeLog`.
- `frontend/src/context/settings-context.tsx` — setting `devLogs`.
- `frontend/src/pages/configuracoes.tsx` — card "Logs" com `<Switch>`.
- `frontend/src/coffee/coffee-log-table.tsx` — funções puras (`agruparLogs`, `classeAtual`, `grupoNoPasso`, `PASSOS`) + render git-graph.
- `frontend/src/coffee/coffee-logs.tsx` — filtro de passo, `notaRoot`, para de mandar `tipo`.
- `frontend/src/coffee/coffee-log-drawer.tsx` — filtro de passo; remove `TIPOS`.

---

### Task 1: Backend — coluna `trace_id`, contextvar e middleware

**Files:**
- Modify: `backend/coffee_module/db.py`
- Modify: `backend/main.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `registrar_log`, `listar_logs`, `inicializar_banco`, `_COLUNAS_LOG` (existentes).
- Produces: `db.definir_trace(trace_id: str | None) -> None`; `coffee_logs.trace_id` (coluna); `CoffeeLog` passa a ter `trace_id` no dict de `listar_logs`. A `acao_usuario` de qualquer requisição passa a ter `trace_id` não-nulo.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Logs git-graph — trace_id
# ---------------------------------------------------------------------------


def test_registrar_log_carimba_trace(coffee_tmp):
    from coffee_module import db
    db.definir_trace("abc123")
    db.registrar_log("acao_usuario", "x", None, {"k": 1}, True)
    db.definir_trace(None)
    db.registrar_log("acao_usuario", "y", None, None, True)
    logs = db.listar_logs()
    x = next(l for l in logs if l["acao"] == "x")
    y = next(l for l in logs if l["acao"] == "y")
    assert x["trace_id"] == "abc123"
    assert y["trace_id"] is None


def test_middleware_carimba_trace_na_requisicao(coffee_cliente):
    from coffee_module import db
    coffee_cliente.post("/api/coffee/buscar", json={"ids": ["1"]})
    lote = [l for l in db.listar_logs(tipo="acao_usuario") if l["acao"] == "busca_lote"]
    assert lote and lote[0]["trace_id"] is not None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py::test_registrar_log_carimba_trace test_coffee_module.py::test_middleware_carimba_trace_na_requisicao -v`
Expected: FAIL (`AttributeError: module 'coffee_module.db' has no attribute 'definir_trace'` e `KeyError: 'trace_id'`).

- [ ] **Step 3: Adicionar contextvar e `definir_trace` em `db.py`**

No topo de `backend/coffee_module/db.py`, após os imports (depois de `import sqlite3`), adicionar:

```python
import contextvars
```

E logo após a função `_usuario_atual` (antes de `_COLUNAS = [...]`), adicionar:

```python
_trace_atual: contextvars.ContextVar = contextvars.ContextVar("coffee_trace", default=None)


def definir_trace(trace_id) -> None:
    """Define o trace_id da operação atual (por requisição / por thread de job)."""
    _trace_atual.set(trace_id)
```

- [ ] **Step 4: Coluna `trace_id` no schema (CREATE + ALTER)**

Em `inicializar_banco`, na criação de `coffee_logs`, adicionar a coluna ao `CREATE TABLE` (após `usuario TEXT`):

```python
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS coffee_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT NOT NULL,
            tipo        TEXT NOT NULL,
            acao        TEXT NOT NULL,
            nota_pk     INTEGER,
            detalhes    TEXT,
            sucesso     INTEGER NOT NULL,
            usuario     TEXT,
            trace_id    TEXT
        )
        """
    )
    cols_logs = [r[1] for r in conn.execute("PRAGMA table_info(coffee_logs)").fetchall()]
    if "usuario" not in cols_logs:
        conn.execute("ALTER TABLE coffee_logs ADD COLUMN usuario TEXT")
    if "trace_id" not in cols_logs:
        conn.execute("ALTER TABLE coffee_logs ADD COLUMN trace_id TEXT")
```

- [ ] **Step 5: `registrar_log` grava o trace + `_COLUNAS_LOG`**

Trocar a constante `_COLUNAS_LOG`:

```python
_COLUNAS_LOG = ["id", "timestamp", "tipo", "acao", "nota_pk", "detalhes", "sucesso", "usuario", "trace_id"]
```

Em `registrar_log`, atualizar a CREATE inline (rede de segurança) e o INSERT para incluir `trace_id`:

```python
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS coffee_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
                tipo TEXT NOT NULL, acao TEXT NOT NULL, nota_pk INTEGER,
                detalhes TEXT, sucesso INTEGER NOT NULL, usuario TEXT, trace_id TEXT
            )
            """
        )
        conn.execute(
            "INSERT INTO coffee_logs (timestamp, tipo, acao, nota_pk, detalhes, sucesso, usuario, trace_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (datetime.datetime.now().isoformat(), tipo, acao, nota_pk, det,
             1 if sucesso else 0, _usuario_atual(), _trace_atual.get()),
        )
```

(`listar_logs` já faz `SELECT {', '.join(_COLUNAS_LOG)}` e `dict(zip(_COLUNAS_LOG, r))`, então o `trace_id` entra no retorno automaticamente.)

- [ ] **Step 6: Middleware em `main.py`**

Em `backend/main.py`, adicionar o import (junto aos outros de `coffee_module`/topo) e o middleware logo após `app.add_middleware(GZipMiddleware, minimum_size=500)` (linha 20):

```python
import uuid

from coffee_module import db as _coffee_db


@app.middleware("http")
async def _trace_middleware(request, call_next):
    _coffee_db.definir_trace(uuid.uuid4().hex[:12])
    return await call_next(request)
```

(Endpoints sync rodam no threadpool do anyio, que copia o contexto atual — o `trace_id` setado aqui é visível em `registrar_log`. Cada requisição roda num contexto próprio: sem vazamento entre chamadas.)

- [ ] **Step 7: Rodar a suíte inteira**

Run: `cd backend && python -m pytest test_coffee_module.py -q`
Expected: os 2 testes novos PASSAM; os demais continuam verdes (a coluna nova é aditiva; o middleware não muda contratos).

- [ ] **Step 8: Commit**

```bash
git add backend/coffee_module/db.py backend/main.py backend/test_coffee_module.py
git commit -m "feat(coffee): trace_id por requisicao (contextvar + middleware) nos logs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Backend — propagar o trace pros jobs

**Files:**
- Modify: `backend/coffee_module/jobs.py`
- Modify: `backend/coffee_module/routes.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `db.definir_trace` (Task 1); `jobs.iniciar_busca`, `jobs.iniciar_geracao`, `jobs._rodar`, `jobs._rodar_geracao` (existentes).
- Produces: `iniciar_busca(ids, trace=None)`, `iniciar_geracao(ids, justificativa=None, trace=None)`; as threads de job carimbam os filhos com o trace recebido.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `backend/test_coffee_module.py`:

```python
def test_job_geracao_propaga_trace_aos_filhos(coffee_cliente, monkeypatch):
    from coffee_module import client, db, jobs
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda id: {"pk": int(id), "id_sap": 10000000, "arquivado": False,
                    "local_instalacao": None, "fields": {"id_sap": 10000000}},
    )
    monkeypatch.setattr(client, "definir_sap", lambda i, s: True)
    r = coffee_cliente.post("/api/coffee/gerar-lote", json={"ids": [355617]})
    _aguardar_job(jobs, r.json()["job_id"])
    logs = db.listar_logs()
    lote = next(l for l in logs if l["acao"] == "geracao_lote")
    filhos = [l for l in logs if l["acao"] == "buscar_nota"]
    assert lote["trace_id"] is not None
    assert filhos and all(f["trace_id"] == lote["trace_id"] for f in filhos)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py::test_job_geracao_propaga_trace_aos_filhos -v`
Expected: FAIL (os `buscar_nota` rodam na thread do job, que não herda o contextvar → `trace_id` None ≠ o do `geracao_lote`).

- [ ] **Step 3: `iniciar_busca`/`_rodar` recebem e setam o trace**

Em `backend/coffee_module/jobs.py`, trocar `iniciar_busca` e `_rodar`:

```python
def iniciar_busca(ids: list, trace: str | None = None) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(ids),
            "feitas": 0,
            "erros": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar, args=(job_id, list(ids), trace), daemon=True).start()
    return job_id


def _rodar(job_id: str, ids: list, trace: str | None = None) -> None:
    db.definir_trace(trace)
    for ident in ids:
```

(o resto de `_rodar` permanece igual.)

- [ ] **Step 4: `iniciar_geracao`/`_rodar_geracao` recebem e setam o trace**

Ainda em `jobs.py`, trocar `iniciar_geracao` e a assinatura/topo de `_rodar_geracao`:

```python
def iniciar_geracao(ids: list, justificativa: str | None = None,
                    trace: str | None = None) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(ids),
            "feitas": 0,
            "erros": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar_geracao, args=(job_id, list(ids), trace),
                     daemon=True).start()
    return job_id


def _rodar_geracao(job_id: str, ids: list, trace: str | None = None) -> None:
    db.definir_trace(trace)
    for ident in ids:
```

(o corpo do laço de `_rodar_geracao` permanece igual.)

- [ ] **Step 5: As rotas passam o trace atual**

Em `backend/coffee_module/routes.py`, na rota `buscar` (linha ~66), passar o trace:

```python
    db.registrar_log("acao_usuario", "busca_lote", None,
                     {"ids": pedido.ids, "total": len(pedido.ids)}, True)
    return {"job_id": jobs.iniciar_busca(pedido.ids, trace=db.trace_atual())}
```

Na rota `gerar_lote` (linha ~208), idem:

```python
    db.registrar_log("acao_usuario", "geracao_lote", None,
                     {"ids": pedido.ids, "total": len(pedido.ids),
                      "justificativa": pedido.justificativa}, True)
    return {"job_id": jobs.iniciar_geracao(pedido.ids, pedido.justificativa,
                                           trace=db.trace_atual())}
```

- [ ] **Step 6: Adicionar `trace_atual` em `db.py`**

Em `backend/coffee_module/db.py`, logo após `definir_trace` (Task 1), adicionar:

```python
def trace_atual():
    """Lê o trace_id da operação atual (ou None)."""
    return _trace_atual.get()
```

- [ ] **Step 7: Rodar a suíte**

Run: `cd backend && python -m pytest test_coffee_module.py -q`
Expected: o teste novo PASSA; os demais verdes.

- [ ] **Step 8: Commit**

```bash
git add backend/coffee_module/jobs.py backend/coffee_module/routes.py backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): jobs propagam trace_id pros logs filhos do lote

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Backend — cabeçalhos de `consultar`/`alterar_local` e filtro `nota_pk`

**Files:**
- Modify: `backend/coffee_module/routes.py`
- Modify: `backend/coffee_module/db.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `db.registrar_log`, `db.listar_logs`, `client.buscar_nota`, `client.alterar_local` (existentes).
- Produces: `acao_usuario "consultar"` (sucesso) e `acao_usuario "alterar_local"`; `listar_logs(nota_pk=X)` passa a incluir as `acao_usuario` (mesmo com `nota_pk` NULL) dos traces que tocam X.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/test_coffee_module.py`:

```python
def test_consultar_sucesso_loga_acao_usuario(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda id: {"pk": int(id), "id_sap": 17247854, "arquivado": False,
                    "local_instalacao": "718ET00026773", "fields": {"id_sap": 17247854}},
    )
    coffee_cliente.get("/api/coffee/consultar/44421")
    consultas = [l for l in db.listar_logs(tipo="acao_usuario")
                 if l["acao"] == "consultar" and l["sucesso"]]
    assert consultas and consultas[0]["nota_pk"] == 44421


def test_alterar_local_loga_acao_usuario(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    monkeypatch.setattr(client, "alterar_local", lambda i, l: True)
    coffee_cliente.post("/api/coffee/local-instalacao",
                        json={"id": 44421, "local": "718ET00026773"})
    locs = [l for l in db.listar_logs(tipo="acao_usuario") if l["acao"] == "alterar_local"]
    assert locs and locs[0]["nota_pk"] == 44421


def test_listar_logs_nota_inclui_cabecalho_de_lote(coffee_tmp):
    from coffee_module import db
    db.definir_trace("t1")
    db.registrar_log("acao_usuario", "geracao_lote", None, {"total": 2}, True)
    db.registrar_log("api_call", "buscar_nota", 44421, {"id": 44421}, True)
    db.definir_trace(None)
    db.registrar_log("acao_usuario", "outra", None, {}, True)
    acoes = {l["acao"] for l in db.listar_logs(nota_pk=44421)}
    assert "buscar_nota" in acoes       # filho da nota
    assert "geracao_lote" in acoes      # cabeçalho do trace (nota_pk NULL)
    assert "outra" not in acoes         # sem trace, não relacionado
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py::test_consultar_sucesso_loga_acao_usuario test_coffee_module.py::test_alterar_local_loga_acao_usuario test_coffee_module.py::test_listar_logs_nota_inclui_cabecalho_de_lote -v`
Expected: FAIL (sucesso de `consultar` não loga; `local-instalacao` não loga `acao_usuario`; filtro `nota_pk` exclui o cabeçalho de lote).

- [ ] **Step 3: `/consultar` sucesso loga `acao_usuario`**

Em `backend/coffee_module/routes.py`, na rota `consultar`, adicionar o log antes do `return` de sucesso:

```python
    db.registrar_log("acao_usuario", "consultar", nota["pk"], {"id": id}, True)
    return {
        "pk": nota["pk"],
        "id_sap": nota["id_sap"],
        "local_instalacao": nota["local_instalacao"],
        "classificacao": classe,
        "arquivado": nota["arquivado"],
    }
```

- [ ] **Step 4: `/local-instalacao` loga `acao_usuario`**

Na rota `local_instalacao`, adicionar o log após a chamada do client:

```python
@router.post("/local-instalacao")
def local_instalacao(pedido: LocalPedido):
    _garantir_banco()
    client.alterar_local(pedido.id, pedido.local)
    db.registrar_log("acao_usuario", "alterar_local", pedido.id,
                     {"id": pedido.id, "local": pedido.local}, True)
    return {"ok": True}
```

(Falha de `alterar_local` levanta dentro do client — o `api_call` de erro já é gravado lá; a `acao_usuario` só registra o sucesso.)

- [ ] **Step 5: Filtro `nota_pk` inclui os cabeçalhos do trace**

Em `backend/coffee_module/db.py`, em `listar_logs`, trocar o bloco do `nota_pk`:

```python
    if nota_pk is not None:
        clausulas.append(
            "(nota_pk = ? OR (tipo = 'acao_usuario' AND trace_id IN "
            "(SELECT trace_id FROM coffee_logs WHERE nota_pk = ? AND trace_id IS NOT NULL)))"
        )
        params.append(nota_pk)
        params.append(nota_pk)
```

- [ ] **Step 6: Rodar a suíte**

Run: `cd backend && python -m pytest test_coffee_module.py -q`
Expected: os 3 testes novos PASSAM; os demais verdes (o teste antigo `test_rota_logs_filtra` insere logs sem trace → a subconsulta não adiciona nada → `all(nota_pk==1)` segue válido).

- [ ] **Step 7: Commit**

```bash
git add backend/coffee_module/routes.py backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): cabecalhos consultar/alterar_local + filtro nota_pk inclui o lote

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — tipo `trace_id`, setting `devLogs` e toggle em Configurações

**Files:**
- Modify: `frontend/src/coffee/types.ts`
- Modify: `frontend/src/context/settings-context.tsx`
- Modify: `frontend/src/pages/configuracoes.tsx`

**Interfaces:**
- Consumes: `Settings`, `DEFAULTS`, `useSettings`, `<Switch>`, `<Card>` (existentes).
- Produces: `CoffeeLog.trace_id: string | null`; `Settings.devLogs: boolean` (default `false`); toggle "Habilitar logs de Dev" em Configurações.

- [ ] **Step 1: `trace_id` em `CoffeeLog`**

Em `frontend/src/coffee/types.ts`, na interface `CoffeeLog`, adicionar o campo após `usuario`:

```ts
export interface CoffeeLog {
  id: number;
  timestamp: string;
  tipo: "api_call" | "transicao" | "acao_usuario";
  acao: string;
  nota_pk: number | null;
  detalhes: Record<string, unknown> | null;
  sucesso: boolean;
  usuario: string | null;
  trace_id: string | null;
}
```

- [ ] **Step 2: `devLogs` no `Settings`**

Em `frontend/src/context/settings-context.tsx`, adicionar o campo à interface `Settings` e ao `DEFAULTS`:

```ts
export interface Settings {
  theme: Theme;
  density: Density;
  accent: Accent;
  showKpis: boolean;
  coffeeLayout: CoffeeLayout;
  devLogs: boolean;
}
```

```ts
const DEFAULTS: Settings = {
  theme: "system",
  density: "cozy",
  accent: ["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
  showKpis: true,
  coffeeLayout: "composer",
  devLogs: false,
};
```

- [ ] **Step 3: Card "Logs" em Configurações**

Em `frontend/src/pages/configuracoes.tsx`, adicionar um card depois do card "Seção COFFEE" (antes do fechamento `</div>` do `flex flex-col gap-4`):

```tsx
          <Card>
            <CardHeader>
              <CardTitle>Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <label htmlFor="dev-logs" className="cursor-pointer text-sm text-muted-foreground">
                  Habilitar logs de Dev
                </label>
                <Switch
                  id="dev-logs"
                  checked={settings.devLogs}
                  onCheckedChange={(v) => setSetting("devLogs", v)}
                />
              </div>
            </CardContent>
          </Card>
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 5: Verificação manual**

Run: `cd frontend && npm run dev`
Conferir: Configurações mostra "Logs → Habilitar logs de Dev"; alternar e recarregar mantém o valor (persistido pelo `settings-context`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/coffee/types.ts frontend/src/context/settings-context.tsx frontend/src/pages/configuracoes.tsx
git commit -m "feat(ui): setting devLogs + toggle Logs de Dev em Configuracoes; trace_id no tipo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — funções puras de agrupamento e passo

**Files:**
- Modify: `frontend/src/coffee/coffee-log-table.tsx`

**Interfaces:**
- Consumes: `CoffeeLog` (com `trace_id`, Task 4).
- Produces (exportados):
  - `interface Grupo { chave: string; cabecalho: CoffeeLog; filhos: CoffeeLog[]; transicaoNova?: "corrigida" | "pendente"; }`
  - `agruparLogs(logs: CoffeeLog[]): Grupo[]`
  - `classeAtual(logs: CoffeeLog[]): string | undefined`
  - `grupoNoPasso(g: Grupo, passo: string): boolean`
  - `PASSOS: ReadonlyArray<{ value: string; label: string }>`

- [ ] **Step 1: Adicionar as funções puras**

Em `frontend/src/coffee/coffee-log-table.tsx`, após o bloco `const DETAIL_LABELS = {...}` e a função `formatDetailValue` (antes de `StructuredDetails`), adicionar:

```tsx
export interface Grupo {
  chave: string;
  cabecalho: CoffeeLog;
  filhos: CoffeeLog[];
  transicaoNova?: "corrigida" | "pendente";
}

const ACOES_GERAR = new Set([
  "geracao_lote", "regerar", "geracao_ignorada_sap_real", "geracao_ignorada_arquivada",
]);
const ACOES_CONSULTAR = new Set(["busca_lote", "consultar"]);

export const PASSOS = [
  { value: "", label: "Todos" },
  { value: "gerar", label: "Gerar" },
  { value: "consultar", label: "Consultar" },
  { value: "alterar_local", label: "Alterar local" },
  { value: "corrigidas", label: "Corrigidas" },
  { value: "pendentes", label: "Pendentes" },
] as const;

// Agrupa por trace_id. Cabeçalho = a acao_usuario de lote (nota_pk NULL) se houver,
// senão a 1ª acao_usuario, senão o 1º log. Demais acao_usuario viram filhos.
export function agruparLogs(logs: CoffeeLog[]): Grupo[] {
  const porTrace = new Map<string, CoffeeLog[]>();
  const ordem: string[] = [];
  for (const l of logs) {
    const chave = l.trace_id ?? `__${l.id}`;
    if (!porTrace.has(chave)) { porTrace.set(chave, []); ordem.push(chave); }
    porTrace.get(chave)!.push(l);
  }
  return ordem.map((chave) => {
    const itens = porTrace.get(chave)!;
    const acoes = itens.filter((l) => l.tipo === "acao_usuario");
    const cabecalho = acoes.find((l) => l.nota_pk === null) ?? acoes[0] ?? itens[0];
    const filhos = itens.filter((l) => l !== cabecalho);
    const trans = itens.find(
      (l) => l.tipo === "transicao" && l.acao === "classificar" &&
             (l.detalhes?.novo === "corrigida" || l.detalhes?.novo === "pendente"),
    );
    return {
      chave, cabecalho, filhos,
      transicaoNova: trans?.detalhes?.novo as "corrigida" | "pendente" | undefined,
    };
  });
}

// Classificação atual da nota = o classificar mais recente nos logs (que vêm DESC).
export function classeAtual(logs: CoffeeLog[]): string | undefined {
  const t = logs.find((l) => l.tipo === "transicao" && l.acao === "classificar");
  return t?.detalhes?.novo as string | undefined;
}

export function grupoNoPasso(g: Grupo, passo: string): boolean {
  switch (passo) {
    case "gerar": return ACOES_GERAR.has(g.cabecalho.acao);
    case "consultar": return ACOES_CONSULTAR.has(g.cabecalho.acao);
    case "alterar_local": return g.cabecalho.acao === "alterar_local";
    case "corrigidas": return g.transicaoNova === "corrigida";
    case "pendentes": return g.transicaoNova === "pendente";
    default: return true; // "" (Todos) e qualquer valor desconhecido
  }
}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros (funções exportadas; ainda não usadas pelo render).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/coffee-log-table.tsx
git commit -m "feat(ui): agruparLogs/classeAtual/grupoNoPasso + constante PASSOS (puras)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — render git-graph no `LogTable`

**Files:**
- Modify: `frontend/src/coffee/coffee-log-table.tsx`

**Interfaces:**
- Consumes: `agruparLogs`, `classeAtual`, `grupoNoPasso`, `Grupo` (Task 5); `useSettings` (`settings.devLogs`); `StructuredDetails`, `TIPO_CLASS`, `TIPO_LABEL`, `formatRelativeTime` (existentes).
- Produces: `LogTable` com props novas `passo?: string` e `notaRoot?: number`; render agrupado git-graph; filhos `api_call`/`transicao` só com `devLogs` ON.

- [ ] **Step 1: Importar `useSettings`**

No topo de `frontend/src/coffee/coffee-log-table.tsx`, após os imports existentes, adicionar:

```tsx
import { useSettings } from '../context/settings-context';
```

- [ ] **Step 2: Estilos do git-graph**

No final da string `TIMELINE_STYLE` (antes da crase de fechamento), acrescentar:

```
  .clog-root{display:flex;align-items:center;gap:8px;padding:4px 22px 10px;font-weight:700}
  .clog-group{margin-bottom:4px}
  .clog-filho{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0;font-size:12px}
  .clog-filho:hover{background:var(--surface-2)}
  .clog-conector{color:var(--text-mute)}
```

- [ ] **Step 3: Helper de resumo do filho**

Antes da função `LogTable`, adicionar:

```tsx
function resumoFilho(l: CoffeeLog): string {
  const d = l.detalhes ?? {};
  if (l.tipo === "transicao" && l.acao === "classificar")
    return `${d.anterior ?? "?"} → ${d.novo ?? "?"}`;
  const partes: string[] = [];
  if (d.status_http != null) partes.push(String(d.status_http));
  if (d.tempo_ms != null) partes.push(`${d.tempo_ms}ms`);
  return partes.join(" · ");
}
```

- [ ] **Step 4: Reescrever `LogTable` (e a interface `LogTableProps`)**

Substituir o bloco que vai do `interface LogTableProps {` existente (logo acima de `LogTable`) até o `}` de fechamento da função `LogTable` — ou seja, a interface antiga **e** a função, de uma vez — por (atenção: não deixar a `interface LogTableProps` antiga no arquivo, senão fica duplicada):

```tsx
interface LogTableProps {
  logs: CoffeeLog[];
  loading: boolean;
  compact?: boolean;
  onClickNota?: (pk: number) => void;
  passo?: string;
  notaRoot?: number;
}

export function LogTable({ logs, loading, compact, onClickNota, passo = "", notaRoot }: LogTableProps): React.JSX.Element {
  const { settings } = useSettings();
  const dev = settings.devLogs;
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set());

  function toggle(id: number): void {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        Carregando logs...
      </div>
    );
  }

  const grupos = agruparLogs(logs).filter((g) => grupoNoPasso(g, passo));

  if (grupos.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontSize: 13, textAlign: "center", padding: 32 }}>
        Nenhum log encontrado.
      </div>
    );
  }

  const classe = notaRoot !== undefined ? classeAtual(logs) : undefined;

  return (
    <div className={`clog-timeline${compact ? " clog-compact" : ""}`}>
      <style>{TIMELINE_STYLE}</style>

      {notaRoot !== undefined && (
        <div className="clog-root">
          <span style={{ fontSize: 14 }}>Nota <span className="edp-mono">#{notaRoot}</span></span>
          {classe && (
            <span className="clog-tag" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
              {classe}
            </span>
          )}
        </div>
      )}

      {grupos.map((g) => {
        const visiveis = [...g.filhos].reverse().filter((f) => dev || f.tipo === "acao_usuario");
        return (
          <div key={g.chave} className="clog-group"
               style={{ marginLeft: notaRoot !== undefined ? 16 : 0 }}>
            <div className="clog-entry">
              <div className={`clog-dot ${g.cabecalho.sucesso ? "ok" : "fail"}`} />
              <div className="clog-card" style={{ cursor: g.cabecalho.detalhes ? "pointer" : undefined }}
                   onClick={() => { if (g.cabecalho.detalhes) toggle(g.cabecalho.id); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="edp-mono" style={{ fontSize: compact ? 10.5 : 11.5, color: "var(--text-mute)" }}
                        title={g.cabecalho.timestamp}>
                    {formatRelativeTime(g.cabecalho.timestamp)}
                  </span>
                  <span className={`clog-tag ${TIPO_CLASS[g.cabecalho.tipo] ?? ""}`}>
                    {TIPO_LABEL[g.cabecalho.tipo] ?? g.cabecalho.tipo}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: compact ? 12 : 13 }}>{g.cabecalho.acao}</span>
                  {g.cabecalho.nota_pk !== null && (
                    <span className="edp-mono" style={{ fontSize: 12, fontWeight: 600,
                      cursor: onClickNota ? "pointer" : undefined,
                      color: onClickNota ? "var(--accent)" : "var(--text)",
                      textDecoration: onClickNota ? "underline" : undefined }}
                      onClick={(e) => { if (onClickNota && g.cabecalho.nota_pk !== null) { e.stopPropagation(); onClickNota(g.cabecalho.nota_pk); } }}>
                      #{g.cabecalho.nota_pk}
                    </span>
                  )}
                  {g.transicaoNova && (
                    <span className="clog-tag" style={{
                      background: g.transicaoNova === "corrigida" ? "rgba(31,159,214,0.14)" : "rgba(245,158,11,0.16)",
                      color: g.transicaoNova === "corrigida" ? "#1f9fd6" : "var(--amber)" }}>
                      → {g.transicaoNova}
                    </span>
                  )}
                  {g.cabecalho.usuario && (
                    <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {g.cabecalho.usuario}
                    </span>
                  )}
                  {!g.cabecalho.sucesso && (
                    <span style={{ color: "var(--red)", fontSize: 11, fontWeight: 600 }}>FALHA</span>
                  )}
                  {g.cabecalho.detalhes && (
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-mute)" }}>
                      {expanded.has(g.cabecalho.id) ? "▲" : "▼"}
                    </span>
                  )}
                </div>
                {expanded.has(g.cabecalho.id) && <StructuredDetails detalhes={g.cabecalho.detalhes} />}
              </div>
            </div>

            {visiveis.map((f, i, arr) => (
              <div key={f.id} className="clog-filho" style={{ paddingLeft: 30, cursor: f.detalhes ? "pointer" : undefined }}
                   onClick={() => { if (f.detalhes) toggle(f.id); }}>
                <span className="clog-conector edp-mono">{i === arr.length - 1 ? "└──" : "├──"}</span>
                <span className={`clog-tag ${TIPO_CLASS[f.tipo] ?? ""}`}>{TIPO_LABEL[f.tipo] ?? f.tipo}</span>
                <span className="edp-mono" style={{ fontWeight: 600 }}>{f.acao}</span>
                {f.nota_pk !== null && (
                  <span className="edp-mono" style={{ color: "var(--text-mute)" }}>#{f.nota_pk}</span>
                )}
                <span className="edp-mono" style={{ color: "var(--text-mute)" }}>{resumoFilho(f)}</span>
                {!f.sucesso && <span style={{ color: "var(--red)", fontWeight: 600 }}>✗ FALHA</span>}
                {f.detalhes && (
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-mute)" }}>
                    {expanded.has(f.id) ? "▲" : "▼"}
                  </span>
                )}
                {expanded.has(f.id) && (
                  <div style={{ flexBasis: "100%" }}><StructuredDetails detalhes={f.detalhes} /></div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros. Conferir que não sobrou o `logs.map` antigo nem `LogTableProps` duplicada (a interface antiga foi substituída pela nova acima).

- [ ] **Step 6: Verificação manual**

Run: `cd frontend && npm run dev` (backend rodando).
Conferir na tela de Logs (sem filtro de passo ainda — Task 7 liga o controle): com Dev OFF cada grupo mostra só o cabeçalho (e eventuais `acao_usuario` filhos como `geracao_ignorada_*`); com Dev ON aparecem os filhos `api_call`/`transicao` com `├──`/`└──`. Clicar num filho/cabeçalho com detalhes expande o `StructuredDetails`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/coffee/coffee-log-table.tsx
git commit -m "feat(ui): LogTable renderiza arvore git-graph (toggle Dev controla os filhos)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — filtro de passo em `CoffeeLogs` e `LogDrawer`

**Files:**
- Modify: `frontend/src/coffee/coffee-logs.tsx`
- Modify: `frontend/src/coffee/coffee-log-drawer.tsx`

**Interfaces:**
- Consumes: `LogTable` (props `passo`/`notaRoot`, Task 6), `PASSOS` (Task 5), `useCoffeeLogs` (existente).
- Produces: segmentado de passo no lugar do de `tipo` nas duas telas; `CoffeeLogs` passa `notaRoot` quando há PK; `LogDrawer` passa `passo`. `TIPOS` removido de `coffee-log-drawer.tsx`.

- [ ] **Step 1: `CoffeeLogs` — trocar `tipo` por `passo`**

Em `frontend/src/coffee/coffee-logs.tsx`:

Trocar os imports do topo:

```tsx
import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS } from './coffee-log-table';
import { BASE as API_BASE } from '../api';
```

Trocar o estado `tipo` por `passo`:

```tsx
  const [passo, setPasso] = React.useState("");
```

Remover `tipo` da chamada do hook:

```tsx
  const parsedPk = notaPk.trim() ? Number(notaPk) : undefined;
  const pkValido = Number.isFinite(parsedPk) ? parsedPk : undefined;
  const { logs, loading } = useCoffeeLogs({
    nota_pk: pkValido,
    usuario: usuario || undefined,
    limit,
  });
```

Trocar o segmentado (o `<div className="edp-seg">` que mapeava `TIPOS`):

```tsx
        <div className="edp-seg">
          {PASSOS.map((p) => (
            <button key={p.value} className={passo === p.value ? "on" : ""}
                    onClick={() => setPasso(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
```

Trocar a renderização do `LogTable` no final:

```tsx
      <LogTable logs={logs} loading={loading} passo={passo} notaRoot={pkValido}
                onClickNota={(pk) => setNotaPk(String(pk))} />
```

- [ ] **Step 2: `LogDrawer` — trocar `tipo` por `passo` e remover `TIPOS`**

Em `frontend/src/coffee/coffee-log-drawer.tsx`:

Trocar imports e remover o `export const TIPOS`:

```tsx
import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS } from './coffee-log-table';
```

Trocar o estado e o hook:

```tsx
  const [passo, setPasso] = React.useState("");
  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: notaPk,
    limit: 50,
  });
```

Trocar o segmentado de filtro:

```tsx
        {/* filtro de passo */}
        <div style={{ flexShrink: 0, padding: "10px 16px 6px", display: "flex", gap: 0 }}>
          <div className="edp-seg" style={{ fontSize: 11 }}>
            {PASSOS.map((p) => (
              <button key={p.value} className={passo === p.value ? "on" : ""}
                      onClick={() => setPasso(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
```

Trocar a renderização do `LogTable` (a raiz do drawer é o próprio título "Logs — Nota #pk", então **não** passa `notaRoot`; só `passo`):

```tsx
        <LogTable logs={logs} loading={loading} compact passo={passo} />
```

- [ ] **Step 3: Confirmar que `TIPOS` não é mais referenciado**

Run: `cd frontend && grep -rn "TIPOS" src/`
Expected: nenhum resultado (foi removido do drawer e o `coffee-logs` passou a usar `PASSOS`).

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 5: Verificação manual**

Run: `cd frontend && npm run dev` (backend rodando).
Conferir:
1. Tela Logs: segmentado `Todos | Gerar | Consultar | Alterar local | Corrigidas | Pendentes`. `Gerar`/`Consultar`/`Alterar local` filtram pelos grupos da ação; `Corrigidas`/`Pendentes` mostram grupos com a tag `→ corrigida`/`→ pendente`.
2. Campo PK preenchido → cabeçalho raiz `Nota #pk` com badge da classificação; ações como sub-cabeçalhos; Dev ON aninha api/transição.
3. `LogDrawer` (clicar em Logs de uma nota): mesmo segmentado de passo; árvore git-graph respeitando o toggle de Dev.
4. Toggle de Dev em Configurações reflete nas duas telas sem reload.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/coffee/coffee-logs.tsx frontend/src/coffee/coffee-log-drawer.tsx
git commit -m "feat(ui): filtro por passo do fluxo em Logs e LogDrawer (remove segmentado de tipo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Coluna `trace_id` + ALTER → Task 1. ✓
- Contextvar + middleware → Task 1. ✓
- Propagação pros jobs → Task 2. ✓
- Cabeçalhos `consultar` (sucesso) e `alterar_local` → Task 3. ✓
- Filtro `nota_pk` inclui cabeçalhos de lote → Task 3. ✓
- Setting `devLogs` + toggle em Configurações → Task 4. ✓
- `trace_id` no tipo `CoffeeLog` → Task 4. ✓
- `agruparLogs` (regra de cabeçalho com múltiplas `acao_usuario`) → Task 5. ✓
- `classeAtual` (badge da raiz) → Task 5/6. ✓
- Filtro de passo (gerar/consultar/alterar_local por ação; corrigidas/pendentes por transição) → Task 5 (`grupoNoPasso`) + Task 7 (UI). ✓
- Render git-graph (`├──`/`└──`, dev esconde só api/transição) → Task 6. ✓
- Árvore com raiz na nota (PK e drawer) → Task 6 (`notaRoot`) + Task 7. (Drawer usa o próprio título como raiz — `// ponytail:` evita "Nota #pk" duplicado.) ✓
- Substituir segmentado de `tipo` nas duas telas → Task 7. ✓
- Param `tipo` do backend fica funcional, só sem uso pela nova UI (`// ponytail:` remover exigiria mexer em rota+testes). ✓

**Placeholder scan:** sem TBD/TODO; todo passo de código tem código concreto; comandos com saída esperada.

**Type consistency:** `Grupo`/`agruparLogs`/`classeAtual`/`grupoNoPasso`/`PASSOS` definidos em Task 5 e consumidos em Task 6/7 com os mesmos nomes e tipos. `LogTableProps` ganha `passo?: string`/`notaRoot?: number` em Task 6 e é usada com esses nomes em Task 7. `db.definir_trace`/`db.trace_atual` definidos em Task 1/2 e usados em Task 2. `CoffeeLog.trace_id` (Task 4) lido por `agruparLogs` (Task 5) e gravado pelo backend (Task 1). ✓
