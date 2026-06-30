# region Chapter 1. IMPORTS & CONFIGURATIONS
import os
import pandas as pd
import numpy as np
import datetime
import streamlit as st
import json

from config import (
    DE_PARA_CJ_ANEEL, DE_PARA_CIDADES, CAMINHO_INDICADOR_CONTINUIDADE,
    MAP_ORDEM_EXECUTADA, MAP_REGIONAL_CSD, MAP_FILTROS,
    CAMINHO_EXPORT_NOTAS, CAMINHO_EXPORT_ORDEM, CAMINHO_BASE_SINCRONIZADA, STATUS_MAP,
    CAMINHO_CLIENTES_CONJUNTO, CAMINHO_CUSTO_MODULAR, CAMINHO_GANHOS, CAMINHO_TABLE1,
    CAMINHO_EXPORT_MEDIDAS, CAMINHO_INPUT_RAMAL, CAMINHO_EXPORT_RAMAL_ORD, CAMINHO_PROSPECTADOS
)

from database import carregar_dados, carregar_projeto_construcao, salvar_em_massa, salvar_log_alteracoes, status_para_int, carregar_dados_ramal

# --- FUNÇÃO DE REGRA DE NEGÓCIO: CONJUNTO CRÍTICO ---
# Avalia a criticidade do conjunto com base no Delta do Indicador (12 meses)
def regra_conjunto_critico(valor):
    if pd.isna(valor): return "-"
    elif valor > -0.5: return "Violado"
    elif valor == -0.5: return "Crítico"
    else: return 'Dentro'

# --- FUNÇÕES DE LEITURA EM CACHE (EVITA GARGALO DE REDE NO RECARREGAMENTO) ---
@st.cache_data
# endregion

# region Chapter 2. EXCEL READERS (BACKEND)
def ler_indicador_continuidade():
    if os.path.exists(CAMINHO_INDICADOR_CONTINUIDADE):
        try:
            return pd.read_excel(CAMINHO_INDICADOR_CONTINUIDADE)
        except Exception as e:
            print(f"Erro ao ler Indicador de Continuidade: {e}")
            return None
    return None

@st.cache_data
def ler_export_notas():
    if os.path.exists(CAMINHO_EXPORT_NOTAS):
        colunas_esperadas = ['Nota', 'Status usuário', 'CenTrabalho princ.', 'Ordem', 'Encerram.por data', 'Prioridade']
        try:
            return pd.read_excel(CAMINHO_EXPORT_NOTAS, usecols=lambda c: c in colunas_esperadas)
        except Exception as e:
            print(f"Erro ao ler IW28: {e}")
            return None
    return None

@st.cache_data
def ler_export_medidas():
    if os.path.exists(CAMINHO_EXPORT_MEDIDAS):
        try:
            return pd.read_excel(CAMINHO_EXPORT_MEDIDAS)
        except Exception as e:
            print(f"Erro ao ler IW66: {e}")
            return None
    return None

@st.cache_data
def ler_clientes_conjunto(caminho):
    if os.path.exists(caminho):
        try:
            return pd.read_excel(caminho, usecols=['CONJUNTO_DESC', 'QTDE_CONJUNTO'])
        except Exception as e:
            print(f"Erro ao ler Clientes: {e}")
            return None
    return None

@st.cache_data
def ler_export_ordem():
    if os.path.exists(CAMINHO_EXPORT_ORDEM):
        try:
            return pd.read_excel(CAMINHO_EXPORT_ORDEM, usecols=['Ordem', 'Status usuário', 'Status do sistema', 'Total planejado', 'Total real'])
        except Exception as e:
            print(f"Erro ao ler IW38: {e}")
            return None
    return None

@st.cache_data
def ler_custo_modular(caminho):
    if os.path.exists(caminho):
        try:
            df_custo_raw = pd.read_excel(caminho, sheet_name='Modulares')
            df_sazonal_full = pd.read_excel(caminho, sheet_name='Modulares', skiprows=1, nrows=4)
            return df_custo_raw, df_sazonal_full
        except Exception as e:
            print(f"Erro ao ler Custo Modular: {e}")
            return None
    return None

@st.cache_data
def ler_ganhos(caminho):
    if os.path.exists(caminho):
        try:
            return pd.read_excel(caminho, sheet_name='Ganhos')
        except Exception as e:
            print(f"Erro ao ler Ganhos: {e}")
            return None
    return None

@st.cache_data
def ler_table1(caminho):
    if os.path.exists(caminho):
        try:
            return pd.read_excel(caminho)
        except Exception as e:
            print(f"Erro ao ler Table1: {e}")
            return None
    return None

# ====================================================================
# MOTOR DE DADOS (Carregamento e Cruzamentos)
# ====================================================================
# endregion

# region Chapter 3. DATA MOTOR GERAL (ETL & REGULATÓRIO)
def puxar_dados_completos_da_rede(ano=None):
    # 3.1. Carrega a base bruta (notas cadastradas) do SQLite
    df = carregar_dados(ano=ano) 

    # Tratamento de segurança para garantir que o Status Anterior seja numérico/texto legível
    if 'Status_Anterior' in df.columns:
        df['Status_Anterior'] = df['Status_Anterior'].astype(str).str.extract(r'^(\d+)', expand=False).fillna(df['Status_Anterior'])
        df['Status_Anterior'] = df['Status_Anterior'].replace(["nan", "NaN", "None", "", "<NA>"], "-")
        # Mapeia códigos numéricos especiais para seus nomes amigáveis usando map().fillna() para ArrowStringArray
        mapa_nomes_status = {
            "998": "SUPR",
            "999": "ENCE EXEC",
            "997": "SUPR CANC"
        }
        df['Status_Anterior'] = df['Status_Anterior'].map(mapa_nomes_status).fillna(df['Status_Anterior'])
    else:
        df['Status_Anterior'] = "-"

    # --- MAPEAMENTOS GEOGRÁFICOS BÁSICOS ---
    # Extrai os primeiros 3 caracteres do Circuito/Local Instalação para cruzar com os dicionários de configuração
    df['Cidade'] = df['Local_Instalacao'].astype(str).str[:3].map(DE_PARA_CIDADES).fillna("Desconhecido")
    df['CJ_Aneel'] = df['Circuito'].astype(str).str[:3].map(DE_PARA_CJ_ANEEL).fillna("Desconhecido")
    df["substacao_conjunto"] = df['Circuito'].astype(str).str[:3].fillna("Desconhecido") + " - " + df['Conjunto'].astype(str).fillna("Desconhecido")
    
    # --- 3.2. PROCV DO INDICADOR DE CONTINUIDADE (CRITICIDADE E RANKING) ---
    # Lê a planilha externa da rede e verifica quais conjuntos estão próximos da violação (Limite ANEEL)
    df_hierarquia_raw = ler_indicador_continuidade()
    if df_hierarquia_raw is not None:
        df_hierarquia = df_hierarquia_raw.copy()
        df_hierarquia.columns = df_hierarquia.columns.astype(str).str.replace('\n', ' ').str.replace('[', '').str.replace(']', '').str.strip()
        
        col_alvo = 'DELTA_INDICADOR _12MM_CONJUNTO' if 'DELTA_INDICADOR _12MM_CONJUNTO' in df_hierarquia.columns else 'DELTA_INDICADOR_12MM_CONJUNTO'
        df_hierarquia['DELTA_INDICADOR_12MM_CONJUNTO'] = pd.to_numeric(df_hierarquia[col_alvo], errors='coerce')
        
        col_nome_conjunto = 'TBL_HIERARQUIA_CONJUNTO CJ_NOME' if 'TBL_HIERARQUIA_CONJUNTO CJ_NOME' in df_hierarquia.columns else ('TBL_HIERARQUIA_CONJUNTO[CJ_NOME]' if 'TBL_HIERARQUIA_CONJUNTO[CJ_NOME]' in df_hierarquia.columns else df_hierarquia.columns[0])

        # Padroniza nomes (remove acentos, espaços) para garantir que o cruzamento de dados (Merge/Map) funcione perfeitamente
        df_hierarquia['Conj.Corrijido'] = df_hierarquia[col_nome_conjunto].astype(str).str.normalize('NFKD').str.encode('ascii', errors='ignore').str.decode('utf-8').str.strip().str.upper()
        df_hierarquia['Conjunto Crítico'] = df_hierarquia['DELTA_INDICADOR_12MM_CONJUNTO'].apply(regra_conjunto_critico)  
        df_hierarquia['ranking'] = df_hierarquia['DELTA_INDICADOR_12MM_CONJUNTO'].rank(ascending=False, method='min', na_option='bottom').fillna(99).astype(int)
        
        mapeamento_conjunto_critico = dict(zip(df_hierarquia['Conj.Corrijido'], df_hierarquia['Conjunto Crítico']))
        mapeamento_ranking = dict(zip(df_hierarquia['Conj.Corrijido'], df_hierarquia['ranking']))
        
        col_regional_excel = 'Regional_1' if 'Regional_1' in df_hierarquia.columns else 'Regional'
        if col_regional_excel in df_hierarquia.columns:
            mapeamento_regional = dict(zip(df_hierarquia['Conj.Corrijido'], df_hierarquia[col_regional_excel]))
        else:
            mapeamento_regional = {}
            print("Aviso: Coluna Regional_1 não encontrada na planilha de indicadores.")

        SINONIMOS_CONJUNTO = {"CARAGUATATUBA":"CARAGUA", "FERRAZ":"FERRAZ DE VASCONCELOS", "BRAS CUBAS": "BRAZ CUBAS"}
        chave_busca_base = df['CJ_Aneel'].astype(str).str.normalize('NFKD').str.encode('ascii', errors='ignore').str.decode('utf-8').str.strip().str.upper().replace(SINONIMOS_CONJUNTO)
        
        df['Conj.critico'] = chave_busca_base.map(mapeamento_conjunto_critico).fillna("-")
        df['ranking'] = chave_busca_base.map(mapeamento_ranking).fillna(0).astype(int)
        
    else:
        df['Conj.critico'] = "-"
        df['ranking'] = 0

    # --- 3.3. MAPEAMENTO ESTÁTICO: REGIONAL CSD ---
    chave_busca_regional = df['CJ_Aneel'].astype(str).str.normalize('NFKD').str.encode('ascii', errors='ignore').str.decode('utf-8').str.strip().str.upper()
    df['Regional_CSD'] = chave_busca_regional.map(MAP_REGIONAL_CSD).fillna("-")

    # --- 3.4. INTEGRAÇÃO SAP: EXTRAÇÃO IW28 (STATUS E DATAS REAIS) ---
    # Puxa os dados gerados pelo Robô RPA para atualizar o status final e data de encerramento da nota
    df['Centro_Responsavel_Banco'] = df['Centro_Responsavel'].fillna("-")
    
    df_sap_raw = ler_export_notas()
    if df_sap_raw is not None:
        try:
            df_sap = df_sap_raw.copy()
            df_sap['Nota'] = df_sap['Nota'].dropna().astype(int).astype(str).str.strip()
            
            dicionario_status_sap = dict(zip(df_sap['Nota'], df_sap['Status usuário']))
            df['Export_status'] = df['Numero_Nota'].astype(str).str.strip().map(dicionario_status_sap).fillna("Fora SAP")
            
            dicionario_centro_sap = dict(zip(df_sap['Nota'], df_sap['CenTrabalho princ.']))
            df['Centro_SAP'] = df['Numero_Nota'].astype(str).str.strip().map(dicionario_centro_sap)

            # Identifica a qual Ordem aquela Nota pertence para podermos cruzar com o financeiro (IW38)
            df_sap['Ordem_Texto'] = pd.to_numeric(df_sap['Ordem'], errors='coerce').apply(lambda x: str(int(x)) if pd.notna(x) else "-")
            
            dicionario_ordem_sap = dict(zip(df_sap['Nota'], df_sap['Ordem_Texto']))
            df['Ordem'] = df['Numero_Nota'].astype(str).str.strip().map(dicionario_ordem_sap).fillna("-")
            
            if 'Encerram.por data' in df_sap.columns:
                dicionario_encerram_data = dict(zip(df_sap['Nota'], df_sap['Encerram.por data']))
                df['Encerram.por data'] = df['Numero_Nota'].astype(str).str.strip().map(dicionario_encerram_data).fillna("-")
            else:
                df['Encerram.por data'] = "-"

            df['Centro_Responsavel'] = df['Centro_SAP'].fillna(df['Centro_Responsavel_Banco']).fillna("-")
            
        except Exception as e:
            df['Export_status'] = "Erro na leitura"
            df['Centro_Responsavel'] = df['Centro_Responsavel_Banco'] 
            df['Encerram.por data'] = "-"
            print(f"Erro ao ler IW28: {e}")
    else:
        df['Export_status'] = "Pendente Extração SAP"
        df['Centro_Responsavel'] = df['Centro_Responsavel_Banco'] 
        df['Encerram.por data'] = "-"
    
    df = df.drop(columns=['Centro_Responsavel_Banco'], errors='ignore')
    if 'Centro_SAP' in df.columns:
        df = df.drop(columns=['Centro_SAP'], errors='ignore')

    # Lógica fallback: Se a nota ainda não foi enviada pro SAP, o Status Final reflete o Status local da Engenharia
    df['Status_Final'] = df['Export_status']
    mascara_fora_sap = df['Export_status'] == "Fora SAP"
    df.loc[mascara_fora_sap, 'Status_Final'] = df.loc[mascara_fora_sap, 'Status_Nota']
    
    # Extrai apenas os números iniciais do status (ex: "01 Sem providência" -> "01")
    df['Status_Final'] = df['Status_Final'].astype(str).str.extract(r'^(\d+)', expand=False).fillna(df['Status_Final'])
    mapa_nomes_status = {
        "998": "SUPR",
        "999": "ENCE EXEC",
        "997": "SUPR CANC"
    }
    df['Status_Final'] = df['Status_Final'].map(mapa_nomes_status).fillna(df['Status_Final'])
    df['Status_Usuário_Ordem'] = "-"

    # --- 3.5. PROCV DA QUANTIDADE DE CLIENTES POR CONJUNTO ---
    # Utilizado mais a frente como denominador para calcular o DEC e FEC

    df_clientes_raw = ler_clientes_conjunto(CAMINHO_CLIENTES_CONJUNTO)
    if df_clientes_raw is not None:
        try:
            col_chave_excel = 'CONJUNTO_DESC'
            col_valor_excel = 'QTDE_CONJUNTO'
            df_clientes = df_clientes_raw.copy()
            df_clientes[col_chave_excel] = df_clientes[col_chave_excel].astype(str).str.strip().str.upper()
            
            def converter_clientes_inteiro(valor):
                if pd.isna(valor): return 0
                if isinstance(valor, (int, float)): return int(valor)
                v_str = str(valor).strip().replace('.', '')
                try: return int(v_str)
                except: return 0
            
            df_clientes[col_valor_excel] = df_clientes[col_valor_excel].apply(converter_clientes_inteiro)
            dict_clientes_dinamico = dict(zip(df_clientes[col_chave_excel], df_clientes[col_valor_excel]))
            
            chave_busca_regional = df['CJ_Aneel'].astype(str).str.normalize('NFKD').str.encode('ascii', errors='ignore').str.decode('utf-8').str.strip().str.upper()
            df['N_Clientes_Conjunto'] = chave_busca_regional.map(dict_clientes_dinamico).fillna(0).astype(int)
            
        except Exception as e:
            df['N_Clientes_Conjunto'] = 0
            print(f"Erro ao ler Planilha de Clientes: {e}")
    else:
        df['N_Clientes_Conjunto'] = 0

    # --- 3.6. INTEGRAÇÃO SAP: CUSTO E EXECUÇÃO DE ORDENS (IW38) ---
    # Compara o valor Orçado (Planejado) contra o que realmente foi Gasto (Real)
    df_ordem_raw = ler_export_ordem()
    if df_ordem_raw is not None:
        try:
            df_ordem = df_ordem_raw.copy()
            df_ordem['Ordem'] = df_ordem['Ordem'].dropna().astype(int).astype(str).str.strip()
            dicionario_centro_sap = dict(zip(df_ordem['Ordem'], df_ordem['Status usuário']))
            dicionario_status_sistema_sap = dict(zip(df_ordem['Ordem'], df_ordem['Status do sistema']))
            dicionario_total_planejado_ordem = dict(zip(df_ordem['Ordem'], df_ordem['Total planejado']))
            dicionario_total_real_ordem = dict(zip(df_ordem['Ordem'], df_ordem['Total real']))

            if 'Ordem' in df.columns:
                chave_busca_ordem = pd.to_numeric(df['Ordem'], errors='coerce').dropna().astype(int).astype(str).str.strip()
                df.loc[df['Ordem'] != "-", 'Status_Usuário_Ordem'] = chave_busca_ordem.map(dicionario_centro_sap).fillna("-")
                df['Status_Usuário_Ordem'] = df['Status_Usuário_Ordem'].fillna("-")

                df.loc[df['Ordem'] != "-", 'Status_Sistema'] = chave_busca_ordem.map(dicionario_status_sistema_sap).fillna("-")
                df['Status_Sistema'] = df['Status_Sistema'].fillna("-")

                df.loc[df['Ordem'] != "-", 'Total_planejado_ordem']  = chave_busca_ordem.map(dicionario_total_planejado_ordem).fillna(0.0)
                df['Total_planejado_ordem'] = pd.to_numeric(df['Total_planejado_ordem'], errors='coerce').fillna(0.0)

                df.loc[df['Ordem'] != "-", 'Total_real_ordem']  = chave_busca_ordem.map(dicionario_total_real_ordem).fillna(0.0)
                df['Total_real_ordem'] = pd.to_numeric(df['Total_real_ordem'], errors='coerce').fillna(0.0)

                # Cálculo percentual de avanço financeiro da obra
                def calcular_exec_percentagem(row):
                    try:
                        planejado = float(row['Total_planejado_ordem'])
                        real = float(row['Total_real_ordem'])
                        if planejado > 0: return (real / planejado) * 100
                        elif real > 0 and planejado == 0: return 100.0
                        else: return 0.0
                    except:
                        return "-"

                df['Exec_percentagem_ordem'] = df.apply(calcular_exec_percentagem, axis=1)
                
                # Traduz a sopa de letrinhas do SAP (JAND INVE, etc) em um simples SIM ou NÃO para facilitar a auditoria
                df['Ordem_Executada'] = df['Status_Usuário_Ordem'].map(MAP_ORDEM_EXECUTADA).fillna("NÃO")

        except Exception as e:
            df['Status_Usuário_Ordem'] = "Erro na leitura"
            print(f"Erro ao ler IW38: {e}")
    else:
        df['Status_Usuário_Ordem'] = "Pendente Extração IW38"
        df['Status_Sistema'] = "Pendente Extração IW38"
        df['Total_planejado_ordem'] = "Pendente Extração IW38"
        df['Total_real_ordem'] = "Pendente Extração IW38"
        df['Exec_percentagem_ordem'] = "Pendente Extração IW38"
        df['Ordem_Executada'] = "Pendente Extração IW38"

    map_projeto_construcao = carregar_projeto_construcao()
    df['Projeto_Construcao'] = df['CJ_Aneel'].map(map_projeto_construcao).fillna("-")
    df["Modular"] = df["Conjunto"].astype(str).str.contains("MODULAR", case=False, na=False).map({True: "Sim", False: "Não"})
    
    # --- 3.7. PROCV COMPLEXO: CUSTOS MODULARES, CHI, CI E SAZONALIDADE ---
    # Lê os custos padrão dos conjuntos modulares e multiplica pelo volume planejado (Planejado_DDPM)

    colunas_modulo_9 = ['Modular', 'CHI', 'CI', 'Ocorrencia', 'DEC_PROG_CHI', 'CHI_Sazonal_2025', 'Total_planejado_modular']
    for col in colunas_modulo_9: df[col] = 0.0

    custo_modular_data = ler_custo_modular(CAMINHO_CUSTO_MODULAR)
    if custo_modular_data is not None:
        try:
            df_custo_raw, df_sazonal_full = custo_modular_data
            df_custo_raw = df_custo_raw.copy()
            df_sazonal_full = df_sazonal_full.copy()
            
            df_custo_raw.columns = df_custo_raw.columns.astype(str).str.strip()
            
            col_chave_excel = [c for c in df_custo_raw.columns if 'Conjunto' in c][0]
            col_valor_excel = [c for c in df_custo_raw.columns if 'Custo Modular' in c][0]
            chi_col = [c for c in df_custo_raw.columns if 'CHI' in c][0]
            ci_col = [c for c in df_custo_raw.columns if 'CI' in c][0]
            ocor_col = [c for c in df_custo_raw.columns if 'Ocor' in c][0]
            col_m_excel = df_custo_raw.columns[12] if len(df_custo_raw.columns) > 12 else None
            
            df_custo = df_custo_raw[[col_chave_excel, col_valor_excel, chi_col, ci_col, ocor_col]].copy()
            df_custo.columns = ['chave', 'valor', 'chi_b', 'ci_b', 'ocor_b']
            df_custo['chave'] = df_custo['chave'].astype(str).str.strip().str.upper()
            
            def limpar_numero_br(valor):
                if pd.isna(valor): return 0.0
                if isinstance(valor, (int, float)): return float(valor)
                v_str = str(valor).upper().replace('R$', '').strip()
                if ',' in v_str: v_str = v_str.replace('.', '').replace(',', '.')
                try: return float(v_str)
                except: return 0.0
            
            df_custo['valor'] = df_custo['valor'].apply(limpar_numero_br)
            df_custo['chi_b'] = df_custo['chi_b'].apply(limpar_numero_br)
            df_custo['ci_b'] = df_custo['ci_b'].apply(limpar_numero_br)
            df_custo['ocor_b'] = df_custo['ocor_b'].apply(limpar_numero_br)
            
            dict_custo = dict(zip(df_custo['chave'], df_custo['valor']))
            dict_chi = dict(zip(df_custo['chave'], df_custo['chi_b']))
            dict_ci = dict(zip(df_custo['chave'], df_custo['ci_b']))
            dict_ocor = dict(zip(df_custo['chave'], df_custo['ocor_b']))
            
            dict_dec_prog = {}
            if col_m_excel:
                dict_dec_prog = dict(zip(df_custo_raw[col_chave_excel].astype(str).str.strip().str.upper(), df_custo_raw[col_m_excel].fillna(0.0)))
            
            dict_sazonal = {}
            try:
                if len(df_sazonal_full.columns) >= 21:
                    df_sazonal_excel = df_sazonal_full.iloc[:, 20:32]
                    if not df_sazonal_excel.empty:
                        dict_sazonal = dict(zip(df_sazonal_excel.iloc[0].astype(int), df_sazonal_excel.iloc[3].astype(float)))
            except Exception as e_saz:
                print(f"Sazonalidade não carregada: {e_saz}")

            if 'Conjunto' in df.columns:
                chave_busca = df['Conjunto'].astype(str).str.strip().str.upper()
                quantidade_g2 = pd.to_numeric(df['Planejado_DDPM'], errors='coerce').fillna(0.0)
                
                df['Modular'] = chave_busca.map(dict_custo).fillna(0.0)
                df['Total_planejado_modular'] = df['Modular'] * quantidade_g2
                df['CHI'] = chave_busca.map(dict_chi).fillna(0.0) * quantidade_g2
                df['CI'] = chave_busca.map(dict_ci).fillna(0.0) * quantidade_g2 
                df['Ocorrencia'] = chave_busca.map(dict_ocor).fillna(0.0) * quantidade_g2
                df['DEC_PROG_CHI'] = chave_busca.map(dict_dec_prog).fillna(0.0) * quantidade_g2
                
                df['Data_H2'] = pd.to_datetime(df['Data_Envio_Projeto'], errors='coerce', dayfirst=True)
                df['Ano_H2'] = df['Data_H2'].dt.year
                df['Mes_H2'] = df['Data_H2'].dt.month
                
                fator_proch = df['Mes_H2'].map(dict_sazonal).fillna(0.0)
                col_cc_multiplicador = pd.to_numeric(df['CC'], errors='coerce').fillna(0.0) if 'CC' in df.columns else 0.0
                
                df['CHI_Sazonal_2025'] = np.where(df['Ano_H2'] == 2025, fator_proch * col_cc_multiplicador, 0.0)
                df = df.drop(columns=['Data_H2', 'Ano_H2', 'Mes_H2'], errors='ignore')
                
        except Exception as e:
            st.error(f"Erro Crítico no Bloco 9 (Modulares): {e}")

    # --- 3.8. REGRAS DE NEGÓCIO: CÁLCULO DEC E FEC ---
    col_bw_clientes = 'N_Clientes_Conjunto' 
    col_bx_duracao = 'CHI'  
    col_by_freq = 'CI'      
    
    df['DEC'] = 0.0
    df['FEC'] = 0.0
    
    if all(col in df.columns for col in [col_bw_clientes, col_bx_duracao, col_by_freq]):
        cond_divisao_valida = (df[col_bw_clientes] != 0) & (df[col_bw_clientes].notna())
        df.loc[cond_divisao_valida, 'DEC'] = df[col_bx_duracao] / df[col_bw_clientes]
        df.loc[cond_divisao_valida, 'FEC'] = df[col_by_freq] / df[col_bw_clientes]

    # --- 3.9. PROCV COMPOSTO: FATOR DE GANHOS CHI-CONJ ---
    df['CHI_Conj'] = 0.0

    df_ganhos_raw = ler_ganhos(CAMINHO_GANHOS)
    if df_ganhos_raw is not None:
        try:
            df_ganhos = df_ganhos_raw.copy()
            df_ganhos.columns = df_ganhos.columns.astype(str).str.strip()
            
            col_c_excel = df_ganhos.columns[2]  
            col_b_excel = df_ganhos.columns[1]  
            col_k_excel = df_ganhos.columns[10] 
            
            df_ganhos['chave_composta'] = (
                df_ganhos[col_c_excel].astype(str).str.strip().str.upper() + "_" + 
                df_ganhos[col_b_excel].astype(str).str.strip().str.upper()
            )
            
            dict_ganhos = dict(zip(df_ganhos['chave_composta'], df_ganhos[col_k_excel].fillna(0.0)))
            
            chave_busca_sistema = (
                df['Conjunto'].astype(str).str.strip().str.upper() + "_" + 
                df['CJ_Aneel'].astype(str).str.strip().str.upper()
            )
            
            fator_ganhos = chave_busca_sistema.map(dict_ganhos).fillna(0.0)
            quantidade_g2 = pd.to_numeric(df['Planejado_DDPM'], errors='coerce').fillna(0.0)
            
            df['CHI_Conj'] = fator_ganhos * quantidade_g2
            
        except Exception as e:
            st.error(f"Erro ao ler planilha de Ganhos: {e}")

    # --- 3.10. PROCV HISTÓRICOS: 12 MESES E 3 MESES ---
    for col in ['CI_12M', 'CHI_12M', 'OCO_12M', 'OCO_3M']: df[col] = "-"

    df_t1_raw = ler_table1(CAMINHO_TABLE1)
    if df_t1_raw is not None:
        try:
            df_t1 = df_t1_raw.copy()
            df_t1.columns = df_t1.columns.astype(str).str.strip()
            
            dict_ci12 = dict(zip(df_t1['Ajustado'].astype(str).str.upper(), df_t1['[SumCI_12M]']))
            dict_chi12 = dict(zip(df_t1['Ajustado'].astype(str).str.upper(), df_t1['[SumCHI_12M]']))
            dict_oco12 = dict(zip(df_t1['Ajustado'].astype(str).str.upper(), df_t1['[SumEventos_12M]']))
            dict_oco3 = dict(zip(df_t1['Ajustado'].astype(str).str.upper(), df_t1['[SumEventos_3M]']))
            
            col_chave_ce = 'CE' 
            if col_chave_ce in df.columns:
                chave_busca_ce = df[col_chave_ce].astype(str).str.strip().str.upper()
                df['CI_12M'] = chave_busca_ce.map(dict_ci12).fillna("-")
                df['CHI_12M'] = chave_busca_ce.map(dict_chi12).fillna("-")
                df['OCO_12M'] = chave_busca_ce.map(dict_oco12).fillna("-")
                df['OCO_3M'] = chave_busca_ce.map(dict_oco3).fillna("-")
                
        except Exception as e:
            print(f"Erro ao processar históricos da Table1: {e}")
        
    # --- 3.11. LÓGICA DE TOPOLOGIA DE PROTEÇÃO ---
    col_f = 'Local_Instalacao' 
    local_limpo = df[col_f].astype(str).str.strip().str.upper()
    parte1 = local_limpo.str[0:3].str.strip()
    parte2 = local_limpo.str[4:6].str.strip()
    parte3 = local_limpo.str[7:17].str.strip() 
    chave_protecao = parte1 + parte2 + parte3 + "9"
    equipamento_protecao_direto = parte2.isin(['RL', 'BR', 'BF', 'DJ'])

    df['Equipamento_Protecao'] = np.where(equipamento_protecao_direto, chave_protecao, "-")

    # --- 3.12. INTEGRAÇÃO SAP: MEDIDAS IW66 ---
    df['Medida_SAP'] = "-"
    df_medidas_raw = ler_export_medidas()
    if df_medidas_raw is not None:
        try:
            df_m = df_medidas_raw.copy()
            df_m['Nota'] = df_m['Nota'].dropna().astype(int).astype(str).str.strip()
            
            def classificar_row(row):
                denom = str(row.get('Denominação do conjunto', '')).strip().upper()
                texto = str(row.get('Texto medida', '')).strip().upper()
                desc = str(row.get('Descrição', '')).strip().upper()
                val = row.get('Nº de ordenação', 0)
                
                if pd.isna(val):
                    val = 0
                else:
                    try:
                        val = float(val)
                    except:
                        val = 0
                        
                un_denoms = [
                    "POSTE", "TRANSFORMADOR", "TRANSF", "TRAFO", "SUBST", "CHAVE",
                    "RELIGADOR", "SECCIONALIZADOR", "DISJUNTOR", "DJ", "BF", "LBS",
                    "MONITORAMENTO", "MANUT. CIRC"
                ]
                is_un_denom = any(kw in denom for kw in un_denoms)
                
                m_denoms = [
                    "REDE", "RDS", "BLINDAGEM", "MELHORIA OPERATIVA"
                ]
                is_m_denom = any(kw in denom for kw in m_denoms)
                
                un_keywords = [
                    "POSTE", "TRANSF", "TRAFO", "RELIG", "CHAVE", "SECCIONALIZADOR", "DISJUNTOR", "DJ"
                ]
                m_keywords = [
                    "CONDUTOR", "CABO", "SPACER", "RECOND", "CONSTR", "BLINDAR", "EXTENSAO", "REDE"
                ]
                
                has_un_text = any(kw in texto for kw in un_keywords) or any(kw in desc for kw in un_keywords)
                has_m_text = any(kw in texto for kw in m_keywords) or any(kw in desc for kw in m_keywords)
                
                if val > 20:
                    return val, "m"
                if is_un_denom:
                    return val, "un"
                elif is_m_denom:
                    if has_un_text and not has_m_text and val <= 20:
                        return val, "un"
                    return val, "m"
                else:
                    if has_un_text and not has_m_text and val <= 20:
                        return val, "un"
                    elif has_m_text and not has_un_text:
                        return val, "m"
                    else:
                        if val >= 10:
                            return val, "m"
                        else:
                            return val, "un"
            
            df_m['val_class'], df_m['unit_class'] = zip(*df_m.apply(classificar_row, axis=1))
            
            # Vectorized aggregation
            df_m['val_m'] = np.where(df_m['unit_class'] == 'm', df_m['val_class'], 0)
            df_m['val_un'] = np.where(df_m['unit_class'] == 'un', df_m['val_class'], 0)
            
            grouped = df_m.groupby('Nota')[['val_m', 'val_un']].sum().reset_index()
            
            def format_row(row):
                sum_m = row['val_m']
                sum_un = row['val_un']
                parts = []
                if sum_m > 0:
                    sum_km = sum_m / 1000.0
                    km_str = f"{sum_km:.3f}".rstrip('0').rstrip('.')
                    parts.append(f"{km_str} km")
                if sum_un > 0:
                    un_str = f"{int(sum_un)}" if sum_un.is_integer() else f"{sum_un:.1f}"
                    parts.append(f"{un_str} un")
                if not parts:
                    return "-"
                return " / ".join(parts)
            
            grouped['Medida_SAP_Str'] = grouped.apply(format_row, axis=1)
            dict_medidas = dict(zip(grouped['Nota'], grouped['Medida_SAP_Str']))
            
            df['Medida_SAP'] = df['Numero_Nota'].astype(str).str.strip().map(dict_medidas).fillna("-")
        except Exception as e:
            print(f"Erro ao processar medidas IW66: {e}")
            df['Medida_SAP'] = "Erro"

    # --- 3.13. COMPARAÇÃO: MEDIDA VS PLANEJADO ---
    def comparar_medida_planejado(row):
        medida_str = str(row.get('Medida_SAP', '-')).strip()
        planejado_val = row.get('Planejado_DDPM')
        
        if pd.isna(planejado_val) or medida_str == "-":
            return "-"
            
        try:
            planejado_val = float(planejado_val)
        except:
            return "-"
            
        # Substitui vírgula por ponto para suportar padrão decimal brasileiro
        medida_str = medida_str.replace(',', '.')
        
        import re
        km_val = 0.0
        un_val = 0.0
        has_km = False
        has_un = False
        
        if "km" in medida_str.lower():
            m = re.search(r'([\d\.]+)\s*km', medida_str.lower())
            if m:
                try:
                    km_val = float(m.group(1))
                    has_km = True
                except: pass
        if "un" in medida_str.lower():
            m = re.search(r'([\d\.]+)\s*un', medida_str.lower())
            if m:
                try:
                    un_val = float(m.group(1))
                    has_un = True
                except: pass
                
        if not has_km and not has_un:
            return "-"
            
        match_km = False
        if has_km:
            if abs(km_val * 1000.0 - planejado_val) < 0.1 or abs(km_val - planejado_val) < 0.1:
                match_km = True
                
        match_un = False
        if has_un:
            if abs(un_val - planejado_val) < 0.1:
                match_un = True
                
        if has_km and has_un:
            if match_km or match_un:
                return "Sim"
            return "Não"
        elif has_km:
            return "Sim" if match_km else "Não"
        elif has_un:
            return "Sim" if match_un else "Não"
            
        return "-"

    df['Medida_vs_Planejado'] = df.apply(comparar_medida_planejado, axis=1)

    return df

MAP_COLUNAS_EXCEL = {
    "Regional": "Regional",
    "NOTA": "Numero_Nota",
    "Status da Obra": "Status_Obra",
    "Conjunto": "Conjunto",
    "Circuito": "Circuito",
    "Local Instalação": "Local_Instalacao",
    "Planejado-DDPM": "Planejado_DDPM",
    "Mês de Execução  Planejado - DDPM": "Mes_Execucao_Planejado",
    "Data Envio Projeto-DDPM": "Data_Envio_Projeto",
    "CenTrab respon/": "Centro_Responsavel",
    "Prioridade Nota": "Prioridade_Nota",
    "Status Nota": "Status_Nota",
    "Cidade": "Cidade",
    "Observação": "Observacao",
    "CJ ANEEL": "CJ_Aneel",
    " SUBESTAÇÃO ": "substacao_conjunto",
    " Conj.Crítico ": "Conj.critico",
    "Rankig": "ranking",
    "Check": "Check",
    "EXPORT\nStatus": "Export_status",
    "Status\nFinal": "Status_Final",
    "Status\nanterior": "Status_Anterior",
    "Check\nCancelado": "Check_Cancelado",
    "Ordem": "Ordem",
    "Status usuário\nOrdem": "Status_Usuário_Ordem",
    "Status do sistema": "Status_Sistema",
    "Ordem\nTotal planejado": "Total_planejado_ordem",
    "Ordem\nTotal real": "Total_real_ordem",
    "%\nExecutado": "Exec_percentagem_ordem",
    "Considera\nOrdem Exec": "Ordem_Executada",
    "Projeto\nConstrução": "Projeto_Construcao",
    "Modular": "Modular",
    "Total Plan\nModular": "Total_planejado_modular",
    "Regional\nCSD": "Regional_CSD",
    "Clientes Conj": "N_Clientes_Conjunto",
    "CHI": "CHI",
    "CI": "CI",
    "Ocor.": "Ocorrencia",
    "DEC": "DEC",
    "FEC": "FEC",
    "CHI - Conj.": "CHI_Conj",
    "CHI - Sazonal\n2025": "CHI_Sazonal_2025",
    "DIS.PROTEÇÃO": "Equipamento_Protecao",
    "CI-12M": "CI_12M",
    "CHI-12M": "CHI_12M",
    "OCO-12M": "OCO_12M",
    "OCO-3M": "OCO_3M",
    "DEC PROG.\nCHI": "DEC_PROG_CHI",
    "Grupo": "Grupo"
}

# endregion

# region Chapter 4. EXCEL EXPORTER
def gerar_copia_excel_rede(df_fresco=None):
    """
    Puxa a base mais recente do SQLite (HISTÓRICO COMPLETO), executa todos os cruzamentos
    e cálculos de Engenharia e gera o arquivo Excel formatado para o Power Query.
    """
    # Garante que puxa 100% do histórico (ignora se a tela estiver filtrada só para 2026)
    from processamento import puxar_dados_completos_da_rede
    df_temp = puxar_dados_completos_da_rede(ano=None).copy()

    # =========================================================================
    # PREPARAÇÃO VISUAL E FORMATAÇÃO DE DADOS (Padrão Legado)
    # =========================================================================
    
    # 1. Datas (Formato: DD/MM/YYYY) robusto contra nulos e números do Excel
    def formatar_data_envio(val):
        val_str = str(val).strip()
        if val_str in ['-', '', 'nan', 'None', 'NaT', '<NA>']: return '-'
        try:
            # Se for número serial do Excel (ex: 43105)
            if val_str.replace('.', '').isdigit() and 30000 < float(val_str) < 60000:
                dt = pd.to_datetime('1899-12-30') + pd.to_timedelta(float(val_str), 'D')
                return dt.strftime('%d/%m/%Y')
            
            # Se for string de data normal
            dt = pd.to_datetime(val_str, errors='coerce', dayfirst=True)
            if pd.notna(dt):
                return dt.strftime('%d/%m/%Y')
        except:
            pass
        return val_str

    if 'Data_Envio_Projeto' in df_temp.columns:
        df_temp['Data_Envio_Projeto'] = df_temp['Data_Envio_Projeto'].apply(formatar_data_envio)

    # 2. Mês de Execução (Padronização absoluta para 01/MM/AAAA para o Power Query ler nativamente)
    def formatar_data_excucao(val):
        meses = {'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06', 
                 'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12', 'maio': '05'}
        try:
            val_str = str(val).strip().lower()
            if val_str in ['-', '', 'nan', 'None', 'NaT', '<NA>']: return "-"
            
            val_str = val_str.replace('/', '-')
            import re
            
            # Caso 1: Formato "jan-27" ou "jan-2027"
            if '-' in val_str:
                partes = val_str.split('-')
                mes_key = partes[0]
                ano_str = partes[1]
                if mes_key in meses:
                    mes = meses[mes_key]
                    ano = "20" + ano_str if len(ano_str) == 2 else ano_str
                    return f"01/{mes}/{ano}"
            
            # Caso 2: Formato "01-27" (já numérico)
            if re.match(r'^\d{2}-\d{2}$', val_str):
                partes = val_str.split('-')
                return f"01/{partes[0]}/20{partes[1]}"
                
            # Fallback
            dt = pd.to_datetime(val_str, errors='coerce', dayfirst=True)
            if pd.notna(dt):
                return dt.strftime('01/%m/%Y')
                
            return val_str
        except:
            return val_str
            
    if 'Mes_Execucao_Planejado' in df_temp.columns:
        df_temp['Mes_Execucao_Planejado'] = df_temp['Mes_Execucao_Planejado'].apply(formatar_data_excucao)
        
    # 3. % Executado (Formato: 0%)
    if 'Exec_percentagem_ordem' in df_temp.columns:
        df_temp['Exec_percentagem_ordem'] = pd.to_numeric(df_temp['Exec_percentagem_ordem'].astype(str).str.replace(',','.'), errors='coerce').fillna(0)
        df_temp['Exec_percentagem_ordem'] = df_temp['Exec_percentagem_ordem'].apply(lambda x: f"{int(x)}%" if float(x).is_integer() else f"{x:.0f}%")

    # 4. Colunas Vazias de Controle e Preenchimento Padrão
    if 'Check_Cancelado' not in df_temp.columns: 
        df_temp['Check_Cancelado'] = "ok"
    else: 
        df_temp['Check_Cancelado'] = df_temp['Check_Cancelado'].replace(["", "-", None, "nan"], "ok")
    
    if 'Notas_postergadas_2024' not in df_temp.columns: df_temp['Notas_postergadas_2024'] = "Não"
    if 'Fisico_Realizado_Ordem' not in df_temp.columns: df_temp['Fisico_Realizado_Ordem'] = 0.0

    # 5. Marcador de erro (#REF!) nas colunas não mapeadas/vazias
    for col in ['CI_12M', 'CHI_12M', 'OCO_12M', 'OCO_3M']:
        if col in df_temp.columns:
            df_temp[col] = df_temp[col].replace(["-", "", None, "nan"], "#REF!")
        else:
            df_temp[col] = "#REF!"
            
    # 6. Status com Zero à Esquerda (Formato: 01, 02... 99)
    def zpad_status(val):
        try:
            if str(val).strip() in ["-", "", "nan", "None", "Fora SAP"]: return str(val)
            import re
            nums = re.findall(r'\d+', str(val))
            if nums: return f"{int(nums[0]):02d}"
            return str(val)
        except: return str(val)
        
    for col in ['Status_Nota', 'Status_Final', 'Status_Anterior']:
        if col in df_temp.columns:
            df_temp[col] = df_temp[col].apply(zpad_status)

    # 7. Planejado DDPM no Formato 1,00 0,03 com 2 casas decimais
    def format_planejado_ddpm(val):
        try:
            val_str = str(val).strip()
            if val_str in ['-', '', 'nan', 'None', 'NaT', '<NA>']: return "-"
            num_val = float(val_str.replace(',', '.'))
            return f"{num_val:.2f}".replace('.', ',')
        except:
            return str(val)

    if 'Planejado_DDPM' in df_temp.columns:
        df_temp['Planejado_DDPM'] = df_temp['Planejado_DDPM'].apply(format_planejado_ddpm)

    # =========================================================================
    # MAPEAMENTO FINAL E EXPORTAÇÃO
    # =========================================================================
    colunas_mapeamento = [
        ("Regional", "Regional"), ("Numero_Nota", "NOTA"), ("Status_Obra", "Status da Obra"),
        ("Conjunto", "Conjunto"), ("Circuito", "Circuito"), ("Local_Instalacao", "Local Instalação"),
        ("Planejado_DDPM", "Planejado-DDPM"), ("Mes_Execucao_Planejado", "Mês de Execução  Planejado - DDPM"),
        ("Data_Envio_Projeto", "Data Envio Projeto-DDPM"), ("Centro_Responsavel", "CenTrab respon/"),
        ("Prioridade_Nota", "Prioridade Nota"), ("Status_Nota", "Status Nota"),
        ("Fisico_Realizado_Ordem", "Físico Realizado Ordem"), ("Cidade", "Cidade"),
        ("Observacao", "Observação"), ("CJ_Aneel", "CJ ANEEL"),
        ("substacao_conjunto", " SUBESTAÇÃO "), ("Conj.critico", " Conj.Crítico "),
        ("ranking", "Rankig"), ("Check", "Check"), ("Export_status", "EXPORT\nStatus"),
        ("Status_Final", "Status\nFinal"), ("Status_Anterior", "Status\nanterior"),
        ("Check_Cancelado", "Check\nCancelado"), ("Ordem", "Ordem"),
        ("Status_Usuário_Ordem", "Status usuário\nOrdem"), ("Status_Sistema", "Status do sistema"),
        ("Total_planejado_ordem", "Ordem\nTotal planejado"), ("Total_real_ordem", "Ordem\nTotal real"),
        ("Exec_percentagem_ordem", "%\nExecutado"), ("Ordem_Executada", "Considera\nOrdem Exec"),
        ("Projeto_Construcao", "Projeto\nConstrução"), ("Notas_postergadas_2024", "Notas postergadas\n2024"),
        ("Modular", "Modular"), ("Total_planejado_modular", "Total Plan\nModular"),
        ("Regional_CSD", "Regional\nCSD"), ("N_Clientes_Conjunto", "Clientes Conj"),
        ("CHI", "CHI"), ("CI", "CI"), ("Ocorrencia", "Ocor."),
        ("DEC", "DEC"), ("FEC", "FEC"), ("CHI_Conj", "CHI - Conj."),
        ("CHI_Sazonal_2025", "CHI - Sazonal\n2025"), ("Equipamento_Protecao", "DIS.PROTEÇÃO"),
        ("CI_12M", "CI-12M"), ("CHI_12M", "CHI-12M"), ("OCO_12M", "OCO-12M"), ("OCO_3M", "OCO-3M"),
        ("DEC_PROG_CHI", "DEC PROG.\nCHI"), ("Grupo", "Grupo"),
        ("Retroativa_Responsavel", "Retroativa Responsavel"), ("Retroativa_prioridade", "Retroativa prioridade")
    ]
    
    for col_orig, col_dest in colunas_mapeamento:
        if col_orig not in df_temp.columns:
            df_temp[col_orig] = "-"
            
    colunas_orig = [orig for orig, dest in colunas_mapeamento]
    df_export = df_temp[colunas_orig].copy()
    
    mapa_nomes = {orig: dest for orig, dest in colunas_mapeamento}
    df_export = df_export.rename(columns=mapa_nomes)
    
    # =========================================================================
    # EXPORTAÇÃO AVANÇADA (Nativa do Excel para proteger o Power Query)
    # =========================================================================
    from config import CAMINHO_BASE_SINCRONIZADA
    
    with pd.ExcelWriter(CAMINHO_BASE_SINCRONIZADA, engine='xlsxwriter') as writer:
        nome_aba = 'Input de Notas' 
        df_export.to_excel(writer, sheet_name=nome_aba, index=False)
        
        workbook = writer.book
        worksheet = writer.sheets[nome_aba]
        
        # 1. Estilo do Cabeçalho
        header_format = workbook.add_format({
            'bold': True, 'text_wrap': True, 'valign': 'vcenter', 'align': 'center',
            'bg_color': '#4F81BD', 'font_color': 'white', 'border': 1
        })
        
        # 2. Estilos de Dados
        data_format = workbook.add_format({'valign': 'vcenter', 'align': 'center'})
        
        # Escreve o cabeçalho
        for col_num, value in enumerate(df_export.columns):
            worksheet.write(0, col_num, value, header_format)
            
        worksheet.set_row(0, 45) 
        worksheet.freeze_panes(1, 0)
        worksheet.autofilter(0, 0, len(df_export), len(df_export.columns) - 1)
        
        # Aplica as larguras e formatações corretas coluna a coluna
        for i, col in enumerate(df_export.columns):
            if "Observação" in col:
                worksheet.set_column(i, i, 45, data_format)
            elif "Local" in col or "Conjunto" in col or "Circuito" in col:
                worksheet.set_column(i, i, 20, data_format)
            else:
                worksheet.set_column(i, i, 14, data_format)
# endregion
