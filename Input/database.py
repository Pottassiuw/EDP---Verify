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
from config import STATUS_MAP, INV_STATUS_MAP, DE_PARA_CIDADES

# Define o caminho onde as configurações vão morar na rede
CAMINHO_CONFIG_DINAMICA = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\config_responsaveis.json"
CAMINHO_PROJETO_CONSTRUCAO = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\config_projeto_construcao.json"

# --- PROTEÇÃO DO BANCO DE DADOS NO EXECUTÁVEL ---
def obter_caminho_banco():
    # Independentemente de onde o .exe estiver salvo (C: do usuário), 
    # ele SEMPRE vai buscar e salvar as notas no servidor da EDP!
    caminho_rede = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\notas_departamento.db"
    
    return caminho_rede

def get_db_connection():
    camin_db = obter_caminho_banco()
    conn = sqlite3.connect(camin_db, timeout=30, check_same_thread=False)
    conn.execute("PRAGMA synchronous = OFF;")      # Não espera a rede confirmar a escrita física
    conn.execute("PRAGMA journal_mode = MEMORY;")  # Cria o arquivo temporário na RAM, e não na rede
    conn.execute("PRAGMA temp_store = MEMORY;")    # Guarda tabelas temporárias na memória
    conn.execute("PRAGMA cache_size = -20000;")
    return conn

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
        
    conn.commit()
    conn.close()


def carregar_dados():
    conn = get_db_connection()
    df = pd.read_sql("SELECT * FROM notas ORDER BY ID_Cronologia ASC", conn)
    
    if 'Centro_Responsavel' in df.columns:
        df['Centro_Responsavel'] = df['Centro_Responsavel'].fillna('-')
    else:
        df['Centro_Responsavel'] = '-'
    
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
            except:
                try:
                    return pd.to_datetime(val_str).strftime('%d/%m/%Y')
                except:
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
            "ID_Cronologia", "Numero_Nota","Status_Obra", "Conjunto", "Circuito", 
            "Local_Instalacao", "Cidade", "Regional", "Planejado_DDPM", 
            "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Status_Nota", 
            "Prioridade_Nota", "Observacao", "Centro_Responsavel", "Check", "Status_Anterior"
        ])
    
    return df

def carregar_logs():
    """Carrega todos os registros da tabela de log de alterações."""
    conn = get_db_connection()
    try:
        return pd.read_sql("SELECT * FROM log_alteracoes ORDER BY Data_Hora DESC", conn)
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
    if "SUPR" in val_upper: return 998
    if "ENCE EXEC" in val_upper: return 999  # Corrigido de "ENCE" para "ENCE EXEC"
    
    match = re.search(r'^(\d+)', val_upper)
    if match: 
        return int(match.group(1))
    return 0


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

    # UPSERT: 15 colunas para inserir ou atualizar
    colunas_upsert = [
        "ID_Cronologia",
        "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", 
        "Regional", "Planejado_DDPM", "Mes_Execucao_Planejado", "Data_Envio_Projeto", 
        "Status_Nota", "Prioridade_Nota", "Observacao", "Check", "Status_Anterior",
        "Centro_Responsavel"
    ]
    
    # Garante que todas as colunas necessárias existam no DataFrame antes de criar os registros
    for col in colunas_upsert:
        if col not in df_salvar.columns:
            df_salvar[col] = "-" # Valor padrão para colunas ausentes

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
    Exclui notas do banco de dados com base em uma lista de 'Numero_Nota'.
    """
    realizar_backup()
    if not lista_numeros_nota:
        return 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # O executemany espera uma lista de tuplas
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
            
            # Se o campo revertido for um Status, precisamos garantir que volte como o ID numérico
            if campo in ['Status_Nota', 'Status_Anterior']:
                valor_para_banco = status_para_int(valor_antigo)
                
            cursor.execute(f'UPDATE notas SET "{campo}" = ? WHERE Numero_Nota = ?', (valor_para_banco, numero_nota))
            
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
    finally:
        conn.close()
