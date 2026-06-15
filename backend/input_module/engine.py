"""Motor de enriquecimento de dados do módulo Input.

Porte de Input/processamento.py (função ``puxar_dados_completos_da_rede``
renomeada para ``enriquecer_dados``) e da auditoria ``avaliar_prazo_sap``
(Input/app.py). Sem dependência de Streamlit.

Diferenças relevantes em relação ao porte original:
- Caminhos de rede lidos de ``config`` em TEMPO DE CHAMADA (``config.CAMINHO_*``),
  para que o monkeypatch dos testes tenha efeito.
- ``st.error(...)`` vira ``print(...)``.
- Cache em memória com TTL e lock, ``status_bases`` e ``gerar_copia_excel_rede``
  (que nunca derruba a request: corpo inteiro em try/except).
"""
import datetime
import os
import re
import threading
import time

import numpy as np
import pandas as pd

from input_module import config
from input_module.db import carregar_dados, carregar_projeto_construcao


meses_pt_rev = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "maio": 5, "jun": 6,
                "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}


# --- FUNÇÃO DE REGRA DE NEGÓCIO: CONJUNTO CRÍTICO ---
# Avalia a criticidade do conjunto com base no Delta do Indicador (12 meses)
def regra_conjunto_critico(valor):
    if pd.isna(valor): return "-"
    elif valor > -0.5: return "Violado"
    elif valor == -0.5: return "Crítico"
    else: return 'Dentro'


# ====================================================================
# AUDITORIA CRONOLÓGICA (DDPM vs SAP) — porte de Input/app.py:925
# ====================================================================
def avaliar_prazo_sap(row):
    try:
        status_final = str(row.get('Status_Final', ''))
        # Reconciliação: o engine produz Status_Final = Export_status (status SAP).
        # O indicador "Encerrado (99)" da lógica original referia-se ao status da
        # nota; usamos também Status_Nota para detectar o 99 de forma robusta.
        status_nota = str(row.get('Status_Nota', ''))
        ordem_executada = str(row.get('Ordem_Executada', 'NÃO')).strip().upper()
        is_99 = ('99' in status_final) or ('99' in status_nota)

        # 1. TRATAMENTO ULTRA-ROBUSTO DO PLANEJADO (DDPM)
        val_plan = str(row.get('Mes_Execucao_Planejado', '')).strip()
        mes_planejado, ano_planejado = None, None

        if val_plan not in ["", "-", "None", "nan"]:
            # Testa se o Pandas autoconverteu o planejamento para data completa (Ex: 2024-02-01 00:00:00)
            match_iso = re.match(r'^(\d{4})[-/](\d{2})[-/](\d{2})', val_plan)
            if match_iso:
                ano_planejado = int(match_iso.group(1))
                mes_planejado = int(match_iso.group(2))
            elif '-' in val_plan:
                partes = val_plan.split('-')
                if partes[0].lower() in meses_pt_rev:
                    mes_planejado = meses_pt_rev[partes[0].lower()]
                    ano_planejado = int(partes[1])
                    if ano_planejado < 100: ano_planejado += 2000
                elif partes[1].lower() in meses_pt_rev:
                    mes_planejado = meses_pt_rev[partes[1].lower()]
                    ano_planejado = int(partes[0])
                    if ano_planejado < 100: ano_planejado += 2000

        hoje = datetime.datetime.now()

        # --- NOVA REGRA 1: PASSÍVEL DE ENCERRAMENTO ---
        # Notas com Ordem_Executada == 'SIM' que não possuem status 99
        if not is_99 and ordem_executada == 'SIM':
            return "⚠️ Passível de Encerramento"

        if not mes_planejado or not ano_planejado:
            if is_99: return "⚠️ Sem Mês Planejado Válido"
            return "⚪ Sem Planejamento"

        # REGRA: Realizada Fora do Plano (Mês Planejado > Atual)
        if ano_planejado > hoje.year:
            return "🟣 Fora do Plano"

        # --- NOVA REGRA 2: NOTAS NÃO ENCERRADAS (AVALIAÇÃO DE ATRASO) ---
        if not is_99:
            if (ano_planejado < hoje.year) or (ano_planejado == hoje.year and mes_planejado < hoje.month):
                return "🔴 Com Atraso"
            else:
                return "⚪ Em Andamento (No Prazo)"

        # 2. TRATAMENTO DO REALIZADO (SAP - Ex: 2024-02-21 00:00:00)
        val_real = row.get('Encerram.por data', '-')
        if pd.isna(val_real) or str(val_real).strip() in ["", "-", "None", "nan"]:
            return "⏳Sem Data SAP"

        dt_real = pd.to_datetime(val_real, errors='coerce')
        if pd.isna(dt_real):
            return "⚠️ Data SAP Inválida"

        mes_real = dt_real.month
        ano_real = dt_real.year

        # 3. COMPARAÇÃO MATEMÁTICA DO DESVIO
        if ano_real < ano_planejado or (ano_real == ano_planejado and mes_real < mes_planejado):
            return "🟢 Adiantado"
        elif ano_real == ano_planejado and mes_real == mes_planejado:
            return "🔵 No Prazo"
        else:
            return "🔴 Com Atraso"
    except:
        return "⚠️ Erro na Análise"


# ====================================================================
# MOTOR DE DADOS (Carregamento e Cruzamentos)
# ====================================================================
def enriquecer_dados():
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
    df['Cidade'] = df['Local_Instalacao'].astype(str).str[:3].map(config.DE_PARA_CIDADES).fillna("Desconhecido")
    df['CJ_Aneel'] = df['Circuito'].astype(str).str[:3].map(config.DE_PARA_CJ_ANEEL).fillna("Desconhecido")
    df["substacao_conjunto"] = df['Circuito'].astype(str).str[:3].fillna("Desconhecido") + " - " + df['Conjunto'].astype(str).fillna("Desconhecido")

    # --- 3.2. PROCV DO INDICADOR DE CONTINUIDADE (CRITICIDADE E RANKING) ---
    # Lê a planilha externa da rede e verifica quais conjuntos estão próximos da violação (Limite ANEEL)
    if os.path.exists(config.CAMINHO_INDICADOR_CONTINUIDADE):
        df_hierarquia = pd.read_excel(config.CAMINHO_INDICADOR_CONTINUIDADE)
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
    df['Regional_CSD'] = chave_busca_regional.map(config.MAP_REGIONAL_CSD).fillna("-")

    # --- 3.4. INTEGRAÇÃO SAP: EXTRAÇÃO IW28 (STATUS E DATAS REAIS) ---
    # Puxa os dados gerados pelo Robô RPA para atualizar o status final e data de encerramento da nota
    df['Centro_Responsavel_Banco'] = df['Centro_Responsavel'].fillna("-")

    if os.path.exists(config.CAMINHO_BASE_IW28):
        try:
            colunas_esperadas = ['Nota', 'Status usuário', 'CenTrabalho princ.', 'Ordem', 'Encerram.por data']
            df_sap = pd.read_excel(config.CAMINHO_BASE_IW28, usecols=lambda c: c in colunas_esperadas)
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
    if os.path.exists(config.CAMINHO_CLIENTES_CONJUNTO):
        try:
            col_chave_excel = 'CONJUNTO_DESC'
            col_valor_excel = 'QTDE_CONJUNTO'

            df_clientes = pd.read_excel(config.CAMINHO_CLIENTES_CONJUNTO, usecols=[col_chave_excel, col_valor_excel])
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
    if os.path.exists(config.CAMINHO_CUSTO_ORD_IW38):
        try:
            df_ordem = pd.read_excel(config.CAMINHO_CUSTO_ORD_IW38, usecols = ['Ordem', 'Status usuário', 'Status do sistema', 'Total planejado','Total real'])
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
                df['Ordem_Executada'] = df['Status_Usuário_Ordem'].map(config.MAP_ORDEM_EXECUTADA).fillna("NÃO")

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
    colunas_modulo_9 = ['Modular', 'CHI', 'CI', 'Ocorrencia', 'DEC_PROG_CHI', 'CHI_Sazonal_2025']
    for col in colunas_modulo_9: df[col] = 0.0

    if os.path.exists(config.CAMINHO_CUSTO_MODULAR):
        try:
            df_custo_raw = pd.read_excel(config.CAMINHO_CUSTO_MODULAR, sheet_name='Modulares')
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
                df_sazonal_excel = pd.read_excel(config.CAMINHO_CUSTO_MODULAR, sheet_name='Modulares', skiprows=1, nrows=4, usecols="U:AF")
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
            print(f"Erro Crítico no Bloco 9 (Modulares): {e}")

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
    df['CHI_Conj'] = 0.0

    if os.path.exists(config.CAMINHO_GANHOS):
        try:
            df_ganhos = pd.read_excel(config.CAMINHO_GANHOS, sheet_name='Ganhos')
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
            print(f"Erro ao ler planilha de Ganhos: {e}")

    # --- 3.10. PROCV HISTÓRICOS: 12 MESES E 3 MESES ---
    for col in ['CI_12M', 'CHI_12M', 'OCO_12M', 'OCO_3M']: df[col] = "-"

    if os.path.exists(config.CAMINHO_TABLE1):
        try:
            df_t1 = pd.read_excel(config.CAMINHO_TABLE1)
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

    df["Auditoria_Cronograma"] = df.apply(avaliar_prazo_sap, axis=1)
    return df


# ====================================================================
# CACHE EM MEMÓRIA (TTL + lock) E METADADOS DAS BASES
# ====================================================================
_CACHE_TTL_SEGUNDOS = 600
_cache = {"df": None, "quando": 0.0}
_cache_lock = threading.Lock()


def get_dataset(forcar: bool = False) -> pd.DataFrame:
    with _cache_lock:
        expirado = time.time() - _cache["quando"] > _CACHE_TTL_SEGUNDOS
        if forcar or _cache["df"] is None or expirado:
            _cache["df"] = enriquecer_dados()
            _cache["quando"] = time.time()
        return _cache["df"]


def invalidar_cache() -> None:
    with _cache_lock:
        _cache["df"] = None


def status_bases() -> list:
    bases = []
    for nome, caminho in config.BASES_REDE.items():
        existe = os.path.exists(caminho)
        bases.append({
            "nome": nome,
            "arquivo": os.path.basename(caminho),
            "encontrada": existe,
            "modificada": datetime.datetime.fromtimestamp(
                os.path.getmtime(caminho)).isoformat() if existe else None,
        })
    return bases


# ====================================================================
# CÓPIA EXCEL NA REDE — porte de Input/processamento.py:387
# (nunca derruba a request: corpo inteiro em try/except)
# ====================================================================
def gerar_copia_excel_rede():
    """Puxa a base mais recente, executa todos os cruzamentos e gera o Excel
    sincronizado na rede para alimentar as planilhas laterais.

    Toda a lógica está protegida por try/except: se a rede estiver indisponível
    o erro é apenas registrado, sem derrubar a request que disparou a tarefa.
    """
    try:
        # 1. Puxa os dados atualizados com todos os cálculos automáticos prontos
        df_fresco = enriquecer_dados()

        # Filtra e renomeia as colunas para o mesmo padrão amigável do painel
        colunas_exportar = [col for col in config.COLUNAS_PAINEL if col in df_fresco.columns]
        df_export = df_fresco[colunas_exportar].copy()
        df_export = df_export.rename(columns=config.NOMES_AMIGAVEIS)

        # 2. Salva na rede de forma limpa usando o openpyxl
        df_export.to_excel(config.CAMINHO_COPIA_EXCEL, index=False)
    except Exception as e:
        print(f"Erro ao gerar cópia Excel na rede: {e}")
