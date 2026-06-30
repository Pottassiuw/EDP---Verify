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
from input_module.config import DE_PARA_CIDADES, DE_PARA_REGIONAL, INV_STATUS_MAP, STATUS_MAP


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

    # Índices para acelerar auditoria e logs
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_alteracoes_nota ON log_alteracoes(Numero_Nota)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_alteracoes_data ON log_alteracoes(Data_Hora DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_arquivos_data ON log_arquivos(Data_Hora DESC)')

    conn.commit()
    conn.close()


# ==============================================================================
# BACKUP ROTATIVO (local, síncrono — a rota decide o background)
# ==============================================================================
def realizar_backup(limite: int = 20, intervalo_horas: int = 2) -> None:
    """Cria um backup rotativo do banco em ``config.data_dir()/"backups"``.

    Só cria um novo se o último tiver sido feito há mais de ``intervalo_horas``
    (``intervalo_horas=0`` sempre cria). Mantém no máximo ``limite`` arquivos.
    Síncrono: o agendamento em segundo plano fica a cargo da rota (BackgroundTasks).
    """
    caminho_db = obter_caminho_banco()
    if not os.path.exists(caminho_db):
        return

    diretorio_backup = str(config.data_dir() / "backups")
    if not os.path.exists(diretorio_backup):
        try:
            os.makedirs(diretorio_backup)
        except Exception:
            pass

    backups_existentes = glob.glob(os.path.join(diretorio_backup, "notas_departamento_*.db"))
    backups_existentes.sort(key=os.path.getmtime)

    if backups_existentes and intervalo_horas:
        ultimo_backup = backups_existentes[-1]
        tempo_ultimo = datetime.datetime.fromtimestamp(os.path.getmtime(ultimo_backup))
        if (datetime.datetime.now() - tempo_ultimo).total_seconds() < (intervalo_horas * 3600):
            return  # Já existe um backup recente, não cria duplicatas à toa

    data_hora_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_backup = f"notas_departamento_{data_hora_str}.db"
    caminho_backup = os.path.join(diretorio_backup, nome_backup)

    try:
        shutil.copy2(caminho_db, caminho_backup)
        if caminho_backup not in backups_existentes:
            backups_existentes.append(caminho_backup)
        while len(backups_existentes) > limite:
            backup_antigo = backups_existentes.pop(0)
            if os.path.exists(backup_antigo):
                os.remove(backup_antigo)
    except Exception as e:
        print(f"Erro ao realizar backup: {e}")


# ==============================================================================
# CONFIGURAÇÕES DINÂMICAS LOCAIS (JSON)
# ==============================================================================
def _caminho_responsaveis() -> str:
    return str(config.data_dir() / "config_responsaveis.json")


def carregar_responsaveis() -> dict:
    caminho = _caminho_responsaveis()
    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    return dict(config.DE_PARA_RESPONSAVEIS_PADRAO)


def salvar_responsaveis(novo: dict) -> None:
    config.data_dir().mkdir(parents=True, exist_ok=True)
    with open(_caminho_responsaveis(), "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=4)


def carregar_projeto_construcao() -> dict:
    """Carrega o mapa projeto/construção do JSON na rede; se ausente, devolve o padrão.

    Diferente do porte original, NÃO tenta escrever na rede quando o arquivo não
    existe — apenas retorna ``config.MAP_PROJETO_CONSTRUCAO_PADRAO``.
    """
    caminho = config.CAMINHO_PROJETO_CONSTRUCAO
    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    return dict(config.MAP_PROJETO_CONSTRUCAO_PADRAO)


# ==============================================================================
# CARGA E PERSISTÊNCIA DE DADOS
# ==============================================================================
def carregar_dados() -> pd.DataFrame:
    conn = get_db_connection()
    try:
        df = pd.read_sql("SELECT * FROM notas ORDER BY ID_Cronologia ASC", conn)

        if 'Centro_Responsavel' in df.columns:
            df['Centro_Responsavel'] = df['Centro_Responsavel'].fillna('-')
        else:
            df['Centro_Responsavel'] = '-'
    finally:
        conn.close()

    if not df.empty:
        df['Status_Nota'] = df['Status_Nota'].map(STATUS_MAP)

        meses_pt = {
            1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr',
            5: 'maio', 6: 'jun', 7: 'jul', 8: 'ago',
            9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
        }
        dt_mes = pd.to_datetime(df['Mes_Execucao_Planejado'], errors='coerce')
        mes_ano_formatado = dt_mes.dt.month.map(meses_pt) + '-' + dt_mes.dt.year.fillna(0).astype(int).astype(str)
        df['Mes_Execucao_Planejado'] = mes_ano_formatado.where(dt_mes.notna(), df['Mes_Execucao_Planejado'])

        def formatar_data_envio(val):
            if pd.isna(val) or str(val).strip().lower() in ["none", "nan", "-", "", "<na>"]:
                return "-"
            val_str = str(val).strip()
            try:
                return pd.to_datetime(val_str, dayfirst=True).strftime('%d/%m/%Y')
            except Exception:
                try:
                    return pd.to_datetime(val_str).strftime('%d/%m/%Y')
                except Exception:
                    return val_str

        df['Data_Envio_Projeto'] = df['Data_Envio_Projeto'].apply(formatar_data_envio)

        # Coluna Cidades
        df['Codigo_Busca'] = df['Local_Instalacao'].astype(str).str[:3]
        df['Cidade'] = df['Codigo_Busca'].map(DE_PARA_CIDADES)
        df = df.drop(columns=['Codigo_Busca'])

        # Limpeza de valores Nulos e texto "None"
        colunas_forcar_texto = [
            "Observacao", "Check", "Status_Obra", "Conjunto", "Circuito",
            "Local_Instalacao", "Regional", "Centro_Responsavel", "Prioridade_Nota"
        ]

        for col in df.columns:
            if df[col].dtype == object or col in colunas_forcar_texto:
                # Força a conversão para string para lidar com colunas que vieram como numéricas (NaN)
                df[col] = df[col].fillna("").astype(str)
                df[col] = df[col].apply(lambda x: "" if str(x).strip().lower() in ["none", "nan", "null", "<na>"] else x)

                # Garante que a Observação e o Check também não fiquem com o traço "-" padrão
                if col in ["Observacao", "Check"]:
                    df[col] = df[col].apply(lambda x: "" if str(x).strip() == "-" else x)

    else:
        df = pd.DataFrame(columns=[
            "ID_Cronologia", "Numero_Nota", "Status_Obra", "Conjunto", "Circuito",
            "Local_Instalacao", "Cidade", "Regional", "Planejado_DDPM",
            "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Status_Nota",
            "Prioridade_Nota", "Observacao", "Centro_Responsavel", "Check", "Status_Anterior"
        ])

    return df


def proximo_id_cronologia(df: pd.DataFrame) -> int:
    """Retorna o próximo ID_Cronologia disponível com base no DataFrame de notas."""
    if df.empty or "ID_Cronologia" not in df.columns or not df["ID_Cronologia"].notna().any():
        return 1
    return int(pd.to_numeric(df["ID_Cronologia"], errors="coerce").max()) + 1


def carregar_logs() -> pd.DataFrame:
    """Carrega todos os registros da tabela de log de alterações."""
    conn = get_db_connection()
    try:
        return pd.read_sql("SELECT * FROM log_alteracoes ORDER BY Data_Hora DESC", conn)
    except Exception:
        return pd.DataFrame(columns=["ID_Log", "Numero_Nota", "Usuario",
                                     "Data_Hora", "Campo_Alterado",
                                     "Valor_Antigo", "Valor_Novo"])
    finally:
        conn.close()


def status_para_int(val):
    if pd.isna(val) or str(val).strip() == "-":
        return None
    val_str = str(val).strip()

    # 1. BUSCA EXATA: Se o texto for exatamente o do Selectbox, retorna o ID na hora
    if val_str in INV_STATUS_MAP:
        return INV_STATUS_MAP[val_str]

    # 2. FALLBACK SEGURO: Caso venha de digitação manual ou logs parciais
    val_upper = val_str.upper()
    if "SUPR" in val_upper:
        return 998
    if "ENCE EXEC" in val_upper:
        return 999

    match = re.search(r'^(\d+)', val_upper)
    if match:
        return int(match.group(1))
    return 0


def salvar_em_massa(df: pd.DataFrame) -> None:
    realizar_backup()
    df_salvar = df.copy()

    df_salvar['Status_Nota'] = df_salvar['Status_Nota'].apply(status_para_int)

    if 'Status_Anterior' not in df_salvar.columns:
        df_salvar['Status_Anterior'] = "-"
    # Garante que a conversão seja aplicada em todos os casos
    df_salvar['Status_Anterior'] = df_salvar['Status_Anterior'].apply(status_para_int)

    if 'Check' not in df_salvar.columns:
        df_salvar['Check'] = "-"
    if 'Centro_Responsavel' not in df_salvar.columns:
        df_salvar['Centro_Responsavel'] = "-"

    # UPSERT: colunas para inserir ou atualizar
    colunas_upsert = [
        "ID_Cronologia",
        "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao",
        "Regional", "Planejado_DDPM", "Mes_Execucao_Planejado", "Data_Envio_Projeto",
        "Status_Nota", "Prioridade_Nota", "Observacao", "Check", "Status_Anterior",
        "Centro_Responsavel"
    ]

    # Garante que todas as colunas necessárias existam antes de criar os registros
    for col in colunas_upsert:
        if col not in df_salvar.columns:
            df_salvar[col] = "-"  # Valor padrão para colunas ausentes

    registros = df_salvar[colunas_upsert].to_records(index=False).tolist()

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        update_assignments = ',\n'.join([
            f'"{col}" = excluded."{col}"' for col in colunas_upsert if col != "Numero_Nota"
        ])

        sql_upsert = f'''
            INSERT INTO notas ({', '.join(f'"{c}"' for c in colunas_upsert)})
            VALUES ({', '.join(['?'] * len(colunas_upsert))})
            ON CONFLICT(Numero_Nota) DO UPDATE SET
                {update_assignments};
        '''

        cursor.executemany(sql_upsert, registros)
        conn.commit()
    except Exception as e:
        print(f"Erro no banco: {e}")
        raise e
    finally:
        conn.close()


def salvar_log_alteracoes(logs: list) -> None:
    """Salva uma lista de alterações no log do banco de dados.

    A lista ``logs`` deve ser uma lista de tuplas no formato:
    (Numero_Nota, Usuario, Data_Hora, Campo_Alterado, Valor_Antigo, Valor_Novo)
    """
    if not logs:
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.executemany('''
            INSERT INTO log_alteracoes (Numero_Nota, Usuario, Data_Hora, Campo_Alterado, Valor_Antigo, Valor_Novo)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', logs)
        conn.commit()
    except Exception as e:
        print(f"Erro ao salvar log de alterações: {e}")
    finally:
        conn.close()


def deletar_notas(lista_numeros_nota: list, usuario: str = "sistema") -> int:
    """Exclui notas do banco e registra a exclusão no log de auditoria.

    O log e o DELETE ocorrem na mesma transação.
    """
    realizar_backup()
    if not lista_numeros_nota:
        return 0

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        data_hora_log = datetime.datetime.now()
        logs_exclusao = [
            (int(nota), usuario, data_hora_log,
             "EXCLUSÃO DE NOTA", "Registro Existente", "Registro Apagado")
            for nota in lista_numeros_nota
        ]
        cursor.executemany('''
            INSERT INTO log_alteracoes (Numero_Nota, Usuario, Data_Hora, Campo_Alterado, Valor_Antigo, Valor_Novo)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', logs_exclusao)

        notas_para_deletar = [(int(nota),) for nota in lista_numeros_nota]
        cursor.executemany('DELETE FROM notas WHERE Numero_Nota = ?', notas_para_deletar)
        count = cursor.rowcount
        conn.commit()
        return count
    except Exception as e:
        print(f"Erro ao deletar notas do banco: {e}")
        raise e
    finally:
        conn.close()


def reverter_ultima_alteracao():
    """Desfaz a última alteração salva no banco com base na tabela de log.

    Identifica o último timestamp (Data_Hora) e reverte todas as ações daquela
    transação, removendo os logs revertidos para permitir "Ctrl+Z infinito".
    """
    realizar_backup()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT MAX(Data_Hora) FROM log_alteracoes")
        result = cursor.fetchone()
        if not result or not result[0]:
            return False, "O log de alterações está vazio. Não há o que desfazer."

        ultima_data_hora = result[0]

        cursor.execute(
            "SELECT ID_Log, Numero_Nota, Campo_Alterado, Valor_Antigo FROM log_alteracoes WHERE Data_Hora = ?",
            (ultima_data_hora,))
        logs = cursor.fetchall()

        if not logs:
            return False, "Nenhum detalhe encontrado para a última alteração."

        for id_log, numero_nota, campo, valor_antigo in logs:
            valor_para_banco = valor_antigo

            # Se o campo revertido for um Status, garante que volte como ID numérico
            if campo in ['Status_Nota', 'Status_Anterior']:
                valor_para_banco = status_para_int(valor_antigo)

            cursor.execute(f'UPDATE notas SET "{campo}" = ? WHERE Numero_Nota = ?', (valor_para_banco, numero_nota))

            # Remove o log revertido para permitir "Ctrl+Z infinito"
            cursor.execute("DELETE FROM log_alteracoes WHERE ID_Log = ?", (id_log,))

        conn.commit()

        data_formatada = str(ultima_data_hora)[:16]
        return True, f"Sucesso! {len(logs)} edição(ões) salva(s) em {data_formatada} foram desfeitas."
    except Exception as e:
        print(f"Erro ao reverter banco: {e}")
        return False, f"Erro interno: {e}"
    finally:
        conn.close()


def obter_data_ultima_alteracao():
    """Busca a data e hora exata da última modificação feita no banco."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT MAX(Data_Hora) FROM log_alteracoes")
        resultado = cursor.fetchone()
        return resultado[0] if resultado else None
    finally:
        conn.close()


def salvar_log_arquivo(nome_arquivo, usuario, data_hora, acao) -> None:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO log_arquivos (Nome_Arquivo, Usuario, Data_Hora, Acao)
            VALUES (?, ?, ?, ?)
        ''', (nome_arquivo, usuario, data_hora, acao))
        conn.commit()
    except Exception as e:
        print(f"Erro ao salvar log de arquivo: {e}")
    finally:
        conn.close()


def carregar_log_arquivos() -> pd.DataFrame:
    conn = get_db_connection()
    try:
        return pd.read_sql("SELECT * FROM log_arquivos ORDER BY Data_Hora DESC", conn)
    except Exception:
        return pd.DataFrame(columns=["ID_Log", "Nome_Arquivo", "Usuario",
                                     "Data_Hora", "Acao"])
    finally:
        conn.close()


# ==============================================================================
# EDIÇÃO COM DIFF (lógica server-side que substitui a UI do Streamlit)
# ==============================================================================
# Campos que o usuário pode editar pela UI (Input/app.py:540)
CAMPOS_EDITAVEIS = [
    "Status_Nota", "Prioridade_Nota", "Planejado_DDPM", "Observacao",
    "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao",
    "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Check",
]


def aplicar_edicoes(linhas: list, usuario: str) -> dict:
    """Aplica edições parciais: diff campo a campo, log e upsert.

    Cada item de ``linhas`` é um dict com Numero_Nota + os campos editados.
    A comparação usa a MESMA representação formatada de ``carregar_dados()``
    (status como texto, datas formatadas), que é o que a UI exibe e envia.
    """
    df_banco = carregar_dados()
    if df_banco.empty:
        raise ValueError("Banco vazio: nenhuma nota para editar.")
    df_banco = df_banco.set_index("Numero_Nota", drop=False)

    agora = datetime.datetime.now()
    logs, registros_alterados = [], []
    for linha in linhas:
        numero = int(linha["Numero_Nota"])
        if numero not in df_banco.index:
            raise ValueError(f"Nota {numero} não existe no banco.")
        original = df_banco.loc[numero]
        mudancas = {}
        for campo in CAMPOS_EDITAVEIS:
            if campo not in linha:
                continue
            novo = "" if linha[campo] is None else str(linha[campo]).strip()
            antigo = "" if pd.isna(original.get(campo)) else str(original.get(campo)).strip()
            if novo != antigo:
                mudancas[campo] = linha[campo]
                logs.append((numero, usuario, agora, campo, antigo, novo))
        if not mudancas:
            continue
        registro = original.to_dict()
        registro.update(mudancas)
        if "Status_Nota" in mudancas:
            registro["Status_Anterior"] = original["Status_Nota"]
        if "Local_Instalacao" in mudancas:
            registro["Regional"] = DE_PARA_REGIONAL.get(
                str(mudancas["Local_Instalacao"])[:3], "-")
        registros_alterados.append(registro)

    if registros_alterados:
        salvar_log_alteracoes(logs)
        salvar_em_massa(pd.DataFrame(registros_alterados))
    return {"alteradas": len(registros_alterados), "campos": len(logs)}
