# Fundação COFFEE (camada de integração backend) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o módulo backend `coffee_module/` que busca notas na API externa COFFEE (job + polling com rate limit), classifica por SAP (pendente/corrigida/gerada com snapshot) e persiste em SQLite, expondo `/api/coffee/*`. Sem UI.

**Architecture:** Pacote isolado espelhando o `input_module/`: `config` (env), `client` (httpx → API externa), `classify` (regra pura de SAP), `db` (SQLite com snapshot do `id_sap` anterior), `jobs` (busca em lote em thread, com progresso), `routes` (APIRouter). Buscas em lote rodam como job in-process consultável por polling.

**Tech Stack:** FastAPI, pydantic, **httpx** (já instalado, vem do FastAPI; será declarado em requirements), SQLite (stdlib `sqlite3`), pytest.

**Spec:** `docs/superpowers/specs/2026-06-18-coffee-foundation-design.md`

## Global Constraints

- Chave da API **lida exclusivamente de `COFFEE_API_KEY` (env)** — nunca commitada, nem como default. `base_url()` deve falhar de forma clara se a chave estiver vazia.
- Rate limit configurável por env: `COFFEE_DELAY_BUSCA` (default `1.0`), `COFFEE_DELAY_GERACAO` (default `0.5`). Lidos em tempo de chamada (não copiados), para o monkeypatch dos testes funcionar.
- Placeholder de SAP "não gerada" = `10000000` (`config.SAP_PENDENTE`).
- Diretório de dados sobrescritível por `COFFEE_DATA_DIR` (testes). SQLite com WAL, `check_same_thread=False`.
- Classificação: `pendente` se `id_sap == 10000000`; `corrigida` se `anterior == 10000000` e `atual != 10000000`; senão `gerada`. `arquivado` NÃO entra na classificação (guardado à parte).
- Falha de uma nota no job não derruba o lote: registra erro por `pk` e segue.
- Convenções iguais ao `input_module`: imports top-level (`from coffee_module import db`), testes na raiz de `backend/`, comando `cd backend; python -m pytest test_coffee_module.py -v`.

---

## Estrutura de arquivos

```
backend/
├── coffee_module/
│   ├── __init__.py     (vazio)
│   ├── config.py       chave/URL/delays/constantes (env)
│   ├── classify.py     regra pura de classificação
│   ├── client.py       4 chamadas à API externa (httpx)
│   ├── db.py           SQLite: upsert com snapshot, listar, erro
│   ├── jobs.py         job de busca em lote (thread + progresso)
│   └── routes.py       APIRouter /api/coffee/*
├── test_coffee_module.py  (novo)
├── requirements.txt       (modificar: declarar httpx)
└── main.py                (modificar: incluir router)
```

---

### Task 1: Pacote, `config.py`, `classify.py` e dependência httpx

**Files:**
- Create: `backend/coffee_module/__init__.py` (vazio)
- Create: `backend/coffee_module/config.py`
- Create: `backend/coffee_module/classify.py`
- Modify: `backend/requirements.txt`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Produces: `config.data_dir() -> Path`, `config.base_url() -> str`, `config.COFFEE_API_KEY: str`, `config.DELAY_BUSCA: float`, `config.DELAY_GERACAO: float`, `config.SAP_PENDENTE: int = 10000000`; `classify.classificar(id_sap_atual, id_sap_anterior) -> str`.

- [ ] **Step 1: Criar o pacote e o config**

Criar `backend/coffee_module/__init__.py` vazio.

Criar `backend/coffee_module/config.py`:

```python
"""Configuração do módulo COFFEE: chave da API, URL base, delays e constantes."""
import os
from pathlib import Path


def data_dir() -> Path:
    """Diretório de dados local (sobrescritível por env para testes)."""
    return Path(
        os.environ.get(
            "COFFEE_DATA_DIR", str(Path(__file__).resolve().parent.parent / "data")
        )
    )


COFFEE_API_KEY = os.environ.get("COFFEE_API_KEY", "")
DELAY_BUSCA = float(os.environ.get("COFFEE_DELAY_BUSCA", "1.0"))
DELAY_GERACAO = float(os.environ.get("COFFEE_DELAY_GERACAO", "0.5"))
SAP_PENDENTE = 10000000


def base_url() -> str:
    """URL base da API externa. Falha claro se a chave não estiver definida."""
    if not COFFEE_API_KEY:
        raise RuntimeError(
            "COFFEE_API_KEY não definida — defina a variável de ambiente."
        )
    return f"https://coffee.edp.gpti.com.br/api/{COFFEE_API_KEY}/deolhonarede"
```

- [ ] **Step 2: Criar a classificação**

Criar `backend/coffee_module/classify.py`:

```python
"""Classificação de notas COFFEE a partir do id_sap (atual × anterior)."""
from coffee_module import config


def classificar(id_sap_atual, id_sap_anterior) -> str:
    """pendente | corrigida | gerada — ver spec. arquivado NÃO entra aqui."""
    if id_sap_atual == config.SAP_PENDENTE:
        return "pendente"
    if id_sap_anterior == config.SAP_PENDENTE and id_sap_atual != config.SAP_PENDENTE:
        return "corrigida"
    return "gerada"
```

- [ ] **Step 3: Escrever os testes**

Criar `backend/test_coffee_module.py`:

```python
"""Testes do módulo COFFEE (backend)."""
from coffee_module import classify, config


def test_classificacao_pendente():
    assert classify.classificar(config.SAP_PENDENTE, None) == "pendente"
    assert classify.classificar(config.SAP_PENDENTE, 17247854) == "pendente"


def test_classificacao_corrigida_na_transicao():
    # anterior era placeholder, atual virou SAP real
    assert classify.classificar(17247854, config.SAP_PENDENTE) == "corrigida"


def test_classificacao_gerada():
    # primeira busca já com SAP real (sem anterior conhecido)
    assert classify.classificar(17247854, None) == "gerada"
    # transição já "consumida": anterior também é real
    assert classify.classificar(17247854, 17247854) == "gerada"
```

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_coffee_module.py -v`
Expected: 3 PASSED

- [ ] **Step 5: Declarar httpx em requirements**

Adicionar a linha ao final de `backend/requirements.txt`:

```
httpx==0.28.1
```

(httpx já está instalado no ambiente como dependência transitiva do FastAPI; esta linha só o torna explícito, já que o `client.py` o usará em runtime.)

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/__init__.py backend/coffee_module/config.py backend/coffee_module/classify.py backend/test_coffee_module.py backend/requirements.txt
git commit -m "feat(coffee): config, classificacao e dependencia httpx"
```

---

### Task 2: `db.py` — SQLite com snapshot

**Files:**
- Create: `backend/coffee_module/db.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `config.data_dir()`, `config.SAP_PENDENTE`, `classify.classificar(...)`.
- Produces: `db.get_db_connection()`, `db.inicializar_banco()`, `db.upsert_nota(pk:int, id_sap:int, arquivado:bool, dados_json:dict) -> str` (retorna a classificação), `db.registrar_erro(pk:int, mensagem:str)`, `db.listar_notas(status:str|None=None) -> list[dict]`.

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_coffee_module.py`:

```python
import pytest


@pytest.fixture
def coffee_tmp(monkeypatch, tmp_path):
    """Aponta o módulo para dados temporários, chave fake, e inicializa o banco."""
    monkeypatch.setenv("COFFEE_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    monkeypatch.setattr(config, "DELAY_BUSCA", 0)
    monkeypatch.setattr(config, "DELAY_GERACAO", 0)
    from coffee_module import db
    db.inicializar_banco()
    return tmp_path


def test_upsert_primeira_busca_pendente(coffee_tmp):
    from coffee_module import db
    classe = db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    assert classe == "pendente"
    notas = db.listar_notas("pendente")
    assert len(notas) == 1
    assert notas[0]["pk"] == 355617
    assert notas[0]["id_sap_anterior"] is None
    assert notas[0]["arquivado"] is False


def test_upsert_transicao_corrigida_depois_gerada(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    # SAP atribuído: 10000000 -> real
    classe = db.upsert_nota(355617, 17247854, True, {"id_sap": 17247854})
    assert classe == "corrigida"
    nota = db.listar_notas("corrigida")[0]
    assert nota["id_sap_anterior"] == 10000000
    assert nota["arquivado"] is True
    # re-busca: transição consumida -> gerada
    classe = db.upsert_nota(355617, 17247854, True, {"id_sap": 17247854})
    assert classe == "gerada"
    assert db.listar_notas("corrigida") == []
    assert len(db.listar_notas("gerada")) == 1


def test_registrar_erro_e_listar_tudo(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(1, 10000000, False, {})
    db.registrar_erro(2, "timeout")
    todas = db.listar_notas()
    assert len(todas) == 2
    erro = [n for n in todas if n["pk"] == 2][0]
    assert erro["erro"] == "timeout"
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_coffee_module.py -v`
Expected: FAIL — `ModuleNotFoundError`/`AttributeError` (db não existe)

- [ ] **Step 3: Implementar**

Criar `backend/coffee_module/db.py`:

```python
"""Persistência local do módulo COFFEE (SQLite) com snapshot de id_sap."""
import datetime
import json
import sqlite3

from coffee_module import config
from coffee_module.classify import classificar

_COLUNAS = ["pk", "id_sap", "id_sap_anterior", "arquivado",
            "classificacao", "dados_json", "buscado_em", "erro"]


def obter_caminho_banco() -> str:
    return str(config.data_dir() / "coffee.db")


def get_db_connection() -> sqlite3.Connection:
    config.data_dir().mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(obter_caminho_banco(), timeout=30, check_same_thread=False)
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def inicializar_banco() -> None:
    conn = get_db_connection()
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
            erro            TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def upsert_nota(pk: int, id_sap: int, arquivado: bool, dados_json: dict) -> str:
    conn = get_db_connection()
    row = conn.execute("SELECT id_sap FROM notas_coffee WHERE pk = ?", (pk,)).fetchone()
    id_sap_anterior = row[0] if row is not None else None
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
    return classe


def registrar_erro(pk: int, mensagem: str) -> None:
    conn = get_db_connection()
    conn.execute(
        """
        INSERT INTO notas_coffee (pk, erro, buscado_em) VALUES (?, ?, ?)
        ON CONFLICT(pk) DO UPDATE SET erro=excluded.erro, buscado_em=excluded.buscado_em
        """,
        (pk, mensagem, datetime.datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()


def listar_notas(status: str | None = None) -> list:
    conn = get_db_connection()
    sql = f"SELECT {', '.join(_COLUNAS)} FROM notas_coffee"
    params: tuple = ()
    if status:
        sql += " WHERE classificacao = ?"
        params = (status,)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    saida = []
    for r in rows:
        d = dict(zip(_COLUNAS, r))
        d["arquivado"] = bool(d["arquivado"]) if d["arquivado"] is not None else None
        d["dados_json"] = json.loads(d["dados_json"]) if d["dados_json"] else None
        saida.append(d)
    return saida
```

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_coffee_module.py -v`
Expected: 6 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): banco SQLite com snapshot e classificacao"
```

---

### Task 3: `client.py` — chamadas à API externa (httpx)

**Files:**
- Create: `backend/coffee_module/client.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `config.base_url()`.
- Produces: `client.buscar_nota(id) -> dict` (`{"pk", "id_sap", "arquivado", "fields"}`; levanta em erro), `client.arquivar(id, sap) -> bool`, `client.desarquivar(id) -> bool`, `client.alterar_local(id, local) -> bool`.

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_coffee_module.py`:

```python
import httpx


class _FakeResp:
    def __init__(self, payload=None, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code != 200:
            raise httpx.HTTPStatusError("erro", request=None, response=None)

    def json(self):
        return self._payload


# json_all retorna uma STRING JSON (duplamente codificada)
_JSON_ALL = (
    '[{"model": "AppDeOlhoNaRede2.informativo", "pk": 355617, '
    '"fields": {"id_sap": 17247854, "arquivado": true, "sintoma": "EEST"}}]'
)


def test_buscar_nota_faz_duplo_parse(monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    capturado = {}

    def fake_get(url, timeout=None):
        capturado["url"] = url
        return _FakeResp(payload=_JSON_ALL)

    monkeypatch.setattr(httpx, "get", fake_get)
    from coffee_module import client
    nota = client.buscar_nota(355617)
    assert nota["pk"] == 355617
    assert nota["id_sap"] == 17247854
    assert nota["arquivado"] is True
    assert nota["fields"]["sintoma"] == "EEST"
    assert capturado["url"].endswith("/deolhonarede/json_all/355617")


def test_buscar_nota_propaga_erro_http(monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    monkeypatch.setattr(httpx, "get", lambda url, timeout=None: _FakeResp(status=500))
    from coffee_module import client
    with pytest.raises(httpx.HTTPStatusError):
        client.buscar_nota(1)


def test_escritas_montam_url(monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    urls = []

    def fake_get(url, timeout=None):
        urls.append(url)
        return _FakeResp(payload="ok")

    monkeypatch.setattr(httpx, "get", fake_get)
    from coffee_module import client
    assert client.arquivar(123321, 10000000) is True
    assert client.desarquivar(123321) is True
    assert client.alterar_local(123321, "701CF12345678") is True
    assert urls[0].endswith("/deolhonarede/sap/123321/10000000")
    assert urls[1].endswith("/deolhonarede/desarquivar/123321")
    assert urls[2].endswith("/deolhonarede/local_instalacao/123321/701CF12345678")
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_coffee_module.py -v`
Expected: FAIL — client não existe

- [ ] **Step 3: Implementar**

Criar `backend/coffee_module/client.py`:

```python
"""Cliente da API externa COFFEE (httpx). Encapsula as 4 chamadas."""
import json

import httpx

from coffee_module import config

_TIMEOUT = 120


def buscar_nota(id) -> dict:
    """GET json_all/{id}. Faz o duplo-parse e retorna campos-chave + fields."""
    resp = httpx.get(f"{config.base_url()}/json_all/{id}", timeout=_TIMEOUT)
    resp.raise_for_status()
    bruto = resp.json()
    if isinstance(bruto, str):          # resposta é uma string JSON
        bruto = json.loads(bruto)
    registro = bruto[0]
    fields = registro.get("fields", {})
    return {
        "pk": registro.get("pk"),
        "id_sap": fields.get("id_sap"),
        "arquivado": bool(fields.get("arquivado")),
        "fields": fields,
    }


def arquivar(id, sap) -> bool:
    resp = httpx.get(f"{config.base_url()}/sap/{id}/{sap}", timeout=_TIMEOUT)
    resp.raise_for_status()
    return True


def desarquivar(id) -> bool:
    resp = httpx.get(f"{config.base_url()}/desarquivar/{id}", timeout=_TIMEOUT)
    resp.raise_for_status()
    return True


def alterar_local(id, local) -> bool:
    resp = httpx.get(f"{config.base_url()}/local_instalacao/{id}/{local}", timeout=_TIMEOUT)
    resp.raise_for_status()
    return True
```

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_coffee_module.py -v`
Expected: 9 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/coffee_module/client.py backend/test_coffee_module.py
git commit -m "feat(coffee): cliente httpx das 4 APIs externas"
```

---

### Task 4: `jobs.py` — busca em lote com progresso

**Files:**
- Create: `backend/coffee_module/jobs.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `client.buscar_nota(id)`, `db.upsert_nota(...)`, `db.registrar_erro(...)`, `config.DELAY_BUSCA`.
- Produces: `jobs.iniciar_busca(ids:list) -> str` (job_id), `jobs.obter_job(job_id:str) -> dict|None` (`{estado, total, feitas, erros, iniciado_em}`).

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_coffee_module.py`:

```python
import time as _time


def _aguardar_job(jobs, job_id, limite_s=3.0):
    """Faz polling do job até concluir (ou estourar o tempo)."""
    fim = _time.time() + limite_s
    while _time.time() < fim:
        j = jobs.obter_job(job_id)
        if j and j["estado"] == "concluido":
            return j
        _time.sleep(0.01)
    raise AssertionError("job não concluiu a tempo")


def test_job_busca_lote_com_progresso_e_erros(coffee_tmp, monkeypatch):
    from coffee_module import client, db, jobs

    def fake_buscar(id):
        if str(id) == "999":
            raise RuntimeError("timeout")
        return {"pk": int(id), "id_sap": 17247854, "arquivado": True,
                "fields": {"id_sap": 17247854}}

    monkeypatch.setattr(client, "buscar_nota", fake_buscar)
    job_id = jobs.iniciar_busca(["355617", "999", "355618"])
    j = _aguardar_job(jobs, job_id)
    assert j["total"] == 3
    assert j["feitas"] == 3
    assert len(j["erros"]) == 1
    assert j["erros"][0]["pk"] == "999"
    # as duas notas válidas foram persistidas
    assert len(db.listar_notas("gerada")) == 2


def test_obter_job_inexistente(coffee_tmp):
    from coffee_module import jobs
    assert jobs.obter_job("nao-existe") is None
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_coffee_module.py -v`
Expected: FAIL — jobs não existe

- [ ] **Step 3: Implementar**

Criar `backend/coffee_module/jobs.py`:

```python
"""Job in-process de busca em lote de notas COFFEE, com progresso (polling)."""
import datetime
import threading
import time
import uuid

from coffee_module import client, config, db

_JOBS: dict = {}
_LOCK = threading.Lock()


def iniciar_busca(ids: list) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(ids),
            "feitas": 0,
            "erros": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar, args=(job_id, list(ids)), daemon=True).start()
    return job_id


def _rodar(job_id: str, ids: list) -> None:
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
        except Exception as exc:  # noqa: BLE001 — uma falha não derruba o lote
            try:
                db.registrar_erro(int(ident), str(exc))
            except (ValueError, TypeError):
                pass
            with _LOCK:
                _JOBS[job_id]["erros"].append({"pk": ident, "msg": str(exc)})
        finally:
            with _LOCK:
                _JOBS[job_id]["feitas"] += 1
        time.sleep(config.DELAY_BUSCA)
    with _LOCK:
        _JOBS[job_id]["estado"] = "concluido"


def obter_job(job_id: str):
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None
```

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_coffee_module.py -v`
Expected: 11 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/coffee_module/jobs.py backend/test_coffee_module.py
git commit -m "feat(coffee): job de busca em lote com progresso"
```

---

### Task 5: `routes.py` + montagem no app

**Files:**
- Create: `backend/coffee_module/routes.py`
- Modify: `backend/main.py` (junto do `input_router`)
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `jobs.iniciar_busca`, `jobs.obter_job`, `db.inicializar_banco`, `db.listar_notas`, `client.arquivar/desarquivar/alterar_local`.
- Produces: rotas `/api/coffee/buscar` (POST), `/api/coffee/job/{job_id}` (GET), `/api/coffee/notas` (GET), `/api/coffee/sap` (POST), `/api/coffee/desarquivar` (POST), `/api/coffee/local-instalacao` (POST).

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_coffee_module.py`:

```python
from fastapi.testclient import TestClient


@pytest.fixture
def coffee_cliente(coffee_tmp, monkeypatch):
    from coffee_module import client
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda id: {"pk": int(id), "id_sap": 17247854, "arquivado": True,
                    "fields": {"id_sap": 17247854}},
    )
    from main import app
    return TestClient(app)


def test_rota_buscar_job_e_notas(coffee_cliente):
    from coffee_module import jobs
    r = coffee_cliente.post("/api/coffee/buscar", json={"ids": ["355617"]})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    _aguardar_job(jobs, job_id)
    rj = coffee_cliente.get(f"/api/coffee/job/{job_id}")
    assert rj.json()["feitas"] == 1
    notas = coffee_cliente.get("/api/coffee/notas").json()["registros"]
    assert len(notas) == 1 and notas[0]["pk"] == 355617
    assert coffee_cliente.get("/api/coffee/notas?status=gerada").json()["registros"][0]["pk"] == 355617


def test_rota_buscar_lista_vazia_400(coffee_cliente):
    assert coffee_cliente.post("/api/coffee/buscar", json={"ids": []}).status_code == 400


def test_rota_job_inexistente_404(coffee_cliente):
    assert coffee_cliente.get("/api/coffee/job/nao-existe").status_code == 404


def test_rotas_de_escrita(coffee_cliente, monkeypatch):
    from coffee_module import client
    chamadas = []
    monkeypatch.setattr(client, "arquivar", lambda i, s: chamadas.append(("sap", i, s)) or True)
    monkeypatch.setattr(client, "desarquivar", lambda i: chamadas.append(("des", i)) or True)
    monkeypatch.setattr(client, "alterar_local", lambda i, l: chamadas.append(("loc", i, l)) or True)
    assert coffee_cliente.post("/api/coffee/sap", json={"id": 1, "sap": 10000000}).json()["ok"] is True
    assert coffee_cliente.post("/api/coffee/desarquivar", json={"id": 1}).json()["ok"] is True
    assert coffee_cliente.post("/api/coffee/local-instalacao", json={"id": 1, "local": "X"}).json()["ok"] is True
    assert ("sap", 1, 10000000) in chamadas
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_coffee_module.py -v`
Expected: FAIL — 404 nas rotas (router não montado)

- [ ] **Step 3: Implementar o router**

Criar `backend/coffee_module/routes.py`:

```python
"""Rotas /api/coffee/* — fundação do hub COFFEE."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from coffee_module import client, db, jobs

router = APIRouter(prefix="/api/coffee")

_estado = {"inicializado": False}


def _garantir_banco() -> None:
    if not _estado["inicializado"]:
        db.inicializar_banco()
        _estado["inicializado"] = True


class BuscaPedido(BaseModel):
    ids: list[str]


class SapPedido(BaseModel):
    id: int
    sap: int


class IdPedido(BaseModel):
    id: int


class LocalPedido(BaseModel):
    id: int
    local: str


@router.post("/buscar")
def buscar(pedido: BuscaPedido):
    _garantir_banco()
    if not pedido.ids:
        raise HTTPException(status_code=400, detail="Lista de IDs vazia.")
    return {"job_id": jobs.iniciar_busca(pedido.ids)}


@router.get("/job/{job_id}")
def job(job_id: str):
    j = jobs.obter_job(job_id)
    if j is None:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    return j


@router.get("/notas")
def notas(status: Optional[str] = None):
    _garantir_banco()
    return {"registros": db.listar_notas(status)}


@router.post("/sap")
def sap(pedido: SapPedido):
    client.arquivar(pedido.id, pedido.sap)
    return {"ok": True}


@router.post("/desarquivar")
def desarquivar(pedido: IdPedido):
    client.desarquivar(pedido.id)
    return {"ok": True}


@router.post("/local-instalacao")
def local_instalacao(pedido: LocalPedido):
    client.alterar_local(pedido.id, pedido.local)
    return {"ok": True}
```

- [ ] **Step 4: Montar no app**

Em `backend/main.py`, logo após as linhas que incluem o `input_router`:

```python
from input_module.routes import router as input_router

app.include_router(input_router)
```

adicionar:

```python
from coffee_module.routes import router as coffee_router

app.include_router(coffee_router)
```

(Ambos os `include_router` devem ficar antes do bloco `DIST = pathlib.Path(...)` / mount estático.)

- [ ] **Step 5: Rodar os testes**

Run: `cd backend; python -m pytest test_coffee_module.py test_input_module.py test_upload.py -v`
Expected: todos PASSED (módulo novo + regressão dos existentes)

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/routes.py backend/main.py backend/test_coffee_module.py
git commit -m "feat(coffee): endpoints /api/coffee montados no app"
```

---

## Verificação final

- [ ] `cd backend; python -m pytest test_coffee_module.py test_input_module.py test_upload.py -v` → todos PASSED.
- [ ] Conferir que `COFFEE_API_KEY` não aparece hardcoded em nenhum arquivo versionado (`git grep -i "CC575E3C"` não retorna nada).
- [ ] Conferir que `httpx` está em `backend/requirements.txt`.
