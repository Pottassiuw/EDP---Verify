import os
import pandas as pd
import numpy as np
import datetime
import streamlit as st

from config import (
    DE_PARA_CJ_ANEEL, DE_PARA_CIDADES, CAMINHO_INDICADOR_CONTINUIDADE, 
    MAP_ORDEM_EXECUTADA, MAP_REGIONAL_CSD, MAP_FILTROS
)

from database import carregar_dados, carregar_projeto_construcao

# --- FUNÇÃO DE REGRA DE NEGÓCIO: CONJUNTO CRÍTICO ---
# Avalia a criticidade do conjunto com base no Delta do Indicador (12 meses)
def regra_conjunto_critico(valor):
    if pd.isna(valor): return "-"
    elif valor > -0.5: return "Violado"
    elif valor == -0.5: return "Crítico"
    else: return 'Dentro'

# ====================================================================
# MOTOR DE DADOS (Carregamento e Cruzamentos)
# ====================================================================
def puxar_dados_completos_da_rede():
    # 3.1. Carrega a base bruta (notas cadastradas) do SQLite
    df = carregar_dados() 

    # Tratamento de segurança para garantir que o Status Anterior seja numérico/texto legível
    if 'Status_Anterior' in df.columns:
        df['Status_Anterior'] = pd.to_numeric(df['Status_Anterior'], errors='coerce')
        df['Status_Anterior'] = df['Status_Anterior'].apply(lambda x: str(int(x)) if pd.notna(x) else "-")
    else:
        df['Status_Anterior'] = "-"

    # --- MAPEAMENTOS GEOGRÁFICOS BÁSICOS ---
    # Extrai os primeiros 3 caracteres do Circuito/Local Instalação para cruzar com os dicionários de configuração
    df['Cidade'] = df['Local_Instalacao'].astype(str).str[:3].map(DE_PARA_CIDADES).fillna("Desconhecido")
    df['CJ_Aneel'] = df['Circuito'].astype(str).str[:3].map(DE_PARA_CJ_ANEEL).fillna("Desconhecido")
    df["substacao_conjunto"] = df['Circuito'].astype(str).str[:3].fillna("Desconhecido") + " - " + df['Conjunto'].astype(str).fillna("Desconhecido")
    
    # --- 3.2. PROCV DO INDICADOR DE CONTINUIDADE (CRITICIDADE E RANKING) ---
    # Lê a planilha externa da rede e verifica quais conjuntos estão próximos da violação (Limite ANEEL)
    if os.path.exists(CAMINHO_INDICADOR_CONTINUIDADE): 
        df_hierarquia = pd.read_excel(CAMINHO_INDICADOR_CONTINUIDADE)
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
    CAMINHO_BASE_IW28 = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Gerada_base_IW28.XLSX"
    CAMINHO_CUSTO_ORD_IW38 = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Gerada_custo_ord_IW38.XLSX"
    
    df['Centro_Responsavel_Banco'] = df['Centro_Responsavel'].fillna("-")
    
    if os.path.exists(CAMINHO_BASE_IW28): 
        try:
            colunas_esperadas = ['Nota', 'Status usuário', 'CenTrabalho princ.', 'Ordem', 'Encerram.por data']
            df_sap = pd.read_excel(CAMINHO_BASE_IW28, usecols=lambda c: c in colunas_esperadas)
            df_sap['Nota'] = df_sap['Nota'].dropna().astype(int).astype(str).str.strip()
            
            dicionario_status_sap = dict(zip(df_sap['Nota'], df_sap['Status usuário']))
            df['Export_status'] = df['Numero_Nota'].astype(str).str.strip().map(dicionario_status_sap).fillna("Fora SAP")
            
            dicionario_centro_sap = dict(zip(df_sap['Nota'], df_sap['CenTrabalho princ.']))
            df['Centro_SAP'] = df['Numero_Nota'].astype(str).str.strip().map(dicionario_centro_sap)

            # Identifica a qual Ordem aquela Nota pertence para podermos cruzar com o financeiro (IW38)
            df_sap['Ordem_Texto'] = pd.to_numeric(df_sap['Ordem'], errors='coerce').apply(lambda x: str(int(x)) if pd.notna(x) else "Fora SAP")
            
            dicionario_ordem_sap = dict(zip(df_sap['Nota'], df_sap['Ordem_Texto']))
            df['Ordem'] = df['Numero_Nota'].astype(str).str.strip().map(dicionario_ordem_sap).fillna("Fora SAP")
            
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
    df['Status_Usuário_Ordem'] = "-"

    # --- 3.5. PROCV DA QUANTIDADE DE CLIENTES POR CONJUNTO ---
    # Utilizado mais a frente como denominador para calcular o DEC e FEC
    CAMINHO_CLIENTES_CONJUNTO = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Clientes_Conjunto.xlsx"

    if os.path.exists(CAMINHO_CLIENTES_CONJUNTO):
        try:
            col_chave_excel = 'CONJUNTO_DESC'
            col_valor_excel = 'QTDE_CONJUNTO'
            
            df_clientes = pd.read_excel(CAMINHO_CLIENTES_CONJUNTO, usecols=[col_chave_excel, col_valor_excel])
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
    if os.path.exists(CAMINHO_CUSTO_ORD_IW38): 
        try:
            df_ordem = pd.read_excel(CAMINHO_CUSTO_ORD_IW38, usecols = ['Ordem', 'Status usuário', 'Status do sistema', 'Total planejado','Total real'])
            df_ordem['Ordem'] = df_ordem['Ordem'].dropna().astype(int).astype(str).str.strip()
            dicionario_centro_sap = dict(zip(df_ordem['Ordem'], df_ordem['Status usuário']))
            dicionario_status_sistema_sap = dict(zip(df_ordem['Ordem'], df_ordem['Status do sistema']))
            dicionario_total_planejado_ordem = dict(zip(df_ordem['Ordem'], df_ordem['Total planejado']))
            dicionario_total_real_ordem = dict(zip(df_ordem['Ordem'], df_ordem['Total real']))

            if 'Ordem' in df.columns:
                chave_busca_ordem = pd.to_numeric(df['Ordem'], errors='coerce').dropna().astype(int).astype(str).str.strip()
                df.loc[df['Ordem'] != "Fora SAP", 'Status_Usuário_Ordem'] = chave_busca_ordem.map(dicionario_centro_sap).fillna("-")
                df['Status_Usuário_Ordem'] = df['Status_Usuário_Ordem'].fillna("-")

                df.loc[df['Ordem'] != "Fora SAP", 'Status_Sistema'] = chave_busca_ordem.map(dicionario_status_sistema_sap).fillna("-")
                df['Status_Sistema'] = df['Status_Sistema'].fillna("-")

                df.loc[df['Ordem'] != "Fora SAP", 'Total_planejado_ordem']  = chave_busca_ordem.map(dicionario_total_planejado_ordem).fillna("0")
                df['Total_planejado_ordem'] = df['Total_planejado_ordem'].fillna("0")

                df.loc[df['Ordem'] != "Fora SAP", 'Total_real_ordem']  = chave_busca_ordem.map(dicionario_total_real_ordem).fillna("0")
                df['Total_real_ordem'] = df['Total_real_ordem'].fillna("0") 

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
    CAMINHO_CUSTO_MODULAR = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Custo_Modular.xlsx"

    colunas_modulo_9 = ['Modular', 'CHI', 'CI', 'Ocorrencia', 'DEC_PROG_CHI', 'CHI_Sazonal_2025']
    for col in colunas_modulo_9: df[col] = 0.0

    if os.path.exists(CAMINHO_CUSTO_MODULAR):
        try:
            df_custo_raw = pd.read_excel(CAMINHO_CUSTO_MODULAR, sheet_name='Modulares')
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
                df_sazonal_excel = pd.read_excel(CAMINHO_CUSTO_MODULAR, sheet_name='Modulares', skiprows=1, nrows=4, usecols="U:AF")
                dict_sazonal = dict(zip(df_sazonal_excel.iloc[0].astype(int), df_sazonal_excel.iloc[3].astype(float)))
            except Exception as e_saz:
                print(f"Sazonalidade não carregada: {e_saz}")

            if 'Conjunto' in df.columns:
                chave_busca = df['Conjunto'].astype(str).str.strip().str.upper()
                quantidade_g2 = pd.to_numeric(df['Planejado_DDPM'], errors='coerce').fillna(0.0)
                
                # A quantidade planejada atua como multiplicador das métricas unitárias
                df['Modular'] = chave_busca.map(dict_custo).fillna(0.0)
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
    # DEC = Duração das interrupções / Nº de Clientes. FEC = Frequência / Nº de Clientes
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
    # Avaliação de Ganhos utilizando duas colunas como chave (Conjunto + Circuito Aneel)
    CAMINHO_GANHOS = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Ganhos.xlsx"
    df['CHI_Conj'] = 0.0

    if os.path.exists(CAMINHO_GANHOS):
        try:
            df_ganhos = pd.read_excel(CAMINHO_GANHOS, sheet_name='Ganhos')
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
    CAMINHO_TABLE1 = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Table1.xlsx"
    for col in ['CI_12M', 'CHI_12M', 'OCO_12M', 'OCO_3M']: df[col] = "-"

    if os.path.exists(CAMINHO_TABLE1):
        try:
            df_t1 = pd.read_excel(CAMINHO_TABLE1)
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
    # O código da topologia está embutido (escondido) dentro do nome do Local de Instalação.
    col_f = 'Local_Instalacao' 
    local_limpo = df[col_f].astype(str).str.strip().str.upper()
    # Fatia (slicing) a string do Local Instalação para montar o código-chave de busca
    parte1 = local_limpo.str[0:3].str.strip()
    parte2 = local_limpo.str[4:6].str.strip()
    parte3 = local_limpo.str[7:17].str.strip() 
    chave_protecao = parte1 + parte2 + parte3 + "9"
    equipamento_protecao_direto = parte2.isin(['RL', 'BR', 'BF', 'DJ'])

    # Atribui diretamente a chave extraída se for um equipamento de proteção, caso contrário "-"
    df['Equipamento_Protecao'] = np.where(equipamento_protecao_direto, chave_protecao, "-")

    return df

def gerar_copia_excel_rede():
    """
    Puxa a base mais recente do SQLite, executa todos os cruzamentos
    e cálculos de Engenharia (DEC, FEC, CHI, Topologia) e gera um arquivo
    Excel atualizado na rede para alimentar as planilhas laterais.
    """
    # 1. Puxa os dados atualizados com todos os cálculos automáticos prontos
    df_fresco = puxar_dados_completos_da_rede()
    
    # Filtra e renomeia as colunas para o mesmo padrão amigável do painel
    colunas_exportar = [
        "Regional", "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao",
        "Planejado_DDPM", "Mes_Execucao_Planejado", "Data_Envio_Projeto","Centro_Responsavel",
        "Prioridade_Nota", "Status_Nota","Cidade", "Observacao",  "CJ_Aneel", 
        "substacao_conjunto", "Conj.critico", "ranking", "Check", "Export_status", "Status_Final", "Status_Anterior", "Check_Cancelado",
        "Ordem", "Status_Usuário_Ordem", "Status_Sistema", "Total_planejado_ordem", "Total_real_ordem", "Exec_percentagem_ordem", "Ordem_Executada", "Modular",
        "Total_planejado_modular", "Regional_CSD", "N_Clientes_Conjunto", "CHI", "CI", "Ocorrencia", "DEC", "FEC", "CHI_Conj", "Equipamento_Protecao", "DEC_PROG_CHI"
    ]
    colunas_exportar = [col for col in colunas_exportar if col in df_fresco.columns]
    df_export = df_fresco[colunas_exportar].copy()
    
    mapa_nomes = {v: k for k, v in MAP_FILTROS.items()}
    mapa_nomes.update({
        "Numero_Nota": "Nº Nota (ID)",
        "Status_Nota": "Status Nota",
        "Prioridade_Nota": "Prioridade Nota",
        "Status_Obra": "Status Obra",
        "Planejado_DDPM": "Planejado",
        "Local_Instalacao": "Local Instalação",
        "Mes_Execucao_Planejado": "Mês Execução Planejado",
        "substacao_conjunto": "Subestação Conj",
        "CJ_Aneel": "Cj. Aneel",
        "Check": "Check",
        "Observacao": "Observação",
        "Centro_Responsavel": "Centro de Trabalho Responsável",
        "Total_planejado_ordem": "Total Planejado Ordem (R$)",
        "Total_real_ordem": "Total Real Ordem (R$)",
        "Modular": "Modular (R$)"
    })
    df_export = df_export.rename(columns=mapa_nomes)

    # 2. Defina o caminho onde as planilhas laterais vão buscar a informação
    # (Pode alterar o nome do arquivo final 'Base_Notas_Sincronizada.xlsx' se preferir)
    caminho_destino_excel = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Base_Notas_Sincronizada.xlsx"
    
    # 3. Salva na rede de forma limpa usando o openpyxl (que já está no seu venv)
    df_export.to_excel(caminho_destino_excel, index=False)
