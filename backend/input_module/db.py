"""Persistência local do módulo Input (SQLite).

Porte de Input/database.py com banco LOCAL (backend/data/) em vez do
arquivo compartilhado na rede. Tabela `bloqueios` não foi portada (sem uso).
"""
import datetime
import glob
import json
import os
import re
import shutil
import sqlite3

import pandas as pd

from input_module import config
from input_module.config import DE_PARA_CIDADES, INV_STATUS_MAP, STATUS_MAP


def obter_caminho_banco() -> str:
    return str(config.data_dir() / "notas_departamento.db")


def get_db_connection() -> sqlite3.Connection:
    config.data_dir().mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(obter_caminho_banco(), timeout=30, check_same_thread=False)
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def migrar_da_rede_se_preciso() -> str:
    """Primeira execução: copia o banco da rede para o diretório local.

    Retorna "ja-existe", "migrado" ou "rede-indisponivel".
    """
    destino = obter_caminho_banco()
    if os.path.exists(destino):
        return "ja-existe"
    if not os.path.exists(config.REDE_DB_ORIGEM):
        return "rede-indisponivel"
    config.data_dir().mkdir(parents=True, exist_ok=True)
    shutil.copy2(config.REDE_DB_ORIGEM, destino)
    return "migrado"


def inicializar_banco() -> None:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notas (
            Numero_Nota INTEGER PRIMARY KEY,
            ID_Cronologia INTEGER,
            Status_Obra TEXT,
            Conjunto TEXT,
            Circuito TEXT,
            Local_Instalacao TEXT,
            Regional TEXT,
            Planejado_DDPM REAL,
            Mes_Execucao_Planejado TEXT,
            Data_Envio_Projeto TEXT,
            Centro_Responsavel TEXT,
            Status_Nota INTEGER,
            Prioridade_Nota TEXT,
            Observacao TEXT,
            "Check" TEXT,
            Status_Anterior TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS log_alteracoes (
            ID_Log INTEGER PRIMARY KEY AUTOINCREMENT,
            Numero_Nota INTEGER,
            Usuario TEXT,
            Data_Hora TIMESTAMP,
            Campo_Alterado TEXT,
            Valor_Antigo TEXT,
            Valor_Novo TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS log_arquivos (
            ID_Log INTEGER PRIMARY KEY AUTOINCREMENT,
            Nome_Arquivo TEXT,
            Usuario TEXT,
            Data_Hora TIMESTAMP,
            Acao TEXT
        )
    ''')

    # --- VERIFICAÇÃO E ATUALIZAÇÃO DO ESQUEMA (ALTER TABLE) ---
    # Pega a lista de colunas que realmente existem hoje no banco
    cursor.execute("PRAGMA table_info(notas)")
    colunas_existentes = [coluna[1] for coluna in cursor.fetchall()]

    # Se as colunas novas não existirem, adiciona elas na tabela antiga
    if "Check" not in colunas_existentes:
        cursor.execute('ALTER TABLE notas ADD COLUMN "Check" TEXT DEFAULT "-"')
    if "Status_Anterior" not in colunas_existentes:
        cursor.execute('ALTER TABLE notas ADD COLUMN Status_Anterior TEXT DEFAULT "-"')

    conn.commit()
    conn.close()
