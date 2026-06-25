import pandas as pd
import sqlite3
import os
import re

print("🚀 INICIANDO CARGA DEFINITIVA DO BANCO DE DADOS...")

# ==============================================================================
# 1. MAPEAMENTO E CONFIGURAÇÕES
# ==============================================================================
caminho_excel = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\Input Nota.xlsm"
caminho_db = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\notas_departamento.db"

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
    "CenTrab respon/": "Centro_Responsavel"
}

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
    if match: return str(int(match.group(1))) # Remove zeros à esquerda e retorna texto
    return "-"

def limpar_texto(valor):
    if pd.isna(valor) or str(valor).strip().lower() in ["nan", "none", "null", ""]:
        return "-"
    return str(valor).strip()

# ==============================================================================
# 2. EXTRAÇÃO E TRANSFORMAÇÃO (ETL)
# ==============================================================================
print(f"📊 Lendo o Excel bruto ({caminho_excel})...")
df = pd.read_excel(caminho_excel, usecols=colunas_para_ler)
df = df.rename(columns=de_para_colunas)

print("🧹 Limpando e formatando os dados...")
df = df.dropna(subset=['Numero_Nota'])
df['Numero_Nota'] = df['Numero_Nota'].astype(int)
df = df.drop_duplicates(subset=['Numero_Nota'], keep='first')

df.insert(0, 'ID_Cronologia', range(1, len(df) + 1))
df['Planejado_DDPM'] = pd.to_numeric(df['Planejado_DDPM'], errors='coerce').fillna(0.0)
df['Status_Nota'] = df['Status_Nota'].apply(normalizar_status)
df['Status_Anterior'] = df['Status_Anterior'].apply(normalizar_status_anterior)

colunas_texto = [
    "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", 
    "Regional", "Mes_Execucao_Planejado", "Data_Envio_Projeto", 
    "Prioridade_Nota", "Centro_Responsavel"
]
for col in colunas_texto:
    df[col] = df[col].apply(limpar_texto)

df['Check'] = df['Check'].apply(lambda x: "" if pd.isna(x) or str(x).strip() in ["nan", "-"] else str(x).strip())
df['Observacao'] = df['Observacao'].apply(lambda x: "" if pd.isna(x) or str(x).strip() in ["nan", "-"] else str(x).strip())

# ==============================================================================
# 3. CRIAÇÃO E INJEÇÃO NO BANCO DE DADOS (COM PROTEÇÃO DE LOGS)
# ==============================================================================
print(f"💾 Preparando injeção no SQLite ({caminho_db})...")

# Conecta ao banco (Se não existir, ele cria)
conn = sqlite3.connect(caminho_db)
cursor = conn.cursor()

# O SEGREDO: Em vez de deletar o arquivo, destruímos apenas a tabela de notas,
# deixando as tabelas 'log_alteracoes' e 'log_arquivos' intactas!
cursor.execute('DROP TABLE IF EXISTS notas')

# Recria a tabela de notas rigorosamente formatada
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
        Status_Anterior TEXT
    )
''')

colunas_banco = [
    "Numero_Nota", "ID_Cronologia", "Status_Obra", "Conjunto", "Circuito", 
    "Local_Instalacao", "Regional", "Planejado_DDPM", "Mes_Execucao_Planejado", 
    "Data_Envio_Projeto", "Centro_Responsavel", "Status_Nota", "Prioridade_Nota", 
    "Observacao", "Check", "Status_Anterior"
]
df = df[colunas_banco]
registros = df.to_records(index=False).tolist()

try:
    placeholders = ", ".join(["?"] * len(colunas_banco))
    cursor.executemany(f'''
        INSERT INTO notas ({", ".join(f'"{c}"' for c in colunas_banco)})
        VALUES ({placeholders})
    ''', registros)
    conn.commit()
    print(f"✅ SUCESSO! {len(df)} notas atualizadas. Os logs de alteração foram protegidos.")
except Exception as e:
    print(f"❌ Falha crítica na injeção: {e}")
finally:
    conn.close()
    print("🔌 Conexão fechada. Pode iniciar o Painel EDP!")