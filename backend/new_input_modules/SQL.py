# region Chapter 1. IMPORTS & CONFIGURATIONS
import pandas as pd
import sqlite3
import os
import re

print("🚀 INICIANDO CARGA DEFINITIVA DO BANCO DE DADOS...")

# Mapeamentos e Caminhos Principais
caminho_excel = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\Input Nota.xlsm"
caminho_excel_ramal = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\Input Nota Ramal.xlsx"
caminho_db = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\notas_departamento.db"

# Mapeamentos de Colunas para Notas Gerais
colunas_para_ler = [
    "NOTA", "Status da Obra", "Conjunto", "Circuito", "Local Instalação", 
    "Regional", "Planejado-DDPM", "Mês de Execução  Planejado - DDPM", 
    "Data Envio Projeto-DDPM", "Status Nota", "Prioridade Nota", 
    "Observação", "Check", "Status\nanterior", "CenTrab respon/"
]

de_para_colunas = {
    "NOTA": "Numero_Nota",
    "Status da Obra": "Status_Obra",
    "Conjunto": "Conjunto",
    "Circuito": "Circuito",
    "Local Instalação": "Local_Instalacao", 
    "Regional": "Regional",
    "Planejado-DDPM": "Planejado_DDPM",
    "Mês de Execução  Planejado - DDPM": "Mes_Execucao_Planejado",
    "Data Envio Projeto-DDPM": "Data_Envio_Projeto",
    "Status Nota": "Status_Nota",
    "Prioridade Nota": "Prioridade_Nota",
    "Observação": "Observacao",
    "Check": "Check",
    "Status\nanterior": "Status_Anterior",
    "CenTrab respon/": "Centro_Responsavel",
}

# Mapeamentos de Colunas para Notas de Ramal
colunas_para_ler_ramal = [
    "NOTA", "Status da Obra", "Conjunto", "Circuito", "Local Instalação", 
    "Planejado\nDDPM", "Mês de Execução\nPlanejado DDPM", 
    "CenTrab\nrespon/", "Prioridade\nNota", "Observação", 
    "Extração Antiga", "Status Nota", "Check Btzero", "Plano"
]

de_para_colunas_ramal = {
    "NOTA": "Numero_Nota",
    "Status da Obra": "Status_Obra",
    "Conjunto": "Conjunto",
    "Circuito": "Circuito",
    "Local Instalação": "Local_Instalacao",
    "Planejado\nDDPM": "Planejado_DDPM",
    "Mês de Execução\nPlanejado DDPM": "Mes_Execucao_Planejado",
    "CenTrab\nrespon/": "CenTrab_Respon",
    "Prioridade\nNota": "Prioridade_Nota",
    "Observação": "Observacao",
    "Extração Antiga": "Extracao_Antiga",
    "Status Nota": "Status_Nota",
    "Check Btzero": "Check_Btzero",
    "Plano": "Plano"
}
# endregion

# region Chapter 2. CLEANING FUNCTIONS
def normalizar_status(valor):
    if pd.isna(valor): return 0
    valor_str = str(valor).strip().upper()
    if "SUPR" in valor_str: return 998
    elif "ENCE EXEC" in valor_str: return 999
    elif "ENCE CANC" in valor_str: return 997
    match = re.search(r'^(\d+)', valor_str)
    if match: return int(match.group(1))
    return 0

def normalizar_status_anterior(valor):
    if pd.isna(valor) or str(valor).strip().lower() in ["nan", "none", "null", "", "-"]:
        return "-"
    valor_str = str(valor).strip().upper()
    if "SUPR" in valor_str: return "998"
    elif "ENCE EXEC" in valor_str: return "999"
    elif "ENCE CANC" in valor_str: return "997"
    match = re.search(r'^(\d+)', valor_str)
    if match: return str(int(match.group(1)))
    return "-"

def limpar_texto(valor):
    if pd.isna(valor) or str(valor).strip().lower() in ["nan", "none", "null", ""]:
        return "-"
    return str(valor).strip()
# endregion

# region Chapter 3. ETL PIPELINE
# 3.1. Processamento e Limpeza das Notas Gerais
print(f"📊 Lendo o Excel bruto Geral ({caminho_excel})...")
df = pd.read_excel(caminho_excel, usecols=colunas_para_ler)
df = df.rename(columns=de_para_colunas)

print("🧹 Limpando e formatando os dados Geral...")
df = df.dropna(subset=['Numero_Nota'])
df['Numero_Nota'] = df['Numero_Nota'].astype(int)

# --- RASTREADOR DE DUPLICADAS (GERAL) ---
duplicadas_geral = df[df.duplicated(subset=['Numero_Nota'], keep=False)].sort_values(by='Numero_Nota')

if not duplicadas_geral.empty:
    print(f"\n⚠️ ATENÇÃO: Encontradas {len(duplicadas_geral)} linhas com Número de Nota duplicado na base Geral!")
    print("Mostrando as primeiras ocorrências no terminal:")
    print(duplicadas_geral[['Numero_Nota', 'Status_Obra', 'Data_Envio_Projeto', 'Mes_Execucao_Planejado']].head(10).to_string(index=False))
    
    caminho_log_geral = os.path.join(os.path.dirname(caminho_db), "LOG_Duplicadas_Geral.xlsx")
    duplicadas_geral.to_excel(caminho_log_geral, index=False)
    print(f"📝 Planilha de auditoria gerada com sucesso em: {caminho_log_geral}\n")

# Mantém a última ocorrência inserida na planilha
df = df.drop_duplicates(subset=['Numero_Nota'], keep='last')
# ----------------------------------------

df.insert(0, 'ID_Cronologia', range(1, len(df) + 1))
# CORREÇÃO: Trata a vírgula do Excel antes de converter para número
df['Planejado_DDPM'] = pd.to_numeric(df['Planejado_DDPM'].astype(str).str.replace(',', '.'), errors='coerce').fillna(0.0)

df['Status_Nota'] = df['Status_Nota'].apply(normalizar_status)
df['Status_Anterior'] = df['Status_Anterior'].apply(normalizar_status_anterior)

colunas_texto = [
    "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", 
    "Regional", "Mes_Execucao_Planejado", 
    "Prioridade_Nota", "Centro_Responsavel"
]
for col in colunas_texto:
    df[col] = df[col].apply(limpar_texto)

# --- Tratamento Robusto de Data de Envio (SQL) ---
def limpar_data_envio_sql(val):
    if pd.isna(val): return "-"
    val_str = str(val).strip()
    if val_str.lower() in ['-', '', 'nan', 'none', 'nat', '<na>']: return '-'
    try:
        # Verifica se é número serial do Excel (ex: 43105)
        if val_str.replace('.', '').isdigit() and 30000 < float(val_str) < 60000:
            dt = pd.to_datetime('1899-12-30') + pd.to_timedelta(float(val_str), 'D')
            return dt.strftime('%Y-%m-%d')
        
        # Tenta converter string normal (DD/MM/YYYY)
        dt = pd.to_datetime(val_str, errors='coerce', dayfirst=True)
        if pd.notna(dt):
            return dt.strftime('%Y-%m-%d')
    except:
        pass
    return "-"

df['Data_Envio_Projeto'] = df['Data_Envio_Projeto'].apply(limpar_data_envio_sql)

df['Check'] = df['Check'].apply(lambda x: "" if pd.isna(x) or str(x).strip() in ["nan", "-"] else str(x).strip())
df['Observacao'] = df['Observacao'].apply(lambda x: "" if pd.isna(x) or str(x).strip() in ["nan", "-"] else str(x).strip())

# 3.2. Processamento e Limpeza das Notas de Ramal
print(f"📊 Lendo o Excel bruto de Ramal ({caminho_excel_ramal})...")
df_ramal = pd.read_excel(caminho_excel_ramal, sheet_name="Input de Notas", usecols=colunas_para_ler_ramal)
df_ramal = df_ramal.rename(columns=de_para_colunas_ramal)

print("🧹 Limpando e formatando os dados de Ramal...")
df_ramal = df_ramal.dropna(subset=['Numero_Nota'])
df_ramal['Numero_Nota'] = df_ramal['Numero_Nota'].astype(int)

# --- RASTREADOR DE DUPLICADAS (RAMAL) ---
duplicadas_ramal = df_ramal[df_ramal.duplicated(subset=['Numero_Nota'], keep=False)].sort_values(by='Numero_Nota')

if not duplicadas_ramal.empty:
    print(f"\n⚠️ ATENÇÃO: Encontradas {len(duplicadas_ramal)} linhas com Número de Nota duplicado na base Ramal!")
    
    caminho_log_ramal = os.path.join(os.path.dirname(caminho_db), "LOG_Duplicadas_Ramal.xlsx")
    duplicadas_ramal.to_excel(caminho_log_ramal, index=False)
    print(f"📝 Planilha de auditoria de ramal gerada em: {caminho_log_ramal}\n")

# Mantém a última ocorrência
df_ramal = df_ramal.drop_duplicates(subset=['Numero_Nota'], keep='last')
# ----------------------------------------

df_ramal.insert(0, 'ID_Cronologia', range(1, len(df_ramal) + 1))
# CORREÇÃO: Trata a vírgula do Excel antes de converter para número
df_ramal['Planejado_DDPM'] = pd.to_numeric(df_ramal['Planejado_DDPM'].astype(str).str.replace(',', '.'), errors='coerce').fillna(0.0)

df_ramal['Status_Anterior'] = "-"

colunas_texto_ramal = [
    "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", 
    "Mes_Execucao_Planejado", "CenTrab_Respon", "Prioridade_Nota", 
    "Extracao_Antiga", "Status_Nota", "Check_Btzero", "Plano", "Status_Anterior"
]
for col in colunas_texto_ramal:
    df_ramal[col] = df_ramal[col].apply(limpar_texto)

df_ramal['Observacao'] = df_ramal['Observacao'].apply(lambda x: "" if pd.isna(x) or str(x).strip() in ["nan", "-"] else str(x).strip())
# endregion

# region Chapter 4. DATABASE INJECTION
print(f"💾 Preparando injeção no SQLite ({caminho_db})...")

conn = sqlite3.connect(caminho_db)
cursor = conn.cursor()

# Recria as tabelas preservando outras tabelas de log
# --- PROTEÇÃO DOS VÍNCULOS DE NOTA MÃE ---
dict_vinculos = {}
try:
    cursor.execute("SELECT Numero_Nota, Nota_Mae FROM notas")
    for nota, mae in cursor.fetchall():
        if mae and mae != '-':
            dict_vinculos[nota] = mae
except sqlite3.OperationalError:
    pass

cursor.execute('DROP TABLE IF EXISTS notas')
cursor.execute('DROP TABLE IF EXISTS notas_ramal')

# Tabela Geral
cursor.execute('''
    CREATE TABLE notas(
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
        Status_Anterior TEXT,
        Nota_Mae TEXT DEFAULT '-'
    )
''')

# Tabela Ramal
cursor.execute('''
    CREATE TABLE notas_ramal(
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

# Injeta os dados da tabela Geral
colunas_banco = [
    "Numero_Nota", "ID_Cronologia", "Status_Obra", "Conjunto", "Circuito", 
    "Local_Instalacao", "Regional", "Planejado_DDPM", "Mes_Execucao_Planejado", 
    "Data_Envio_Projeto", "Centro_Responsavel", "Status_Nota", "Prioridade_Nota", 
    "Observacao", "Check", "Status_Anterior"
]
df = df[colunas_banco]
registros = df.to_records(index=False).tolist()

# Injeta os dados da tabela Ramal
colunas_banco_ramal = [
    "Numero_Nota", "ID_Cronologia", "Status_Obra", "Conjunto", "Circuito", 
    "Local_Instalacao", "Planejado_DDPM", "Mes_Execucao_Planejado", "CenTrab_Respon", 
    "Prioridade_Nota", "Observacao", "Extracao_Antiga", "Status_Nota", 
    "Status_Anterior", "Check_Btzero", "Plano"
]
df_ramal = df_ramal[colunas_banco_ramal]
registros_ramal = df_ramal.to_records(index=False).tolist()

try:
    # 1. Injeta Geral
    placeholders = ", ".join(["?"] * len(colunas_banco))
    cursor.executemany(f'''
        INSERT INTO notas ({", ".join(f'"{c}"' for c in colunas_banco)})
        VALUES ({placeholders})
    ''', registros)
    
    if dict_vinculos:
        registros_update_mae = [(mae, nota) for nota, mae in dict_vinculos.items()]
        cursor.executemany('''
            UPDATE notas SET Nota_Mae = ? WHERE Numero_Nota = ?
        ''', registros_update_mae)
    
    # 2. Injeta Ramal
    placeholders_ramal = ", ".join(["?"] * len(colunas_banco_ramal))
    cursor.executemany(f'''
        INSERT INTO notas_ramal ({", ".join(f'"{c}"' for c in colunas_banco_ramal)})
        VALUES ({placeholders_ramal})
    ''', registros_ramal)
    
    conn.commit()
    print(f"✅ SUCESSO! {len(df)} notas gerais e {len(df_ramal)} notas de ramal atualizadas.")
except Exception as e:
    print(f"❌ Falha crítica na injeção: {e}")
finally:
    conn.close()
    print("🔌 Conexão fechada. Banco de dados sincronizado!")
# endregion