"""Persistência local do módulo COFFEE (SQLite) com snapshot de id_sap."""
import contextvars
import datetime
import getpass
import json
import os
import sqlite3

from coffee_module import config
from coffee_module.classify import classificar


def _usuario_atual() -> str:
    """Usuário da máquina (best-effort, nunca levanta)."""
    try:
        nome = getpass.getuser()
        if nome:
            return nome
    except Exception:  # noqa: BLE001
        pass
    return os.environ.get("USERNAME") or os.environ.get("USER") or "desconhecido"

_trace_atual: contextvars.ContextVar = contextvars.ContextVar("coffee_trace", default=None)


def definir_trace(trace_id) -> None:
    """Define o trace_id da operação atual (por requisição / por thread de job)."""
    _trace_atual.set(trace_id)


def trace_atual():
    return _trace_atual.get()


_COLUNAS = ["pk", "id_sap", "id_sap_anterior", "arquivado",
            "classificacao", "dados_json", "buscado_em", "erro", "a_gerar", "origem"]


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
            erro            TEXT,
            a_gerar         INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    cols_notas = [r[1] for r in conn.execute("PRAGMA table_info(notas_coffee)").fetchall()]
    if "a_gerar" not in cols_notas:
        conn.execute("ALTER TABLE notas_coffee ADD COLUMN a_gerar INTEGER NOT NULL DEFAULT 0")
    if "origem" not in cols_notas:
        conn.execute("ALTER TABLE notas_coffee ADD COLUMN origem TEXT")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS coffee_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT NOT NULL,
            tipo        TEXT NOT NULL,
            acao        TEXT NOT NULL,
            nota_pk     INTEGER,
            detalhes    TEXT,
            sucesso     INTEGER NOT NULL,
            usuario     TEXT,
            trace_id    TEXT
        )
        """
    )
    cols_logs = [r[1] for r in conn.execute("PRAGMA table_info(coffee_logs)").fetchall()]
    if "usuario" not in cols_logs:
        conn.execute("ALTER TABLE coffee_logs ADD COLUMN usuario TEXT")
    if "trace_id" not in cols_logs:
        conn.execute("ALTER TABLE coffee_logs ADD COLUMN trace_id TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_nota_pk ON coffee_logs(nota_pk)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_tipo ON coffee_logs(tipo)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON coffee_logs(timestamp)")
    conn.commit()
    conn.close()


def upsert_nota(pk: int, id_sap: int, dados_json: dict) -> str:
    # ponytail: arquivado intencionalmente excluído — representa ação do usuário no nosso
    # app (via arquivar_nota), não o estado do COFFEE (que arquiva como workflow normal).
    conn = get_db_connection()
    row = conn.execute(
        "SELECT id_sap, classificacao, origem FROM notas_coffee WHERE pk = ?", (pk,)
    ).fetchone()
    id_sap_anterior = row[0] if row is not None else None
    classe_anterior = row[1] if row is not None else None
    origem = row[2] if row is not None else None
    classe = classificar(id_sap, id_sap_anterior, origem)
    conn.execute(
        """
        INSERT INTO notas_coffee
            (pk, id_sap, id_sap_anterior, arquivado, classificacao, dados_json, buscado_em, erro)
        VALUES (?, ?, ?, 0, ?, ?, ?, NULL)
        ON CONFLICT(pk) DO UPDATE SET
            id_sap=excluded.id_sap, id_sap_anterior=excluded.id_sap_anterior,
            classificacao=excluded.classificacao,
            dados_json=excluded.dados_json, buscado_em=excluded.buscado_em, erro=NULL
        """,
        (pk, id_sap, id_sap_anterior, classe,
         json.dumps(dados_json, ensure_ascii=False),
         datetime.datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    if row is not None and classe_anterior is not None and classe != classe_anterior:
        registrar_log("transicao", "classificar", pk,
                      {"anterior": classe_anterior, "novo": classe,
                       "id_sap_anterior": id_sap_anterior, "id_sap_atual": id_sap}, True)
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


def arquivar_nota(pk: int) -> None:
    conn = get_db_connection()
    conn.execute("UPDATE notas_coffee SET arquivado = 1 WHERE pk = ?", (pk,))
    conn.commit()
    conn.close()


def listar_notas(status: str | None = None) -> list:
    conn = get_db_connection()
    sql = f"SELECT {', '.join(_COLUNAS)} FROM notas_coffee"
    clausulas: list[str] = []
    params: list = []
    if status == "a_gerar":
        clausulas.append("a_gerar = 1")
    elif status == "gerada":
        clausulas.append("classificacao IN ('gerada', 'corrigida')")
    elif status:
        clausulas.append("classificacao = ?")
        params.append(status)
    clausulas.append("(arquivado IS NULL OR arquivado = 0)")
    sql += " WHERE " + " AND ".join(clausulas)
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    saida = []
    for r in rows:
        d = dict(zip(_COLUNAS, r))
        d["arquivado"] = bool(d["arquivado"]) if d["arquivado"] is not None else None
        d["a_gerar"] = bool(d["a_gerar"])
        d["dados_json"] = json.loads(d["dados_json"]) if d["dados_json"] else None
        saida.append(d)
    return saida


def marcar_gerar(pk: int, a_gerar: bool) -> None:
    """Liga/desliga a flag a_gerar de uma nota existente."""
    conn = get_db_connection()
    conn.execute("UPDATE notas_coffee SET a_gerar = ? WHERE pk = ?",
                 (1 if a_gerar else 0, pk))
    conn.commit()
    conn.close()


def definir_origem(pk: int, origem: str) -> None:
    """Marca a origem da nota ('avulsa' | 'verificar')."""
    conn = get_db_connection()
    conn.execute("UPDATE notas_coffee SET origem = ? WHERE pk = ?", (origem, pk))
    conn.commit()
    conn.close()


def origem_atual(pk: int) -> str | None:
    """Retorna a origem registrada da nota, ou None."""
    conn = get_db_connection()
    row = conn.execute("SELECT origem FROM notas_coffee WHERE pk = ?", (pk,)).fetchone()
    conn.close()
    return row[0] if row is not None else None


def nota_existe(pk: int) -> bool:
    conn = get_db_connection()
    row = conn.execute("SELECT 1 FROM notas_coffee WHERE pk = ?", (pk,)).fetchone()
    conn.close()
    return row is not None


# ---------------------------------------------------------------------------
# Sistema de logs (coffee_logs)
# ---------------------------------------------------------------------------

_COLUNAS_LOG = ["id", "timestamp", "tipo", "acao", "nota_pk", "detalhes", "sucesso", "usuario", "trace_id"]


def registrar_log(tipo: str, acao: str, nota_pk: int | None,
                  detalhes: dict | None, sucesso: bool) -> None:
    """Insere um registro em coffee_logs. Best-effort: nunca levanta."""
    try:
        det = json.dumps(detalhes, ensure_ascii=False, default=str) if detalhes is not None else None
        conn = get_db_connection()
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS coffee_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
                tipo TEXT NOT NULL, acao TEXT NOT NULL, nota_pk INTEGER,
                detalhes TEXT, sucesso INTEGER NOT NULL, usuario TEXT, trace_id TEXT
            )
            """
        )
        conn.execute(
            "INSERT INTO coffee_logs (timestamp, tipo, acao, nota_pk, detalhes, sucesso, usuario, trace_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (datetime.datetime.now().isoformat(), tipo, acao, nota_pk, det,
             1 if sucesso else 0, _usuario_atual(), _trace_atual.get()),
        )
        conn.commit()
        conn.close()
    except Exception:  # noqa: BLE001 -- log jamais quebra a operacao primaria
        pass


def listar_usuarios_log() -> list[str]:
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT DISTINCT usuario FROM coffee_logs WHERE usuario IS NOT NULL ORDER BY usuario"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


def diagnosticar_nota(pk: int) -> dict | None:
    """Estado bruto de uma nota + seus logs, para diagnóstico de transição."""
    conn = get_db_connection()
    row = conn.execute(
        "SELECT pk, id_sap, id_sap_anterior, classificacao, arquivado, buscado_em "
        "FROM notas_coffee WHERE pk = ?", (pk,)
    ).fetchone()
    conn.close()
    if row is None:
        return None
    return {
        "pk": row[0], "id_sap": row[1], "id_sap_anterior": row[2],
        "classificacao": row[3],
        "arquivado": bool(row[4]) if row[4] is not None else None,
        "buscado_em": row[5], "logs": listar_logs(nota_pk=pk, limit=200),
    }


def listar_logs(nota_pk: int | None = None, tipo: str | None = None,
                limit: int = 100, usuario: str | None = None) -> list:
    conn = get_db_connection()
    sql = f"SELECT {', '.join(_COLUNAS_LOG)} FROM coffee_logs"
    clausulas: list = []
    params: list = []
    if nota_pk is not None:
        clausulas.append(
            "(nota_pk = ? OR (tipo = 'acao_usuario' AND nota_pk IS NULL AND trace_id IN "
            "(SELECT trace_id FROM coffee_logs WHERE nota_pk = ? AND trace_id IS NOT NULL)))"
        )
        params.append(nota_pk)
        params.append(nota_pk)
    if tipo:
        clausulas.append("tipo = ?")
        params.append(tipo)
    if usuario:
        clausulas.append("usuario = ?")
        params.append(usuario)
    if clausulas:
        sql += " WHERE " + " AND ".join(clausulas)
    sql += " ORDER BY timestamp DESC, id DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    saida = []
    for r in rows:
        d = dict(zip(_COLUNAS_LOG, r))
        d["sucesso"] = bool(d["sucesso"])
        d["detalhes"] = json.loads(d["detalhes"]) if d["detalhes"] else None
        saida.append(d)
    return saida
