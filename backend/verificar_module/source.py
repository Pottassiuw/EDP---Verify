"""Fonte SQLite somente leitura da triagem Verificar."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from urllib.parse import quote

import pandas as pd


TABELA_VERIFICACAO = "ids_verificacao"
CAMINHO_REDE_PADRAO = (
    "//fscoc10/dep/DDPM/COFFEE/Gerador de Notas/Verificar.db"
)


class FonteVerificarIndisponivelErro(RuntimeError):
    """O banco de triagem não pôde ser lido."""


def caminho_banco() -> str:
    """Caminho do banco de triagem; override permite usar um clone em testes."""
    return os.environ.get("VERIFICAR_DB_PATH", CAMINHO_REDE_PADRAO).strip()


def _uri_somente_leitura(caminho: str) -> str:
    normalizado = caminho.replace("\\", "/")
    if normalizado.startswith("//"):
        return "file:////" + quote(normalizado.lstrip("/"), safe="/") + "?mode=ro"
    return Path(normalizado).resolve().as_uri() + "?mode=ro"


def carregar_registros() -> pd.DataFrame:
    """Retorna a tabela compartilhada sem criar journal ou alterar seu schema."""
    caminho = caminho_banco()
    if not caminho:
        raise FonteVerificarIndisponivelErro(
            "VERIFICAR_DB_PATH não foi configurado. Informe o banco da triagem."
        )

    try:
        conn = sqlite3.connect(_uri_somente_leitura(caminho), uri=True, timeout=15)
        try:
            conn.execute("PRAGMA query_only = ON")
            tabelas = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            if TABELA_VERIFICACAO not in tabelas:
                raise FonteVerificarIndisponivelErro(
                    f"O banco de triagem não contém a tabela '{TABELA_VERIFICACAO}'."
                )
            return pd.read_sql_query(
                f'SELECT * FROM "{TABELA_VERIFICACAO}"',
                conn,
            )
        finally:
            conn.close()
    except FonteVerificarIndisponivelErro:
        raise
    except (OSError, sqlite3.Error) as exc:
        raise FonteVerificarIndisponivelErro(
            "Não foi possível ler o Verificar.db. Verifique acesso à rede, "
            "permissão de leitura e o caminho configurado."
        ) from exc
