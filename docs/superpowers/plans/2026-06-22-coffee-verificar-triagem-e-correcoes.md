# COFFEE — Verificar=Triagem embutida + correções (nav, logs, persistência) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar o fluxo COFFEE — Verificar passa a ser a triagem embutida (Verificar → Corrigidas → Gerar), corrigir a navegação sidebar↔header, capturar o usuário da máquina nos logs e persistir o estado da planilha Verificar.

**Architecture:** Backend SQLite (`coffee.db`) ganha colunas `usuario` (em `coffee_logs`) e `a_gerar` (em `notas_coffee`) via migração idempotente, mais a rota `/marcar-gerar` e a limpeza da flag no `/regerar`. Frontend sobe o estado de navegação (`section`/`coffeeSub`) para `App.tsx` como fonte única, remove a seção "Triagem" do topo e embute o `Dashboard` dentro de `CoffeeVerificar`, persistindo um snapshot da triagem em `sessionStorage`.

**Tech Stack:** Backend — Python, FastAPI, sqlite3, pytest (TestClient + monkeypatch). Frontend — React 18 + TypeScript, Vite (sem framework de teste; verificação via `npm run build`).

## Global Constraints

- **Logging é best-effort:** `registrar_log` NUNCA levanta; toda a função é envolvida em `try/except`. A captura do usuário também é best-effort.
- **Migrações idempotentes:** toda `ALTER TABLE` é guardada por checagem em `PRAGMA table_info(<tabela>)`. Nunca quebra bancos existentes.
- **Banco único:** tudo em `coffee.db` via `db.get_db_connection()`.
- **Timestamp:** sempre `datetime.datetime.now().isoformat()`.
- **Testes backend** rodam com cwd em `backend/`: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py`. Tudo que toca o banco usa a fixture `coffee_tmp` (tmp_path + chave fake + `inicializar_banco()`); rotas usam `coffee_cliente` (TestClient).
- **Sem framework de teste no frontend:** cada task frontend verifica com `cd frontend && npm run build` (tsc + vite). Tasks frontend não usam ciclo TDD.
- **Padrões frontend:** estilos inline + CSS custom properties (`var(--surface)`, `var(--accent)`…), classes utilitárias `edp-btn`/`edp-seg`/`edp-mono`/`cnt-tag`. `API_BASE = localStorage.getItem("edp_api") || "/api"` para todas as URLs de fetch.
- **Vínculo triagem↔COFFEE:** o número da nota (`Note.id` numérico) = `pk` em `notas_coffee`. Notas com id fora de `/^\d{5,12}$/` não podem ser marcadas "a gerar".

---

### Task 1: Logs capturam o usuário da máquina

**Files:**
- Modify: `backend/coffee_module/db.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `get_db_connection`, `_COLUNAS_LOG` (existentes).
- Produces:
  - `_usuario_atual() -> str` — best-effort, nunca levanta.
  - `registrar_log(...)` passa a gravar `usuario` automaticamente (assinatura pública inalterada).
  - `listar_logs(...)` passa a devolver `usuario` em cada dict.
  - `inicializar_banco()` migra `coffee_logs` adicionando `usuario TEXT`.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Sub-projeto 3 — usuario nos logs
# ---------------------------------------------------------------------------


def test_log_grava_usuario(coffee_tmp, monkeypatch):
    from coffee_module import db
    monkeypatch.setattr(db.getpass, "getuser", lambda: "operador.teste")
    db.registrar_log("acao_usuario", "x", None, None, True)
    logs = db.listar_logs()
    assert logs[0]["usuario"] == "operador.teste"


def test_usuario_atual_fallback_nunca_levanta(coffee_tmp, monkeypatch):
    from coffee_module import db

    def boom():
        raise OSError("sem tty")

    monkeypatch.setattr(db.getpass, "getuser", boom)
    monkeypatch.setenv("USERNAME", "via.env")
    assert db._usuario_atual() == "via.env"
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "usuario" -v`
Expected: FAIL — `module 'coffee_module.db' has no attribute 'getpass'` / `_usuario_atual`.

- [ ] **Step 3: Adicionar imports e o helper `_usuario_atual` em `db.py`**

No topo de `backend/coffee_module/db.py`, troque o bloco de imports:

```python
"""Persistência local do módulo COFFEE (SQLite) com snapshot de id_sap."""
import datetime
import json
import sqlite3

from coffee_module import config
from coffee_module.classify import classificar
```

por:

```python
"""Persistência local do módulo COFFEE (SQLite) com snapshot de id_sap."""
import datetime
import getpass
import json
import os
import sqlite3

from coffee_module import config
from coffee_module.classify import classificar


def _usuario_atual() -> str:
    """Usuário da máquina (best-effort, nunca levanta)."""
    try:
        nome = getpass.getuser()
        if nome:
            return nome
    except Exception:  # noqa: BLE001
        pass
    return os.environ.get("USERNAME") or os.environ.get("USER") or "desconhecido"
```

- [ ] **Step 4: Migrar `coffee_logs` e atualizar a DDL em `inicializar_banco`**

Em `inicializar_banco()`, troque o `CREATE TABLE IF NOT EXISTS coffee_logs (...)` para incluir a coluna `usuario`:

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
            usuario     TEXT
        )
        """
    )
```

E, logo após esse `CREATE` (antes dos `CREATE INDEX`), adicione a migração idempotente:

```python
    cols_logs = [r[1] for r in conn.execute("PRAGMA table_info(coffee_logs)").fetchall()]
    if "usuario" not in cols_logs:
        conn.execute("ALTER TABLE coffee_logs ADD COLUMN usuario TEXT")
```

- [ ] **Step 5: Gravar `usuario` em `registrar_log` e lê-lo em `listar_logs`**

Em `db.py`, troque a constante:

```python
_COLUNAS_LOG = ["id", "timestamp", "tipo", "acao", "nota_pk", "detalhes", "sucesso"]
```

por:

```python
_COLUNAS_LOG = ["id", "timestamp", "tipo", "acao", "nota_pk", "detalhes", "sucesso", "usuario"]
```

No corpo de `registrar_log`, troque o `CREATE TABLE IF NOT EXISTS coffee_logs (...)` inline e o `INSERT` por:

```python
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS coffee_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
                tipo TEXT NOT NULL, acao TEXT NOT NULL, nota_pk INTEGER,
                detalhes TEXT, sucesso INTEGER NOT NULL, usuario TEXT
            )
            """
        )
        conn.execute(
            "INSERT INTO coffee_logs (timestamp, tipo, acao, nota_pk, detalhes, sucesso, usuario) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (datetime.datetime.now().isoformat(), tipo, acao, nota_pk, det,
             1 if sucesso else 0, _usuario_atual()),
        )
```

Em `listar_logs`, dentro do loop de montagem dos dicts, o `usuario` já vem por estar em `_COLUNAS_LOG`. Nenhuma conversão extra é necessária (texto puro).

- [ ] **Step 6: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "usuario" -v`
Expected: PASS (2 testes).

- [ ] **Step 7: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS, sem falhas.

- [ ] **Step 8: Commit**

```bash
git add backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): logs capturam usuario da maquina (getpass best-effort)"
```

---

### Task 2: Coluna `a_gerar` + `marcar_gerar` + `nota_existe` + filtro em `listar_notas`

**Files:**
- Modify: `backend/coffee_module/db.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `get_db_connection`, `_COLUNAS`, `upsert_nota` (existentes).
- Produces:
  - `marcar_gerar(pk: int, a_gerar: bool) -> None`.
  - `nota_existe(pk: int) -> bool`.
  - `listar_notas(status)` aceita `status="a_gerar"` (filtra `a_gerar=1`) e inclui `a_gerar` (bool) em cada dict.
  - `inicializar_banco()` migra `notas_coffee` adicionando `a_gerar INTEGER NOT NULL DEFAULT 0`.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Sub-projeto 3 — flag a_gerar
# ---------------------------------------------------------------------------


def test_marcar_gerar_e_listar(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 17247854, False, {"id_sap": 17247854})
    assert db.listar_notas("a_gerar") == []
    db.marcar_gerar(355617, True)
    aged = db.listar_notas("a_gerar")
    assert len(aged) == 1 and aged[0]["pk"] == 355617
    assert aged[0]["a_gerar"] is True


def test_marcar_gerar_falso_remove_da_lista(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(1, 17247854, False, {})
    db.marcar_gerar(1, True)
    db.marcar_gerar(1, False)
    assert db.listar_notas("a_gerar") == []


def test_a_gerar_preservado_em_refetch(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(1, 10000000, False, {"id_sap": 10000000})
    db.marcar_gerar(1, True)
    db.upsert_nota(1, 17247854, True, {"id_sap": 17247854})  # re-busca
    assert db.listar_notas("a_gerar")[0]["pk"] == 1


def test_nota_existe(coffee_tmp):
    from coffee_module import db
    assert db.nota_existe(99) is False
    db.upsert_nota(99, 10000000, False, {})
    assert db.nota_existe(99) is True
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "a_gerar or nota_existe" -v`
Expected: FAIL — `module 'coffee_module.db' has no attribute 'marcar_gerar'`.

- [ ] **Step 3: Migrar `notas_coffee` e atualizar a DDL em `inicializar_banco`**

Em `inicializar_banco()`, troque o `CREATE TABLE IF NOT EXISTS notas_coffee (...)` para incluir `a_gerar`:

```python
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notas_coffee (
            pk              INTEGER PRIMARY KEY,
            id_sap          INTEGER,
            id_sap_anterior INTEGER,
            arquivado       INTEGER,
            classificacao   TEXT,
            dados_json      TEXT,
            buscado_em      TEXT,
            erro            TEXT,
            a_gerar         INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    cols_notas = [r[1] for r in conn.execute("PRAGMA table_info(notas_coffee)").fetchall()]
    if "a_gerar" not in cols_notas:
        conn.execute("ALTER TABLE notas_coffee ADD COLUMN a_gerar INTEGER NOT NULL DEFAULT 0")
```

- [ ] **Step 4: Adicionar `a_gerar` a `_COLUNAS` e o filtro em `listar_notas`**

Troque:

```python
_COLUNAS = ["pk", "id_sap", "id_sap_anterior", "arquivado",
            "classificacao", "dados_json", "buscado_em", "erro"]
```

por:

```python
_COLUNAS = ["pk", "id_sap", "id_sap_anterior", "arquivado",
            "classificacao", "dados_json", "buscado_em", "erro", "a_gerar"]
```

Substitua o corpo de `listar_notas` por:

```python
def listar_notas(status: str | None = None) -> list:
    conn = get_db_connection()
    sql = f"SELECT {', '.join(_COLUNAS)} FROM notas_coffee"
    params: tuple = ()
    if status == "a_gerar":
        sql += " WHERE a_gerar = 1"
    elif status:
        sql += " WHERE classificacao = ?"
        params = (status,)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    saida = []
    for r in rows:
        d = dict(zip(_COLUNAS, r))
        d["arquivado"] = bool(d["arquivado"]) if d["arquivado"] is not None else None
        d["a_gerar"] = bool(d["a_gerar"])
        d["dados_json"] = json.loads(d["dados_json"]) if d["dados_json"] else None
        saida.append(d)
    return saida
```

- [ ] **Step 5: Implementar `marcar_gerar` e `nota_existe`**

Adicione após `listar_notas` (antes do bloco de logs):

```python
def marcar_gerar(pk: int, a_gerar: bool) -> None:
    """Liga/desliga a flag a_gerar de uma nota existente."""
    conn = get_db_connection()
    conn.execute("UPDATE notas_coffee SET a_gerar = ? WHERE pk = ?",
                 (1 if a_gerar else 0, pk))
    conn.commit()
    conn.close()


def nota_existe(pk: int) -> bool:
    conn = get_db_connection()
    row = conn.execute("SELECT 1 FROM notas_coffee WHERE pk = ?", (pk,)).fetchone()
    conn.close()
    return row is not None
```

- [ ] **Step 6: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "a_gerar or nota_existe" -v`
Expected: PASS (4 testes).

- [ ] **Step 7: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS, sem falhas.

- [ ] **Step 8: Commit**

```bash
git add backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): coluna a_gerar + marcar_gerar/nota_existe + filtro listar_notas"
```

---

### Task 3: Rota `/marcar-gerar` + limpeza da flag em `/regerar`

**Files:**
- Modify: `backend/coffee_module/routes.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `db.nota_existe`, `db.marcar_gerar`, `db.upsert_nota`, `db.listar_notas`, `db.registrar_log`, `client.buscar_nota`, `client.desarquivar` (Tasks 1–2 + existentes).
- Produces:
  - `POST /api/coffee/marcar-gerar` body `{id: int, a_gerar: bool = true}` → `{"ok": true}`. Se a nota não existir e `a_gerar=true`, busca+upsert antes; se a busca falhar, HTTP 502 e log `sucesso=False`.
  - `POST /api/coffee/regerar` passa a limpar `a_gerar` (set False) ao concluir com sucesso.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
def test_rota_marcar_gerar_nota_existente(coffee_cliente):
    from coffee_module import db
    db.upsert_nota(355617, 17247854, False, {"id_sap": 17247854})
    r = coffee_cliente.post("/api/coffee/marcar-gerar", json={"id": 355617, "a_gerar": True})
    assert r.status_code == 200 and r.json()["ok"] is True
    assert db.listar_notas("a_gerar")[0]["pk"] == 355617
    assert any(l["acao"] == "marcar_gerar" for l in db.listar_logs(tipo="acao_usuario"))


def test_rota_marcar_gerar_busca_se_ausente(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854}},
    )
    r = coffee_cliente.post("/api/coffee/marcar-gerar", json={"id": 355617, "a_gerar": True})
    assert r.status_code == 200
    assert db.nota_existe(355617) is True
    assert db.listar_notas("a_gerar")[0]["pk"] == 355617


def test_rota_marcar_gerar_falha_busca_502(coffee_cliente, monkeypatch):
    from coffee_module import client, db

    def boom(i):
        raise RuntimeError("falha API")

    monkeypatch.setattr(client, "buscar_nota", boom)
    r = coffee_cliente.post("/api/coffee/marcar-gerar", json={"id": 999, "a_gerar": True})
    assert r.status_code == 502
    assert any(l["acao"] == "marcar_gerar" and l["sucesso"] is False
               for l in db.listar_logs(tipo="acao_usuario"))


def test_rota_regerar_limpa_a_gerar(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    db.marcar_gerar(355617, True)
    monkeypatch.setattr(client, "desarquivar", lambda i: True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854}},
    )
    r = coffee_cliente.post("/api/coffee/regerar", json={"id": 355617})
    assert r.status_code == 200
    assert db.listar_notas("a_gerar") == []
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "marcar_gerar or regerar_limpa" -v`
Expected: FAIL — `/marcar-gerar` retorna 404; regerar não limpa a flag.

- [ ] **Step 3: Adicionar o modelo e a rota `/marcar-gerar`**

Em `backend/coffee_module/routes.py`, adicione o modelo junto aos outros (após `LocalPedido`):

```python
class MarcarGerarPedido(BaseModel):
    id: int
    a_gerar: bool = True
```

E, ao final do arquivo, adicione a rota:

```python
@router.post("/marcar-gerar")
def marcar_gerar(pedido: MarcarGerarPedido):
    _garantir_banco()
    if pedido.a_gerar and not db.nota_existe(pedido.id):
        try:
            nota = client.buscar_nota(pedido.id)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
        except Exception:
            db.registrar_log("acao_usuario", "marcar_gerar", pedido.id,
                             {"id": pedido.id, "a_gerar": pedido.a_gerar}, False)
            raise HTTPException(status_code=502,
                                detail="Nao foi possivel buscar a nota na API COFFEE.")
    db.marcar_gerar(pedido.id, pedido.a_gerar)
    db.registrar_log("acao_usuario", "marcar_gerar", pedido.id,
                     {"id": pedido.id, "a_gerar": pedido.a_gerar}, True)
    return {"ok": True}
```

- [ ] **Step 4: Limpar a flag em `/regerar`**

Substitua o corpo da rota `regerar` por (adiciona `db.marcar_gerar(nota["pk"], False)` após o upsert bem-sucedido):

```python
@router.post("/regerar")
def regerar(pedido: IdPedido):
    _garantir_banco()
    try:
        client.desarquivar(pedido.id)
        nota = client.buscar_nota(pedido.id)
        db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
    except Exception:
        db.registrar_log("acao_usuario", "regerar", pedido.id,
                         {"id": pedido.id, "origem": "ui"}, False)
        raise
    db.marcar_gerar(nota["pk"], False)
    db.registrar_log("acao_usuario", "regerar", pedido.id,
                     {"id": pedido.id, "origem": "ui"}, True)
    return {"ok": True, "nota": nota}
```

- [ ] **Step 5: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "marcar_gerar or regerar" -v`
Expected: PASS.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS, sem falhas.

- [ ] **Step 7: Commit**

```bash
git add backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "feat(coffee): rota /marcar-gerar + limpeza de a_gerar no /regerar"
```

---

### Task 4: Subir o estado de navegação para `App.tsx` (Bloco A)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/sidebar.tsx`
- Modify: `frontend/src/coffee/coffee-hub.tsx`
- Verify: `frontend/` (`npm run build`)

**Interfaces:**
- Consumes: `usePersistedState`, `CoffeeSubPage` (existentes).
- Produces: `Sidebar` e `CoffeeHub` controlados por `coffeeSub`/`setCoffeeSub` vindos do `App`. `SidebarProps` ganha `coffeeSub: CoffeeSubPage; setCoffeeSub: (s: CoffeeSubPage) => void`. `CoffeeHubProps` ganha `sub: CoffeeSubPage; setSub: (s: CoffeeSubPage) => void`.

Sem ciclo TDD (frontend). Esta task corrige o bug de navegação mantendo a seção "Triagem" intacta; a remoção dela vem na Task 6.

- [ ] **Step 1: Confirmar baseline de build verde**

Run: `cd frontend && npm run build`
Expected: build conclui sem erros.

- [ ] **Step 2: `App.tsx` — criar `coffeeSub` e repassar**

Em `frontend/src/App.tsx`, garanta o import (já existe `usePersistedState`? não — adicione):

```tsx
import { usePersistedState } from './hooks/use-persisted-state';
```

Dentro de `App`, após a linha `const [coffeeReturn, setCoffeeReturn] = React.useState...`, adicione:

```tsx
  const [coffeeSub, setCoffeeSub] = usePersistedState<CoffeeSubPage>("edp_coffee_sub", "verificar");
```

E adicione `CoffeeSubPage` ao import de tipos no topo:

```tsx
import type { Note, TweakState, Source, AppSection, Theme, Accent, SetTweak, CoffeeSubPage } from './types';
```

Na função `sendToCoffeeQueue`, troque:

```tsx
    try { sessionStorage.setItem("edp_coffee_sub", JSON.stringify("abrir")); } catch { /* ignore */ }
    setSection("coffee");
```

por:

```tsx
    setCoffeeSub("abrir");
    setSection("coffee");
```

Troque a renderização da `Sidebar`:

```tsx
      <Sidebar section={section} setSection={changeSection} />
```

por:

```tsx
      <Sidebar section={section} setSection={changeSection}
               coffeeSub={coffeeSub} setCoffeeSub={setCoffeeSub} />
```

Troque a renderização do `CoffeeHub`:

```tsx
            <CoffeeHub notes={notes} layout={t.coffeeLayout}
                       coffeeReturn={coffeeReturn}
                       onClearReturn={() => setCoffeeReturn(null)}
                       onBackToTriagem={() => { changeSection("triagem"); }} />
```

por:

```tsx
            <CoffeeHub notes={notes} layout={t.coffeeLayout}
                       sub={coffeeSub} setSub={setCoffeeSub}
                       coffeeReturn={coffeeReturn}
                       onClearReturn={() => setCoffeeReturn(null)}
                       onBackToTriagem={() => { changeSection("triagem"); }} />
```

- [ ] **Step 3: `sidebar.tsx` — virar controlada**

Em `frontend/src/components/sidebar.tsx`:

(a) Remova as funções `readCoffeeSub` e `writeCoffeeSub` (não são mais usadas).

(b) Troque a interface e a assinatura:

```tsx
interface SidebarProps { section: AppSection; setSection: (s: AppSection) => void; }
export function Sidebar({ section, setSection }: SidebarProps): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(() => readBool("edp_sidebar_expanded", true));
  const [coffeeOpen, setCoffeeOpen] = React.useState(() => readBool("edp_coffee_open", true));
  const [activeSub, setActiveSub] = React.useState<CoffeeSubPage>(() => readCoffeeSub());
```

por:

```tsx
interface SidebarProps {
  section: AppSection;
  setSection: (s: AppSection) => void;
  coffeeSub: CoffeeSubPage;
  setCoffeeSub: (s: CoffeeSubPage) => void;
}
export function Sidebar({ section, setSection, coffeeSub, setCoffeeSub }: SidebarProps): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(() => readBool("edp_sidebar_expanded", true));
  const [coffeeOpen, setCoffeeOpen] = React.useState(() => readBool("edp_coffee_open", true));
```

(c) Troque a função `selectSub`:

```tsx
  function selectSub(sub: CoffeeSubPage): void {
    writeCoffeeSub(sub);
    setActiveSub(sub);
    setSection("coffee");
  }
```

por:

```tsx
  function selectSub(sub: CoffeeSubPage): void {
    setCoffeeSub(sub);
    setSection("coffee");
  }
```

(d) No `map` dos sub-itens, troque o cálculo de `isActive`:

```tsx
            const isActive = section === "coffee" && activeSub === s.id;
```

por:

```tsx
            const isActive = section === "coffee" && coffeeSub === s.id;
```

- [ ] **Step 4: `coffee-hub.tsx` — virar controlado**

Em `frontend/src/coffee/coffee-hub.tsx`:

(a) Remova o import de `usePersistedState`:

```tsx
import { usePersistedState } from '../hooks/use-persisted-state';
```

(b) Troque a interface e a linha de estado:

```tsx
interface CoffeeHubProps {
  notes: Note[];
  layout: "composer" | "split";
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeHub({ notes, layout, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeHubProps): React.JSX.Element {
  const [sub, setSub] = usePersistedState<CoffeeSubPage>("edp_coffee_sub", "abrir");
```

por:

```tsx
interface CoffeeHubProps {
  notes: Note[];
  layout: "composer" | "split";
  sub: CoffeeSubPage;
  setSub: (s: CoffeeSubPage) => void;
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeHub({ notes, layout, sub, setSub, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeHubProps): React.JSX.Element {
```

- [ ] **Step 5: Rodar o build**

Run: `cd frontend && npm run build`
Expected: PASS, sem erros de TypeScript (sem `usePersistedState`/`activeSub`/`readCoffeeSub`/`writeCoffeeSub` órfãos).

- [ ] **Step 6: Verificação manual**

Run: `cd frontend && npm run dev` e confirme:
- No COFFEE, clicar numa subseção na **sidebar** navega e o header reflete a mesma aba (e vice-versa).
- Recarregar mantém a subseção (sessionStorage).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/sidebar.tsx frontend/src/coffee/coffee-hub.tsx
git commit -m "fix(coffee): sidebar e header navegam pelo mesmo coffeeSub (estado no App)"
```

---

### Task 5: Extrair `TopBar` para componente próprio

**Files:**
- Create: `frontend/src/components/top-bar.tsx`
- Modify: `frontend/src/App.tsx`
- Verify: `frontend/` (`npm run build`)

**Interfaces:**
- Produces: `TopBar({ t, setTweak, file, source, onReset }): React.JSX.Element` exportado de `components/top-bar.tsx`, consumível por `App` e por `CoffeeVerificar` (Task 6).

Refactor puro, sem mudança de comportamento. Necessário porque `TopBar` hoje vive dentro de `App.tsx` e a Task 6 precisa renderizá-lo dentro de `CoffeeVerificar`.

- [ ] **Step 1: Criar `components/top-bar.tsx`**

Crie `frontend/src/components/top-bar.tsx` movendo o componente atual de `App.tsx`:

```tsx
import React from 'react';
import type { TweakState, Source, SetTweak, Theme } from '../types';
import { Logo } from './shared';

interface TopBarProps { t: TweakState; setTweak: SetTweak<TweakState>; file: string; source: Source; onReset: () => void; }

export function TopBar({ t, setTweak, file, source, onReset }: TopBarProps): React.JSX.Element {
  return (
    <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0 22px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
      <Logo theme={t.theme} h={24} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)", background: "var(--bg-2)",
                   padding: "5px 10px", borderRadius: 6, border: "1px solid var(--line)" }}>{file}</span>
        <span title={source === "api" ? "Conectado ao backend" : "Dados de demonstração (offline)"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontFamily: "var(--font-mono)",
                       letterSpacing: ".06em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 999,
                       color: source === "api" ? "var(--green)" : "var(--amber)",
                       background: source === "api" ? "var(--tint-green)" : "var(--tint-amber)",
                       border: "1px solid " + (source === "api" ? "rgba(0,168,89,.3)" : "rgba(240,169,59,.3)") }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
          {source === "api" ? "API" : "Demo"}
        </span>
        <div className="edp-seg">
          {(["dark", "light"] as Theme[]).map((th) => (
            <button key={th} className={t.theme === th ? "on" : ""} onClick={() => setTweak("theme", th)}>
              {th === "dark" ? "Escuro" : "Claro"}</button>
          ))}
        </div>
        <button className="edp-btn ghost sm" title="Nova planilha" onClick={onReset}>↑ Nova</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `App.tsx` — remover o `TopBar` inline e importar**

Em `frontend/src/App.tsx`, **remova** todo o bloco do componente `TopBar` (a interface `TopBarProps` e a função `function TopBar(...) { ... }`) e o import agora desnecessário de `Logo` **se** não for usado em outro lugar do arquivo (continua sendo usado? verifique — se sim, mantenha). Adicione o import:

```tsx
import { TopBar } from './components/top-bar';
```

(A chamada `<TopBar t={t} setTweak={setTweak} file={file} source={source} onReset={...} />` no JSX permanece inalterada.)

- [ ] **Step 3: Rodar o build**

Run: `cd frontend && npm run build`
Expected: PASS, sem erros nem imports não usados.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/top-bar.tsx frontend/src/App.tsx
git commit -m "refactor: extrai TopBar para components/top-bar.tsx"
```

---

### Task 6: Embutir a triagem em `Verificar` e remover a seção "Triagem" (Bloco C.1)

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/sidebar.tsx`
- Modify: `frontend/src/coffee/coffee-hub.tsx`
- Modify: `frontend/src/coffee/coffee-verificar.tsx`
- Verify: `frontend/` (`npm run build`) + manual

**Interfaces:**
- Consumes: `Dashboard`, `UploadScreen`, `TopBar` (Task 5), `DashboardProps` (existente).
- Produces:
  - `AppSection = "coffee" | "input"` (sem `"triagem"`).
  - Interface `TriageHandoff` exportada de `coffee-verificar.tsx`, repassada `App → CoffeeHub → CoffeeVerificar`.
  - `CoffeeVerificar({ triage }: { triage: TriageHandoff })` — gate: `UploadScreen` quando `screen === "upload"`, senão `TopBar` + `Dashboard`.

- [ ] **Step 1: `types.ts` — remover `"triagem"` de `AppSection`**

Troque:

```ts
export type AppSection = "triagem" | "coffee" | "input";
```

por:

```ts
export type AppSection = "coffee" | "input";
```

- [ ] **Step 2: `coffee-verificar.tsx` — reescrever como gate da triagem**

Substitua todo o conteúdo de `frontend/src/coffee/coffee-verificar.tsx` por:

```tsx
import React from 'react';
import type { Note, TweakState, Source, SetTweak } from '../types';
import { TopBar } from '../components/top-bar';
import { UploadScreen } from '../components/upload-screen';
import { Dashboard } from '../components/dashboard';

export interface TriageHandoff {
  t: TweakState;
  setTweak: SetTweak<TweakState>;
  notes: Note[];
  completed: Set<string>;
  dupResolved: Set<string>;
  source: Source;
  file: string;
  screen: "upload" | "dashboard";
  onToggleComplete: (id: string) => void;
  onMarkMany: (ids: string[], action: "done" | "reopen") => void;
  onMarkDuplicate: (id: string) => void;
  onSendToCoffee: (ids: string[], sourceId?: string) => void;
  onUpload: (file: File) => Promise<void>;
  onDemo: (name?: string) => void;
  onReset: () => void;
}

export function CoffeeVerificar({ triage }: { triage: TriageHandoff }): React.JSX.Element {
  if (triage.screen === "upload") {
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <UploadScreen theme={triage.t.theme} onDemo={triage.onDemo} onUpload={triage.onUpload} />
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar t={triage.t} setTweak={triage.setTweak} file={triage.file}
              source={triage.source} onReset={triage.onReset} />
      <Dashboard t={triage.t} notes={triage.notes} completed={triage.completed} dupResolved={triage.dupResolved}
                 onToggleComplete={triage.onToggleComplete} onMarkMany={triage.onMarkMany}
                 onMarkDuplicate={triage.onMarkDuplicate} onSendToCoffee={triage.onSendToCoffee} />
    </div>
  );
}
```

- [ ] **Step 3: `coffee-hub.tsx` — receber e repassar `triage`**

Em `frontend/src/coffee/coffee-hub.tsx`:

(a) Adicione o import do tipo:

```tsx
import { CoffeeVerificar, type TriageHandoff } from './coffee-verificar';
```

(remova o import antigo `import { CoffeeVerificar } from './coffee-verificar';`).

(b) Adicione `triage` à interface e à desestruturação:

```tsx
interface CoffeeHubProps {
  notes: Note[];
  layout: "composer" | "split";
  sub: CoffeeSubPage;
  setSub: (s: CoffeeSubPage) => void;
  triage: TriageHandoff;
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeHub({ notes, layout, sub, setSub, triage, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeHubProps): React.JSX.Element {
```

(c) Troque a renderização da sub `verificar`:

```tsx
      ) : sub === "verificar" ? (
        <CoffeeVerificar />
```

por:

```tsx
      ) : sub === "verificar" ? (
        <CoffeeVerificar triage={triage} />
```

- [ ] **Step 4: `sidebar.tsx` — remover o item "Triagem"**

Em `frontend/src/components/sidebar.tsx`, no ramo expandido, **remova** a linha:

```tsx
          <Row active={section === "triagem"} label="Triagem" icon={<IconTriage />} onClick={() => setSection("triagem")} />
```

E no ramo colapsado, **remova**:

```tsx
          <IconBtn active={section === "triagem"} label="Triagem" onClick={() => setSection("triagem")}><IconTriage /></IconBtn>
```

(`IconTriage` fica sem uso — remova a const `IconTriage` para não quebrar o build por import/variável não usada.)

- [ ] **Step 5: `App.tsx` — default `coffee`, montar `triage`, remover render de upload/dashboard**

Em `frontend/src/App.tsx`:

(a) Troque o default da seção:

```tsx
  const [section, setSection] = React.useState<AppSection>("triagem");
```

por:

```tsx
  const [section, setSection] = React.useState<AppSection>("coffee");
```

(b) Monte o objeto `triage` logo antes do `return` do componente:

```tsx
  const triage: TriageHandoff = {
    t, setTweak, notes, completed, dupResolved, source, file, screen,
    onToggleComplete: toggleComplete,
    onMarkMany: markMany,
    onMarkDuplicate: markDuplicate,
    onSendToCoffee: sendToCoffeeQueue,
    onUpload: handleUpload,
    onDemo: loadDemo,
    onReset: () => { setCoffeeReturn(null); setScreen("upload"); },
  };
```

(c) Adicione o import do tipo:

```tsx
import type { TriageHandoff } from './coffee/coffee-verificar';
```

(d) Troque o bloco de renderização das seções. De:

```tsx
          {section === "input" ? (
            <InputSection t={t} />
          ) : section === "coffee" ? (
            <CoffeeHub notes={notes} layout={t.coffeeLayout}
                       sub={coffeeSub} setSub={setCoffeeSub}
                       coffeeReturn={coffeeReturn}
                       onClearReturn={() => setCoffeeReturn(null)}
                       onBackToTriagem={() => { changeSection("triagem"); }} />
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

para:

```tsx
          {section === "input" ? (
            <InputSection t={t} />
          ) : (
            <CoffeeHub notes={notes} layout={t.coffeeLayout}
                       sub={coffeeSub} setSub={setCoffeeSub}
                       triage={triage}
                       coffeeReturn={coffeeReturn}
                       onClearReturn={() => setCoffeeReturn(null)}
                       onBackToTriagem={() => { setCoffeeSub("verificar"); }} />
          )}
```

(e) Remova os imports agora não usados em `App.tsx`: `TopBar` (de `./components/top-bar`), `UploadScreen`, `Dashboard` — **somente** se não forem mais referenciados (o `triage` os usa via `CoffeeVerificar`, então em `App.tsx` eles ficam órfãos). Remova-os. Mantenha `Note`/demais tipos.

(f) Em `changeSection`, simplifique (não há mais `"triagem"`):

```tsx
  function changeSection(s: AppSection): void {
    if (s !== "coffee") setCoffeeReturn(null);
    setSection(s);
  }
```

(permanece válido; `s` agora só pode ser `"coffee"` ou `"input"`).

- [ ] **Step 6: Rodar o build**

Run: `cd frontend && npm run build`
Expected: PASS, sem imports/variáveis órfãos (`TopBar`, `UploadScreen`, `Dashboard`, `IconTriage`).

- [ ] **Step 7: Verificação manual**

Run: `cd frontend && npm run dev` e confirme:
- A sidebar não tem mais "Triagem" no topo.
- O app abre em COFFEE → Verificar; sem planilha, a Verificar mostra a tela de upload/demo.
- Após carregar a demo, a Verificar mostra o `TopBar` + a triagem completa (filtros, fila, detalhe).
- "↑ Nova" volta para o upload dentro da Verificar.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types.ts frontend/src/App.tsx frontend/src/components/sidebar.tsx frontend/src/coffee/coffee-hub.tsx frontend/src/coffee/coffee-verificar.tsx
git commit -m "feat(coffee): Verificar passa a ser a triagem embutida; remove secao Triagem"
```

---

### Task 7: Coluna "Usuário" na `LogTable` (Bloco B frontend)

**Files:**
- Modify: `frontend/src/coffee/types.ts`
- Modify: `frontend/src/coffee/coffee-log-table.tsx`
- Verify: `frontend/` (`npm run build`)

**Interfaces:**
- Consumes: `CoffeeLog` (existente).
- Produces: `CoffeeLog` ganha `usuario: string | null`; `LogTable` mostra coluna "Usuário" (escondida no modo `compact`).

- [ ] **Step 1: `types.ts` — adicionar `usuario` a `CoffeeLog`**

Em `frontend/src/coffee/types.ts`, troque a interface `CoffeeLog` por:

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
}
```

- [ ] **Step 2: `coffee-log-table.tsx` — adicionar a coluna**

Em `frontend/src/coffee/coffee-log-table.tsx`, no `<thead>`, troque:

```tsx
            <th>Acao</th>
            {!compact && <th>Nota</th>}
            <th style={{ width: 50, textAlign: "center" }}>OK</th>
```

por:

```tsx
            <th>Acao</th>
            {!compact && <th>Nota</th>}
            {!compact && <th>Usuario</th>}
            <th style={{ width: 50, textAlign: "center" }}>OK</th>
```

E no `<tbody>`, após a célula `Nota` (o bloco `{!compact && ( <td> ... nota_pk ... </td> )}`), adicione a célula de usuário:

```tsx
              {!compact && (
                <td style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {l.usuario
                    ? <span className="edp-mono">{l.usuario}</span>
                    : <span style={{ color: "var(--text-mute)" }}>—</span>}
                </td>
              )}
```

- [ ] **Step 3: Rodar o build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/types.ts frontend/src/coffee/coffee-log-table.tsx
git commit -m "feat(coffee): coluna Usuario na LogTable"
```

---

### Task 8: Ação "Marcar p/ gerar" na triagem (Bloco C.3)

**Files:**
- Modify: `frontend/src/components/dashboard.tsx`
- Verify: `frontend/` (`npm run build`) + manual

**Interfaces:**
- Consumes: `POST /api/coffee/marcar-gerar` (Task 3), `Note` (existente).
- Produces: botão "Marcar p/ gerar" no detalhe da nota (`Detail`) e na barra de ações em lote, chamando `marcar-gerar`. Desabilitado para id não-numérico (`/^\d{5,12}$/`).

- [ ] **Step 1: Adicionar helper de fetch e estado de feedback**

Em `frontend/src/components/dashboard.tsx`, abaixo da linha `const URG: Record<UrgBand, string> = ...` (escopo de módulo), adicione:

```tsx
const API_BASE = localStorage.getItem("edp_api") || "/api";
const COFFEE_ID_RE = /^\d{5,12}$/;

async function marcarParaGerar(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/coffee/marcar-gerar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Number(id), a_gerar: true }),
  });
  if (!res.ok) throw new Error(`POST /marcar-gerar -> ${res.status}`);
}
```

- [ ] **Step 2: Botão no painel de detalhe (`Detail`)**

Em `dashboard.tsx`, o componente `Detail` tem uma guarda `if (!sel) return <div .../>;` no topo. O hook de estado deve vir **antes** dessa guarda (regra dos hooks). Troque o início de `Detail`:

```tsx
function Detail({ sel, done, dup, onToggleDone, onMarkDuplicate, onSendToCoffee }: DetailProps): React.JSX.Element {
  if (!sel) return <div style={{ background: "var(--bg-2)" }} />;
```

por:

```tsx
function Detail({ sel, done, dup, onToggleDone, onMarkDuplicate, onSendToCoffee }: DetailProps): React.JSX.Element {
  const [gerarMsg, setGerarMsg] = React.useState<{ ok: boolean; txt: string } | null>(null);
  if (!sel) return <div style={{ background: "var(--bg-2)" }} />;
  const podeGerar = COFFEE_ID_RE.test(sel.id);
  const selId = sel.id;
  function onMarcarGerar(): void {
    setGerarMsg(null);
    marcarParaGerar(selId)
      .then(() => setGerarMsg({ ok: true, txt: "Marcada para gerar." }))
      .catch((e: unknown) => setGerarMsg({ ok: false, txt: e instanceof Error ? e.message : String(e) }));
  }
```

No cabeçalho do detalhe, dentro do `<div style={{ display: "flex", gap: 8, flexShrink: 0 }}>` que já contém os botões COFFEE/Concluir, adicione **antes** do botão COFFEE:

```tsx
          <button className="edp-btn sm" disabled={!podeGerar} onClick={onMarcarGerar}
                  title={podeGerar ? "Marcar para gerar no COFFEE" : "ID nao numerico: nao pode ser gerado"}>
            ⚙ Marcar p/ gerar
          </button>
```

Renderize o feedback no corpo: localize o fechamento do `<div>` do cabeçalho (o que tem `padding: "15px 24px"`) e, **logo após** esse `</div>` e **antes** do `<div style={{ flex: 1, overflow: "auto", padding: 24, ... }}>`, insira:

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

- [ ] **Step 3: Botão na barra de ações em lote**

Em `dashboard.tsx`, na IIFE de ações em lote (`selBatch.size > 0 && (() => { ... })()`), dentro da `<div>` que contém os botões "Concluir"/"Reabrir"/"COFFEE", adicione um botão que marca todas as selecionadas elegíveis:

```tsx
                <button className="edp-btn sm" onClick={() => {
                  ids.filter((id) => COFFEE_ID_RE.test(id)).forEach((id) => { marcarParaGerar(id).catch(() => {}); });
                  setSelBatch(new Set());
                }}>⚙ Marcar p/ gerar</button>
```

(coloque-o ao lado do `<button className="edp-btn coffee sm" ...>☕ COFFEE</button>`).

- [ ] **Step 4: Rodar o build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 5: Verificação manual**

Run: `cd frontend && npm run dev` (com backend ativo). Confirme:
- No detalhe de uma nota com id numérico, "⚙ Marcar p/ gerar" mostra feedback verde de sucesso.
- Para id não-numérico, o botão fica desabilitado.
- Em lote, selecionar várias e "Marcar p/ gerar" limpa a seleção sem erro.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard.tsx
git commit -m "feat(coffee): acao 'Marcar p/ gerar' na triagem (detalhe + lote)"
```

---

### Task 9: Aba Gerar mostra "A gerar" + "Regerar todas" (Bloco C.4)

**Files:**
- Modify: `frontend/src/coffee/coffee-geradas.tsx`
- Verify: `frontend/` (`npm run build`) + manual

**Interfaces:**
- Consumes: `useCoffeeNotas("a_gerar")` (Task 2 backend), `CoffeeNotasTable`, `LogDrawer`, fluxo `regerar` existente em `coffee-geradas.tsx`.
- Produces: seção "A gerar" acima das Geradas, com Regerar por linha + Logs + "Regerar todas"; aviso de vazio só quando ambas vazias.

- [ ] **Step 1: Ler também as notas "a gerar" e calcular vazio combinado**

Em `frontend/src/coffee/coffee-geradas.tsx`, dentro de `CoffeeGeradas`, logo após o hook existente `const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");`, adicione:

```tsx
  const aGerar = useCoffeeNotas("a_gerar");
  const [lote, setLote] = React.useState<{ rodando: boolean; feitas: number; total: number }>(
    { rodando: false, feitas: 0, total: 0 });

  function regerarTodas(): void {
    const pks = aGerar.notas.map((n) => n.pk);
    if (pks.length === 0 || lote.rodando) return;
    setLote({ rodando: true, feitas: 0, total: pks.length });
    let chain = Promise.resolve();
    pks.forEach((pk) => {
      chain = chain.then(() => regerar(pk).then(() => {
        setLote((s) => ({ ...s, feitas: s.feitas + 1 }));
      }).catch(() => { setLote((s) => ({ ...s, feitas: s.feitas + 1 })); }));
    });
    chain.then(() => {
      setLote({ rodando: false, feitas: 0, total: 0 });
      aGerar.refetch();
      refetch();
    });
  }
```

- [ ] **Step 2: Atualizar `handleRowRegerar` para também recarregar a lista "a gerar"**

Em `coffee-geradas.tsx`, troque a função `handleRowRegerar` por (acrescenta `aGerar.refetch()`):

```tsx
  function handleRowRegerar(pk: number): void {
    setRowBusy((s) => new Set(s).add(pk));
    regerar(pk)
      .then(() => { refetch(); aGerar.refetch(); })
      .catch(() => {})
      .finally(() => setRowBusy((s) => { const n = new Set(s); n.delete(pk); return n; }));
  }
```

- [ ] **Step 3: Renderizar a seção "A gerar" acima das Geradas**

Em `coffee-geradas.tsx`, localize o bloco `{/* Zona 2: Tabela de Geradas */}` e insira **antes** dele a nova seção:

```tsx
      {/* Zona 1.5: A gerar */}
      <div style={{ flexShrink: 0, padding: "14px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>A gerar</span>
        {!aGerar.isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {aGerar.notas.length} nota{aGerar.notas.length !== 1 ? "s" : ""}
          </span>
        )}
        {aGerar.notas.length > 0 && (
          <button className="edp-btn sm" style={{ fontWeight: 600 }} disabled={lote.rodando}
                  onClick={regerarTodas}>
            {lote.rodando ? `Regenerando ${lote.feitas}/${lote.total}…` : "Regerar todas"}
          </button>
        )}
      </div>
      {aGerar.notas.length > 0 && (
        <CoffeeNotasTable
          notas={aGerar.notas}
          isLoading={aGerar.isLoading}
          emptyMessage="Nenhuma nota marcada para gerar."
          actionColumn={(nota) => {
            const busy = rowBusy.has(nota.pk);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="edp-btn sm" disabled={busy || lote.rodando} onClick={() => handleRowRegerar(nota.pk)}
                        style={{ fontWeight: 600, fontSize: 12 }}>
                  {busy ? "..." : "Regerar"}
                </button>
                <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                        title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
                  Logs
                </button>
              </div>
            );
          }}
        />
      )}
```

- [ ] **Step 4: Aviso de vazio só quando ambas vazias**

Na seção "Notas Geradas", troque o `emptyMessage` da tabela de geradas para refletir o estado combinado. Localize `<CoffeeNotasTable notas={notas} ...>` (a das geradas) e troque seu `emptyMessage`:

```tsx
        emptyMessage="Nenhuma nota gerada encontrada. Use o formulario acima para regerar uma nota."
```

por:

```tsx
        emptyMessage={aGerar.notas.length > 0
          ? "Nenhuma nota gerada ainda. As notas acima estao aguardando geracao."
          : "Nenhuma nota gerada encontrada. Use o formulario acima ou marque notas na Verificar."}
```

- [ ] **Step 5: Rodar o build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 6: Verificação manual**

Run: `cd frontend && npm run dev` (backend ativo). Confirme:
- Marcar uma nota "a gerar" na Verificar → ela aparece na seção "A gerar" da aba Gerar.
- "Regerar" na linha move a nota para "Geradas" e some de "A gerar".
- "Regerar todas" mostra progresso `n/total` e esvazia "A gerar".
- Com "A gerar" e "Geradas" ambas vazias, aparece o aviso padrão.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/coffee/coffee-geradas.tsx
git commit -m "feat(coffee): aba Gerar mostra notas 'a gerar' + Regerar todas"
```

---

### Task 10: Persistir o estado da planilha Verificar (Bloco D)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/dashboard.tsx`
- Verify: `frontend/` (`npm run build`) + manual

**Interfaces:**
- Consumes: `usePersistedState` (existente), estado de triagem em `App`.
- Produces: snapshot `edp_triage_snapshot` (notes/completed/dupResolved/file/source/screen) re-hidratado na montagem; `selId` no `Dashboard` persistido; invalidação ao trocar de planilha.

- [ ] **Step 1: Helpers de snapshot em `App.tsx`**

Em `frontend/src/App.tsx`, em escopo de módulo (perto de `VERIFY_FILTER_KEYS`), adicione:

```tsx
const TRIAGE_SNAPSHOT_KEY = "edp_triage_snapshot";

interface TriageSnapshot {
  notes: Note[];
  completed: string[];
  dupResolved: string[];
  file: string;
  source: Source;
  screen: "upload" | "dashboard";
}

function lerSnapshot(): TriageSnapshot | null {
  try {
    const raw = sessionStorage.getItem(TRIAGE_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as TriageSnapshot) : null;
  } catch { return null; }
}
function gravarSnapshot(s: TriageSnapshot): void {
  try { sessionStorage.setItem(TRIAGE_SNAPSHOT_KEY, JSON.stringify(s)); } catch { /* cota/indisponivel: degrada */ }
}
function limparSnapshot(): void {
  try { sessionStorage.removeItem(TRIAGE_SNAPSHOT_KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 2: Re-hidratar na montagem (inicializadores de estado)**

Em `App.tsx`, troque os inicializadores de `notes/completed/dupResolved/file/source/screen` para ler o snapshot uma vez. Substitua:

```tsx
  const [screen, setScreen] = React.useState<"upload" | "dashboard">("upload");
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set());
  const [dupResolved, setDupResolved] = React.useState<Set<string>>(() => new Set());
  const [file, setFile] = React.useState("");
  const [source, setSource] = React.useState<Source>("demo");
```

por:

```tsx
  const _snap = React.useMemo(() => lerSnapshot(), []);
  const [screen, setScreen] = React.useState<"upload" | "dashboard">(_snap?.screen ?? "upload");
  const [notes, setNotes] = React.useState<Note[]>(_snap?.notes ?? []);
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set(_snap?.completed ?? []));
  const [dupResolved, setDupResolved] = React.useState<Set<string>>(() => new Set(_snap?.dupResolved ?? []));
  const [file, setFile] = React.useState(_snap?.file ?? "");
  const [source, setSource] = React.useState<Source>(_snap?.source ?? "demo");
```

- [ ] **Step 3: Gravar o snapshot quando o estado de triagem muda**

Em `App.tsx`, adicione um efeito que persiste o snapshot enquanto há dashboard carregado. Coloque-o após as declarações de estado:

```tsx
  React.useEffect(() => {
    if (screen !== "dashboard" || notes.length === 0) return;
    gravarSnapshot({
      notes, completed: [...completed], dupResolved: [...dupResolved], file, source, screen,
    });
  }, [notes, completed, dupResolved, file, source, screen]);
```

- [ ] **Step 4: Não sobrescrever um snapshot válido com o fetch do backend**

Em `App.tsx`, no efeito que consome `apiData`, troque a guarda:

```tsx
  React.useEffect(() => {
    if (!apiData?.notes?.length || screen !== "upload" || source === "demo") return;
```

por (acrescenta a checagem de snapshot):

```tsx
  React.useEffect(() => {
    if (_snap) return;  // snapshot válido tem prioridade sobre o refetch
    if (!apiData?.notes?.length || screen !== "upload" || source === "demo") return;
```

- [ ] **Step 5: Invalidar o snapshot ao trocar de planilha**

Em `App.tsx`, dentro de `loadDemo` e `handleUpload`, logo após o `limparFiltrosVerify();` já existente, adicione:

```tsx
    limparSnapshot();
```

E na ação de reset (`onReset` do `triage`, que faz `setScreen("upload")`), troque por:

```tsx
    onReset: () => { setCoffeeReturn(null); limparSnapshot(); setScreen("upload"); },
```

- [ ] **Step 6: Persistir a nota selecionada no `Dashboard`**

Em `frontend/src/components/dashboard.tsx`, troque:

```tsx
  const [selId, setSelId] = React.useState<string | null>(notes[0] ? notes[0].id : null);
```

por:

```tsx
  const [selId, setSelId] = usePersistedState<string | null>("edp_verify_sel", notes[0] ? notes[0].id : null);
```

(`usePersistedState` já está importado em `dashboard.tsx`.)

- [ ] **Step 7: Limpar `edp_verify_sel` junto dos demais filtros**

Em `App.tsx`, adicione `"edp_verify_sel"` ao array `VERIFY_FILTER_KEYS`:

```tsx
const VERIFY_FILTER_KEYS = [
  "edp_verify_q", "edp_verify_uf", "edp_verify_setor", "edp_verify_urg",
  "edp_verify_status", "edp_verify_situacao", "edp_verify_rules", "edp_verify_sel",
];
```

- [ ] **Step 8: Rodar o build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 9: Verificação manual**

Run: `cd frontend && npm run dev`. Confirme:
- Carregue a demo, aplique filtros, selecione uma nota, dê **refresh**: volta direto para a triagem (não para o upload), com filtros e seleção preservados.
- "↑ Nova" limpa tudo e volta ao upload; recarregar depois disso não restaura a planilha antiga.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/dashboard.tsx
git commit -m "feat(triagem): persiste snapshot da Verificar (dados+filtros+selecao)"
```

---

## Verificação final (critérios de aceite do spec)

- [ ] Clicar numa subseção COFFEE na sidebar navega mesmo já no COFFEE; header e sidebar destacam o mesmo item. (Task 4)
- [ ] `coffee_logs` tem `usuario`; novos logs gravam o usuário; `LogTable` mostra a coluna. (Tasks 1, 7)
- [ ] Item "Triagem" sumiu do topo; triagem dentro de COFFEE → Verificar; app abre nela com upload quando vazia. (Tasks 5, 6)
- [ ] `notas_coffee` tem `a_gerar`; `POST /marcar-gerar` seta a flag e garante a linha; `GET /notas?status=a_gerar` retorna as marcadas. (Tasks 2, 3)
- [ ] `POST /regerar` com sucesso limpa `a_gerar`. (Task 3)
- [ ] Triagem tem "Marcar p/ gerar" (detalhe + lote), desabilitado p/ id não-numérico. (Task 8)
- [ ] Aba Gerar mostra "A gerar" (Regerar por linha, Logs, Regerar todas) acima das Geradas; aviso de vazio só quando ambas vazias. (Task 9)
- [ ] Refresh na Verificar restaura dados + filtros + seleção, sem voltar ao upload. (Task 10)
- [ ] `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q` verde.
- [ ] `cd frontend && npm run build` sem erros.

## Fora de escopo

- Filtro de logs por usuário (só exibição).
- Identidade real multiusuário (auth/headers) — preparado pelo schema, não implementado.
- Paginação/retenção de logs.
- Regerar todas com paralelismo (é sequencial).
- Migrar posse dos dados de triagem para Context.
