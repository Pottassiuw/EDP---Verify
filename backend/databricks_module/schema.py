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
    "date_load", "updated_at", "data_atualizacao", "dt_atualizacao",
    "modified_at", "ultima_atualizacao", "atualizado_em", "data_modificacao",
    "atualizacao", "data_carga", "dt_carga",
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
