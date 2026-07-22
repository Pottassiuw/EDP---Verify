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
