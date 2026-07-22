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
