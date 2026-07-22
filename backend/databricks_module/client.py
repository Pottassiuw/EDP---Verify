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
