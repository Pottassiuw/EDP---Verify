# Sidebar Retrátil + Sistema de Logs COFFEE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a sidebar retrátil (colapsada 56px / expandida 220px com accordion COFFEE) e o sistema completo de logs no SQLite (`coffee_logs`), com rotas de consulta e de regerar.

**Architecture:** Backend usa SQLite existente (`coffee.db`): nova tabela `coffee_logs` mais uma função best-effort `registrar_log` chamada de `client.py` (api_call), `db.upsert_nota` (transições) e `routes.py` (ações de usuário). Frontend reescreve `sidebar.tsx` com dois estados persistidos em `localStorage`, removendo o flyout e usando accordion inline; a comunicação com `CoffeeHub` continua via `sessionStorage` (props inalteradas).

**Tech Stack:** Backend — Python, FastAPI, sqlite3, httpx, pytest (monkeypatch). Frontend — React 18 + TypeScript, Vite (sem framework de teste; verificação via `npm run build`).

## Global Constraints

- **Logging é best-effort:** `registrar_log` NUNCA pode lançar exceção para o chamador. Toda a função é envolvida em `try/except` que engole erros. A operação primária (busca, escrita, upsert) jamais quebra por causa de log.
- **Banco único:** Tudo vive em `coffee.db` via `db.get_db_connection()`. Nada de banco novo.
- **Timestamp:** sempre `datetime.datetime.now().isoformat()`.
- **`detalhes`:** serializado com `json.dumps(detalhes, ensure_ascii=False)`; `None` vira `NULL`.
- **`sucesso`:** armazenado como INTEGER (1/0); devolvido como `bool` em leituras.
- **Sidebar props inalteradas:** `Sidebar` continua recebendo apenas `{ section, setSection }`. Sub-página COFFEE continua via `sessionStorage("edp_coffee_sub")`.
- **Chaves de persistência (frontend):** `localStorage("edp_sidebar_expanded")` (default `true`), `localStorage("edp_coffee_open")` (default `true`).
- **Testes backend** rodam com cwd em `backend/`: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -v`. Tudo que toca o banco usa a fixture `coffee_tmp` (tmp_path + chave fake + `inicializar_banco()`).

---

### Task 1: Tabela `coffee_logs` + `registrar_log` + `listar_logs`

**Files:**
- Modify: `backend/coffee_module/db.py` (adiciona DDL em `inicializar_banco`, e duas funções novas)
- Test: `backend/test_coffee_module.py` (novos testes ao final)

**Interfaces:**
- Consumes: `db.get_db_connection()`, `config.data_dir()` (já existentes).
- Produces:
  - `registrar_log(tipo: str, acao: str, nota_pk: int | None, detalhes: dict | None, sucesso: bool) -> None` — best-effort, nunca levanta.
  - `listar_logs(nota_pk: int | None = None, tipo: str | None = None, limit: int = 100) -> list[dict]` — ordenado por `timestamp DESC`. Cada dict: `{id, timestamp, tipo, acao, nota_pk, detalhes (dict|None), sucesso (bool)}`.
  - `inicializar_banco()` agora também cria `coffee_logs` e seus índices.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Sub-projeto 1 — Sistema de logs (coffee_logs)
# ---------------------------------------------------------------------------


def test_registrar_e_listar_log_roundtrip(coffee_tmp):
    from coffee_module import db
    db.registrar_log("api_call", "buscar_nota", 355617,
                     {"id": 355617, "status_http": 200, "tempo_ms": 12}, True)
    logs = db.listar_logs()
    assert len(logs) == 1
    log = logs[0]
    assert log["tipo"] == "api_call"
    assert log["acao"] == "buscar_nota"
    assert log["nota_pk"] == 355617
    assert log["sucesso"] is True
    assert log["detalhes"]["status_http"] == 200
    assert isinstance(log["id"], int)


def test_listar_logs_filtra_por_nota_e_tipo(coffee_tmp):
    from coffee_module import db
    db.registrar_log("api_call", "buscar_nota", 1, {"id": 1}, True)
    db.registrar_log("api_call", "arquivar", 2, {"id": 2}, True)
    db.registrar_log("transicao", "classificar", 1, {"anterior": "pendente"}, True)
    assert len(db.listar_logs(nota_pk=1)) == 2
    assert len(db.listar_logs(tipo="api_call")) == 2
    assert len(db.listar_logs(nota_pk=1, tipo="transicao")) == 1


def test_listar_logs_ordena_desc_e_respeita_limit(coffee_tmp):
    from coffee_module import db
    for i in range(5):
        db.registrar_log("acao_usuario", "regerar", i, {"i": i}, True)
    logs = db.listar_logs(limit=3)
    assert len(logs) == 3
    # mais recentes primeiro: o último inserido (i=4) deve vir antes
    assert logs[0]["detalhes"]["i"] >= logs[-1]["detalhes"]["i"]


def test_registrar_log_nunca_levanta(coffee_tmp):
    from coffee_module import db
    # detalhes não-serializável não deve quebrar o chamador
    db.registrar_log("api_call", "x", None, {"obj": object()}, False)
    # erro de sucesso=False registrado normalmente continua funcionando
    db.registrar_log("api_call", "y", None, None, False)
    assert any(l["acao"] == "y" for l in db.listar_logs())
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "log" -v`
Expected: FAIL — `AttributeError: module 'coffee_module.db' has no attribute 'registrar_log'`.

- [ ] **Step 3: Adicionar a DDL de `coffee_logs` em `inicializar_banco`**

Em `backend/coffee_module/db.py`, dentro de `inicializar_banco()`, após o `CREATE TABLE ... notas_coffee` e antes de `conn.commit()`, adicione:

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
            sucesso     INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_nota_pk ON coffee_logs(nota_pk)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_tipo ON coffee_logs(tipo)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON coffee_logs(timestamp)")
```

- [ ] **Step 4: Implementar `registrar_log` e `listar_logs`**

Adicione ao final de `backend/coffee_module/db.py`:

```python
_COLUNAS_LOG = ["id", "timestamp", "tipo", "acao", "nota_pk", "detalhes", "sucesso"]


def registrar_log(tipo: str, acao: str, nota_pk: int | None,
                  detalhes: dict | None, sucesso: bool) -> None:
    """Insere um registro em coffee_logs. Best-effort: nunca levanta."""
    try:
        det = json.dumps(detalhes, ensure_ascii=False, default=str) if detalhes is not None else None
        conn = get_db_connection()
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS coffee_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
                tipo TEXT NOT NULL, acao TEXT NOT NULL, nota_pk INTEGER,
                detalhes TEXT, sucesso INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            "INSERT INTO coffee_logs (timestamp, tipo, acao, nota_pk, detalhes, sucesso) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (datetime.datetime.now().isoformat(), tipo, acao, nota_pk, det,
             1 if sucesso else 0),
        )
        conn.commit()
        conn.close()
    except Exception:  # noqa: BLE001 — log jamais quebra a operação primária
        pass


def listar_logs(nota_pk: int | None = None, tipo: str | None = None,
                limit: int = 100) -> list:
    conn = get_db_connection()
    sql = f"SELECT {', '.join(_COLUNAS_LOG)} FROM coffee_logs"
    clausulas: list = []
    params: list = []
    if nota_pk is not None:
        clausulas.append("nota_pk = ?")
        params.append(nota_pk)
    if tipo:
        clausulas.append("tipo = ?")
        params.append(tipo)
    if clausulas:
        sql += " WHERE " + " AND ".join(clausulas)
    sql += " ORDER BY timestamp DESC, id DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    saida = []
    for r in rows:
        d = dict(zip(_COLUNAS_LOG, r))
        d["sucesso"] = bool(d["sucesso"])
        d["detalhes"] = json.loads(d["detalhes"]) if d["detalhes"] else None
        saida.append(d)
    return saida
```

Nota: a CREATE-TABLE dentro de `registrar_log` garante a tabela mesmo quando o log é chamado de um fluxo que não passou por `inicializar_banco` (ex.: testes de client). `default=str` garante serialização de objetos não-JSON sem levantar.

- [ ] **Step 5: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "log" -v`
Expected: PASS (4 testes).

- [ ] **Step 6: Rodar a suíte inteira (garantir nada quebrou)**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS (19 testes).

- [ ] **Step 7: Commit**

```bash
git add backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): tabela coffee_logs + registrar_log/listar_logs"
```

---

### Task 2: Logs de transição em `upsert_nota`

**Files:**
- Modify: `backend/coffee_module/db.py` (`upsert_nota`)
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `registrar_log` (Task 1).
- Produces: `upsert_nota` passa a emitir logs `transicao` quando, **havendo linha anterior**, a `classificacao` muda (`acao="classificar"`) e/ou `arquivado` muda (`acao="arquivar_estado"`). Assinatura e retorno (`-> str`) inalterados.

Decisão de escopo: só registra transição quando já existia linha no banco para a `pk`. A primeira busca (sem anterior) não gera `transicao` — o `api_call` da Task 3 já cobre esse evento, evitando ruído.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
def test_upsert_registra_transicao_de_classificacao(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})  # pendente (sem anterior)
    db.upsert_nota(355617, 17247854, True, {"id_sap": 17247854})   # -> corrigida
    trans = db.listar_logs(tipo="transicao")
    classif = [t for t in trans if t["acao"] == "classificar"]
    assert len(classif) == 1
    assert classif[0]["nota_pk"] == 355617
    assert classif[0]["detalhes"]["anterior"] == "pendente"
    assert classif[0]["detalhes"]["novo"] == "corrigida"


def test_upsert_registra_transicao_de_arquivado(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})  # arquivado=False
    db.upsert_nota(355617, 10000000, True, {"id_sap": 10000000})   # -> arquivado=True
    arq = [t for t in db.listar_logs(tipo="transicao") if t["acao"] == "arquivar_estado"]
    assert len(arq) == 1
    assert arq[0]["detalhes"] == {"anterior": False, "novo": True}


def test_upsert_primeira_busca_nao_gera_transicao(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    assert db.listar_logs(tipo="transicao") == []
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "transicao" -v`
Expected: FAIL — `db.listar_logs(tipo="transicao")` retorna `[]` (nenhuma transição é registrada ainda).

- [ ] **Step 3: Ler o estado anterior em `upsert_nota` e emitir os logs**

Em `backend/coffee_module/db.py`, substitua o corpo de `upsert_nota` por (mudanças: lê também `classificacao` e `arquivado` antigos; registra transições após o commit):

```python
def upsert_nota(pk: int, id_sap: int, arquivado: bool, dados_json: dict) -> str:
    conn = get_db_connection()
    row = conn.execute(
        "SELECT id_sap, classificacao, arquivado FROM notas_coffee WHERE pk = ?", (pk,)
    ).fetchone()
    id_sap_anterior = row[0] if row is not None else None
    classe_anterior = row[1] if row is not None else None
    arquivado_anterior = bool(row[2]) if row is not None and row[2] is not None else None
    classe = classificar(id_sap, id_sap_anterior)
    conn.execute(
        """
        INSERT INTO notas_coffee
            (pk, id_sap, id_sap_anterior, arquivado, classificacao, dados_json, buscado_em, erro)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(pk) DO UPDATE SET
            id_sap=excluded.id_sap, id_sap_anterior=excluded.id_sap_anterior,
            arquivado=excluded.arquivado, classificacao=excluded.classificacao,
            dados_json=excluded.dados_json, buscado_em=excluded.buscado_em, erro=NULL
        """,
        (pk, id_sap, id_sap_anterior, 1 if arquivado else 0, classe,
         json.dumps(dados_json, ensure_ascii=False),
         datetime.datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    if row is not None and classe_anterior is not None and classe != classe_anterior:
        registrar_log("transicao", "classificar", pk,
                      {"anterior": classe_anterior, "novo": classe,
                       "id_sap_anterior": id_sap_anterior, "id_sap_atual": id_sap}, True)
    if arquivado_anterior is not None and arquivado_anterior != arquivado:
        registrar_log("transicao", "arquivar_estado", pk,
                      {"anterior": arquivado_anterior, "novo": arquivado}, True)
    return classe
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "transicao" -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS (22 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): log automatico de transicoes em upsert_nota"
```

---

### Task 3: Logs de `api_call` em `client.py`

**Files:**
- Modify: `backend/coffee_module/client.py` (4 funções + import de `db`/`time`)
- Test: `backend/test_coffee_module.py` (adiciona fixture `coffee_tmp` aos testes de client existentes + novos asserts)

**Interfaces:**
- Consumes: `db.registrar_log` (Task 1).
- Produces: cada função de `client` emite `api_call` com `detalhes` medindo `tempo_ms`, capturando `status_http` quando houver e re-levantando o erro original.

Cuidado de import: `client.py` passa a importar `db`. Ordem atual: `db` importa `config`, `classify` (não importa `client`) → sem ciclo.

- [ ] **Step 1: Atualizar os testes de client para isolar o banco e checar o log**

Em `backend/test_coffee_module.py`, adicione o parâmetro `coffee_tmp` às três funções de teste de client existentes e acrescente asserts de log. Substitua as três funções:

```python
def test_buscar_nota_faz_duplo_parse(coffee_tmp, monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    capturado = {}

    def fake_get(url, timeout=None):
        capturado["url"] = url
        return _FakeResp(payload=_JSON_ALL)

    monkeypatch.setattr(httpx, "get", fake_get)
    from coffee_module import client, db
    nota = client.buscar_nota(355617)
    assert nota["pk"] == 355617
    assert nota["id_sap"] == 17247854
    assert nota["arquivado"] is True
    assert nota["fields"]["sintoma"] == "EEST"
    assert capturado["url"].endswith("/deolhonarede/json_all/355617")
    logs = db.listar_logs(tipo="api_call")
    assert len(logs) == 1 and logs[0]["acao"] == "buscar_nota" and logs[0]["sucesso"] is True
    assert "tempo_ms" in logs[0]["detalhes"]


def test_buscar_nota_propaga_erro_http(coffee_tmp, monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    monkeypatch.setattr(httpx, "get", lambda url, timeout=None: _FakeResp(status=500))
    from coffee_module import client, db
    with pytest.raises(httpx.HTTPStatusError):
        client.buscar_nota(1)
    logs = db.listar_logs(tipo="api_call")
    assert len(logs) == 1 and logs[0]["sucesso"] is False
    assert logs[0]["detalhes"]["status_http"] == 500


def test_escritas_montam_url(coffee_tmp, monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    urls = []

    def fake_get(url, timeout=None):
        urls.append(url)
        return _FakeResp(payload="ok")

    monkeypatch.setattr(httpx, "get", fake_get)
    from coffee_module import client, db
    assert client.arquivar(123321, 10000000) is True
    assert client.desarquivar(123321) is True
    assert client.alterar_local(123321, "701CF12345678") is True
    assert urls[0].endswith("/deolhonarede/sap/123321/10000000")
    assert urls[1].endswith("/deolhonarede/desarquivar/123321")
    assert urls[2].endswith("/deolhonarede/local_instalacao/123321/701CF12345678")
    acoes = {l["acao"] for l in db.listar_logs(tipo="api_call")}
    assert {"arquivar", "desarquivar", "alterar_local"} <= acoes
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "buscar_nota or escritas" -v`
Expected: FAIL — `db.listar_logs(tipo="api_call")` vazio (client ainda não loga).

- [ ] **Step 3: Adicionar logging em `client.py`**

Reescreva `backend/coffee_module/client.py` inteiro:

```python
"""Cliente da API externa COFFEE (httpx). Encapsula as 4 chamadas, com logging."""
import json
import time

import httpx

from coffee_module import config, db

_TIMEOUT = 120


def _status_de(exc: Exception):
    resp = getattr(exc, "response", None)
    return getattr(resp, "status_code", None)


def buscar_nota(id) -> dict:
    """GET json_all/{id}. Faz o duplo-parse e retorna campos-chave + fields."""
    inicio = time.perf_counter()
    try:
        resp = httpx.get(f"{config.base_url()}/json_all/{id}", timeout=_TIMEOUT)
        resp.raise_for_status()
        bruto = resp.json()
        if isinstance(bruto, str):
            bruto = json.loads(bruto)
        registro = bruto[0]
        fields = registro.get("fields", {})
        tempo_ms = round((time.perf_counter() - inicio) * 1000)
        db.registrar_log("api_call", "buscar_nota", registro.get("pk"),
                         {"id": id, "status_http": resp.status_code, "tempo_ms": tempo_ms}, True)
        return {
            "pk": registro.get("pk"),
            "id_sap": fields.get("id_sap"),
            "arquivado": bool(fields.get("arquivado")),
            "fields": fields,
        }
    except Exception as exc:  # noqa: BLE001
        tempo_ms = round((time.perf_counter() - inicio) * 1000)
        db.registrar_log("api_call", "buscar_nota", None,
                         {"id": id, "status_http": _status_de(exc),
                          "tempo_ms": tempo_ms, "erro": str(exc)}, False)
        raise


def _get_logado(acao: str, url: str, nota_pk, detalhes: dict) -> bool:
    inicio = time.perf_counter()
    try:
        resp = httpx.get(url, timeout=_TIMEOUT)
        resp.raise_for_status()
        tempo_ms = round((time.perf_counter() - inicio) * 1000)
        db.registrar_log("api_call", acao, nota_pk,
                         {**detalhes, "status_http": resp.status_code, "tempo_ms": tempo_ms}, True)
        return True
    except Exception as exc:  # noqa: BLE001
        tempo_ms = round((time.perf_counter() - inicio) * 1000)
        db.registrar_log("api_call", acao, nota_pk,
                         {**detalhes, "status_http": _status_de(exc),
                          "tempo_ms": tempo_ms, "erro": str(exc)}, False)
        raise


def arquivar(id, sap) -> bool:
    return _get_logado("arquivar", f"{config.base_url()}/sap/{id}/{sap}", id, {"id": id, "sap": sap})


def desarquivar(id) -> bool:
    return _get_logado("desarquivar", f"{config.base_url()}/desarquivar/{id}", id, {"id": id})


def alterar_local(id, local) -> bool:
    return _get_logado("alterar_local", f"{config.base_url()}/local_instalacao/{id}/{local}",
                       id, {"id": id, "local": local})
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "buscar_nota or escritas" -v`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS (22 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/client.py backend/test_coffee_module.py
git commit -m "feat(coffee): logging de api_call em client.py com tempo de resposta"
```

---

### Task 4: Rotas `/logs` e `/regerar` + `acao_usuario` nas rotas existentes

**Files:**
- Modify: `backend/coffee_module/routes.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `db.listar_logs`, `db.registrar_log`, `db.upsert_nota`, `client.desarquivar`, `client.buscar_nota`.
- Produces:
  - `GET /api/coffee/logs?nota_pk={pk}&tipo={tipo}&limit={n}` → `{"logs": [...]}` (default `limit=100`).
  - `POST /api/coffee/regerar` body `{"id": int}` → `{"ok": true, "nota": {...}}`.
  - Rotas `/buscar` e `/sap` emitem `acao_usuario` (`busca_lote` / não há ação extra em sap além do log de api_call — ver abaixo).

Decisão: conforme o spec §2.3, `acao_usuario` cobre `regerar` e `busca_lote`. A rota `/buscar` registra `busca_lote`; `/regerar` registra `regerar`. As demais escritas já são cobertas por `api_call` no client.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
def test_rota_buscar_registra_acao_usuario(coffee_cliente):
    from coffee_module import jobs, db
    r = coffee_cliente.post("/api/coffee/buscar", json={"ids": ["355617", "355618"]})
    _aguardar_job(jobs, r.json()["job_id"])
    lote = [l for l in db.listar_logs(tipo="acao_usuario") if l["acao"] == "busca_lote"]
    assert len(lote) == 1
    assert lote[0]["detalhes"]["total"] == 2


def test_rota_logs_filtra(coffee_cliente):
    from coffee_module import db
    db.registrar_log("api_call", "buscar_nota", 1, {"id": 1}, True)
    db.registrar_log("transicao", "classificar", 1, {"x": 1}, True)
    todos = coffee_cliente.get("/api/coffee/logs").json()["logs"]
    assert len(todos) >= 2
    so_api = coffee_cliente.get("/api/coffee/logs?tipo=api_call").json()["logs"]
    assert all(l["tipo"] == "api_call" for l in so_api)
    so_nota = coffee_cliente.get("/api/coffee/logs?nota_pk=1").json()["logs"]
    assert all(l["nota_pk"] == 1 for l in so_nota)


def test_rota_regerar(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    chamadas = []
    monkeypatch.setattr(client, "desarquivar", lambda i: chamadas.append(("des", i)) or True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854}},
    )
    r = coffee_cliente.post("/api/coffee/regerar", json={"id": 355617})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["nota"]["pk"] == 355617
    assert ("des", 355617) in chamadas
    assert any(l["acao"] == "regerar" for l in db.listar_logs(tipo="acao_usuario"))
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "acao_usuario or rota_logs or regerar" -v`
Expected: FAIL — rota `/logs` e `/regerar` retornam 404 / log `busca_lote` ausente.

- [ ] **Step 3: Implementar logging na rota `/buscar` e as rotas novas**

Em `backend/coffee_module/routes.py`:

(a) Na rota `/buscar`, registre `busca_lote` antes de retornar:

```python
@router.post("/buscar")
def buscar(pedido: BuscaPedido):
    _garantir_banco()
    if not pedido.ids:
        raise HTTPException(status_code=400, detail="Lista de IDs vazia.")
    db.registrar_log("acao_usuario", "busca_lote", None,
                     {"ids": pedido.ids, "total": len(pedido.ids)}, True)
    return {"job_id": jobs.iniciar_busca(pedido.ids)}
```

(b) Ao final do arquivo, adicione a rota de consulta e a de regerar:

```python
@router.get("/logs")
def logs(nota_pk: Optional[int] = None, tipo: Optional[str] = None, limit: int = 100):
    _garantir_banco()
    return {"logs": db.listar_logs(nota_pk=nota_pk, tipo=tipo, limit=limit)}


@router.post("/regerar")
def regerar(pedido: IdPedido):
    _garantir_banco()
    db.registrar_log("acao_usuario", "regerar", pedido.id, {"id": pedido.id, "origem": "ui"}, True)
    client.desarquivar(pedido.id)
    nota = client.buscar_nota(pedido.id)
    db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
    return {"ok": True, "nota": nota}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "acao_usuario or rota_logs or regerar" -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS (25 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "feat(coffee): rotas /logs e /regerar + log de busca_lote"
```

---

### Task 5: Sidebar retrátil (frontend)

**Files:**
- Modify: `frontend/src/components/sidebar.tsx` (reescrita completa)
- Verify: `frontend/` (`npm run build`)

**Interfaces:**
- Consumes: `AppSection`, `CoffeeSubPage` de `../types`; `sessionStorage("edp_coffee_sub")`.
- Produces: componente `Sidebar({ section, setSection })` com dois estados (colapsada 56px / expandida 220px), accordion COFFEE inline, sem flyout. Props inalteradas — `App.tsx` não muda.

Não há framework de teste no frontend; a verificação é `npm run build` (tsc + vite) + checklist manual. Por isso esta task não usa ciclo TDD.

- [ ] **Step 1: Confirmar baseline de build verde**

Run: `cd frontend && npm run build`
Expected: build conclui sem erros (estado atual).

- [ ] **Step 2: Reescrever `sidebar.tsx`**

Substitua todo o conteúdo de `frontend/src/components/sidebar.tsx` por:

```tsx
import React from 'react';
import type { AppSection, CoffeeSubPage } from '../types';

const svgBase = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const BrandGlyph = (): React.JSX.Element => (
  <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="30" fill="none" stroke="var(--indigo)" strokeWidth="9" />
    <circle cx="50" cy="50" r="18" fill="none" stroke="var(--blue)" strokeWidth="9" />
    <circle cx="50" cy="50" r="7" fill="none" stroke="var(--green)" strokeWidth="9" />
  </svg>
);
const IconTriage = (): React.JSX.Element => (<svg {...svgBase}><path d="M4 6h10M4 12h10M4 18h7" /><path d="M15.5 16.5l2 2 4-4.5" /></svg>);
const IconCoffee = (): React.JSX.Element => (<svg {...svgBase}><path d="M5 9h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" /><path d="M17 10h2.4a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3c-.5 1 .5 1.6 0 2.6M12 3c-.5 1 .5 1.6 0 2.6" /></svg>);
const IconInput = (): React.JSX.Element => (
  <svg {...svgBase}><rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" /></svg>
);
const IconReport = (): React.JSX.Element => (<svg {...svgBase}><path d="M3 21h18" /><rect x="5" y="10" width="3" height="8" rx="1" /><rect x="11" y="5" width="3" height="13" rx="1" /><rect x="17" y="13" width="3" height="5" rx="1" /></svg>);
const IconBI = (): React.JSX.Element => (<svg {...svgBase}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>);
const IconGear = (): React.JSX.Element => (<svg {...svgBase}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);

const COFFEE_SUBS: { id: CoffeeSubPage; label: string }[] = [
  { id: "abrir", label: "Abrir" },
  { id: "geradas", label: "Gerar" },
  { id: "corrigidas", label: "Corrigidas" },
  { id: "pendentes", label: "Pendentes" },
  { id: "verificar", label: "Verificar" },
];

function readBool(key: string, def: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw === "true";
  } catch { /* ignore */ }
  return def;
}
function writeBool(key: string, val: boolean): void {
  try { localStorage.setItem(key, String(val)); } catch { /* ignore */ }
}

function readCoffeeSub(): CoffeeSubPage {
  try {
    const raw = sessionStorage.getItem("edp_coffee_sub");
    if (raw) return JSON.parse(raw) as CoffeeSubPage;
  } catch { /* ignore */ }
  return "abrir";
}
function writeCoffeeSub(sub: CoffeeSubPage): void {
  try { sessionStorage.setItem("edp_coffee_sub", JSON.stringify(sub)); } catch { /* ignore */ }
}

interface IconBtnProps { active?: boolean; soon?: boolean; label: string; onClick?: () => void; children: React.ReactNode; }
function IconBtn({ active, soon, label, onClick, children }: IconBtnProps): React.JSX.Element {
  return (
    <button title={soon ? label + " · em breve" : label} aria-label={label} disabled={soon} onClick={onClick}
            style={{ position: "relative", width: 42, height: 42, border: 0, borderRadius: 11,
                     cursor: soon ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                     background: active ? "var(--accent-tint)" : "transparent",
                     color: active ? "var(--accent)" : "var(--text-mute)", opacity: soon ? 0.4 : 1, transition: "background .12s, color .12s" }}>
      {active && <span style={{ position: "absolute", left: -7, top: 9, bottom: 9, width: 3, borderRadius: 999, background: "var(--accent)" }} />}
      {children}
      {soon && <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "var(--amber)" }} />}
    </button>
  );
}

// Linha completa (ícone + label) usada na sidebar expandida.
interface RowProps { active?: boolean; soon?: boolean; label: string; onClick?: () => void; icon: React.ReactNode; right?: React.ReactNode; }
function Row({ active, soon, label, onClick, icon, right }: RowProps): React.JSX.Element {
  return (
    <button title={soon ? label + " · em breve" : label} aria-label={label} disabled={soon} onClick={onClick}
            style={{ position: "relative", width: "100%", height: 42, border: 0, borderRadius: 11, padding: "0 10px",
                     cursor: soon ? "default" : "pointer", display: "flex", alignItems: "center", gap: 11,
                     background: active ? "var(--accent-tint)" : "transparent",
                     color: active ? "var(--accent)" : "var(--text-mute)", opacity: soon ? 0.4 : 1,
                     transition: "background .12s, color .12s", textAlign: "left", fontSize: 13.5 }}>
      {active && <span style={{ position: "absolute", left: -4, top: 9, bottom: 9, width: 3, borderRadius: 999, background: "var(--accent)" }} />}
      <span style={{ display: "flex", width: 20, justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {soon ? <span style={{ fontSize: 9, opacity: .8 }}>soon</span> : right}
    </button>
  );
}

interface SidebarProps { section: AppSection; setSection: (s: AppSection) => void; }
export function Sidebar({ section, setSection }: SidebarProps): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(() => readBool("edp_sidebar_expanded", true));
  const [coffeeOpen, setCoffeeOpen] = React.useState(() => readBool("edp_coffee_open", true));
  const [activeSub, setActiveSub] = React.useState<CoffeeSubPage>(() => readCoffeeSub());

  function toggleExpanded(): void {
    setExpanded((p) => { const v = !p; writeBool("edp_sidebar_expanded", v); return v; });
  }
  function toggleCoffee(): void {
    setCoffeeOpen((p) => { const v = !p; writeBool("edp_coffee_open", v); return v; });
  }
  function selectSub(sub: CoffeeSubPage): void {
    writeCoffeeSub(sub);
    setActiveSub(sub);
    setSection("coffee");
  }

  const navStyle: React.CSSProperties = {
    width: expanded ? 220 : 56, flexShrink: 0, background: "var(--surface)",
    borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column",
    alignItems: expanded ? "stretch" : "center", padding: expanded ? "12px 10px 14px" : "12px 0 14px",
    gap: 6, zIndex: 2, transition: "width 150ms ease",
  };

  return (
    <nav className="edp-nav" style={navStyle}>
      <style>{`.edp-nav button:not(:disabled):hover{background:var(--surface-2)!important;color:var(--text)!important}`}</style>

      {/* Topo: brand + toggle (expandida) | toggle (colapsada) */}
      {expanded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 6px" }}>
          <BrandGlyph />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>EDP Verify</span>
          <button aria-label="Colapsar menu" title="Colapsar" onClick={toggleExpanded}
                  style={{ width: 24, height: 24, border: 0, borderRadius: 6, cursor: "pointer",
                           background: "var(--surface-2)", color: "var(--text-mute)", fontSize: 12 }}>
            «
          </button>
        </div>
      ) : (
        <button aria-label="Expandir menu" title="Expandir" onClick={toggleExpanded}
                style={{ width: 42, height: 42, marginBottom: 6, border: 0, borderRadius: 11, cursor: "pointer",
                         background: "var(--surface-2)", color: "var(--text-mute)", fontSize: 14 }}>
          »
        </button>
      )}

      {expanded ? (
        <>
          <Row active={section === "triagem"} label="Triagem" icon={<IconTriage />} onClick={() => setSection("triagem")} />

          {/* COFFEE com accordion */}
          <Row active={section === "coffee"} label="COFFEE" icon={<IconCoffee />}
               onClick={() => setSection("coffee")}
               right={
                 <span role="button" aria-label={coffeeOpen ? "Fechar sub-itens COFFEE" : "Abrir sub-itens COFFEE"}
                       onClick={(e) => { e.stopPropagation(); toggleCoffee(); }}
                       style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 10, cursor: "pointer", color: "var(--text-mute)" }}>
                   {coffeeOpen ? "▾" : "▸"}
                 </span>
               } />
          {coffeeOpen && COFFEE_SUBS.map((s) => {
            const isActive = section === "coffee" && activeSub === s.id;
            return (
              <button key={s.id} onClick={() => selectSub(s.id)} aria-label={s.label}
                      style={{ position: "relative", display: "flex", alignItems: "center",
                               width: "100%", height: 34, padding: "0 10px 0 41px", border: 0, borderRadius: 9,
                               cursor: "pointer", fontSize: 12.5, textAlign: "left",
                               background: isActive ? "var(--accent-tint)" : "transparent",
                               color: isActive ? "var(--accent)" : "var(--text-mute)", transition: "background .1s" }}>
                {isActive && <span style={{ position: "absolute", left: 24, top: 7, bottom: 7, width: 3, borderRadius: 999, background: "var(--accent)" }} />}
                {s.label}
              </button>
            );
          })}

          <Row active={section === "input"} label="Input" icon={<IconInput />} onClick={() => setSection("input")} />
          <div style={{ flex: 1 }} />
          <div style={{ height: 1, background: "var(--line)", margin: "6px 4px" }} />
          <Row soon label="Relatorios" icon={<IconReport />} />
          <Row soon label="De olho no BI" icon={<IconBI />} />
          <Row soon label="Configuracoes" icon={<IconGear />} />
        </>
      ) : (
        <>
          <IconBtn active={section === "triagem"} label="Triagem" onClick={() => setSection("triagem")}><IconTriage /></IconBtn>
          <IconBtn active={section === "coffee"} label="COFFEE" onClick={() => setSection("coffee")}><IconCoffee /></IconBtn>
          <IconBtn active={section === "input"} label="Input" onClick={() => setSection("input")}><IconInput /></IconBtn>
          <div style={{ flex: 1 }} />
          <IconBtn soon label="Relatorios"><IconReport /></IconBtn>
          <IconBtn soon label="De olho no BI"><IconBI /></IconBtn>
          <IconBtn soon label="Configuracoes"><IconGear /></IconBtn>
        </>
      )}
    </nav>
  );
}
```

- [ ] **Step 3: Rodar o build (typecheck + vite)**

Run: `cd frontend && npm run build`
Expected: PASS, sem erros de TypeScript. (Sem `flyoutOpen`/`flyoutRef`/`chevronRef` órfãos; sem imports não usados.)

- [ ] **Step 4: Verificação manual (checklist do spec §5)**

Run: `cd frontend && npm run dev` e no navegador confirme:
- Sidebar inicia expandida (220px) com labels e accordion COFFEE aberto.
- Botão «/» colapsa/expande com animação suave de width.
- Reload mantém o estado (localStorage).
- Clicar no chevron ▾/▸ abre/fecha os 5 sub-itens sem navegar.
- Clicar num sub-item navega para COFFEE e marca o item ativo (barra accent).
- Colapsada (56px): só ícones, sem flyout; clicar COFFEE navega para a seção.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/sidebar.tsx
git commit -m "feat(coffee): sidebar retratil com accordion, remove flyout"
```

---

## Verificação final (spec §5)

- [ ] Tabela `coffee_logs` criada em `inicializar_banco`. (Task 1)
- [ ] `GET /api/coffee/logs` retorna logs filtrados por `nota_pk`/`tipo`/`limit`. (Task 4)
- [ ] `POST /api/coffee/regerar` desarquiva + rebusca + upsert + loga `regerar`. (Task 4)
- [ ] Chamadas de API geram `api_call` com `tempo_ms`. (Task 3)
- [ ] Transições de classificação/arquivado geram logs automáticos. (Task 2)
- [ ] Sidebar expande/colapsa com animação, persiste em localStorage, default expandida. (Task 5)
- [ ] Accordion COFFEE navega; flyout removido. (Task 5)
- [ ] `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q` → 25 passed.
- [ ] `cd frontend && npm run build` sem erros.

## Fora de escopo (Sub-projeto 2)

UI de regerar na sub-página "Gerar", "Verificar" como triagem embutida, UI de visualização de logs, renomear "Geradas"→"Gerar" no header do `CoffeeHub`.
