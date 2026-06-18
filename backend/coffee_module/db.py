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
