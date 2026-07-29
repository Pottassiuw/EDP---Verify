# Carteira de Notas — Fase 0 (Discovery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o `databricks_module` — camada de integração genérica e reutilizável com o Databricks SQL Warehouse — e usá-lo para descobrir e documentar o schema real da base COFFEE, sem nenhuma UI.

**Architecture:** Módulo backend sem conhecimento de domínio: `config` (credenciais via `.env`), `client` (executa SQL → DataFrame, com retentativas/backoff/logging) e `schema` (introspecção). Um script de execução manual (`discover_databricks.py`) roda a descoberta contra o warehouse real e gera um relatório em `docs/dev/`. Qualquer módulo futuro (carteira, relatórios, etc.) reutiliza `client.consultar`.

**Tech Stack:** Python, FastAPI (já existente), `databricks-sql-connector`, `pandas` (já dep), `python-dotenv` (já dep), `pytest`.

## Global Constraints

- **CLAUDE.md:** endpoints finos, lógica em serviços; nunca engolir exceção (erro explica o quê/por quê/próximo passo); nunca `any` no TS (não se aplica aqui, backend); funções 30–40 linhas, retorno cedo; imports ordenados (stdlib → terceiros → aliases internos → relativos); remover imports não usados.
- **Source of Truth:** Databricks é **somente leitura**. Fase 0 só lê (introspecção); nenhuma escrita no Databricks.
- **Segredos:** `backend/.env` NUNCA versionado (já coberto por `.gitignore`). Token exposto no chat em 2026-07-22 → rotacionar quando a integração estabilizar; atualizar `.env` com o valor novo. `backend/.env.example` (placeholders) é versionável.
- **Testes offline:** nenhum teste unitário pode depender de rede/credenciais reais. A conexão com o Databricks é injetada (parâmetro `conectar`) ou mockada. A execução real acontece só no script de descoberta (Task 5), rodado manualmente.
- **Env vars:** `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN` (obrigatórias); `DATABRICKS_CATALOG`, `DATABRICKS_SCHEMA`, `DATABRICKS_TIMEOUT`, `DATABRICKS_MAX_TENTATIVAS`, `DATABRICKS_BACKOFF_BASE` (opcionais, com default).
- **Comando de teste (a partir de `backend/`):** `venv/Scripts/python -m pytest test_databricks_module.py -v`
- **Convenção de testes:** arquivos flat em `backend/test_*.py`, importando pacotes como top-level (cwd = `backend/`).

---

## File Structure

- `backend/databricks_module/__init__.py` — marca o pacote (vazio).
- `backend/databricks_module/config.py` — carrega `.env`, expõe credenciais/params com falha clara.
- `backend/databricks_module/client.py` — `consultar(sql, params) -> DataFrame`, retentativas, backoff, logging. Único ponto que fala com o Databricks.
- `backend/databricks_module/schema.py` — introspecção (`listar_tabelas`, `descrever_tabela`, `amostrar`, `contar`, `detectar_coluna_atualizacao`), com validação de identificadores.
- `backend/discover_databricks.py` — script de execução manual da descoberta; gera o relatório.
- `backend/test_databricks_module.py` — testes unitários (config, client, schema) com conexão mockada.
- `backend/requirements.txt` — adiciona `databricks-sql-connector` (versão exata fixada após instalar).
- `backend/.gitignore` cobertura já feita (`backend/.env`); `backend/.env` e `backend/.env.example` já criados.
- `backend/main.py` — chamar `load_dotenv` no startup (defensivo; `config.py` também carrega, para scripts/testes).
- `docs/dev/09-backend-databricks-module.md` — manual do módulo + tabela de mapeamento de colunas (a revisar com engenharia).
- `docs/dev/databricks-schema-discovery.md` — relatório gerado pelo script (artefato).
- `docs/dev/00-overview.md` — adicionar linha do `databricks_module` no mapa de módulos.

---

### Task 1: Scaffolding — dependência, dotenv, arquivos de ambiente

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/main.py:1-14`
- Create: `backend/databricks_module/__init__.py`
- Já criados (verificar): `backend/.env`, `backend/.env.example`, `.gitignore` (linha `backend/.env`)

**Interfaces:**
- Consumes: nada.
- Produces: pacote `databricks_module` importável; `databricks-sql-connector` instalado no venv; `load_dotenv()` disponível no app.

- [ ] **Step 1: Confirmar que os segredos estão protegidos**

Run (a partir da raiz do repo):
```bash
git check-ignore backend/.env && git status --porcelain | grep -E "backend/\.env$" || echo "OK: .env ignorado e fora do status"
```
Expected: imprime `backend/.env` (ignorado) e a linha `OK: .env ignorado e fora do status`. Se `backend/.env` aparecer no `git status`, PARE e corrija o `.gitignore` antes de continuar.

- [ ] **Step 2: Instalar o conector Databricks**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pip install "databricks-sql-connector<4"
```
Expected: instala uma versão 3.x sem erro.

- [ ] **Step 3: Fixar a versão exata em requirements.txt**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pip show databricks-sql-connector | grep -i version
```
Copie a versão reportada (ex.: `3.6.0`) e adicione ao final de `backend/requirements.txt`:
```
databricks-sql-connector==<versão reportada>
```

- [ ] **Step 4: Criar o pacote do módulo**

Create `backend/databricks_module/__init__.py` com conteúdo vazio (só a marcação de pacote):
```python
```

- [ ] **Step 5: Carregar o .env no startup do app**

Em `backend/main.py`, logo após os imports de stdlib/terceiros (antes de `from coffee_module import db as _coffee_db`), adicione:
```python
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
```
(Se `pathlib` já estiver importado como `import pathlib`, use `pathlib.Path(__file__).resolve().parent / ".env"` e não duplique o import.)

- [ ] **Step 6: Verificar import do pacote**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -c "import databricks_module; from databricks import sql; print('ok')"
```
Expected: imprime `ok`.

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/main.py backend/databricks_module/__init__.py backend/.env.example .gitignore
git commit -m "chore(databricks): scaffolding do modulo de integracao (dep, dotenv, env files)"
```
(Confirme que `backend/.env` NÃO está no `git add` — é ignorado.)

---

### Task 2: config.py — credenciais e parâmetros

**Files:**
- Create: `backend/databricks_module/config.py`
- Test: `backend/test_databricks_module.py`

**Interfaces:**
- Consumes: env vars (Global Constraints).
- Produces:
  - `server_hostname() -> str`, `http_path() -> str`, `access_token() -> str` (RuntimeError se ausente/vazia).
  - `catalogo() -> str`, `schema_padrao() -> str` (com default).
  - Constantes: `TIMEOUT_SEGUNDOS: int`, `MAX_TENTATIVAS: int`, `BACKOFF_BASE_SEGUNDOS: float`.

- [ ] **Step 1: Write the failing test**

Create `backend/test_databricks_module.py`:
```python
"""Testes do modulo de integracao Databricks (backend)."""
import importlib

import pytest


def _recarregar_config(monkeypatch, **envs):
    """Recarrega config com um ambiente controlado."""
    for chave in ("DATABRICKS_SERVER_HOSTNAME", "DATABRICKS_HTTP_PATH",
                  "DATABRICKS_TOKEN", "DATABRICKS_CATALOG", "DATABRICKS_SCHEMA"):
        monkeypatch.delenv(chave, raising=False)
    for chave, valor in envs.items():
        monkeypatch.setenv(chave, valor)
    from databricks_module import config
    return importlib.reload(config)


def test_config_exige_credenciais(monkeypatch):
    config = _recarregar_config(monkeypatch)
    with pytest.raises(RuntimeError, match="DATABRICKS_SERVER_HOSTNAME"):
        config.server_hostname()
    with pytest.raises(RuntimeError, match="DATABRICKS_HTTP_PATH"):
        config.http_path()
    with pytest.raises(RuntimeError, match="DATABRICKS_TOKEN"):
        config.access_token()


def test_config_le_credenciais(monkeypatch):
    config = _recarregar_config(
        monkeypatch,
        DATABRICKS_SERVER_HOSTNAME="host.databricks.net",
        DATABRICKS_HTTP_PATH="/sql/1.0/warehouses/abc",
        DATABRICKS_TOKEN="dapi-fake",
    )
    assert config.server_hostname() == "host.databricks.net"
    assert config.http_path() == "/sql/1.0/warehouses/abc"
    assert config.access_token() == "dapi-fake"


def test_config_catalogo_schema_default(monkeypatch):
    config = _recarregar_config(monkeypatch)
    assert isinstance(config.catalogo(), str) and config.catalogo()
    assert isinstance(config.schema_padrao(), str) and config.schema_padrao()
```

- [ ] **Step 2: Run test to verify it fails**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pytest test_databricks_module.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'databricks_module.config'` (ou ImportError).

- [ ] **Step 3: Write minimal implementation**

Create `backend/databricks_module/config.py`:
```python
"""Configuracao do modulo de integracao Databricks.

Le credenciais de variaveis de ambiente (backend/.env via python-dotenv).
Falha com mensagem clara quando algo essencial nao esta definido.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Carrega backend/.env de forma tolerante, para que scripts e testes que
# importam este modulo diretamente tambem enxerguem as credenciais.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

TIMEOUT_SEGUNDOS = int(os.environ.get("DATABRICKS_TIMEOUT", "120"))
MAX_TENTATIVAS = int(os.environ.get("DATABRICKS_MAX_TENTATIVAS", "3"))
BACKOFF_BASE_SEGUNDOS = float(os.environ.get("DATABRICKS_BACKOFF_BASE", "1.0"))


def _exigir(nome: str) -> str:
    valor = os.environ.get(nome, "").strip()
    if not valor:
        raise RuntimeError(
            f"{nome} nao definida — configure backend/.env "
            f"(veja backend/.env.example)."
        )
    return valor


def server_hostname() -> str:
    return _exigir("DATABRICKS_SERVER_HOSTNAME")


def http_path() -> str:
    return _exigir("DATABRICKS_HTTP_PATH")


def access_token() -> str:
    return _exigir("DATABRICKS_TOKEN")


def catalogo() -> str:
    """Catalogo padrao onde vive a base COFFEE (sobrescritivel por env)."""
    return os.environ.get("DATABRICKS_CATALOG", "hive_metastore")


def schema_padrao() -> str:
    """Schema padrao onde vive a base COFFEE (sobrescritivel por env)."""
    return os.environ.get("DATABRICKS_SCHEMA", "default")
```

Nota: `hive_metastore`/`default` são apenas pontos de partida; o catálogo/schema reais da base COFFEE são confirmados na descoberta (Task 5) e fixados via env depois.

- [ ] **Step 4: Run test to verify it passes**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pytest test_databricks_module.py -v
```
Expected: PASS (3 testes de config).

- [ ] **Step 5: Commit**

```bash
git add backend/databricks_module/config.py backend/test_databricks_module.py
git commit -m "feat(databricks): config com credenciais via .env e falha clara"
```

---

### Task 3: client.py — consultar com retentativas

**Files:**
- Create: `backend/databricks_module/client.py`
- Test: `backend/test_databricks_module.py` (append)

**Interfaces:**
- Consumes: `config.MAX_TENTATIVAS`, `config.BACKOFF_BASE_SEGUNDOS`, `config.server_hostname/http_path/access_token`.
- Produces:
  - `consultar(consulta: str, params: Sequence | None = None, *, conectar: Callable | None = None, tentativas: int | None = None) -> pandas.DataFrame`
  - `conectar` é uma função de zero argumentos que devolve uma conexão com protocolo de context manager e `.cursor()`. Default: conexão real via `databricks.sql.connect`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_databricks_module.py`:
```python
class _FakeCursor:
    def __init__(self, descricao, linhas):
        self.description = descricao
        self._linhas = linhas
        self.executado = None

    def execute(self, consulta, params=None):
        self.executado = (consulta, params)

    def fetchall(self):
        return self._linhas

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _FakeConexao:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_consultar_monta_dataframe():
    from databricks_module import client
    cursor = _FakeCursor(
        descricao=[("numero_nota", None), ("regional", None)],
        linhas=[(101, "Guarulhos"), (102, "Mogi das Cruzes")],
    )
    df = client.consultar(
        "SELECT numero_nota, regional FROM t",
        conectar=lambda: _FakeConexao(cursor),
    )
    assert list(df.columns) == ["numero_nota", "regional"]
    assert df.shape == (2, 2)
    assert df.iloc[0]["numero_nota"] == 101
    assert cursor.executado[0].startswith("SELECT")


def test_consultar_dataframe_vazio_preserva_colunas():
    from databricks_module import client
    cursor = _FakeCursor(descricao=[("total", None)], linhas=[])
    df = client.consultar("SELECT count(*) AS total FROM t",
                          conectar=lambda: _FakeConexao(cursor))
    assert list(df.columns) == ["total"]
    assert df.empty


def test_consultar_repete_e_depois_sucede(monkeypatch):
    from databricks_module import client
    monkeypatch.setattr(client.time, "sleep", lambda *_: None)
    estado = {"chamadas": 0}
    cursor = _FakeCursor(descricao=[("x", None)], linhas=[(1,)])

    def conectar():
        estado["chamadas"] += 1
        if estado["chamadas"] == 1:
            raise RuntimeError("timeout transitorio")
        return _FakeConexao(cursor)

    df = client.consultar("SELECT x FROM t", conectar=conectar, tentativas=3)
    assert estado["chamadas"] == 2
    assert df.iloc[0]["x"] == 1


def test_consultar_desiste_apos_tentativas(monkeypatch):
    from databricks_module import client
    monkeypatch.setattr(client.time, "sleep", lambda *_: None)

    def conectar():
        raise RuntimeError("falha permanente")

    with pytest.raises(RuntimeError, match="falha permanente"):
        client.consultar("SELECT 1", conectar=conectar, tentativas=3)
```

- [ ] **Step 2: Run test to verify it fails**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pytest test_databricks_module.py -k consultar -v
```
Expected: FAIL — `No module named 'databricks_module.client'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/databricks_module/client.py`:
```python
"""Cliente generico do Databricks SQL Warehouse.

Sem conhecimento de dominio: conecta, executa SQL e devolve um DataFrame,
com retentativas, backoff exponencial e logging. Qualquer modulo pode usar.
"""
import logging
import time
from typing import Callable, Sequence

import pandas as pd

from databricks import sql

from databricks_module import config

_log = logging.getLogger("databricks")


def _conectar():
    """Abre uma conexao real com o SQL Warehouse (usado por padrao)."""
    return sql.connect(
        server_hostname=config.server_hostname(),
        http_path=config.http_path(),
        access_token=config.access_token(),
    )


def _executar(conectar: Callable, consulta: str, params) -> pd.DataFrame:
    with conectar() as conexao:
        with conexao.cursor() as cursor:
            cursor.execute(consulta, params or None)
            colunas = [coluna[0] for coluna in (cursor.description or [])]
            linhas = cursor.fetchall()
    return pd.DataFrame([tuple(linha) for linha in linhas], columns=colunas)


def _backoff(tentativa: int) -> float:
    return config.BACKOFF_BASE_SEGUNDOS * (2 ** (tentativa - 1))


def consultar(
    consulta: str,
    params: Sequence | None = None,
    *,
    conectar: Callable | None = None,
    tentativas: int | None = None,
) -> pd.DataFrame:
    """Executa uma consulta e devolve um DataFrame.

    Repete ate `tentativas` vezes com backoff exponencial em caso de falha;
    registra tempo e resultado de cada tentativa via logging.

    NOTA (fase 1): hoje todas as excecoes sao retentaveis. Quando conhecermos
    os tipos reais lancados pelo databricks-sql-connector, refinar para nao
    repetir erros nao transitorios (ex.: autenticacao).
    """
    conectar = conectar or _conectar
    tentativas = tentativas if tentativas is not None else config.MAX_TENTATIVAS
    ultima_excecao: Exception | None = None
    for tentativa in range(1, tentativas + 1):
        inicio = time.perf_counter()
        try:
            df = _executar(conectar, consulta, params)
            _log.info(
                "consulta ok tentativa=%d linhas=%d tempo_ms=%d",
                tentativa, len(df),
                round((time.perf_counter() - inicio) * 1000),
            )
            return df
        except Exception as excecao:  # noqa: BLE001
            ultima_excecao = excecao
            _log.warning(
                "consulta falhou tentativa=%d/%d tempo_ms=%d erro=%s",
                tentativa, tentativas,
                round((time.perf_counter() - inicio) * 1000), excecao,
            )
            if tentativa >= tentativas:
                raise
            time.sleep(_backoff(tentativa))
    raise ultima_excecao  # defensivo: nunca alcancado
```

- [ ] **Step 4: Run test to verify it passes**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pytest test_databricks_module.py -k consultar -v
```
Expected: PASS (4 testes de consultar).

- [ ] **Step 5: Commit**

```bash
git add backend/databricks_module/client.py backend/test_databricks_module.py
git commit -m "feat(databricks): client consultar com retentativas, backoff e logging"
```

---

### Task 4: schema.py — introspecção com validação de identificadores

**Files:**
- Create: `backend/databricks_module/schema.py`
- Test: `backend/test_databricks_module.py` (append)

**Interfaces:**
- Consumes: `client.consultar`, `config.catalogo()`, `config.schema_padrao()`.
- Produces:
  - `listar_tabelas(*, catalogo=None, schema=None, **kwargs) -> DataFrame` (`SHOW TABLES IN cat.schema`)
  - `descrever_tabela(tabela, *, catalogo=None, schema=None, **kwargs) -> DataFrame` (`DESCRIBE TABLE cat.schema.tabela`)
  - `amostrar(tabela, n=20, *, catalogo=None, schema=None, **kwargs) -> DataFrame` (`SELECT * ... LIMIT n`)
  - `contar(tabela, *, catalogo=None, schema=None, **kwargs) -> int` (`SELECT COUNT(*) AS total ...`)
  - `detectar_coluna_atualizacao(colunas: Iterable[str]) -> str | None`
  - `_validar_identificador(valor) -> str` (ValueError em identificador inválido)

- [ ] **Step 1: Write the failing test**

Append em `backend/test_databricks_module.py`:
```python
def test_validar_identificador_rejeita_injecao():
    from databricks_module import schema
    with pytest.raises(ValueError):
        schema._validar_identificador("tabela; DROP TABLE x")
    assert schema._validar_identificador("base_coffee") == "base_coffee"


def test_listar_tabelas_monta_sql(monkeypatch):
    from databricks_module import schema
    capturado = {}

    def fake_consultar(consulta, params=None, **kwargs):
        capturado["sql"] = consulta
        import pandas as pd
        return pd.DataFrame({"tableName": ["base_coffee"]})

    monkeypatch.setattr(schema.client, "consultar", fake_consultar)
    df = schema.listar_tabelas(catalogo="cat", schema="sch")
    assert "SHOW TABLES IN cat.sch" in capturado["sql"]
    assert df.iloc[0]["tableName"] == "base_coffee"


def test_contar_retorna_inteiro(monkeypatch):
    from databricks_module import schema
    import pandas as pd

    def fake_consultar(consulta, params=None, **kwargs):
        assert "COUNT(*)" in consulta
        assert "cat.sch.base_coffee" in consulta
        return pd.DataFrame({"total": [1234]})

    monkeypatch.setattr(schema.client, "consultar", fake_consultar)
    total = schema.contar("base_coffee", catalogo="cat", schema="sch")
    assert total == 1234


def test_detectar_coluna_atualizacao():
    from databricks_module import schema
    assert schema.detectar_coluna_atualizacao(
        ["numero_nota", "Data_Atualizacao", "regional"]
    ) == "Data_Atualizacao"
    assert schema.detectar_coluna_atualizacao(["numero_nota", "regional"]) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pytest test_databricks_module.py -k "identificador or listar or contar or detectar" -v
```
Expected: FAIL — `No module named 'databricks_module.schema'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/databricks_module/schema.py`:
```python
"""Descoberta de schema da base COFFEE no Databricks.

Consultas de introspeccao construidas sobre databricks_module.client.
Identificadores (catalogo/schema/tabela) sao validados, pois nao podem ser
passados como bind params.
"""
import re
from typing import Iterable

import pandas as pd

from databricks_module import client, config

_IDENTIFICADOR = re.compile(r"^[A-Za-z0-9_]+$")

CANDIDATOS_ATUALIZACAO = (
    "updated_at", "data_atualizacao", "dt_atualizacao", "modified_at",
    "ultima_atualizacao", "atualizado_em", "data_modificacao",
)


def _validar_identificador(valor: str) -> str:
    if not _IDENTIFICADOR.match(valor or ""):
        raise ValueError(f"Identificador invalido: {valor!r}")
    return valor


def _fqn(tabela: str, catalogo: str | None, schema: str | None) -> str:
    cat = _validar_identificador(catalogo or config.catalogo())
    sch = _validar_identificador(schema or config.schema_padrao())
    tab = _validar_identificador(tabela)
    return f"{cat}.{sch}.{tab}"


def listar_tabelas(*, catalogo=None, schema=None, **kwargs) -> pd.DataFrame:
    cat = _validar_identificador(catalogo or config.catalogo())
    sch = _validar_identificador(schema or config.schema_padrao())
    return client.consultar(f"SHOW TABLES IN {cat}.{sch}", **kwargs)


def descrever_tabela(tabela, *, catalogo=None, schema=None, **kwargs) -> pd.DataFrame:
    return client.consultar(
        f"DESCRIBE TABLE {_fqn(tabela, catalogo, schema)}", **kwargs
    )


def amostrar(tabela, n=20, *, catalogo=None, schema=None, **kwargs) -> pd.DataFrame:
    n = int(n)
    return client.consultar(
        f"SELECT * FROM {_fqn(tabela, catalogo, schema)} LIMIT {n}", **kwargs
    )


def contar(tabela, *, catalogo=None, schema=None, **kwargs) -> int:
    df = client.consultar(
        f"SELECT COUNT(*) AS total FROM {_fqn(tabela, catalogo, schema)}", **kwargs
    )
    return int(df.iloc[0]["total"])


def detectar_coluna_atualizacao(colunas: Iterable[str]) -> str | None:
    """Encontra uma coluna de 'ultima atualizacao' (viabiliza sync incremental)."""
    normalizadas = {str(c).strip().lower(): str(c) for c in colunas}
    for candidato in CANDIDATOS_ATUALIZACAO:
        if candidato in normalizadas:
            return normalizadas[candidato]
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pytest test_databricks_module.py -v
```
Expected: PASS (todos os testes: config + consultar + schema).

- [ ] **Step 5: Commit**

```bash
git add backend/databricks_module/schema.py backend/test_databricks_module.py
git commit -m "feat(databricks): introspeccao de schema com validacao de identificadores"
```

---

### Task 5: Script de descoberta + execução real + relatório

**Files:**
- Create: `backend/discover_databricks.py`
- Create (gerado pelo script): `docs/dev/databricks-schema-discovery.md`

**Interfaces:**
- Consumes: `databricks_module.schema` (`listar_tabelas`, `descrever_tabela`, `contar`, `amostrar`, `detectar_coluna_atualizacao`), `databricks_module.config`.
- Produces: relatório markdown com, por tabela do schema alvo: colunas+tipos, contagem, amostra (linhas ofuscadas para valores longos), e se há coluna de última atualização.

> Este task tem uma etapa de execução real (Step 3) que requer credenciais válidas e rede liberada para o Databricks. Não é um teste unitário.

- [ ] **Step 1: Escrever o script de descoberta**

Create `backend/discover_databricks.py`:
```python
"""Descoberta do schema da base COFFEE no Databricks (execucao manual).

Uso (a partir de backend/):
    venv/Scripts/python discover_databricks.py --schema SCHEMA [--catalogo CAT] [--amostra N]

Conecta no SQL Warehouse (credenciais de backend/.env), lista as tabelas do
schema alvo e, para cada uma, coleta colunas/tipos, contagem e uma amostra;
grava um relatorio em docs/dev/databricks-schema-discovery.md.
"""
import argparse
from pathlib import Path

from databricks_module import config, schema

_RELATORIO = (
    Path(__file__).resolve().parent.parent
    / "docs" / "dev" / "databricks-schema-discovery.md"
)


def _coluna_nome_tabela(df):
    """SHOW TABLES devolve colunas diferentes conforme o runtime; acha a certa."""
    for candidato in ("tableName", "table_name", "tab_name"):
        if candidato in df.columns:
            return candidato
    return df.columns[-1]


def _linhas_descricao(df):
    """DESCRIBE TABLE: pega (col_name, data_type) ate a linha em branco/particao."""
    pares = []
    for _, linha in df.iterrows():
        nome = str(linha.get("col_name", "")).strip()
        tipo = str(linha.get("data_type", "")).strip()
        if not nome or nome.startswith("#"):
            break
        pares.append((nome, tipo))
    return pares


def _ofuscar(valor, limite=40):
    texto = "" if valor is None else str(valor)
    return texto if len(texto) <= limite else texto[:limite] + "…"


def descobrir(catalogo: str, schema_alvo: str, amostra: int) -> str:
    partes = [
        "# Descoberta de Schema — Base COFFEE (Databricks)",
        "",
        f"- Catálogo: `{catalogo}`",
        f"- Schema: `{schema_alvo}`",
        f"- Server: `{config.server_hostname()}`",
        "",
    ]
    tabelas_df = schema.listar_tabelas(catalogo=catalogo, schema=schema_alvo)
    coluna_nome = _coluna_nome_tabela(tabelas_df)
    nomes = [str(v) for v in tabelas_df[coluna_nome].tolist()]
    partes.append(f"## Tabelas encontradas ({len(nomes)})\n")
    partes.append("\n".join(f"- `{n}`" for n in nomes) + "\n")

    for nome in nomes:
        partes.append(f"\n---\n\n## `{nome}`\n")
        try:
            desc = schema.descrever_tabela(nome, catalogo=catalogo, schema=schema_alvo)
            colunas = _linhas_descricao(desc)
            total = schema.contar(nome, catalogo=catalogo, schema=schema_alvo)
            col_atualizacao = schema.detectar_coluna_atualizacao(
                [c for c, _ in colunas]
            )
            partes.append(f"- Linhas: **{total}**")
            partes.append(
                f"- Coluna de última atualização detectada: "
                f"**{col_atualizacao or 'nenhuma (só sync completa)'}**\n"
            )
            partes.append("| Coluna | Tipo |")
            partes.append("|---|---|")
            for col, tipo in colunas:
                partes.append(f"| `{col}` | {tipo} |")

            amostra_df = schema.amostrar(
                nome, n=amostra, catalogo=catalogo, schema=schema_alvo
            )
            partes.append(f"\n### Amostra ({len(amostra_df)} linhas)\n")
            cols = list(amostra_df.columns)
            partes.append("| " + " | ".join(cols) + " |")
            partes.append("|" + "|".join(["---"] * len(cols)) + "|")
            for _, linha in amostra_df.iterrows():
                partes.append(
                    "| " + " | ".join(_ofuscar(linha[c]) for c in cols) + " |"
                )
        except Exception as exc:  # noqa: BLE001
            partes.append(f"\n> ERRO ao inspecionar `{nome}`: {exc}\n")

    return "\n".join(partes) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Descoberta de schema Databricks")
    parser.add_argument("--catalogo", default=config.catalogo())
    parser.add_argument("--schema", default=config.schema_padrao())
    parser.add_argument("--amostra", type=int, default=10)
    args = parser.parse_args()

    conteudo = descobrir(args.catalogo, args.schema, args.amostra)
    _RELATORIO.parent.mkdir(parents=True, exist_ok=True)
    _RELATORIO.write_text(conteudo, encoding="utf-8")
    print(f"Relatorio gravado em {_RELATORIO}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Descobrir catálogo/schema disponíveis (se desconhecidos)**

Run (a partir de `backend/`), para localizar onde vive a base COFFEE:
```bash
venv/Scripts/python -c "from databricks_module import client; print(client.consultar('SHOW CATALOGS'))"
venv/Scripts/python -c "from databricks_module import client; print(client.consultar('SHOW SCHEMAS IN <catalogo>'))"
venv/Scripts/python -c "from databricks_module import client; print(client.consultar('SHOW TABLES IN <catalogo>.<schema>'))"
```
Expected: identificar o catálogo/schema que contém a base COFFEE (a tabela com todas as notas geradas). Anote-os.

- [ ] **Step 3: Rodar a descoberta contra o warehouse real**

Run (a partir de `backend/`, com o catálogo/schema achados no Step 2):
```bash
venv/Scripts/python discover_databricks.py --catalogo <catalogo> --schema <schema> --amostra 10
```
Expected: imprime `Relatorio gravado em .../docs/dev/databricks-schema-discovery.md`; o arquivo existe e lista as tabelas, colunas, contagens e amostras. Confirme o COUNT real da base principal (dimensiona o volume — a arquitetura assumiu 50k–500k).

- [ ] **Step 4: Fixar catálogo/schema reais no .env**

Adicione ao `backend/.env` (usando os valores confirmados):
```
DATABRICKS_CATALOG=<catalogo real>
DATABRICKS_SCHEMA=<schema real>
```

- [ ] **Step 5: Commit (script + relatório)**

```bash
git add backend/discover_databricks.py docs/dev/databricks-schema-discovery.md
git commit -m "feat(databricks): script de descoberta de schema + relatorio da base COFFEE"
```
(O `.env` não entra — é ignorado.)

---

### Task 6: Documentação do módulo + mapa de colunas para revisão com a engenharia

**Files:**
- Create: `docs/dev/09-backend-databricks-module.md`
- Modify: `docs/dev/00-overview.md` (mapa de módulos)

**Interfaces:**
- Consumes: o relatório gerado (Task 5) e o design (`docs/superpowers/specs/2026-07-22-carteira-de-notas-design.md`).
- Produces: manual do módulo + tabela de decisão de colunas (incorporar / ignorar / enriquecer) a ser preenchida com a engenharia — gate da Fase 1.

- [ ] **Step 1: Escrever o manual do módulo**

Create `docs/dev/09-backend-databricks-module.md`:
```markdown
# Backend — databricks_module

Camada de integração genérica e reutilizável com o Databricks SQL Warehouse.
Sem conhecimento de domínio: qualquer módulo (carteira, relatórios, etc.)
usa `client.consultar` sem duplicar lógica de conexão.

## Componentes

- `config.py` — credenciais e parâmetros via `backend/.env` (python-dotenv).
  Variáveis: `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`,
  `DATABRICKS_TOKEN` (obrigatórias); `DATABRICKS_CATALOG`,
  `DATABRICKS_SCHEMA`, `DATABRICKS_TIMEOUT`, `DATABRICKS_MAX_TENTATIVAS`,
  `DATABRICKS_BACKOFF_BASE` (opcionais). Falha com mensagem clara se faltar.
- `client.py` — `consultar(sql, params) -> DataFrame`, único ponto que fala
  com o Databricks. Retentativas com backoff exponencial e logging por
  tentativa (logger `databricks`). Conexão injetável (`conectar=`) para teste.
- `schema.py` — introspecção: `listar_tabelas`, `descrever_tabela`,
  `amostrar`, `contar`, `detectar_coluna_atualizacao`. Identificadores
  validados (não são bind params).
- `discover_databricks.py` (script) — execução manual da descoberta; gera
  `docs/dev/databricks-schema-discovery.md`.

## Segurança

`backend/.env` NUNCA é versionado (`.gitignore`). Databricks é **somente
leitura** nesta fase. Token de acesso deve ser rotacionado periodicamente.

## Testes

`backend/test_databricks_module.py` — offline, conexão mockada/injetada.
Rodar: `venv/Scripts/python -m pytest test_databricks_module.py -v`.

## Limitações conhecidas (a refinar na Fase 1)

- Retentativa hoje repete qualquer exceção; refinar para não repetir erros
  não transitórios (ex.: autenticação) quando os tipos reais forem conhecidos.
- Paginação de introspecção usa `LIMIT`; para leitura em massa (sync da
  carteira) o `carteira_module` fará chunking próprio.
```

- [ ] **Step 2: Adicionar o módulo ao mapa em 00-overview.md**

Em `docs/dev/00-overview.md`, na tabela "Mapa dos módulos", adicione a linha (após a linha do `integracao_module`):
```markdown
| Backend — databricks_module | `backend/databricks_module/` | Integração genérica e reutilizável com o Databricks SQL Warehouse (client, config, descoberta de schema); base da Carteira de Notas | [09-backend-databricks-module.md](./09-backend-databricks-module.md) |
```

- [ ] **Step 3: Escrever a tabela de decisão de colunas (para revisar com engenharia)**

Acrescente ao final de `docs/dev/09-backend-databricks-module.md` a seção abaixo e preencha a coluna "Origem (Databricks)" a partir do relatório de descoberta. A decisão final ("Ação") é tomada **junto com a engenharia** — este é o gate da Fase 1.
```markdown
## Mapa de colunas da base COFFEE → domínio da aplicação

Preencher a partir de `databricks-schema-discovery.md`; decidir com a engenharia.
Ação: **incorporar** (vira coluna de `nota_carteira`) · **ignorar** ·
**enriquecer** (leva também para Input/COFFEE/Relatórios).

| Origem (Databricks) | Tipo | Significado | Equivalente atual | Ação | Observação |
|---|---|---|---|---|---|
| numero_nota (ex.) | ? | nº SAP da nota | notas.Numero_Nota | incorporar (chave natural) | confirmar unicidade |
| conjunto (ex.) | ? | rubrica/plano | Conjunto (ausente no Input) | enriquecer | pedido explícito da engenharia |
| equipamento (ex.) | ? | tipo do ativo | — (novo) | incorporar | dimensão de dashboard |
| regional (ex.) | ? | regional CSD | Regional | incorporar | conferir de-para |
| (coluna de atualização) | ? | última alteração | — | avaliar | viabiliza sync incremental |
```

- [ ] **Step 4: Verificar build/testes ainda verdes**

Run (a partir de `backend/`):
```bash
venv/Scripts/python -m pytest test_databricks_module.py -v
```
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add docs/dev/09-backend-databricks-module.md docs/dev/00-overview.md
git commit -m "docs(databricks): manual do modulo e mapa de colunas para revisao com engenharia"
```

---

## Self-Review

**Spec coverage (seções da Fase 0 no design §12 + §5–§10):**
- `databricks_module` (config/client/schema) → Tasks 2–4. ✓
- Credenciais `.env` + `.gitignore` → Task 1 + Global Constraints. ✓
- Descoberta de schema (tabelas/colunas/tipos/amostras/COUNT/coluna de atualização) → Task 5. ✓
- Mapa de colunas revisado com a engenharia (gate da Fase 1) → Task 6 Step 3. ✓
- Observabilidade (logging por tentativa) → Task 3. ✓ (auditoria em SQLite `carteira_logs` é Fase 1, fora do escopo 0.)
- Retentativas/falhas → Task 3. ✓
- Reutilização por qualquer módulo (sem domínio) → `client.consultar` genérico, Task 3. ✓
- "Sem UI" → nenhum endpoint/rota criado. ✓

**Placeholder scan:** exemplos na tabela de colunas (Task 6) estão marcados "(ex.)" e são template a preencher com dados reais da descoberta — intencional, não placeholder de código. Todo código de módulo/teste é completo.

**Type consistency:** `consultar(consulta, params, *, conectar, tentativas)` idêntico entre Task 3 (def) e Tasks 4–5 (uso, via `**kwargs`). `_validar_identificador`, `_fqn`, `listar_tabelas/descrever_tabela/amostrar/contar/detectar_coluna_atualizacao` consistentes entre def (Task 4) e uso (Task 5). `config.catalogo()/schema_padrao()` consistentes entre Tasks 2/4/5.

**Escopo:** Fase 0 é um subsistema coeso (um módulo backend + descoberta), sem UI — plano único apropriado.
