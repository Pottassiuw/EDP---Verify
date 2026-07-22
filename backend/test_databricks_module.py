"""Testes do modulo de integracao Databricks (backend)."""
import importlib

import pytest


def _recarregar_config(monkeypatch, **envs):
    """Recarrega config com um ambiente controlado.

    O reload roda `load_dotenv()` (efeito colateral do modulo), que pode
    povoar o `os.environ` real a partir de `backend/.env`. Por isso o
    ambiente controlado (delenv/setenv) e aplicado DEPOIS do reload: as
    funcoes de config leem `os.environ` sob demanda, entao o monkeypatch
    aplicado por ultimo e o que vale no teste.
    """
    from databricks_module import config
    importlib.reload(config)
    for chave in ("DATABRICKS_SERVER_HOSTNAME", "DATABRICKS_HTTP_PATH",
                  "DATABRICKS_TOKEN", "DATABRICKS_CATALOG", "DATABRICKS_SCHEMA"):
        monkeypatch.delenv(chave, raising=False)
    for chave, valor in envs.items():
        monkeypatch.setenv(chave, valor)
    return config


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
