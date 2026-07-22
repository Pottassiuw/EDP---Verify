# Carteira de Notas — Fase 1a (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o backend da Carteira (`carteira_module`): projeção operacional local (`carteira.db`) da base COFFEE, serviço de sincronização idempotente, situação derivada e a API do explorador/sincronização — sem UI.

**Architecture:** Reutiliza o `databricks_module` (Fase 0) para ler `sandbox_uc.ddpm.coffee_onr_es_sp` (filtrado para SP), normaliza via `mapping.py`, projeta em SQLite via `repository.py` com reconciliação transacional idempotente (`sync.py`), deriva situação por função pura (`situacao.py`) cruzando com o plano do Input, e expõe endpoints finos (`routes.py`) sobre casos de uso (`service.py`). SQL separado das regras de negócio.

**Tech Stack:** Python, FastAPI, SQLite (sqlite3), pandas, `databricks-sql-connector` + `pyarrow` (já instalados), pytest.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-22-carteira-fase-1-projecao-explorador-design.md`. Discovery: `docs/dev/databricks-schema-discovery.md`.
- **PK da projeção = `id_onr`** (único: 98.051/98.051, 0 nulos). `id_sap` NÃO é chave (1.548 duplicatas + sentinela `10000000` + vazios).
- **Databricks é read-only.** Nenhuma escrita na origem.
- **Filtro SP** na origem: `CSD IN ('GUARATINGUETÁ','SÃO JOSÉ DOS CAMPOS','GUARULHOS','SUZANO','MOGI DAS CRUZES','LITORAL')`.
- **De-para regional:** `LITORAL`→`Litoral Norte`, `SUZANO`→`Poá-Suzano`; demais iguais.
- **Sync sempre completo + skip-signal** (`Atualizacao` é carimbo de refresh da tabela inteira, valor único; não há incremental por-linha). Idempotência: PK `id_onr` + upsert por hash + tombstone (nunca DELETE) + staging/reconcile transacional + single-flight.
- **PII NÃO projetada:** `colaborador`, `matriculaSAP`, `nomeColaborador`, `Solicitante`.
- **CLAUDE.md:** endpoints finos; nunca engolir exceção; funções 30–40 linhas, retorno cedo; SQL separado das regras; imports ordenados; sem `any`.
- **Fora de escopo (Fase 2/3):** mover-para-plano, `plano_movimentacoes`, coluna `origem` no Input, aba Divergências, dashboard completo, command palette, enriquecimento `notas_sp`.
- **Comando de teste (de `backend/`):** `venv/Scripts/python -m pytest test_carteira_module.py -v`
- **Isolamento de teste:** env `CARTEIRA_DATA_DIR` = tmp; `db.inicializar_banco()` no setup; leitura da origem sempre injetada/mockada (nunca rede real em teste).

---

## File Structure

- `backend/carteira_module/__init__.py` — pacote (vazio).
- `backend/carteira_module/config.py` — `data_dir`, catálogo/schema/tabela, `REGIONAIS_SP`, `DE_PARA_REGIONAL`, `TAMANHO_CHUNK`.
- `backend/carteira_module/db.py` — schema `carteira.db`, conexão, `versao`, `meta`.
- `backend/carteira_module/mapping.py` — normalização origem→domínio, de-para, derivações, hash, drop PII.
- `backend/carteira_module/situacao.py` — função pura de situação.
- `backend/carteira_module/repository.py` — SQL: staging, reconciliação, listagem/filtros/paginação, detalhe, resumo.
- `backend/carteira_module/sync.py` — orquestração do sync (skip, ler origem injetável, reconcile, single-flight, execuções).
- `backend/carteira_module/service.py` — casos de uso.
- `backend/carteira_module/routes.py` — router `/api/carteira`.
- `backend/input_module/db.py` — adicionar `listar_numeros_nota()` (contrato estreito de leitura do plano).
- `backend/main.py` — registrar `carteira_router`.
- `backend/test_carteira_module.py` — testes (offline; origem mockada).
- `docs/dev/10-backend-carteira-module.md` — manual do módulo.
- `docs/dev/00-overview.md` — linha do módulo no mapa.

---

### Task 1: config + db (schema, versão, meta)

**Files:**
- Create: `backend/carteira_module/__init__.py`, `backend/carteira_module/config.py`, `backend/carteira_module/db.py`
- Test: `backend/test_carteira_module.py`

**Interfaces:**
- Produces:
  - `config.data_dir() -> Path`; `config.CATALOGO`/`SCHEMA`/`TABELA: str`; `config.REGIONAIS_SP: tuple[str,...]`; `config.DE_PARA_REGIONAL: dict[str,str]`; `config.TAMANHO_CHUNK: int`
  - `db.caminho_banco() -> str`; `db.conectar() -> sqlite3.Connection`; `db.inicializar_banco() -> None`; `db.obter_versao() -> str`; `db.obter_meta(chave: str) -> str | None`; `db.definir_meta(conn, chave: str, valor: str) -> None`; `db.bump_versao(conn) -> None`

- [ ] **Step 1: Write the failing test**

Create `backend/test_carteira_module.py`:
```python
"""Testes do modulo Carteira (backend). Origem Databricks sempre mockada."""
import pytest


@pytest.fixture
def carteira_tmp(monkeypatch, tmp_path):
    monkeypatch.setenv("CARTEIRA_DATA_DIR", str(tmp_path))
    from carteira_module import db
    db.inicializar_banco()
    return tmp_path


def test_inicializar_cria_tabelas(carteira_tmp):
    from carteira_module import db
    conn = db.conectar()
    nomes = {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    conn.close()
    assert {"nota_carteira", "carteira_sync_execucoes",
            "carteira_logs", "carteira_meta"} <= nomes


def test_versao_e_meta(carteira_tmp):
    from carteira_module import db
    v0 = db.obter_versao()
    conn = db.conectar()
    db.definir_meta(conn, "ultimo_refresh_marker", "22-07-2026 07:33")
    db.bump_versao(conn)
    conn.commit()
    conn.close()
    assert db.obter_meta("ultimo_refresh_marker") == "22-07-2026 07:33"
    assert db.obter_versao() != v0


def test_regionais_sp_e_depara():
    from carteira_module import config
    assert "GUARULHOS" in config.REGIONAIS_SP
    assert config.DE_PARA_REGIONAL["LITORAL"] == "Litoral Norte"
    assert config.DE_PARA_REGIONAL["SUZANO"] == "Poá-Suzano"
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'carteira_module'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/__init__.py` (vazio):
```python
```

Create `backend/carteira_module/config.py`:
```python
"""Configuracao do modulo Carteira: caminhos, fonte e dominio."""
import os
from pathlib import Path

from databricks_module import config as dbx


def data_dir() -> Path:
    return Path(
        os.environ.get(
            "CARTEIRA_DATA_DIR", str(Path(__file__).resolve().parent.parent / "data")
        )
    )


CATALOGO = dbx.catalogo()      # sandbox_uc (via .env)
SCHEMA = dbx.schema_padrao()   # ddpm (via .env)
TABELA = "coffee_onr_es_sp"

REGIONAIS_SP = (
    "GUARATINGUETÁ", "SÃO JOSÉ DOS CAMPOS", "GUARULHOS",
    "SUZANO", "MOGI DAS CRUZES", "LITORAL",
)

DE_PARA_REGIONAL = {
    "LITORAL": "Litoral Norte",
    "SUZANO": "Poá-Suzano",
}

TAMANHO_CHUNK = 10000
```

Create `backend/carteira_module/db.py`:
```python
"""Persistencia local da projecao da Carteira (SQLite, carteira.db)."""
import sqlite3

from carteira_module import config


def caminho_banco() -> str:
    config.data_dir().mkdir(parents=True, exist_ok=True)
    return str(config.data_dir() / "carteira.db")


def conectar() -> sqlite3.Connection:
    conn = sqlite3.connect(caminho_banco(), timeout=30, check_same_thread=False)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.row_factory = sqlite3.Row
    return conn


def inicializar_banco() -> None:
    conn = conectar()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS nota_carteira (
            id_onr INTEGER PRIMARY KEY,
            id_sap TEXT,
            sap_real INTEGER,
            conjunto TEXT,
            descricao_conjunto TEXT,
            regional TEXT,
            csd_origem TEXT,
            empresa TEXT,
            quantidade INTEGER,
            quantidade_valida INTEGER,
            prioridade TEXT,
            prioridade_sap INTEGER,
            status_sap TEXT,
            data_encerramento_exec TEXT,
            local_instalacao TEXT,
            alimentador TEXT,
            executor TEXT,
            sintoma TEXT,
            componente_novo TEXT,
            kit TEXT,
            n_trafo TEXT,
            dispositivo_protecao TEXT,
            latitude TEXT,
            longitude TEXT,
            hash_conteudo TEXT,
            sincronizado_em TEXT,
            criado_em TEXT,
            atualizado_em TEXT,
            ausente_na_origem_em TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_nc_regional ON nota_carteira(regional);
        CREATE INDEX IF NOT EXISTS ix_nc_conjunto ON nota_carteira(conjunto);
        CREATE INDEX IF NOT EXISTS ix_nc_status ON nota_carteira(status_sap);
        CREATE INDEX IF NOT EXISTS ix_nc_sapreal ON nota_carteira(sap_real);
        CREATE INDEX IF NOT EXISTS ix_nc_ausente ON nota_carteira(ausente_na_origem_em);
        CREATE INDEX IF NOT EXISTS ix_nc_enc ON nota_carteira(data_encerramento_exec);

        CREATE TABLE IF NOT EXISTS carteira_sync_execucoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            estrategia TEXT,
            iniciado_em TEXT,
            finalizado_em TEXT,
            status TEXT,
            refresh_marker TEXT,
            novas INTEGER,
            atualizadas INTEGER,
            inalteradas INTEGER,
            ausentes INTEGER,
            erro TEXT,
            versao_resultante TEXT
        );

        CREATE TABLE IF NOT EXISTS carteira_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT,
            trace_id TEXT,
            tipo TEXT,
            acao TEXT,
            detalhes TEXT,
            sucesso INTEGER
        );

        CREATE TABLE IF NOT EXISTS carteira_meta (
            chave TEXT PRIMARY KEY,
            valor TEXT
        );
        """
    )
    conn.commit()
    conn.close()


def obter_meta(chave: str) -> str | None:
    conn = conectar()
    row = conn.execute(
        "SELECT valor FROM carteira_meta WHERE chave = ?", (chave,)
    ).fetchone()
    conn.close()
    return row["valor"] if row else None


def definir_meta(conn: sqlite3.Connection, chave: str, valor: str) -> None:
    conn.execute(
        "INSERT INTO carteira_meta(chave, valor) VALUES(?, ?) "
        "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        (chave, valor),
    )


def obter_versao() -> str:
    return obter_meta("versao") or "0"


def bump_versao(conn: sqlite3.Connection) -> None:
    atual = conn.execute(
        "SELECT valor FROM carteira_meta WHERE chave = 'versao'"
    ).fetchone()
    proximo = (int(atual["valor"]) if atual else 0) + 1
    definir_meta(conn, "versao", str(proximo))
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/__init__.py backend/carteira_module/config.py backend/carteira_module/db.py backend/test_carteira_module.py
git commit -m "feat(carteira): config e schema da projecao (carteira.db)"
```

---

### Task 2: mapping.py — normalização, de-para, derivações, hash

**Files:**
- Create: `backend/carteira_module/mapping.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `config.DE_PARA_REGIONAL`.
- Produces:
  - `mapping.de_para_regional(csd: str | None) -> str | None`
  - `mapping.normalizar_linha(origem: dict) -> dict` — recebe um registro cru da origem (chaves = colunas do Databricks) e devolve o dict de negócio de `nota_carteira` (sem metadados de sync), incluindo derivações `sap_real` e `quantidade_valida`.
  - `mapping.hash_conteudo(nota: dict) -> str`
  - `mapping.SENTINELA_SAP = "10000000"`; `mapping.QUANTIDADE_SENTINELA = 9999`

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def _origem_exemplo(**over):
    base = {
        "id_onr": 555, "id_sap": "17247854", "conjunto": "POSTE",
        "descrição_conjunto": "POSTE DEMANDA", "CSD": "LITORAL",
        "EMPRESA": "EDP SP", "quantidade": 12, "prioridade": "3",
        "Prioridade_SAP": 3, "Status_SAP": "Pendente",
        "Data_encerramento_exec": None, "local_instalacao": "718ET00026773",
        "alimentador": "AL1", "executor": "EMPRESA X", "sintoma": "queda",
        "componente_novo": "N", "kit": "", "n_trafo": "", "dispositivo_protecao": "",
        "latitude": "-23.1", "longitude": "-45.2",
        "matriculaSAP": "123", "nomeColaborador": "Fulano", "colaborador": "F",
        "Solicitante": "Sol",
    }
    base.update(over)
    return base


def test_de_para_regional():
    from carteira_module import mapping
    assert mapping.de_para_regional("LITORAL") == "Litoral Norte"
    assert mapping.de_para_regional("SUZANO") == "Poá-Suzano"
    assert mapping.de_para_regional("GUARULHOS") == "GUARULHOS"
    assert mapping.de_para_regional(None) is None


def test_normalizar_linha_deriva_e_dropa_pii():
    from carteira_module import mapping
    n = mapping.normalizar_linha(_origem_exemplo())
    assert n["id_onr"] == 555
    assert n["regional"] == "Litoral Norte"
    assert n["csd_origem"] == "LITORAL"
    assert n["sap_real"] == 1
    assert n["quantidade_valida"] == 1
    assert "matriculaSAP" not in n and "nomeColaborador" not in n
    assert "colaborador" not in n and "Solicitante" not in n


def test_normalizar_linha_sap_pendente_e_quantidade_sentinela():
    from carteira_module import mapping
    n = mapping.normalizar_linha(
        _origem_exemplo(id_sap="10000000", quantidade=9999)
    )
    assert n["sap_real"] == 0
    assert n["quantidade_valida"] == 0


def test_hash_estavel_e_sensivel():
    from carteira_module import mapping
    a = mapping.normalizar_linha(_origem_exemplo())
    b = mapping.normalizar_linha(_origem_exemplo())
    assert mapping.hash_conteudo(a) == mapping.hash_conteudo(b)
    c = mapping.normalizar_linha(_origem_exemplo(Status_SAP="Encerrado"))
    assert mapping.hash_conteudo(a) != mapping.hash_conteudo(c)
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "de_para or normalizar or hash" -v`
Expected: FAIL — `No module named 'carteira_module.mapping'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/mapping.py`:
```python
"""Normalizacao origem Databricks -> dominio da Carteira."""
import hashlib
import json

from carteira_module import config

SENTINELA_SAP = "10000000"
QUANTIDADE_SENTINELA = 9999

# Nome da coluna de descricao vem com acento na origem (descrição_conjunto).
_COL_DESCRICAO = "descrição_conjunto"


def de_para_regional(csd: str | None) -> str | None:
    if csd is None:
        return None
    return config.DE_PARA_REGIONAL.get(csd, csd)


def _texto(valor) -> str | None:
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None


def _inteiro(valor) -> int | None:
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def normalizar_linha(origem: dict) -> dict:
    id_sap = _texto(origem.get("id_sap"))
    sap_real = 1 if (id_sap and id_sap != SENTINELA_SAP) else 0
    quantidade = _inteiro(origem.get("quantidade"))
    quantidade_valida = 1 if (quantidade is not None
                              and quantidade != QUANTIDADE_SENTINELA) else 0
    csd = _texto(origem.get("CSD"))
    return {
        "id_onr": _inteiro(origem.get("id_onr")),
        "id_sap": id_sap,
        "sap_real": sap_real,
        "conjunto": _texto(origem.get("conjunto")),
        "descricao_conjunto": _texto(origem.get(_COL_DESCRICAO)),
        "regional": de_para_regional(csd),
        "csd_origem": csd,
        "empresa": _texto(origem.get("EMPRESA")),
        "quantidade": quantidade,
        "quantidade_valida": quantidade_valida,
        "prioridade": _texto(origem.get("prioridade")),
        "prioridade_sap": _inteiro(origem.get("Prioridade_SAP")),
        "status_sap": _texto(origem.get("Status_SAP")),
        "data_encerramento_exec": _texto(origem.get("Data_encerramento_exec")),
        "local_instalacao": _texto(origem.get("local_instalacao")),
        "alimentador": _texto(origem.get("alimentador")),
        "executor": _texto(origem.get("executor")),
        "sintoma": _texto(origem.get("sintoma")),
        "componente_novo": _texto(origem.get("componente_novo")),
        "kit": _texto(origem.get("kit")),
        "n_trafo": _texto(origem.get("n_trafo")),
        "dispositivo_protecao": _texto(origem.get("dispositivo_protecao")),
        "latitude": _texto(origem.get("latitude")),
        "longitude": _texto(origem.get("longitude")),
    }


def hash_conteudo(nota: dict) -> str:
    """Hash estavel das colunas de negocio (o proprio dict de normalizar_linha)."""
    material = json.dumps(nota, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "de_para or normalizar or hash" -v`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/mapping.py backend/test_carteira_module.py
git commit -m "feat(carteira): normalizacao origem->dominio (de-para, derivacoes, hash, drop PII)"
```

---

### Task 3: situacao.py — situação derivada (função pura)

**Files:**
- Create: `backend/carteira_module/situacao.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Produces: `situacao.derivar(nota: dict, numeros_no_plano: set[int]) -> str` → um de `"cancelada"`, `"executada"`, `"no_plano"`, `"fora_do_plano"`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def test_situacao_precedencia():
    from carteira_module import situacao
    cancelada = {"status_sap": "Cancelado", "data_encerramento_exec": None,
                 "sap_real": 1, "id_sap": "1"}
    assert situacao.derivar(cancelada, {1}) == "cancelada"

    executada = {"status_sap": "Encerrado", "data_encerramento_exec": None,
                 "sap_real": 1, "id_sap": "2"}
    assert situacao.derivar(executada, set()) == "executada"

    exec_por_data = {"status_sap": None, "data_encerramento_exec": "2025-06-01",
                     "sap_real": 1, "id_sap": "3"}
    assert situacao.derivar(exec_por_data, set()) == "executada"

    no_plano = {"status_sap": "Pendente", "data_encerramento_exec": None,
                "sap_real": 1, "id_sap": "44"}
    assert situacao.derivar(no_plano, {44}) == "no_plano"

    fora = {"status_sap": None, "data_encerramento_exec": None,
            "sap_real": 1, "id_sap": "99"}
    assert situacao.derivar(fora, {44}) == "fora_do_plano"


def test_situacao_sem_sap_nunca_no_plano():
    from carteira_module import situacao
    sem_sap = {"status_sap": "Pendente", "data_encerramento_exec": None,
               "sap_real": 0, "id_sap": "10000000"}
    assert situacao.derivar(sem_sap, {10000000}) == "fora_do_plano"
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k situacao -v`
Expected: FAIL — `No module named 'carteira_module.situacao'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/situacao.py`:
```python
"""Situacao da nota: funcao pura sobre a projecao + presenca no plano."""


def derivar(nota: dict, numeros_no_plano: set[int]) -> str:
    if nota.get("status_sap") == "Cancelado":
        return "cancelada"
    if nota.get("status_sap") == "Encerrado" or nota.get("data_encerramento_exec"):
        return "executada"
    if nota.get("sap_real") == 1:
        try:
            numero = int(nota.get("id_sap"))
        except (TypeError, ValueError):
            numero = None
        if numero is not None and numero in numeros_no_plano:
            return "no_plano"
    return "fora_do_plano"
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k situacao -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/situacao.py backend/test_carteira_module.py
git commit -m "feat(carteira): situacao derivada (funcao pura projecao x plano)"
```

---

### Task 4: input_module — contrato estreito `listar_numeros_nota`

**Files:**
- Modify: `backend/input_module/db.py` (adicionar função ao final)
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Produces: `input_module.db.listar_numeros_nota() -> set[int]` — conjunto dos `Numero_Nota` presentes no plano; `set()` se o banco não existir.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def test_listar_numeros_nota(monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path))
    from input_module import db as idb
    idb.inicializar_banco()
    conn = idb.get_db_connection()
    conn.execute("INSERT INTO notas(Numero_Nota) VALUES(111),(222)")
    conn.commit()
    conn.close()
    assert idb.listar_numeros_nota() == {111, 222}
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k listar_numeros -v`
Expected: FAIL — `AttributeError: module 'input_module.db' has no attribute 'listar_numeros_nota'`.

- [ ] **Step 3: Write minimal implementation**

Adicione ao final de `backend/input_module/db.py`:
```python
def listar_numeros_nota() -> set[int]:
    """Contrato estreito de leitura: numeros de nota presentes no plano.

    Usado por outros modulos (ex.: Carteira) para derivar situacao sem
    duplicar SQL do engine. Devolve set vazio se o banco ainda nao existe.
    """
    if not os.path.exists(obter_caminho_banco()):
        return set()
    conn = get_db_connection()
    try:
        linhas = conn.execute("SELECT Numero_Nota FROM notas").fetchall()
    finally:
        conn.close()
    return {int(linha[0]) for linha in linhas if linha[0] is not None}
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k listar_numeros -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/db.py backend/test_carteira_module.py
git commit -m "feat(input): contrato estreito listar_numeros_nota para a Carteira"
```

---

### Task 5: repository.py — staging, reconciliação, listagem, detalhe, resumo

**Files:**
- Create: `backend/carteira_module/repository.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `db.conectar/bump_versao/definir_meta`, `mapping.hash_conteudo`, `situacao` (via SQL CASE — ver nota).
- Produces:
  - `repository.carregar_staging(conn, notas: list[dict]) -> None` — recria `nota_carteira_staging` com as notas normalizadas (+ hash).
  - `repository.reconciliar(conn, agora: str) -> dict` — INSERT/UPDATE/tombstone numa transação; devolve `{"novas","atualizadas","inalteradas","ausentes"}`.
  - `repository.listar(conn, *, numeros_no_plano: set[int], filtros: dict, page: int, size: int, ordenar_por: str, ordem: str) -> tuple[list[dict], int]` — devolve (linhas com `situacao`, total). `filtros` aceita chaves opcionais: `regional`, `conjunto`, `status_sap`, `sap_real`, `situacao`, `q`, `incluir_ausentes`.
  - `repository.obter(conn, id_onr: int, numeros_no_plano: set[int]) -> dict | None`
  - `repository.resumo(conn, numeros_no_plano: set[int]) -> dict` — `{"total", "por_situacao": {...}, "por_regional": {...}}`.

Nota de design: a situação é derivada em SQL para permitir filtrar/paginar corretamente. Cada consulta cria uma TEMP TABLE `plano_atual(numero INTEGER)` populada com `numeros_no_plano` e faz LEFT JOIN; a coluna `situacao` sai de um `CASE`. Isso mantém a lógica igual à de `situacao.derivar` (testada em Task 3) e evita paginar em memória.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def _inserir(conn, notas):
    from carteira_module import repository
    repository.carregar_staging(conn, notas)
    return repository.reconciliar(conn, "2026-07-22T00:00:00")


def test_reconciliar_idempotente_e_tombstone(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    n1 = mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="1001"))
    n2 = mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="1002"))
    r1 = _inserir(conn, [n1, n2])
    assert r1["novas"] == 2
    # rodar de novo com os mesmos dados: nada muda (idempotente)
    r2 = _inserir(conn, [n1, n2])
    assert r2["novas"] == 0 and r2["atualizadas"] == 0 and r2["inalteradas"] == 2
    # n2 some da origem -> tombstone (nunca deletado)
    r3 = _inserir(conn, [n1])
    assert r3["ausentes"] == 1
    row = conn.execute(
        "SELECT ausente_na_origem_em FROM nota_carteira WHERE id_onr=2"
    ).fetchone()
    assert row["ausente_na_origem_em"] is not None
    # n2 volta -> tombstone limpo
    _inserir(conn, [n1, n2])
    row = conn.execute(
        "SELECT ausente_na_origem_em FROM nota_carteira WHERE id_onr=2"
    ).fetchone()
    assert row["ausente_na_origem_em"] is None
    conn.close()


def test_reconciliar_detecta_alteracao(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    _inserir(conn, [mapping.normalizar_linha(_origem_exemplo(id_onr=1, Status_SAP="Pendente"))])
    r = _inserir(conn, [mapping.normalizar_linha(_origem_exemplo(id_onr=1, Status_SAP="Encerrado"))])
    assert r["atualizadas"] == 1
    conn.close()


def test_listar_filtra_por_situacao_e_regional(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="500", CSD="GUARULHOS", Status_SAP="Pendente")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="600", CSD="GUARULHOS", Status_SAP="Encerrado")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=3, id_sap="700", CSD="SUZANO", Status_SAP="Pendente")),
    ])
    linhas, total = repository.listar(
        conn, numeros_no_plano={500}, filtros={"regional": "GUARULHOS"},
        page=1, size=10, ordenar_por="id_onr", ordem="asc",
    )
    assert total == 2
    sit = {l["id_onr"]: l["situacao"] for l in linhas}
    assert sit[1] == "no_plano"      # id_sap 500 no plano
    assert sit[2] == "executada"     # Encerrado
    # filtro por situacao
    _l, t_fora = repository.listar(
        conn, numeros_no_plano=set(), filtros={"situacao": "fora_do_plano"},
        page=1, size=10, ordenar_por="id_onr", ordem="asc",
    )
    assert t_fora == 2               # onr 1 e 3 (Pendente, sem plano)
    conn.close()


def test_resumo_agrega(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="500", CSD="GUARULHOS", Status_SAP="Encerrado")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="600", CSD="SUZANO", Status_SAP="Pendente")),
    ])
    r = repository.resumo(conn, numeros_no_plano=set())
    assert r["total"] == 2
    assert r["por_situacao"].get("executada") == 1
    assert r["por_regional"].get("Poá-Suzano") == 1
    conn.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "reconciliar or listar or resumo" -v`
Expected: FAIL — `No module named 'carteira_module.repository'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/repository.py`:
```python
"""SQL da projecao da Carteira: staging, reconciliacao, leitura, agregados.

A situacao e derivada em SQL (via TEMP TABLE plano_atual + CASE) para
permitir filtragem e paginacao corretas. As regras batem com
situacao.derivar (funcao pura de referencia).
"""
import sqlite3

from carteira_module import db as cdb

# Colunas de negocio de nota_carteira (as produzidas por mapping.normalizar_linha).
_COLUNAS_NEGOCIO = (
    "id_onr", "id_sap", "sap_real", "conjunto", "descricao_conjunto",
    "regional", "csd_origem", "empresa", "quantidade", "quantidade_valida",
    "prioridade", "prioridade_sap", "status_sap", "data_encerramento_exec",
    "local_instalacao", "alimentador", "executor", "sintoma",
    "componente_novo", "kit", "n_trafo", "dispositivo_protecao",
    "latitude", "longitude",
)

_ORDENAVEIS = {
    "id_onr", "id_sap", "regional", "conjunto", "status_sap",
    "quantidade", "data_encerramento_exec",
}

# Expressao de situacao (espelha situacao.derivar). p = LEFT JOIN plano_atual.
_SITUACAO_SQL = """
    CASE
        WHEN n.status_sap = 'Cancelado' THEN 'cancelada'
        WHEN n.status_sap = 'Encerrado' OR n.data_encerramento_exec IS NOT NULL
            THEN 'executada'
        WHEN n.sap_real = 1 AND p.numero IS NOT NULL THEN 'no_plano'
        ELSE 'fora_do_plano'
    END
"""


def carregar_staging(conn: sqlite3.Connection, notas: list[dict]) -> None:
    from carteira_module import mapping
    conn.execute("DROP TABLE IF EXISTS nota_carteira_staging")
    colunas = ", ".join(_COLUNAS_NEGOCIO) + ", hash_conteudo"
    conn.execute(f"CREATE TABLE nota_carteira_staging ({colunas})")
    marcadores = ", ".join(["?"] * (len(_COLUNAS_NEGOCIO) + 1))
    linhas = [
        tuple(nota.get(c) for c in _COLUNAS_NEGOCIO) + (mapping.hash_conteudo(nota),)
        for nota in notas
    ]
    conn.executemany(
        f"INSERT INTO nota_carteira_staging ({colunas}) VALUES ({marcadores})",
        linhas,
    )


def reconciliar(conn: sqlite3.Connection, agora: str) -> dict:
    cols = ", ".join(_COLUNAS_NEGOCIO)
    novas = conn.execute(
        "SELECT COUNT(*) FROM nota_carteira_staging s "
        "WHERE s.id_onr NOT IN (SELECT id_onr FROM nota_carteira)"
    ).fetchone()[0]
    atualizadas = conn.execute(
        "SELECT COUNT(*) FROM nota_carteira_staging s "
        "JOIN nota_carteira n ON n.id_onr = s.id_onr "
        "WHERE n.hash_conteudo <> s.hash_conteudo"
    ).fetchone()[0]
    inalteradas = conn.execute(
        "SELECT COUNT(*) FROM nota_carteira_staging s "
        "JOIN nota_carteira n ON n.id_onr = s.id_onr "
        "WHERE n.hash_conteudo = s.hash_conteudo"
    ).fetchone()[0]
    ausentes = conn.execute(
        "SELECT COUNT(*) FROM nota_carteira n "
        "WHERE n.ausente_na_origem_em IS NULL "
        "AND n.id_onr NOT IN (SELECT id_onr FROM nota_carteira_staging)"
    ).fetchone()[0]

    conn.execute("BEGIN")
    try:
        # INSERT novas
        conn.execute(
            f"INSERT INTO nota_carteira ({cols}, hash_conteudo, sincronizado_em, "
            f"criado_em, atualizado_em) "
            f"SELECT {cols}, hash_conteudo, ?, ?, ? FROM nota_carteira_staging s "
            f"WHERE s.id_onr NOT IN (SELECT id_onr FROM nota_carteira)",
            (agora, agora, agora),
        )
        # UPDATE alteradas
        sets = ", ".join(f"{c} = (SELECT s.{c} FROM nota_carteira_staging s "
                         f"WHERE s.id_onr = nota_carteira.id_onr)"
                         for c in _COLUNAS_NEGOCIO if c != "id_onr")
        conn.execute(
            f"UPDATE nota_carteira SET {sets}, "
            f"hash_conteudo = (SELECT s.hash_conteudo FROM nota_carteira_staging s "
            f"WHERE s.id_onr = nota_carteira.id_onr), "
            f"sincronizado_em = ?, atualizado_em = ?, ausente_na_origem_em = NULL "
            f"WHERE id_onr IN ("
            f"  SELECT s.id_onr FROM nota_carteira_staging s "
            f"  JOIN nota_carteira n ON n.id_onr = s.id_onr "
            f"  WHERE n.hash_conteudo <> s.hash_conteudo)",
            (agora, agora),
        )
        # limpar tombstone de quem reapareceu inalterado
        conn.execute(
            "UPDATE nota_carteira SET ausente_na_origem_em = NULL, sincronizado_em = ? "
            "WHERE ausente_na_origem_em IS NOT NULL "
            "AND id_onr IN (SELECT id_onr FROM nota_carteira_staging)",
            (agora,),
        )
        # tombstone dos ausentes
        conn.execute(
            "UPDATE nota_carteira SET ausente_na_origem_em = ? "
            "WHERE ausente_na_origem_em IS NULL "
            "AND id_onr NOT IN (SELECT id_onr FROM nota_carteira_staging)",
            (agora,),
        )
        cdb.bump_versao(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"novas": novas, "atualizadas": atualizadas,
            "inalteradas": inalteradas, "ausentes": ausentes}


def _preparar_plano(conn: sqlite3.Connection, numeros_no_plano: set[int]) -> None:
    conn.execute("DROP TABLE IF EXISTS plano_atual")
    conn.execute("CREATE TEMP TABLE plano_atual (numero INTEGER PRIMARY KEY)")
    if numeros_no_plano:
        conn.executemany(
            "INSERT OR IGNORE INTO plano_atual(numero) VALUES (?)",
            [(int(n),) for n in numeros_no_plano],
        )


def _where_base(filtros: dict) -> tuple[str, list]:
    clausulas, params = [], []
    if not filtros.get("incluir_ausentes"):
        clausulas.append("n.ausente_na_origem_em IS NULL")
    for coluna, chave in (("regional", "regional"), ("conjunto", "conjunto"),
                          ("status_sap", "status_sap")):
        if filtros.get(chave):
            clausulas.append(f"n.{coluna} = ?")
            params.append(filtros[chave])
    if filtros.get("sap_real") in (0, 1):
        clausulas.append("n.sap_real = ?")
        params.append(filtros["sap_real"])
    if filtros.get("q"):
        termo = f"%{filtros['q']}%"
        clausulas.append("(n.id_sap LIKE ? OR n.conjunto LIKE ? "
                         "OR n.local_instalacao LIKE ?)")
        params += [termo, termo, termo]
    where = (" WHERE " + " AND ".join(clausulas)) if clausulas else ""
    return where, params


def listar(conn, *, numeros_no_plano, filtros, page, size, ordenar_por, ordem):
    _preparar_plano(conn, numeros_no_plano)
    where, params = _where_base(filtros)
    coluna_ordem = ordenar_por if ordenar_por in _ORDENAVEIS else "id_onr"
    direcao = "DESC" if str(ordem).lower() == "desc" else "ASC"

    base = (f"SELECT n.*, ({_SITUACAO_SQL}) AS situacao FROM nota_carteira n "
            f"LEFT JOIN plano_atual p ON p.numero = CAST(n.id_sap AS INTEGER) "
            f"AND n.sap_real = 1 {where}")
    filtro_sit, sit_params = "", []
    if filtros.get("situacao"):
        filtro_sit = " WHERE situacao = ?"
        sit_params = [filtros["situacao"]]

    total = conn.execute(
        f"SELECT COUNT(*) FROM ({base}){filtro_sit}", params + sit_params
    ).fetchone()[0]
    offset = max(0, (page - 1) * size)
    linhas = conn.execute(
        f"SELECT * FROM ({base}){filtro_sit} "
        f"ORDER BY {coluna_ordem} {direcao} LIMIT ? OFFSET ?",
        params + sit_params + [size, offset],
    ).fetchall()
    return [dict(l) for l in linhas], total


def obter(conn, id_onr: int, numeros_no_plano: set[int]) -> dict | None:
    _preparar_plano(conn, numeros_no_plano)
    row = conn.execute(
        f"SELECT n.*, ({_SITUACAO_SQL}) AS situacao FROM nota_carteira n "
        f"LEFT JOIN plano_atual p ON p.numero = CAST(n.id_sap AS INTEGER) "
        f"AND n.sap_real = 1 WHERE n.id_onr = ?",
        (id_onr,),
    ).fetchone()
    return dict(row) if row else None


def resumo(conn, numeros_no_plano: set[int]) -> dict:
    _preparar_plano(conn, numeros_no_plano)
    base = (f"SELECT n.regional AS regional, ({_SITUACAO_SQL}) AS situacao "
            f"FROM nota_carteira n "
            f"LEFT JOIN plano_atual p ON p.numero = CAST(n.id_sap AS INTEGER) "
            f"AND n.sap_real = 1 WHERE n.ausente_na_origem_em IS NULL")
    por_situacao, por_regional, total = {}, {}, 0
    for linha in conn.execute(f"SELECT situacao, COUNT(*) c FROM ({base}) "
                              f"GROUP BY situacao").fetchall():
        por_situacao[linha["situacao"]] = linha["c"]
        total += linha["c"]
    for linha in conn.execute(f"SELECT regional, COUNT(*) c FROM ({base}) "
                              f"GROUP BY regional").fetchall():
        por_regional[linha["regional"]] = linha["c"]
    return {"total": total, "por_situacao": por_situacao,
            "por_regional": por_regional}
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "reconciliar or listar or resumo" -v`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/repository.py backend/test_carteira_module.py
git commit -m "feat(carteira): repository (staging, reconciliacao idempotente, listagem, resumo)"
```

---

### Task 6: sync.py — orquestração (skip-signal, reconcile, single-flight, execuções)

**Files:**
- Create: `backend/carteira_module/sync.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `db`, `mapping.normalizar_linha`, `repository.carregar_staging/reconciliar`, `config`.
- Produces:
  - `sync.sincronizar(*, ler_origem=None, ler_marker=None, agora=None) -> dict` — devolve o registro da execução (`estrategia`, `status`, contagens, `refresh_marker`). `ler_origem() -> Iterable[dict]` e `ler_marker() -> str` são injetáveis (default: Databricks). Aplica skip-signal e single-flight.
  - `sync.estado() -> dict` — `{"ultimo_refresh_marker", "execucoes": [...]}`.
  - `sync._ler_origem_databricks() -> list[dict]`; `sync._ler_marker_databricks() -> str` (default readers).

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def test_sync_completo_e_skip(carteira_tmp):
    from carteira_module import sync
    origem = [_origem_exemplo(id_onr=1, id_sap="1"),
              _origem_exemplo(id_onr=2, id_sap="2")]
    e1 = sync.sincronizar(ler_origem=lambda: origem, ler_marker=lambda: "M1",
                          agora="2026-07-22T00:00:00")
    assert e1["estrategia"] == "completa" and e1["status"] == "ok"
    assert e1["novas"] == 2
    # mesmo marker -> skip (nao reconcilia)
    e2 = sync.sincronizar(ler_origem=lambda: origem, ler_marker=lambda: "M1",
                          agora="2026-07-22T01:00:00")
    assert e2["estrategia"] == "skip"
    # marker novo -> reconcilia de novo, idempotente
    e3 = sync.sincronizar(ler_origem=lambda: origem, ler_marker=lambda: "M2",
                          agora="2026-07-22T02:00:00")
    assert e3["estrategia"] == "completa"
    assert e3["novas"] == 0 and e3["inalteradas"] == 2


def test_sync_registra_execucao(carteira_tmp):
    from carteira_module import sync
    sync.sincronizar(ler_origem=lambda: [_origem_exemplo(id_onr=1, id_sap="1")],
                     ler_marker=lambda: "M1", agora="2026-07-22T00:00:00")
    est = sync.estado()
    assert est["ultimo_refresh_marker"] == "M1"
    assert len(est["execucoes"]) >= 1
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k sync -v`
Expected: FAIL — `No module named 'carteira_module.sync'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/sync.py`:
```python
"""Servico de sincronizacao da Carteira: completo + skip-signal, idempotente."""
import datetime
import threading

from carteira_module import config, db, mapping, repository
from databricks_module import client

_LOCK = threading.Lock()


def _agora_iso() -> str:
    return datetime.datetime.now().isoformat(timespec="seconds")


def _ler_marker_databricks() -> str:
    sql = (f"SELECT MAX(Atualizacao) AS m FROM "
           f"{config.CATALOGO}.{config.SCHEMA}.{config.TABELA}")
    valor = client.consultar(sql).iloc[0]["m"]
    return "" if valor is None else str(valor)


def _ler_origem_databricks() -> list[dict]:
    marcadores = ", ".join(["?"] * len(config.REGIONAIS_SP))
    sql = (f"SELECT * FROM {config.CATALOGO}.{config.SCHEMA}.{config.TABELA} "
           f"WHERE CSD IN ({marcadores})")
    df = client.consultar(sql, list(config.REGIONAIS_SP))
    return df.to_dict("records")


def _registrar(execucao: dict) -> None:
    conn = db.conectar()
    conn.execute(
        "INSERT INTO carteira_sync_execucoes (estrategia, iniciado_em, "
        "finalizado_em, status, refresh_marker, novas, atualizadas, "
        "inalteradas, ausentes, erro, versao_resultante) "
        "VALUES (:estrategia,:iniciado_em,:finalizado_em,:status,:refresh_marker,"
        ":novas,:atualizadas,:inalteradas,:ausentes,:erro,:versao_resultante)",
        {**{k: execucao.get(k) for k in (
            "estrategia", "iniciado_em", "finalizado_em", "status",
            "refresh_marker", "novas", "atualizadas", "inalteradas",
            "ausentes", "erro", "versao_resultante")}},
    )
    conn.commit()
    conn.close()


def sincronizar(*, ler_origem=None, ler_marker=None, agora=None) -> dict:
    ler_origem = ler_origem or _ler_origem_databricks
    ler_marker = ler_marker or _ler_marker_databricks
    iniciado = agora or _agora_iso()
    execucao = {"iniciado_em": iniciado, "refresh_marker": None,
                "novas": 0, "atualizadas": 0, "inalteradas": 0, "ausentes": 0,
                "erro": None, "versao_resultante": None}
    if not _LOCK.acquire(blocking=False):
        execucao.update(estrategia="ignorada", status="em_andamento",
                        finalizado_em=iniciado)
        return execucao
    try:
        marker = ler_marker()
        execucao["refresh_marker"] = marker
        if marker and marker == db.obter_meta("ultimo_refresh_marker"):
            execucao.update(estrategia="skip", status="ok",
                            finalizado_em=_agora_iso(),
                            versao_resultante=db.obter_versao())
            _registrar(execucao)
            return execucao

        notas = [mapping.normalizar_linha(o) for o in ler_origem()]
        conn = db.conectar()
        try:
            repository.carregar_staging(conn, notas)
            contagens = repository.reconciliar(conn, iniciado)
            db_conn = db.conectar()
            db.definir_meta(db_conn, "ultimo_refresh_marker", marker)
            db_conn.commit()
            db_conn.close()
        finally:
            conn.close()
        execucao.update(estrategia="completa", status="ok",
                        finalizado_em=_agora_iso(),
                        versao_resultante=db.obter_versao(), **contagens)
        _registrar(execucao)
        return execucao
    except Exception as exc:  # noqa: BLE001
        execucao.update(estrategia="completa", status="erro",
                        finalizado_em=_agora_iso(), erro=str(exc))
        _registrar(execucao)
        raise
    finally:
        _LOCK.release()


def estado() -> dict:
    conn = db.conectar()
    execucoes = [dict(r) for r in conn.execute(
        "SELECT * FROM carteira_sync_execucoes ORDER BY id DESC LIMIT 20"
    ).fetchall()]
    conn.close()
    return {"ultimo_refresh_marker": db.obter_meta("ultimo_refresh_marker"),
            "execucoes": execucoes}
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k sync -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/sync.py backend/test_carteira_module.py
git commit -m "feat(carteira): servico de sync idempotente (completo + skip + single-flight)"
```

---

### Task 7: service.py — casos de uso

**Files:**
- Create: `backend/carteira_module/service.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `db`, `repository`, `sync`, `input_module.db.listar_numeros_nota`.
- Produces:
  - `service.pagina_notas(filtros: dict, page: int, size: int, ordenar_por: str, ordem: str) -> dict` — `{"registros", "total", "page", "size", "versao"}`.
  - `service.detalhe(id_onr: int) -> dict | None`
  - `service.resumo() -> dict`
  - `service.estado_sincronizacao() -> dict`
  - `service.disparar_sincronizacao() -> dict`

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def test_service_pagina_e_resumo(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from carteira_module import service, sync
    sync.sincronizar(
        ler_origem=lambda: [
            _origem_exemplo(id_onr=1, id_sap="500", CSD="GUARULHOS", Status_SAP="Encerrado"),
            _origem_exemplo(id_onr=2, id_sap="600", CSD="SUZANO", Status_SAP="Pendente"),
        ],
        ler_marker=lambda: "M1", agora="2026-07-22T00:00:00",
    )
    pag = service.pagina_notas({}, page=1, size=10, ordenar_por="id_onr", ordem="asc")
    assert pag["total"] == 2 and len(pag["registros"]) == 2
    assert "versao" in pag
    r = service.resumo()
    assert r["total"] == 2
    d = service.detalhe(1)
    assert d["id_onr"] == 1 and d["situacao"] == "executada"
    assert service.detalhe(9999) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k service -v`
Expected: FAIL — `No module named 'carteira_module.service'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/service.py`:
```python
"""Casos de uso da Carteira: leitura paginada, resumo e sincronizacao."""
from carteira_module import db, repository, sync
from input_module import db as input_db


def _numeros_no_plano() -> set[int]:
    return input_db.listar_numeros_nota()


def pagina_notas(filtros: dict, page: int, size: int,
                 ordenar_por: str, ordem: str) -> dict:
    conn = db.conectar()
    try:
        registros, total = repository.listar(
            conn, numeros_no_plano=_numeros_no_plano(), filtros=filtros,
            page=page, size=size, ordenar_por=ordenar_por, ordem=ordem,
        )
    finally:
        conn.close()
    return {"registros": registros, "total": total, "page": page,
            "size": size, "versao": db.obter_versao()}


def detalhe(id_onr: int) -> dict | None:
    conn = db.conectar()
    try:
        return repository.obter(conn, id_onr, _numeros_no_plano())
    finally:
        conn.close()


def resumo() -> dict:
    conn = db.conectar()
    try:
        return repository.resumo(conn, _numeros_no_plano())
    finally:
        conn.close()


def estado_sincronizacao() -> dict:
    return sync.estado()


def disparar_sincronizacao() -> dict:
    return sync.sincronizar()
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k service -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/service.py backend/test_carteira_module.py
git commit -m "feat(carteira): service (pagina, resumo, detalhe, sincronizacao)"
```

---

### Task 8: routes.py + registro no app

**Files:**
- Create: `backend/carteira_module/routes.py`
- Modify: `backend/main.py` (registrar router + garantir banco)
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `service`, `db.inicializar_banco`.
- Produces: `carteira_module.routes.router` (APIRouter, prefix `/api/carteira`) com `GET /notas`, `GET /notas/{id_onr}`, `GET /resumo`, `GET /sincronizacao`, `POST /sincronizar`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def test_rotas_notas_e_sincronizar(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from carteira_module import routes, sync

    sync.sincronizar(
        ler_origem=lambda: [_origem_exemplo(id_onr=1, id_sap="500", CSD="GUARULHOS")],
        ler_marker=lambda: "M1", agora="2026-07-22T00:00:00",
    )
    app = FastAPI()
    app.include_router(routes.router)
    cliente = TestClient(app)

    r = cliente.get("/api/carteira/notas", params={"regional": "GUARULHOS"})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["total"] == 1 and corpo["registros"][0]["id_onr"] == 1

    assert cliente.get("/api/carteira/notas/1").status_code == 200
    assert cliente.get("/api/carteira/notas/9999").status_code == 404
    assert cliente.get("/api/carteira/resumo").json()["total"] == 1
    assert "execucoes" in cliente.get("/api/carteira/sincronizacao").json()
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k rotas -v`
Expected: FAIL — `No module named 'carteira_module.routes'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/routes.py`:
```python
"""Rotas da Carteira (FastAPI). Endpoints finos: validam e chamam o service."""
from fastapi import APIRouter, HTTPException, Query

from carteira_module import service

router = APIRouter(prefix="/api/carteira", tags=["carteira"])


@router.get("/notas")
def listar_notas(
    regional: str | None = None,
    conjunto: str | None = None,
    status_sap: str | None = None,
    situacao: str | None = None,
    sap_real: int | None = None,
    q: str | None = None,
    incluir_ausentes: bool = False,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
    ordenar_por: str = "id_onr",
    ordem: str = "asc",
):
    filtros = {
        "regional": regional, "conjunto": conjunto, "status_sap": status_sap,
        "situacao": situacao, "sap_real": sap_real, "q": q,
        "incluir_ausentes": incluir_ausentes,
    }
    return service.pagina_notas(filtros, page, size, ordenar_por, ordem)


@router.get("/notas/{id_onr}")
def obter_nota(id_onr: int):
    nota = service.detalhe(id_onr)
    if nota is None:
        raise HTTPException(status_code=404, detail="Nota nao encontrada na carteira.")
    return nota


@router.get("/resumo")
def resumo():
    return service.resumo()


@router.get("/sincronizacao")
def sincronizacao():
    return service.estado_sincronizacao()


@router.post("/sincronizar")
def sincronizar():
    return service.disparar_sincronizacao()
```

Em `backend/main.py`, junto dos outros `include_router` (após `app.include_router(integracao_router)`), adicione:
```python
from carteira_module.routes import router as carteira_router
from carteira_module import db as _carteira_db

_carteira_db.inicializar_banco()
app.include_router(carteira_router)
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -v`
Expected: PASS (todos os testes do módulo).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/routes.py backend/main.py backend/test_carteira_module.py
git commit -m "feat(carteira): rotas /api/carteira + registro no app"
```

---

### Task 9: Documentação

**Files:**
- Create: `docs/dev/10-backend-carteira-module.md`
- Modify: `docs/dev/00-overview.md`

**Interfaces:**
- Consumes: implementação das Tasks 1–8.
- Produces: manual do módulo + linha no mapa de módulos.

- [ ] **Step 1: Escrever o manual**

Create `docs/dev/10-backend-carteira-module.md`:
```markdown
# Backend — carteira_module

Projeção operacional local da base COFFEE (Databricks) e API do explorador.
Reutiliza `databricks_module` para leitura; não fala com o Databricks fora do
`sync.py`.

## Componentes

- `config.py` — `data_dir`, catálogo/schema/tabela (`sandbox_uc.ddpm.coffee_onr_es_sp`),
  `REGIONAIS_SP` (filtro), `DE_PARA_REGIONAL`, `TAMANHO_CHUNK`.
- `db.py` — schema `carteira.db` (`nota_carteira` PK `id_onr`,
  `carteira_sync_execucoes`, `carteira_logs`, `carteira_meta`), `versao`, meta.
- `mapping.py` — normalização origem→domínio: de-para regional, derivações
  (`sap_real`, `quantidade_valida`), `hash_conteudo`, drop de PII.
- `situacao.py` — função pura: `cancelada`/`executada`/`no_plano`/`fora_do_plano`.
- `repository.py` — SQL: staging, reconciliação idempotente (insert/update/
  tombstone), listagem (filtros+paginação+situação via TEMP TABLE), resumo.
- `sync.py` — orquestração: skip-signal (`Atualizacao`), leitura injetável,
  reconcile transacional, single-flight, registro de execuções.
- `service.py` — casos de uso; `routes.py` — endpoints finos `/api/carteira`.

## Sincronização

Sempre completa (a origem faz refresh total; `Atualizacao` é carimbo único da
tabela). Skip-signal: se `MAX(Atualizacao)` == último marker e o último sync foi
ok, pula. Idempotência: PK `id_onr` + upsert por hash + tombstone
(`ausente_na_origem_em`, nunca DELETE) + staging/reconcile transacional +
single-flight (`threading.Lock`).

## Situação

Derivada em tempo de leitura cruzando `nota_carteira.id_sap` com o conjunto de
`Numero_Nota` do plano (`input_module.db.listar_numeros_nota`). A mesma lógica
existe em `situacao.py` (pura) e no `CASE` do `repository.py` (para filtrar/
paginar em SQL).

## APIs

`GET /api/carteira/notas` (filtros+paginação+ETag futuro), `GET /notas/{id_onr}`,
`GET /resumo`, `GET /sincronizacao`, `POST /sincronizar`.

## Testes

`backend/test_carteira_module.py` — offline, origem Databricks injetada.
Rodar: `venv/Scripts/python -m pytest test_carteira_module.py -v`.

## Fora de escopo (fases seguintes)

Mover-para-plano em lote, `plano_movimentacoes`, aba Divergências (Fase 2);
dashboard completo, filtros salvos, command palette (Fase 3); enriquecimento
via `notas_sp` (join `ID_ONR`).
```

- [ ] **Step 2: Adicionar ao mapa de módulos**

Em `docs/dev/00-overview.md`, na tabela "Mapa dos módulos", após a linha do `databricks_module`, adicione:
```markdown
| Backend — carteira_module | `backend/carteira_module/` | Projeção local da base COFFEE (Databricks), sync idempotente, situação derivada e API do explorador da Carteira de Notas | [10-backend-carteira-module.md](./10-backend-carteira-module.md) |
```

- [ ] **Step 3: Verificar suíte verde**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py test_input_module.py -v`
Expected: PASS (carteira + input sem regressão).

- [ ] **Step 4: Commit**

```bash
git add docs/dev/10-backend-carteira-module.md docs/dev/00-overview.md
git commit -m "docs(carteira): manual do carteira_module e mapa de modulos"
```

---

## Self-Review

**Spec coverage (Fase 1 backend):**
- Projeção `nota_carteira` (PK id_onr, colunas, derivações) → Task 1 (schema) + Task 2 (normalização). ✓
- `carteira_sync_execucoes`/`carteira_logs`/`carteira_meta` → Task 1. ✓
- Sync completo + skip-signal + idempotência + single-flight + tombstone → Task 5 (reconcile) + Task 6 (orquestração). ✓
- Situação derivada (pura + SQL) → Task 3 + Task 5 (CASE). ✓
- De-para regional + drop PII + sentinelas → Task 2. ✓
- Join com plano do Input → Task 4 (contrato) + Task 7 (service). ✓
- APIs (notas/resumo/sincronizacao/sincronizar) → Task 8. ✓
- Docs → Task 9. ✓
- Fora de escopo (mover/dashboard/notas_sp) → não implementado, correto. ✓

**Placeholder scan:** sem TBD/TODO; todo código completo.

**Type consistency:** `normalizar_linha(dict)->dict` alimenta `hash_conteudo(dict)`, `carregar_staging(conn, list[dict])` e `reconciliar(conn, str)->dict{novas,atualizadas,inalteradas,ausentes}` — consistentes entre Tasks 2/5/6. `listar(...)->(list[dict],int)` e `resumo(...)->dict` usados igual no service (Task 7) e rotas (Task 8). `listar_numeros_nota()->set[int]` (Task 4) consumido no service (Task 7). Situação: mesmas 4 strings em `situacao.derivar` (Task 3) e no `_SITUACAO_SQL` (Task 5).

**Escopo:** um subsistema coeso (backend da carteira), sem UI — plano único apropriado. O frontend é o plano 1b, separado.
