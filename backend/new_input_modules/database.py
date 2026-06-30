# region Chapter 1. INITIALIZATION & SCHEMA
import sqlite3
import pandas as pd
import json
import os
import sys
import re
import shutil
import glob
import datetime
import threading
from config import STATUS_MAP, INV_STATUS_MAP, DE_PARA_CIDADES, CAMINHO_DB

# Define o caminho onde as configurações vão morar na rede
CAMINHO_CONFIG_DINAMICA = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\config_responsaveis.json"
CAMINHO_PROJETO_CONSTRUCAO = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\config_projeto_construcao.json"

# --- PROTEÇÃO DO BANCO DE DADOS NO EXECUTÁVEL ---
def obter_caminho_banco():
    return CAMINHO_DB

class SingletonConnection(sqlite3.Connection):
    def close(self):
        # Ignore close to keep singleton connection open
        pass

_db_connection = None
_db_lock = threading.Lock()

def get_db_connection():
    """Retorna uma conexão única com timeout estendido para evitar travamentos."""
    global _db_connection
    with _db_lock:
        if _db_connection is None:
            camin_db = obter_caminho_banco()
            _db_connection = sqlite3.connect(camin_db, timeout=30, check_same_thread=False, factory=SingletonConnection)
            _db_connection.execute("PRAGMA synchronous = OFF;")      # Não espera a rede confirmar a escrita física
            _db_connection.execute("PRAGMA journal_mode = MEMORY;")  # Cria o arquivo temporário na RAM, e não na rede
            _db_connection.execute("PRAGMA temp_store = MEMORY;")    # Guarda tabelas temporárias na memória
            _db_connection.execute("PRAGMA cache_size = -20000;")
        return _db_connection

def realizar_backup(limite=20, intervalo_horas=2):
    """
    Cria um backup do banco de dados na subpasta 'backups'.
    Executa em uma thread separada (segundo plano) para não travar a tela de salvamento.
    """
    tarefa_bkp = threading.Thread(target=_realizar_backup_interno, args=(limite, intervalo_horas), daemon=True)
    tarefa_bkp.start()

def _realizar_backup_interno(limite, intervalo_horas):
    """
    Lógica interna do backup rotativo.
    Só cria um novo se o último tiver sido feito há mais de 'intervalo_horas'.
    Mantém no máximo 'limite' arquivos de backup antigos (rotativo).
    """
    caminho_db = obter_caminho_banco()
    if not os.path.exists(caminho_db):
        return

    diretorio_db = os.path.dirname(caminho_db)
    diretorio_backup = os.path.join(diretorio_db, "backups")
    
    if not os.path.exists(diretorio_backup):
        try:
            os.makedirs(diretorio_backup)
        except Exception:
            pass

    backups_existentes = glob.glob(os.path.join(diretorio_backup, "notas_departamento_*.db"))
    backups_existentes.sort(key=os.path.getmtime)
    
    if backups_existentes:
        ultimo_backup = backups_existentes[-1]
        tempo_ultimo = datetime.datetime.fromtimestamp(os.path.getmtime(ultimo_backup))
        if (datetime.datetime.now() - tempo_ultimo).total_seconds() < (intervalo_horas * 3600):
            return  # Já existe um backup recente, não cria duplicatas atoa
            
    data_hora_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_backup = f"notas_departamento_{data_hora_str}.db"
    caminho_backup = os.path.join(diretorio_backup, nome_backup)
    
    try:
        shutil.copy2(caminho_db, caminho_backup)
        backups_existentes.append(caminho_backup)
        while len(backups_existentes) > limite:
            backup_antigo = backups_existentes.pop(0)
            if os.path.exists(backup_antigo):
                os.remove(backup_antigo)
    except Exception as e:
        print(f"Erro ao realizar backup: {e}")

# ==============================================================================
# CONFIGURAÇÕES DINÂMICAS (JSON NA REDE)
# ==============================================================================
DE_PARA_PADRAO = {
    "Poa": "Danilo", "Suzano": "Danilo", "São José dos Campos": "James",
    "Guaratinguetá": "Danilo", "Litoral Norte": "Danilo", "Guarulhos": "James",
    "Mogi das Cruzes": "Fabricio"
}

# endregion

# region Chapter 2. METADATA & SUPPORT TABLES
def carregar_responsaveis():
    if os.path.exists(CAMINHO_CONFIG_DINAMICA):
        with open(CAMINHO_CONFIG_DINAMICA, 'r', encoding='utf-8') as f:
            return json.load(f)
    else:
        salvar_responsaveis(DE_PARA_PADRAO)
        return DE_PARA_PADRAO

def salvar_responsaveis(dicionario_novo):
    with open(CAMINHO_CONFIG_DINAMICA, 'w', encoding='utf-8') as f:
        json.dump(dicionario_novo, f, ensure_ascii=False, indent=4)


MAP_PROJETO_CONSTRUCAO_PADRAO = {
    "ALEX SANFORD PETRASOLI": "SIM", "ALTOS DA VILA PAIVA": "-", "APARECIDA": "-",
    "ARARETAMA": "-", "BARREIRO": "-", "BOISSUCANGA": "SIM", "BONSUCESSO": "-",
    "BRAS CUBAS": "-", "CACAPAVA": "-", "CACHOEIRA PAULISTA": "-", "CARAGUATATUBA": "-",
    "CESAR DE SOUZA": "-", "COLORADO": "-", "CRUZEIRO": "-", "DONA BENTA": "SIM",
    "DUTRA": "-", "FERRAZ": "SIM", "GOPOUVA": "-", "GUARAREMA": "SIM", "GUARATINGUETÁ": "-",
    "GUARULHOS": "-", "IPORANGA": "-", "ITAQUAQUECETUBA": "-", "JACAREI": "-",
    "JOAO NOVAES": "-", "JOSE CENTRO": "-", "KIDA MACEDO": "-", "LORENA": "-",
    "MANTIQUEIRA": "-", "MASSAGUACU": "-", "MOGI CIDADE": "-", "PARQUE INDUSTRIAL": "-",
    "PARQUE TECNOLÓGICO": "-", "PEDREIRA": "-", "PIMENTAS": "-", "PINDAMONHANGABA": "-",
    "POA": "SIM", "ROSEIRA": "-", "SANTA LUZIA": "-", "SANTA PAULA": "-",
    "SAO JOSE DOS CAMPOS": "-", "SAO LUIS": "-", "SATÉLITE": "SIM", "SUZANO": "-",
    "TAUBATÉ": "-", "URBANOVA": "-", "VALE DO SOL": "-", "VALTER JOSE DOS SANTOS": "-",
    "VILA GALVAO": "-", "VILA HERMINIA": "-"
}

def carregar_projeto_construcao():
    if os.path.exists(CAMINHO_PROJETO_CONSTRUCAO):
        with open(CAMINHO_PROJETO_CONSTRUCAO, 'r', encoding='utf-8') as f:
            return json.load(f)
    else:
        salvar_projeto_construcao(MAP_PROJETO_CONSTRUCAO_PADRAO)
        return MAP_PROJETO_CONSTRUCAO_PADRAO

def salvar_projeto_construcao(dicionario_novo):
    with open(CAMINHO_PROJETO_CONSTRUCAO, 'w', encoding='utf-8') as f:
        json.dump(dicionario_novo, f, ensure_ascii=False, indent=4)


# ==============================================================================
# MOTOR DO BANCO DE DADOS (SQLITE)
# ==============================================================================
def inicializar_banco():
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
        CREATE TABLE IF NOT EXISTS notas_ramal (
            Numero_Nota INTEGER PRIMARY KEY,
            ID_Cronologia INTEGER,
            Status_Obra TEXT,
            Conjunto TEXT,
            Circuito TEXT,
            Local_Instalacao TEXT,
            Planejado_DDPM REAL,
            Mes_Execucao_Planejado TEXT,
            CenTrab_Respon TEXT,
            Prioridade_Nota TEXT,
            Observacao TEXT,
            Extracao_Antiga TEXT,
            Status_Nota TEXT,
            Status_Anterior TEXT,
            Check_Btzero TEXT,
            Plano TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bloqueios (
            Numero_Nota INTEGER PRIMARY KEY,
            Usuario TEXT,
            Data_Hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        
    # --- CRIAÇÃO DE ÍNDICES PARA OTIMIZAR AUDITORIA & LOGS ---
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_alteracoes_nota ON log_alteracoes(Numero_Nota)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_alteracoes_data ON log_alteracoes(Data_Hora DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_arquivos_data ON log_arquivos(Data_Hora DESC)')
        
    conn.commit()
    conn.close()


# endregion

# region Chapter 3. CRUD OPERATIONS (GENERAL NOTES)
def carregar_dados(ano=None):
    conn = get_db_connection()
    if ano:
        query = "SELECT * FROM notas WHERE Mes_Execucao_Planejado LIKE ? ORDER BY ID_Cronologia ASC"
        df = pd.read_sql(query, conn, params=(f"%{ano}%",))
    else:
        df = pd.read_sql("SELECT * FROM notas ORDER BY ID_Cronologia ASC", conn)
    
    if 'Centro_Responsavel' in df.columns:
        df['Centro_Responsavel'] = df['Centro_Responsavel'].fillna('-')
    else:
        df['Centro_Responsavel'] = '-'
    
    if 'Nota_Mae' not in df.columns:
        df['Nota_Mae'] = '-'
    else:
        df['Nota_Mae'] = df['Nota_Mae'].fillna('-')
        
    conn.close()
    
    if not df.empty:
        df['Status_Nota'] = df['Status_Nota'].map(STATUS_MAP)
        
        meses_pt = {
            1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr',
            5: 'maio', 6: 'jun', 7: 'jul', 8: 'ago',
            9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
        }
        dt_mes = pd.to_datetime(df['Mes_Execucao_Planejado'], errors='coerce', format='mixed')
        mes_ano_formatado = dt_mes.dt.month.map(meses_pt) + '-' + dt_mes.dt.year.fillna(0).astype(int).astype(str)
        df['Mes_Execucao_Planejado'] = mes_ano_formatado.where(dt_mes.notna(), df['Mes_Execucao_Planejado'])
        
        def formatar_data_envio(val):
            if pd.isna(val) or str(val).strip().lower() in ["none", "nan", "-", "", "<na>"]:
                return "-"
            val_str = str(val).strip()
            dt = pd.to_datetime(val_str, dayfirst=True, errors='coerce')
            if pd.notna(dt):
                return dt.strftime('%d/%m/%Y')
            return val_str
                    
        df['Data_Envio_Projeto'] = df['Data_Envio_Projeto'].apply(formatar_data_envio)

        # Coluna Cidades
        df['Codigo_Busca'] = df['Local_Instalacao'].astype(str).str[:3]
        df['Cidade'] = df['Codigo_Busca'].map(DE_PARA_CIDADES)
        df = df.drop(columns=['Codigo_Busca'])
        
        # Limpeza de valores Nulos e texto "None"
        colunas_forcar_texto = [
            "Observacao", "Check", "Status_Obra", "Conjunto", "Circuito", 
            "Local_Instalacao", "Regional", "Centro_Responsavel", "Prioridade_Nota", "Nota_Mae"
        ]
        
        for col in df.columns:
            if df[col].dtype == object or col in colunas_forcar_texto:
                # Força a conversão para string para lidar com colunas que vieram como numéricas (NaN)
                df[col] = df[col].fillna("").astype(str)
                df[col] = df[col].apply(lambda x: "" if str(x).strip().lower() in ["none", "nan", "null", "<na>"] else x)
                
                # Garante que a Observação e o Check também não fiquem com o traço "-" padrão
                if col in ["Observacao", "Check"]:
                    df[col] = df[col].apply(lambda x: "" if str(x).strip() == "-" else x)
                    
        # Normalização de acentuação para prioridades comuns vindas do banco
        if 'Prioridade_Nota' in df.columns:
            df['Prioridade_Nota'] = df['Prioridade_Nota'].astype(str).str.strip()
            df['Prioridade_Nota'] = df['Prioridade_Nota'].replace({
                'Programavel': 'Programável', 'programavel': 'Programável', 'PROGRAMAVEL': 'Programável',
                'Prioritario': 'Prioritário', 'prioritario': 'Prioritário', 'PRIORITARIO': 'Prioritário'
            })
        
    else:
        df = pd.DataFrame(columns=[
            "ID_Cronologia", "Numero_Nota","Status_Obra", "Conjunto", "Circuito", 
            "Local_Instalacao", "Cidade", "Regional", "Planejado_DDPM", 
            "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Status_Nota", 
            "Prioridade_Nota", "Observacao", "Centro_Responsavel", "Check", "Status_Anterior", "Nota_Mae"
        ])
    
    return df

def carregar_logs(limite=2000, numero_nota=None):
    """
    Carrega os registros do log. 
    Usa um limite de linhas para não estourar a memória do painel.
    """
    conn = get_db_connection()
    try:
        if numero_nota:
            # Se o usuário quer investigar uma nota, puxa todo o histórico só dela
            query = f"SELECT * FROM log_alteracoes WHERE Numero_Nota = {int(numero_nota)} ORDER BY Data_Hora DESC"
        else:
            # Se for a visão geral, puxa apenas as últimas 2000 alterações
            query = f"SELECT * FROM log_alteracoes ORDER BY Data_Hora DESC LIMIT {limite}"
            
        return pd.read_sql(query, conn)
    except Exception:
        return pd.DataFrame(columns=["ID_Log", "Numero_Nota", "Usuario", "Data_Hora", "Campo_Alterado", "Valor_Antigo", "Valor_Novo"])
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
    if "SUPR CANC" in val_upper or "ENCE CANC" in val_upper: return 997
    if "SUPR" in val_upper: return 998
    if "ENCE EXEC" in val_upper: return 999
    
    match = re.search(r'^(\d+)', val_upper)
    if match: 
        return int(match.group(1))
    return 0


def converter_para_iso_data(val):
    if pd.isna(val) or str(val).strip() in ["", "-", "nan", "None"]:
        return "-"
    val_str = str(val).strip().lower()
    
    try:
        dt = pd.to_datetime(val_str, errors='coerce', format='mixed')
        if pd.notna(dt):
            return dt.strftime('%Y-%m-%d')
    except:
        pass
        
    meses_pt_rev = {
        'jan': 1, 'janeiro': 1,
        'fev': 2, 'fevereiro': 2,
        'mar': 3, 'março': 3, 'marco': 3,
        'abr': 4, 'abril': 4,
        'mai': 5, 'maio': 5,
        'jun': 6, 'junho': 6,
        'jul': 7, 'julho': 7,
        'ago': 8, 'agosto': 8,
        'set': 9, 'setembro': 9,
        'out': 10, 'outubro': 10,
        'nov': 11, 'novembro': 11,
        'dez': 12, 'dezembro': 12
    }
    
    parts = re.split(r'[-/\s]+', val_str)
    if len(parts) == 2:
        part_month, part_year = parts[0], parts[1]
        month = None
        if part_month.isdigit():
            m_val = int(part_month)
            if 1 <= m_val <= 12:
                month = m_val
        else:
            month = meses_pt_rev.get(part_month)
            
        year = None
        if part_year.isdigit():
            y_val = int(part_year)
            if len(part_year) == 2:
                year = 2000 + y_val
            elif len(part_year) == 4:
                year = y_val
                
        if month and year:
            return f"{year:04d}-{month:02d}-01"
            
    elif len(parts) == 1:
        part_month = parts[0]
        month = meses_pt_rev.get(part_month)
        if month:
            import datetime
            year = datetime.datetime.now().year
            return f"{year:04d}-{month:02d}-01"
            
    return val_str


def salvar_em_massa(df):
    realizar_backup()
    df_salvar = df.copy()
    
    df_salvar['Status_Nota'] = df_salvar['Status_Nota'].apply(status_para_int)
    
    if 'Status_Anterior' not in df_salvar.columns: 
        df_salvar['Status_Anterior'] = "-"
    # Garante que a conversão seja aplicada em todos os casos
    df_salvar['Status_Anterior'] = df_salvar['Status_Anterior'].apply(status_para_int)
        
    if 'Check' not in df_salvar.columns: df_salvar['Check'] = "-"
    if 'Centro_Responsavel' not in df_salvar.columns: df_salvar['Centro_Responsavel'] = "-"

    # UPSERT: colunas para inserir ou atualizar
    colunas_upsert = [
        "ID_Cronologia",
        "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", 
        "Regional", "Planejado_DDPM", "Mes_Execucao_Planejado", "Data_Envio_Projeto", 
        "Status_Nota", "Prioridade_Nota", "Observacao", "Check", "Status_Anterior",
        "Centro_Responsavel", "Nota_Mae"
    ]
    
    # Garante que todas as colunas necessárias existam no DataFrame antes de criar os registros
    for col in colunas_upsert:
        if col not in df_salvar.columns:
            df_salvar[col] = "-" # Valor padrão para colunas ausentes

    if 'Mes_Execucao_Planejado' in df_salvar.columns:
        df_salvar['Mes_Execucao_Planejado'] = df_salvar['Mes_Execucao_Planejado'].apply(converter_para_iso_data)

    registros = df_salvar[colunas_upsert].to_records(index=False).tolist()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # A sintaxe UPSERT (INSERT ... ON CONFLICT) é mais eficiente que fazer um UPDATE e depois um INSERT IGNORE.
        # Ela realiza a operação em uma única passagem no banco de dados, reduzindo a comunicação pela rede.
        # Requer SQLite 3.24.0+ (Python 3.7+ já vem com uma versão compatível).
        
        # Monta a lista de colunas para o SET do UPDATE, excluindo a chave primária
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


def salvar_log_alteracoes(logs):
    """
    Salva uma lista de alterações no log do banco de dados.
    A lista 'logs' deve ser uma lista de tuplas no formato:
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


def deletar_notas(lista_numeros_nota):
    """
    Exclui notas do banco de dados e registra a ação no log de auditoria.
    """
    realizar_backup()
    if not lista_numeros_nota:
        return 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # 1. GERA O LOG DE EXCLUSÃO ANTES DE APAGAR A NOTA
        try:
            usuario_logado = os.getlogin()
        except:
            usuario_logado = 'Desconhecido'
            
        data_hora_log = datetime.datetime.now()
        logs_exclusao = []
        
        for nota in lista_numeros_nota:
            logs_exclusao.append((
                int(nota), usuario_logado, data_hora_log,
                "EXCLUSÃO DE NOTA", "Registro Existente", "Registro Apagado"
            ))
            
        # Injeta o log da "morte" da nota
        cursor.executemany('''
            INSERT INTO log_alteracoes (Numero_Nota, Usuario, Data_Hora, Campo_Alterado, Valor_Antigo, Valor_Novo)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', logs_exclusao)

        # 2. DELETA FISICAMENTE A NOTA DO BANCO
        notas_para_deletar = [(int(nota),) for nota in lista_numeros_nota]
        cursor.executemany('''
            DELETE FROM notas WHERE Numero_Nota = ?
        ''', notas_para_deletar)
        
        count = cursor.rowcount
        conn.commit()
        return count
    except Exception as e:
        print(f"Erro ao deletar notas do banco: {e}")
        raise e
    finally:
        conn.close()


# endregion

# region Chapter 4. REVERSION & LOGS UTILITIES
def reverter_ultima_alteracao():
    """
    Desfaz a última alteração salva no banco de dados com base na tabela de log.
    Identifica o último timestamp (Data_Hora) e reverte todas as ações daquela transação.
    """
    realizar_backup()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Busca o timestamp exato da última edição
        cursor.execute("SELECT MAX(Data_Hora) FROM log_alteracoes")
        result = cursor.fetchone()
        if not result or not result[0]:
            return False, "O log de alterações está vazio. Não há o que desfazer."
        
        ultima_data_hora = result[0]
        
        # Puxa todas as modificações que ocorreram neste exato segundo (mesmo lote)
        cursor.execute("SELECT ID_Log, Numero_Nota, Campo_Alterado, Valor_Antigo FROM log_alteracoes WHERE Data_Hora = ?", (ultima_data_hora,))
        logs = cursor.fetchall()
        
        if not logs:
            return False, "Nenhum detalhe encontrado para a última alteração."
        
        for id_log, numero_nota, campo, valor_antigo in logs:
            valor_para_banco = valor_antigo
            
            # Verificar em qual tabela a nota reside para fazer a reversão correta
            cursor.execute('SELECT 1 FROM notas WHERE Numero_Nota = ?', (numero_nota,))
            if cursor.fetchone():
                if campo in ['Status_Nota', 'Status_Anterior']:
                    valor_para_banco = status_para_int(valor_antigo)
                cursor.execute(f'UPDATE notas SET "{campo}" = ? WHERE Numero_Nota = ?', (valor_para_banco, numero_nota))
            else:
                cursor.execute(f'UPDATE notas_ramal SET "{campo}" = ? WHERE Numero_Nota = ?', (valor_para_banco, numero_nota))
            
            # Remove o log que foi revertido para permitir "Ctrl+Z infinito" voltando no tempo
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
    """
    Busca a data e hora exata da última modificação feita no banco.
    Utilizado para notificar usuários sobre atualizações de terceiros.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT MAX(Data_Hora) FROM log_alteracoes")
        resultado = cursor.fetchone()
        return resultado[0] if resultado else None
    except Exception as e:
        print(f"Erro ao obter data da última alteração: {e}")
        return None
    finally:
        conn.close()

def obter_usuario_ultima_alteracao(timestamp):
    """
    Busca o usuário responsável pela alteração ocorrida em determinado timestamp.
    """
    if not timestamp:
        return "Desconhecido"
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT Usuario FROM log_alteracoes WHERE Data_Hora = ? LIMIT 1", (timestamp,))
        resultado = cursor.fetchone()
        return resultado[0] if resultado else "Desconhecido"
    except Exception as e:
        print(f"Erro ao obter usuário da última alteração: {e}")
        return "Desconhecido"
    finally:
        conn.close()

def salvar_log_arquivo(nome_arquivo, usuario, data_hora, acao):
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

def carregar_log_arquivos():
    conn = get_db_connection()
    try:
        return pd.read_sql("SELECT * FROM log_arquivos ORDER BY Data_Hora DESC", conn)
    except Exception:
        return pd.DataFrame(columns=["ID_Log", "Nome_Arquivo", "Usuario", "Data_Hora", "Acao"])
    finally:
        conn.close()


# ==============================================================================
# OPERAÇÕES DE RAMAL (notas_ramal)
# ==============================================================================

# endregion

# region Chapter 5. CRUD OPERATIONS (RAMAL NOTES)
def carregar_dados_ramal():
    conn = get_db_connection()
    df = pd.read_sql("SELECT * FROM notas_ramal ORDER BY ID_Cronologia ASC", conn)
    conn.close()
    
    if not df.empty:
        # Mes_Execucao_Planejado formatting
        meses_pt = {
            1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr',
            5: 'maio', 6: 'jun', 7: 'jul', 8: 'ago',
            9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
        }
        dt_mes = pd.to_datetime(df['Mes_Execucao_Planejado'], errors='coerce', format='mixed')
        mes_ano_formatado = dt_mes.dt.month.map(meses_pt) + '-' + dt_mes.dt.year.fillna(0).astype(int).astype(str)
        df['Mes_Execucao_Planejado'] = mes_ano_formatado.where(dt_mes.notna(), df['Mes_Execucao_Planejado'])
        
        # Colunas cidades e regional
        df['Codigo_Busca'] = df['Local_Instalacao'].astype(str).str[:3]
        df['Cidade'] = df['Codigo_Busca'].map(DE_PARA_CIDADES)
        df = df.drop(columns=['Codigo_Busca'])
        
        # Limpeza de valores Nulos e texto "None"
        colunas_forcar_texto = [
            "Observacao", "Check_Btzero", "Status_Obra", "Conjunto", "Circuito", 
            "Local_Instalacao", "CenTrab_Respon", "Prioridade_Nota", "Extracao_Antiga", "Plano"
        ]
        
        for col in df.columns:
            if df[col].dtype == object or col in colunas_forcar_texto:
                df[col] = df[col].fillna("").astype(str)
                df[col] = df[col].apply(lambda x: "" if str(x).strip().lower() in ["none", "nan", "null", "<na>"] else x)
                if col == "Observacao":
                    df[col] = df[col].apply(lambda x: "" if str(x).strip() == "-" else x)
    else:
        df = pd.DataFrame(columns=[
            "ID_Cronologia", "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", 
            "Local_Instalacao", "Cidade", "Regional", "Planejado_DDPM", 
            "Mes_Execucao_Planejado", "CenTrab_Respon", "Prioridade_Nota", 
            "Observacao", "Extracao_Antiga", "Status_Nota", "Status_Anterior", "Check_Btzero", "Plano"
        ])
    return df


def salvar_em_massa_ramal(df):
    realizar_backup()
    df_salvar = df.copy()
    
    colunas_upsert = [
        "ID_Cronologia", "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", 
        "Planejado_DDPM", "Mes_Execucao_Planejado", "CenTrab_Respon", "Prioridade_Nota", 
        "Observacao", "Extracao_Antiga", "Status_Nota", "Status_Anterior", "Check_Btzero", "Plano"
    ]
    
    for col in colunas_upsert:
        if col not in df_salvar.columns:
            df_salvar[col] = "-"
            
    df_salvar['Planejado_DDPM'] = pd.to_numeric(df_salvar['Planejado_DDPM'], errors='coerce').fillna(0.0)
    
    if 'Mes_Execucao_Planejado' in df_salvar.columns:
        df_salvar['Mes_Execucao_Planejado'] = df_salvar['Mes_Execucao_Planejado'].apply(converter_para_iso_data)
        
    # Conversões e limpezas para o banco
    registros = df_salvar[colunas_upsert].to_records(index=False).tolist()
    
    update_assignments = ',\n'.join([
        f'"{col}" = excluded."{col}"' for col in colunas_upsert if col != "Numero_Nota"
    ])
    
    sql_upsert = f'''
        INSERT INTO notas_ramal ({', '.join(f'"{c}"' for c in colunas_upsert)})
        VALUES ({', '.join(['?'] * len(colunas_upsert))})
        ON CONFLICT(Numero_Nota) DO UPDATE SET
            {update_assignments};
    '''
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.executemany(sql_upsert, registros)
        conn.commit()
    except Exception as e:
        print(f"Erro no banco (ramal): {e}")
        raise e
    finally:
        conn.close()


def deletar_notas_ramal(lista_numeros_nota):
    realizar_backup()
    if not lista_numeros_nota:
        return 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        try:
            usuario_logado = os.getlogin()
        except:
            usuario_logado = 'Desconhecido'
            
        data_hora_log = datetime.datetime.now()
        logs_exclusao = []
        
        for nota in lista_numeros_nota:
            logs_exclusao.append((
                int(nota), usuario_logado, data_hora_log,
                "EXCLUSÃO DE NOTA RAMAL", "Registro Existente", "Registro Apagado"
            ))
            
        cursor.executemany('''
            INSERT INTO log_alteracoes (Numero_Nota, Usuario, Data_Hora, Campo_Alterado, Valor_Antigo, Valor_Novo)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', logs_exclusao)

        notas_para_deletar = [(int(nota),) for nota in lista_numeros_nota]
        cursor.executemany('''
            DELETE FROM notas_ramal WHERE Numero_Nota = ?
        ''', notas_para_deletar)
        
        count = cursor.rowcount
        conn.commit()
        return count
    except Exception as e:
        print(f"Erro ao deletar notas do banco (ramal): {e}")
        raise e
    finally:
        conn.close()


def vincular_notas_hierarquia_lote(dados_lote):
    """
    Processa múltiplos vínculos de uma só vez dentro de uma ÚNICA transação SQLite.
    dados_lote: dicionário no formato {nota_mae: [lista_de_filhas]}
    """
    if not dados_lote:
        return 0
        
    realizar_backup()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    total_atualizado = 0
    try:
        # Força o início de uma transação exclusiva
        cursor.execute("BEGIN TRANSACTION")
        
        try:
            import os
            usuario_logado = os.getlogin()
        except:
            usuario_logado = 'Desconhecido'
            
        import datetime
        data_hora_log = datetime.datetime.now()
        
        # Garante a existência da coluna
        try:
            cursor.execute("ALTER TABLE notas ADD COLUMN Nota_Mae TEXT DEFAULT '-'")
        except sqlite3.OperationalError:
            pass
            
        logs_vinculo = []
        notas_para_atualizar = []
        
        for nota_mae, lista_filhas in dados_lote.items():
            for nota_filha in lista_filhas:
                nota_filha_int = int(nota_filha)
                
                # Busca valor antigo para o log
                cursor.execute("SELECT Nota_Mae FROM notas WHERE Numero_Nota = ?", (nota_filha_int,))
                resultado = cursor.fetchone()
                valor_antigo = resultado[0] if resultado and resultado[0] else "-"
                
                logs_vinculo.append((
                    nota_filha_int, usuario_logado, data_hora_log,
                    "VÍNCULO LOTE MÃE", str(valor_antigo), str(nota_mae)
                ))
                notas_para_atualizar.append((str(nota_mae), nota_filha_int))
        
        if logs_vinculo:
            cursor.executemany('''
                INSERT INTO log_alteracoes (Numero_Nota, Usuario, Data_Hora, Campo_Alterado, Valor_Antigo, Valor_Novo)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', logs_vinculo)

            cursor.executemany('''
                UPDATE notas SET Nota_Mae = ? WHERE Numero_Nota = ?
            ''', notas_para_atualizar)
            
            total_atualizado = cursor.rowcount
            if total_atualizado <= 0:
                total_atualizado = len(notas_para_atualizar)
            
        conn.commit() # Gravação única no disco
        return total_atualizado
        
    except Exception as e:
        conn.rollback() # Cancela tudo se der erro, protegendo o banco
        print(f"Erro no processamento em lote: {e}")
        raise e
    finally:
        conn.close()


def vincular_notas_hierarquia(nota_mae, lista_notas_filhas):
    """
    Vincula uma ou mais notas filhas a uma nota mãe principal.
    Gera logs individuais de alteração para cada nota filha atualizada.
    """
    return vincular_notas_hierarquia_lote({nota_mae: lista_notas_filhas})
# endregion
