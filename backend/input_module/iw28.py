"""Contrato de leitura da base IW28 (extração diária do SAP).

A tabela base_iw28 é recriada por to_sql(if_exists="replace") a partir do
Excel do robô SAP — schema flutuante e pode não existir (cópia dev). Toda
leitura degrada para None em vez de levantar.
"""
import pandas as pd

from input_module import db


def obter_por_nota(numero: int) -> dict | None:
    """Linha da base_iw28 para a nota SAP, ou None (ausente/fora da extração)."""
    conn = db.get_db_connection()
    try:
        df = pd.read_sql(
            "SELECT * FROM base_iw28 WHERE CAST(Nota AS INTEGER) = ?",
            conn, params=(int(numero),))
    except Exception:
        return None  # tabela ausente ou coluna Nota renomeada pelo robô
    finally:
        conn.close()
    if df.empty:
        return None
    registro = df.iloc[0].to_dict()
    return {chave: (None if pd.isna(valor) else valor) for chave, valor in registro.items()}


def extraida_em() -> str | None:
    """Data da última importação da IW28 registrada em log_arquivos."""
    conn = db.get_db_connection()
    try:
        row = conn.execute(
            "SELECT MAX(Data_Hora) FROM log_arquivos WHERE Nome_Arquivo LIKE '%IW28%'"
        ).fetchone()
        return row[0] if row and row[0] else None
    except Exception:
        return None
    finally:
        conn.close()
