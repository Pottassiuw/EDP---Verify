import streamlit as st
import pandas as pd
import streamlit.components.v1 as components
import re
import datetime
import os
import threading
import io
import plotly.express as px
import time
import glob
from streamlit_autorefresh import st_autorefresh

from config import (
    STATUS_MAP, config_colunas_secundarias, 
    MAP_FILTROS,
    DE_PARA_CIDADES, DE_PARA_REGIONAL
)

from database import (
    inicializar_banco, salvar_em_massa, 
    carregar_responsaveis, salvar_responsaveis, 
    salvar_projeto_construcao, carregar_projeto_construcao, salvar_log_alteracoes, carregar_logs,
    deletar_notas, reverter_ultima_alteracao, obter_data_ultima_alteracao,
    salvar_log_arquivo, carregar_log_arquivos, obter_caminho_banco
)

# Importação do motor de dados do departamento
from processamento import puxar_dados_completos_da_rede, gerar_copia_excel_rede

# region 1. CONFIGURAÇÃO GERAL DA PÁGINA
# ==============================================================================
st.set_page_config(page_title="Gestão de Notas EDP", layout="wide", initial_sidebar_state="collapsed")

# --- ATUALIZAÇÃO AUTOMÁTICA (Auto-Refresh) ---
# Força a tela a recarregar silenciosamente a cada 10 minutos (600.000 milissegundos)
st_autorefresh(interval=600000, limit=None, key="data_autorefresh")

st.markdown("""
    <style>
        .block-container { padding-bottom: 1rem !important; padding-top: 2rem !important; max-width: 95% !important; padding-left: 1rem !important; padding-right: 1rem !important; }
        [data-testid="stDataFrame"] th { text-align: center !important; }
        [data-testid="stDataFrame"] th > div { justify-content: center !important; }
    </style>
""", unsafe_allow_html=True)
# endregion

# region 2. VARIÁVEIS E FUNÇÕES GLOBAIS DE INTERFACE
# ==============================================================================
ano_atual = datetime.datetime.now().year
meses_pt_rev = {'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'maio': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12}

def ordenar_datas(val):
    try:
        mes_str, ano_str = str(val).split('-')
        mes_num, ano_num = meses_pt_rev.get(mes_str.lower(), 99), int(ano_str)
        return (1, ano_num, mes_num) if ano_num > ano_atual else (0, -ano_num, mes_num) 
    except:
        return (2, 0, 0) 

@st.cache_data
def to_excel(df, colunas_exportar):
    # 1. Filtra apenas as colunas que estão visíveis na tela no momento
    df_export = df[colunas_exportar].copy()
    
    # 2. Resgata os nomes amigáveis baseados na pesquisa global e adiciona as exceções
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
    
    # 3. Renomeia as colunas do arquivo final
    df_export = df_export.rename(columns=mapa_nomes)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name='Selecao_Filtrada')
    processed_data = output.getvalue()
    return processed_data

# endregion

# region 3. CARREGAMENTO DOS DADOS (Chamando o Backend)
# ====================================================================
@st.cache_resource
def setup_banco_uma_vez():
    inicializar_banco()

setup_banco_uma_vez()

@st.cache_data
def carregar_base_pronta():
    return puxar_dados_completos_da_rede()

df_base = carregar_base_pronta()

# --- SISTEMA DE NOTIFICAÇÃO (SINCRONIZAÇÃO DE USUÁRIOS) ---
timestamp_banco_agora = obter_data_ultima_alteracao()
if "timestamp_sessao" not in st.session_state:
    st.session_state.timestamp_sessao = timestamp_banco_agora

if timestamp_banco_agora and st.session_state.timestamp_sessao and timestamp_banco_agora != st.session_state.timestamp_sessao:
    st.session_state.aviso_sincronizacao = True
    st.session_state.timestamp_sessao = timestamp_banco_agora

if st.session_state.get("aviso_sincronizacao", False):
    col_aviso, col_fechar = st.columns([9, 1])
    with col_aviso:
        st.info("**Sincronização automática:** Os dados foram atualizados por outro usuário e sua tela foi recarregada com a versão mais recente!")
    with col_fechar:
        if st.button("Fechar", key="btn_fechar_aviso"):
            st.session_state.aviso_sincronizacao = False
            st.rerun()
# endregion

# region 4. BARRA LATERAL (Filtro Global e Controles)
# ==============================================================================
st.sidebar.header("Pesquisa Global")
busca_nota = st.sidebar.text_input("Buscar Notas:", placeholder="Ex: 12345, 54321; 12345 1010")

if busca_nota:
    lista_busca = [int(n.strip()) for n in re.split(r'[ ,;]+', busca_nota.strip()) if n.strip().isdigit()]
    if lista_busca:
        df_filtrado = df_base[df_base['Numero_Nota'].isin(lista_busca)]
    else:
        df_filtrado = pd.DataFrame(columns=df_base.columns) 
else:
    df_filtrado = df_base.copy()

st.sidebar.markdown("---")
if st.sidebar.button("Encerrar Sessão"):
    components.html("""
        <script>
        var corpo = window.parent.document.body;
        corpo.innerHTML = "<div style='display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;'><h1 style='color:#FF4B4B;'>Sessão Encerrada</h1><p>Obrigado por usar o sistema de gestão de notas da EDP!</p></div>";
        setTimeout(function(){ window.parent.location.reload(); }, 1000);
        </script>
    """, height=0, width=0)
# endregion

# region 5. FRONTEND PRINCIPAL (Cabeçalho e Abas)
# ==============================================================================
config_colunas_total = {
    "ID_Cronologia": st.column_config.NumberColumn("Linha Orig.", disabled=True, format="%d"),
    "Status_Nota": st.column_config.SelectboxColumn("Status Nota", options=list(STATUS_MAP.values()), required=True),
    "Prioridade_Nota": st.column_config.SelectboxColumn("Prioridade Nota", options=["Emergente", "Urgente", "Importante", "Prioritário", "Programável", "Informativo","Protheus","Nota Projetos",], required=True),
    "Planejado_DDPM": st.column_config.NumberColumn("Planejado: ", format="%.2f"),
    "Numero_Nota": st.column_config.NumberColumn("Nº Nota (ID)", required=True, format="%d"),
    "Observacao": st.column_config.TextColumn("Observação", width="medium"),
    "Status_Obra": st.column_config.TextColumn("Status Obra"),
    "Local_Instalacao": st.column_config.TextColumn("Local Instalação"),
    "Mes_Execucao_Planejado": st.column_config.TextColumn("Mês Execução Planejado"),
    "Data_Envio_Projeto": st.column_config.TextColumn("Data Envio Projeto"),
    "substacao_conjunto": st.column_config.TextColumn("Subestação Conj"),
    "Check": st.column_config.TextColumn("Check"),
    **config_colunas_secundarias
}
colunas_para_exibir = [
    "Regional", "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao",
    "Planejado_DDPM", "Mes_Execucao_Planejado", "Data_Envio_Projeto","Centro_Responsavel",
    "Prioridade_Nota", "Status_Nota","Cidade", "Observacao",  "CJ_Aneel", 
    "substacao_conjunto", "Conj.critico", "ranking", "Check", "Export_status", "Status_Final", "Status_Anterior", "Check_Cancelado",
    "Ordem", "Status_Usuário_Ordem", "Status_Sistema", "Total_planejado_ordem", "Total_real_ordem", "Exec_percentagem_ordem", "Ordem_Executada", "Modular",
    "Total_planejado_modular", "Regional_CSD", "N_Clientes_Conjunto", "CHI", "CI", "Ocorrencia", "DEC", "FEC","CHI_Conjunto","Equipamento_Protecao", "DEC_Prog_CHI"
]
colunas_para_exibir = [col for col in colunas_para_exibir if col in df_base.columns]

aba_visualizacao, aba_gerenciamento, aba_relatorios, aba_logs, aba_configuracao = st.tabs(["Visualização (Leitura)", "Gerenciar Notas", "Relatórios", "Log de Alterações", "Configurações"])

# --- 5.1. ABA 1: VISUALIZAÇÃO ---
with aba_visualizacao:
    st.subheader("Gestão de Notas (INPUT)")
    
    indicador_total_registros = st.empty()
    st.divider()

    if "reset_key_vis" not in st.session_state:
        st.session_state.reset_key_vis = 0

    # --- BARRA DE FERRAMENTAS OVERLAY ---
    col_pop_fa, col_pop_calc, col_pop_limpar, _ = st.columns([4, 4, 4, 4])

    with col_pop_calc:
        with st.popover("📊 Calculadora", use_container_width=True):
            colunas_calculaveis = {
                "Planejado DDPM": "Planejado_DDPM", "Total Planejado Ordem": "Total_planejado_ordem",
                "Total Real Ordem": "Total_real_ordem", "Total Planejado Modular": "Total_planejado_modular",
                "Nº Clientes Conjunto": "N_Clientes_Conjunto", "CHI": "CHI", "CIH": "CI",
                "Ocorrências": "Ocorrencia", "DEC": "DEC", "FEC": "FEC"
            }
            opcoes_disp = {k: v for k, v in colunas_calculaveis.items() if v in df_filtrado.columns}
            cols_selecionadas = st.multiselect("Somar e calcular médias:", options=list(opcoes_disp.keys()), key="calc_vis")

    df_vis_base = df_filtrado.copy()

    dict_filtros_selecionados = {}
    with col_pop_fa:
        with st.popover("🔎 Filtros Avançados", use_container_width=True):
            filtros_ativos = st.multiselect("Campos de filtro:", options=list(MAP_FILTROS.keys()), default=["Status", "Regional", "Mês Execução","Local Instalação"])
            st.divider()
            
            filtros_texto = ["Nº Nota", "Local Instalação", "Observação", "Ordem", "DIS Proteção", "Centro Responsável"]
            lista_numericos = ["Planejado", "Ranking", "Total Planejado Ordem", "Total Real Ordem", "Exec %", "Total Planejado Modular", "Nº Clientes Conjunto", "CHI", "CIH", "Ocorrências", "DEC", "FEC", "CHI Conjunto", "DEC Prog. CHI"]
            
            for nome_filtro in filtros_ativos:
                coluna_df = MAP_FILTROS[nome_filtro]
                if nome_filtro in filtros_texto:
                    dict_filtros_selecionados[coluna_df] = st.text_input(f"{nome_filtro}:", placeholder="Digite...", key=f"vis_txt_{nome_filtro}_{st.session_state.reset_key_vis}")
                elif nome_filtro == "Mês Execução":
                    opcoes = sorted(df_vis_base[coluna_df].astype(str).unique(), key=ordenar_datas)
                    dict_filtros_selecionados[coluna_df] = st.multiselect(f"{nome_filtro}:", options=opcoes, key=f"vis_sel_{nome_filtro}_{st.session_state.reset_key_vis}")
                elif nome_filtro in lista_numericos:
                    df_num = pd.to_numeric(df_vis_base[coluna_df], errors='coerce').dropna()
                    min_val = float(df_num.min()) if not df_num.empty else 0.0
                    max_val = float(df_num.max()) if not df_num.empty else 100.0
                    if min_val == max_val: max_val = min_val + 1.0 
                    st.markdown(f"**{nome_filtro} (Min - Max):**")
                    col_min, col_max = st.columns(2)
                    with col_min: val_min = st.number_input(f"Min {nome_filtro}", value=min_val, label_visibility="collapsed", key=f"num_min_{nome_filtro}_{st.session_state.reset_key_vis}")
                    with col_max: val_max = st.number_input(f"Max {nome_filtro}", value=max_val, label_visibility="collapsed", key=f"num_max_{nome_filtro}_{st.session_state.reset_key_vis}")
                    dict_filtros_selecionados[coluna_df] = (val_min, val_max)
                else:
                    opcoes = sorted(df_vis_base[coluna_df].dropna().astype(str).unique())
                    dict_filtros_selecionados[coluna_df] = st.multiselect(f"{nome_filtro}:", options=opcoes, key=f"vis_sel_{nome_filtro}_{st.session_state.reset_key_vis}")

    with col_pop_limpar:
        if st.button("🧹 Limpar Filtros", use_container_width=True):
            st.session_state.reset_key_vis += 1
            st.rerun()

    calculadora_resultados_placeholder = st.container()

    # --- MOTOR DE FILTRAGEM DINÂMICA ---
    df_vis = df_vis_base.copy()
    for col_nome, valores_selecionados in dict_filtros_selecionados.items():
        if valores_selecionados:
            # Filtro Numérico (Range Min-Max)
            if isinstance(valores_selecionados, tuple) and len(valores_selecionados) == 2:
                df_vis['temp_num'] = pd.to_numeric(df_vis[col_nome], errors='coerce')
                df_vis = df_vis[(df_vis['temp_num'] >= valores_selecionados[0]) & (df_vis['temp_num'] <= valores_selecionados[1])]
                df_vis = df_vis.drop(columns=['temp_num'])
            # Filtro de Seleção Múltipla (Lista exata)
            elif isinstance(valores_selecionados, list) and len(valores_selecionados) > 0:
                df_vis = df_vis[df_vis[col_nome].astype(str).isin(valores_selecionados)]
            # Filtro de Texto (Busca parcial / LIKE)
            elif isinstance(valores_selecionados, str) and valores_selecionados.strip() != "":
                termo_busca = valores_selecionados.strip().upper()
                df_vis = df_vis[df_vis[col_nome].astype(str).str.upper().str.contains(termo_busca, na=False)]

    indicador_total_registros.text(f"Total de registros: {len(df_vis)}")

    # --- ALIMENTANDO O RESULTADO DA CALCULADORA DA BARRA LATERAL ---
    if cols_selecionadas:
        num_linhas = len(df_vis)

        if num_linhas > 0:
            with calculadora_resultados_placeholder:
                st.markdown("#### Resultados da Calculadora")
                cols_por_linha = 8
                for i in range(0, len(cols_selecionadas), cols_por_linha):
                    cols_layout = st.columns(cols_por_linha)
                    for j, nome_amigavel in enumerate(cols_selecionadas[i:i+cols_por_linha]):
                        with cols_layout[j]:
                            coluna_real = opcoes_disp[nome_amigavel]
                            serie_numerica = pd.to_numeric(df_vis[coluna_real], errors='coerce')
                            
                            soma_coluna = serie_numerica.sum()
                            media_coluna = serie_numerica.mean()
                            contagem_coluna = serie_numerica.count()
                            
                            st.info(f"**{nome_amigavel}**\n- Soma: `{soma_coluna:,.2f}`\n- Média: `{media_coluna:,.2f}`\n- Contagem: `{contagem_coluna}`")

    st.dataframe(df_vis, column_config=config_colunas_total, column_order=colunas_para_exibir, use_container_width=True, hide_index=True, height=500)
    
    col_btn_download, _ = st.columns([2,6])
    with col_btn_download:
        if not df_vis.empty:
            with st.expander("Exportar para Excel", expanded=False):
                # Cria uma "assinatura" do estado atual dos filtros (Qtd linhas + Soma dos IDs)
                # Isso impede que o usuário baixe um Excel desatualizado se ele mudar os filtros depois de gerar
                estado_filtro = f"{len(df_vis)}_{df_vis['Numero_Nota'].sum() if 'Numero_Nota' in df_vis.columns else 0}"
                
                if st.button("1. Preparar Arquivo", use_container_width=True):
                    with st.spinner("Processando planilha pesada..."):
                        st.session_state['excel_data'] = to_excel(df_vis, colunas_para_exibir)
                        st.session_state['estado_planilha'] = estado_filtro
                
                # Só exibe o download se o Excel pronto pertencer aos filtros atuais da tela
                if st.session_state.get('excel_data') is not None and st.session_state.get('estado_planilha') == estado_filtro:
                    st.download_button(
                        label="2. Baixar Planilha",
                        data=st.session_state['excel_data'],
                        file_name=f"export_notas_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        use_container_width=True
                    )
# endregion

# --- FUNÇÃO MODAL DE CONFIRMAÇÃO ---
@st.dialog("ATENÇÃO: CONFIRMAÇÃO DE REVERSÃO")
def modal_confirmacao_reversao():
    st.markdown("#### Você está prestes a desfazer a última alteração salva no banco de dados.")
    st.markdown("Tem certeza que deseja continuar?")
    col_conf_sim, col_conf_nao = st.columns(2)
    with col_conf_sim:
        if st.button("Sim, Desfazer Ação", type="primary", use_container_width=True):
            with st.spinner("Desfazendo última ação no banco de dados..."):
                sucesso, msg = reverter_ultima_alteracao()
                if sucesso:
                    st.success(msg)
                    tarefa_excel = threading.Thread(target=gerar_copia_excel_rede); tarefa_excel.start()
                else:
                    st.warning(msg)
            st.session_state.reset_key_editor += 1
            st.session_state.aguardando_confirmacao_reversao = False
            st.cache_data.clear()
            st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
            time.sleep(3.5)
            st.rerun()
    with col_conf_nao:
        if st.button("Cancelar", use_container_width=True):
            st.session_state.aguardando_confirmacao_reversao = False
            st.rerun()

# --- 5.2. ABA 2: GERENCIAMENTO ---
with aba_gerenciamento:
    st.subheader("Gestão de Notas (INPUT)")
    st.text("Total de registros: " + str(len(df_vis)))
    st.divider()
    
    sub_editar, sub_inserir_unica, sub_inserir_massa = st.tabs(["Editar Notas Existentes", "Cadastrar Nova Nota", "Colar Planilha (Massa)"])
    
    with sub_editar:
        if "reset_key_editor" not in st.session_state:
            st.session_state.reset_key_editor = 0
            
        st.write("Altere os dados diretamente na tabela abaixo.")
        st.write("Não é possivel alterar os IDs das notas (Nº Nota) para evitar inconsistências. Para criar uma nova nota, utilize a aba 'Cadastrar Nova Nota'.")

        modo_operacao = st.radio(
            "Modo de Operação:",
            ("Edição Rápida", "Edição em Lote", "Exclusão de Notas"),
            horizontal=True,
            key="modo_operacao_editor"
        )

        df_para_editar = df_vis.copy()
        config_editor = {
            **config_colunas_total,
            "Numero_Nota": st.column_config.NumberColumn("Nº Nota (ID)", disabled=True, format="%d"),
            "Conjunto": st.column_config.TextColumn("Conjunto", disabled=False),
            "Local_Instalacao": st.column_config.TextColumn("Local Inst.", disabled=False),
            "Planejado_DDPM": st.column_config.NumberColumn("Planejado", disabled=False, format="%.2f"),
            "Observacao": st.column_config.TextColumn("Observação", width="large"),
        }
        ordem_colunas_editor = colunas_para_exibir

        if modo_operacao == "Exclusão de Notas":
            st.info("Para excluir uma ou mais notas, marque a caixa na coluna 'Excluir' e clique no botão 'Excluir Notas Selecionadas'.")
            if "Excluir" not in df_para_editar.columns:
                df_para_editar.insert(0, "Excluir", False)
            
            config_editor["Excluir"] = st.column_config.CheckboxColumn("Excluir?", help="Marque para excluir a nota ao clicar no botão 'Excluir'", width="small")
            ordem_colunas_editor = ["Excluir"] + colunas_para_exibir
            
        elif modo_operacao == "Edição em Lote":
            st.info("Marque as notas desejadas na coluna 'Selecionar', escolha os novos valores abaixo da tabela e aplique a todas de uma vez.")
            if "Selecionar" not in df_para_editar.columns:
                df_para_editar.insert(0, "Selecionar", False)
            
            config_editor["Selecionar"] = st.column_config.CheckboxColumn("Selecionar", help="Marque para aplicar edição em lote", width="small")
            ordem_colunas_editor = ["Selecionar"] + colunas_para_exibir
        
        with st.form("form_editar"):
            df_editado = st.data_editor(
                df_para_editar, 
                column_config=config_editor, 
                column_order=ordem_colunas_editor,
                num_rows="fixed", 
                use_container_width=True, 
                hide_index=True,
                key=f"editor_principal_notas_{st.session_state.reset_key_editor}"
            )
            
            # Lógica dos botões condicionada ao modo de operação
            botao_salvar = False
            botao_deletar = False
            botao_salvar_lote = False
            
            if modo_operacao == "Exclusão de Notas":
                col_salvar, col_deletar, col_desfazer, col_reverter, _ = st.columns([2, 3, 2, 3, 2])
                with col_salvar:
                    botao_salvar = st.form_submit_button("💾 Salvar Edições", type="primary", use_container_width=True)
                with col_deletar:
                    botao_deletar = st.form_submit_button("🗑️  Excluir Notas Selecionadas", use_container_width=True)
                with col_desfazer:
                    botao_desfazer = st.form_submit_button("❌ Descartar Tudo", use_container_width=True)
                with col_reverter:
                    botao_reverter = st.form_submit_button("📄Reverter Último Salvamento", use_container_width=True)
            elif modo_operacao == "Edição em Lote":
                st.markdown("#### Aplicar Alterações em Lote")
                col_lote1, col_lote2, col_lote3 = st.columns(3)
                with col_lote1:
                    lote_status = st.selectbox("Novo Status:", options=["(Manter Atual)"] + list(STATUS_MAP.values()))
                with col_lote2:
                    lote_prioridade = st.selectbox("Nova Prioridade:", options=["(Manter Atual)", "Emergente", "Urgente", "Importante", "Prioritário", "Programável", "Informativo","Protheus","Nota Projetos"])
                with col_lote3:
                    lote_mes = st.text_input("Novo Mês Execução:", placeholder="Ex: 05-2024", value="(Manter Atual)")
                    
                col_salvar_lote, col_desfazer, col_reverter, _ = st.columns([3, 2, 3, 4])
                with col_salvar_lote:
                    botao_salvar_lote = st.form_submit_button("Aplicar e Salvar Lote", type="primary", use_container_width=True)
                with col_desfazer:
                    botao_desfazer = st.form_submit_button("Descartar Tudo", use_container_width=True)
                with col_reverter:
                    botao_reverter = st.form_submit_button("Reverter Último Salvamento", use_container_width=True)
            else: # Modo Edição Rápida
                col_salvar, col_desfazer, col_reverter, _ = st.columns([2, 2, 3, 5])
                with col_salvar:
                    botao_salvar = st.form_submit_button("💾 Salvar Edições", type="primary", use_container_width=True)
                with col_desfazer:
                    botao_desfazer = st.form_submit_button("❌ Descartar Tudo", use_container_width=True)
                with col_reverter:
                    botao_reverter = st.form_submit_button("📄Reverter Último Salvamento", use_container_width=True)
            
            if botao_desfazer:
                st.session_state.reset_key_editor += 1
                st.rerun()
                
            if botao_reverter:
                st.session_state.aguardando_confirmacao_reversao = True
                
            if botao_deletar:
                notas_a_deletar = df_editado[df_editado["Excluir"] == True]
                if not notas_a_deletar.empty:
                    lista_ids_deletar = notas_a_deletar["Numero_Nota"].tolist()
                    with st.spinner(f"Excluindo {len(lista_ids_deletar)} nota(s) do banco de dados..."):
                        deletar_notas(lista_ids_deletar)
                        tarefa_excel = threading.Thread(target=gerar_copia_excel_rede); tarefa_excel.start()
                    st.success(f"{len(lista_ids_deletar)} nota(s) foram excluídas com sucesso! A base será recarregada.")
                    st.cache_data.clear()
                    st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                    st.session_state.reset_key_editor += 1
                    time.sleep(2)
                    st.rerun()
                else:
                    st.warning("Nenhuma nota foi marcada para exclusão. Marque a caixa na coluna 'Excluir' e tente novamente.")
                    
            if botao_salvar_lote:
                notas_selecionadas = df_editado[df_editado["Selecionar"] == True].copy()
                if notas_selecionadas.empty:
                    st.warning("Nenhuma nota selecionada. Marque as caixas na coluna 'Selecionar'.")
                else:
                    mudou_algo = False
                    if lote_status != "(Manter Atual)":
                        notas_selecionadas['Status_Nota'] = lote_status
                        mudou_algo = True
                    if lote_prioridade != "(Manter Atual)":
                        notas_selecionadas['Prioridade_Nota'] = lote_prioridade
                        mudou_algo = True
                    if lote_mes.strip() != "(Manter Atual)" and lote_mes.strip() != "":
                        notas_selecionadas['Mes_Execucao_Planejado'] = lote_mes.strip()
                        mudou_algo = True

                    if not mudou_algo:
                        st.warning("Você não escolheu nenhum novo valor para aplicar em lote.")
                    else:
                        logs_para_salvar = []
                        try: usuario_logado = os.getlogin()
                        except: usuario_logado = 'Desconhecido'
                        data_hora_log = datetime.datetime.now()

                        colunas_analise = ["Status_Nota", "Prioridade_Nota", "Mes_Execucao_Planejado"]

                        for index, row_alterada in notas_selecionadas.iterrows():
                            numero_nota = row_alterada['Numero_Nota']
                            row_original = df_vis.loc[index]

                            for coluna in colunas_analise:
                                valor_novo_raw = row_alterada.get(coluna)
                                valor_antigo_raw = row_original.get(coluna)

                                valor_novo = str(valor_novo_raw) if pd.notna(valor_novo_raw) else ""
                                valor_antigo = str(valor_antigo_raw) if pd.notna(valor_antigo_raw) else ""

                                if valor_novo.strip() != valor_antigo.strip():
                                    logs_para_salvar.append((
                                        int(numero_nota), usuario_logado, data_hora_log,
                                        coluna, valor_antigo, valor_novo
                                    ))

                        status_original_map = dict(zip(df_base['Numero_Nota'], df_base['Status_Nota']))
                        status_anterior_map = dict(zip(df_base['Numero_Nota'], df_base['Status_Anterior']))

                        def identificar_status_anterior_lote(row):
                            nota = row['Numero_Nota']
                            status_novo = row['Status_Nota']
                            status_antigo_banco = status_original_map.get(nota, status_novo)
                            if status_novo != status_antigo_banco:
                                return status_antigo_banco
                            return status_anterior_map.get(nota, '-')

                        notas_selecionadas['Status_Anterior'] = notas_selecionadas.apply(identificar_status_anterior_lote, axis=1)

                        if 'Local_Instalacao' in notas_selecionadas.columns:
                            notas_selecionadas['Regional'] = notas_selecionadas['Local_Instalacao'].astype(str).str[:3].map(DE_PARA_REGIONAL).fillna("-")

                        if logs_para_salvar:
                            with st.spinner(f"Aplicando lote em {len(notas_selecionadas)} nota(s)..."):
                                salvar_log_alteracoes(logs_para_salvar)
                                salvar_em_massa(notas_selecionadas)
                                threading.Thread(target=gerar_copia_excel_rede).start()

                            st.success(f"Edição em lote concluída! {len(notas_selecionadas)} notas foram atualizadas.")
                            st.cache_data.clear()
                            st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                            st.session_state.reset_key_editor += 1
                            time.sleep(2)
                            st.rerun()
                        else:
                            st.info("Os valores escolhidos são idênticos aos que já estavam nas notas selecionadas.")
            
            if botao_salvar:
                # --- DETECÇÃO DE MUDANÇAS (DIFF) ---
                # Compara os dados originais (df_vis) com os dados recém-editados na tabela (df_editado)
                colunas_analise = ["Status_Nota", "Prioridade_Nota", "Planejado_DDPM", "Observacao", "Status_Obra", "Local_Instalacao", "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Check"]
                colunas_analise = [c for c in colunas_analise if c in df_editado.columns]
                
                # Varre coluna por coluna convertendo para string, evitando falsos positivos de tipagem (ex: 0 vs 0.0)
                mudou = pd.Series(False, index=df_editado.index)
                for col in colunas_analise:
                    s_orig = df_vis[col].fillna("___NULL___").astype(str).str.strip()
                    s_edit = df_editado[col].fillna("___NULL___").astype(str).str.strip()
                    mudou = mudou | (s_orig != s_edit)
                
                # Isola apenas as linhas onde pelo menos uma coluna mudou
                df_apenas_alterados = df_editado[mudou].copy()
                
                if 'Local_Instalacao' in df_apenas_alterados.columns:
                    df_apenas_alterados['Regional'] = df_apenas_alterados['Local_Instalacao'].astype(str).str[:3].map(DE_PARA_REGIONAL).fillna("-")
                
                if not df_apenas_alterados.empty:
                    # --- GERAÇÃO DO LOG DE ALTERAÇÕES ---
                    logs_para_salvar = []
                    usuario_logado = os.getlogin()
                    data_hora_log = datetime.datetime.now()

                    for index, row_alterada in df_apenas_alterados.iterrows():
                        numero_nota = row_alterada['Numero_Nota']
                        # O 'index' do df_editado corresponde ao do df_vis
                        row_original = df_vis.loc[index]

                        for coluna in colunas_analise:
                            valor_novo_raw = row_alterada.get(coluna)
                            valor_antigo_raw = row_original.get(coluna)

                            # Converte para string e trata nulos para uma comparação segura
                            valor_novo = str(valor_novo_raw) if pd.notna(valor_novo_raw) else ""
                            valor_antigo = str(valor_antigo_raw) if pd.notna(valor_antigo_raw) else ""

                            if valor_novo.strip() != valor_antigo.strip():
                                logs_para_salvar.append((
                                    int(numero_nota), usuario_logado, data_hora_log,
                                    coluna, valor_antigo, valor_novo
                                ))

                    # Mapeamento do histórico para controle de Status Anterior
                    status_original_map = dict(zip(df_base['Numero_Nota'], df_base['Status_Nota']))
                    status_anterior_map = dict(zip(df_base['Numero_Nota'], df_base['Status_Anterior']))
                    
                    def identificar_status_anterior(row):
                        nota = row['Numero_Nota']
                        status_novo = row['Status_Nota']
                        status_antigo_banco = status_original_map.get(nota, status_novo)
                        if status_novo != status_antigo_banco: 
                            return status_antigo_banco
                        return status_anterior_map.get(nota, '-')

                    df_apenas_alterados['Status_Anterior'] = df_apenas_alterados.apply(identificar_status_anterior, axis=1)
                    
                    with st.spinner(f"Gravando {len(df_apenas_alterados)} nota(s) e {len(logs_para_salvar)} alterações no Banco... ⏳"):
                        salvar_log_alteracoes(logs_para_salvar)
                        salvar_em_massa(df_apenas_alterados)     
                        
                        # Inicia uma Thread em segundo plano para não travar a tela do usuário
                        # enquanto o Pandas processa e reescreve a planilha Excel na rede da EDP
                        tarefa_excel = threading.Thread(target=gerar_copia_excel_rede)
                        tarefa_excel.start()
                        
                    st.success(f"Sucesso! {len(df_apenas_alterados)} nota(s) atualizada(s). Excel da rede rodando em segundo plano. 🚀")
                else:
                    st.info("Nenhuma alteração detectada nas notas.")
                
                st.cache_data.clear() 
                st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                st.rerun()

        # --- CONFIRMAÇÃO DE REVERSÃO (FORA DO FORMULÁRIO) ---
        if st.session_state.get("aguardando_confirmacao_reversao", False):
            modal_confirmacao_reversao()

    with sub_inserir_unica:
        st.write("Preencha os dados para cadastrar uma nota avulsa no banco.")
        with st.form("form_unica", clear_on_submit=True):
            col1, col2, col3 = st.columns(3)
            with col1:
                novo_id = st.number_input("Nº Nota (ID)*", min_value=1, step=1, format="%d")
                novo_planejado = st.number_input("Planejado DDPM*", min_value=0.0, format="%.2f")
                novo_status = st.selectbox("Status Nota*", options=list(STATUS_MAP.values()))
                novo_status_obra = st.text_input("Status Obra*", placeholder = "-")
                novo_prioridade = st.selectbox("Prioridade Nota*", options=["Emergente", "Urgente", "Importante", "Prioritário", "Programável", "Informativo","Protheus","Nota Projetos"], index=4)

            with col2:
                novo_conjunto = st.text_input("Conjunto*", placeholder = "-")
                novo_circuito = st.text_input("Circuito*", placeholder = "-")
                novo_local = st.text_input("Local Instalação*", placeholder = "-")
            with col3:
                novo_mes = st.text_input("Mês Execução*", placeholder ="-")
                nova_data = st.text_input("Data Envio*", value= datetime.datetime.now().strftime("%d-%m-%Y"), placeholder="DD-MM-AAAA")
            
            with st.expander("Observação e Check"):
                nova_obs = st.text_area("Observação", height=150, placeholder="Digite aqui qualquer informação adicional sobre a nota...", label_visibility="collapsed")
                novo_check = st.text_input("Check*", value="-")
                novo_status_anterior = st.text_input("Status Anterior*", value="-")

            if st.form_submit_button("💾 Salvar Nova Nota", type="primary"):
                # VALIDAÇÃO DE DUPLICIDADE NO BANCO DE DADOS
                if novo_id in df_base['Numero_Nota'].values:
                    st.error(f"A Nota de Nº {novo_id} já existe no banco de dados! Por favor, utilize a aba 'Editar Notas Existentes' para alterá-la.")
                else:
                    max_id_cron = df_base['ID_Cronologia'].max() if not df_base.empty and 'ID_Cronologia' in df_base.columns and df_base['ID_Cronologia'].notna().any() else 0
                    novo_id_cron = int(max_id_cron) + 1

                    nova_regional = DE_PARA_REGIONAL.get(str(novo_local)[:3], "-") if novo_local else "-"

                    nova_linha_df = pd.DataFrame([{
                        "ID_Cronologia": novo_id_cron,
                        "Numero_Nota": novo_id, "Status_Obra": novo_status_obra, "Conjunto": novo_conjunto, 
                        "Circuito": novo_circuito, "Local_Instalacao": novo_local, "Regional": nova_regional,
                        "Planejado_DDPM": novo_planejado, "Mes_Execucao_Planejado": novo_mes,
                        "Data_Envio_Projeto": nova_data, "Status_Nota": novo_status, "Prioridade_Nota": novo_prioridade, 
                        "Observacao": nova_obs, "Check": novo_check, "Status_Anterior": novo_status_anterior,
                        "Centro_Responsavel": "-"
                    }])
                    
                    with st.spinner("Salvando nova nota..."):
                        salvar_em_massa(nova_linha_df)
                        tarefa_excel = threading.Thread(target=gerar_copia_excel_rede)
                        tarefa_excel.start()
                        
                    st.success(f"Nota {novo_id} cadastrada com sucesso!")
                    st.cache_data.clear()
                    st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                    st.rerun()

    with sub_inserir_massa:
        st.info("**Dica de Colagem:** Para colar várias colunas do Excel sem juntar tudo, dê apenas **um clique simples no índice (número da linha)** à esquerda e pressione `Ctrl+V`.")
        st.info("**Para Excluir Linhas:** Selecione a linha clicando no número à esquerda e pressione a tecla `Delete` no seu teclado.")
        
        colunas_essenciais_massa = [
            "Numero_Nota", "Status_Nota", "Prioridade_Nota", "Planejado_DDPM", 
            "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", 
            "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Observacao", 
            "Check"
        ]
        
        if "df_temp_massa" not in st.session_state: st.session_state.df_temp_massa = pd.DataFrame(columns=colunas_essenciais_massa)
        if "reset_key" not in st.session_state: st.session_state.reset_key = 0
        if st.button("Limpar Tabela Inteira"):
            st.session_state.df_temp_massa = pd.DataFrame(columns=colunas_essenciais_massa)
            st.session_state.reset_key += 1
            st.rerun()

        with st.form("form_inserir_massa", clear_on_submit=True):
            df_editavel = st.data_editor(st.session_state.df_temp_massa, column_config=config_colunas_total, column_order=colunas_essenciais_massa, num_rows="dynamic", use_container_width=True, hide_index=False, key=f"editor_massa_{st.session_state.reset_key}")
            botao_salvar = st.form_submit_button("💾 Salvar Lote de Notas", type="primary")

        if botao_salvar:
            if not df_editavel.empty:
                if df_editavel['Numero_Nota'].isnull().any():
                    st.error("Erro: Existem linhas sem o Número da Nota (ID).")
                else:
                    # Verifica duplicidade com o banco de dados
                    notas_existentes = df_base['Numero_Nota'].values
                    duplicadas_banco = df_editavel[df_editavel['Numero_Nota'].isin(notas_existentes)]['Numero_Nota'].astype(int).tolist()
                    
                    # Verifica duplicidade no próprio lote colado
                    duplicadas_lote = df_editavel[df_editavel.duplicated(subset=['Numero_Nota'])]['Numero_Nota'].astype(int).tolist()
                    
                    if duplicadas_lote:
                        st.error(f"Erro: Existem notas duplicadas dentro da própria tabela que você colou: {', '.join(map(str, set(duplicadas_lote)))}. Remova as duplicatas antes de salvar.")
                    elif duplicadas_banco:
                        st.error(f"Erro: As seguintes notas já existem no banco de dados e devem ser alteradas na aba 'Editar Notas Existentes': {', '.join(map(str, duplicadas_banco))}")
                    else:
                        df_inserir = df_editavel.copy()

                        max_id_cron = df_base['ID_Cronologia'].max() if not df_base.empty and 'ID_Cronologia' in df_base.columns and df_base['ID_Cronologia'].notna().any() else 0
                        df_inserir['ID_Cronologia'] = range(int(max_id_cron) + 1, int(max_id_cron) + 1 + len(df_inserir))
                        
                        df_inserir['Regional'] = df_inserir['Local_Instalacao'].astype(str).str[:3].map(DE_PARA_REGIONAL).fillna("-")
                        if 'Centro_Responsavel' not in df_inserir.columns:
                            df_inserir['Centro_Responsavel'] = "-"
                        
                        with st.spinner("Processando lote de notas em massa..."):
                            salvar_em_massa(df_inserir)
                            tarefa_excel = threading.Thread(target=gerar_copia_excel_rede)
                            tarefa_excel.start()
                        
                        st.session_state.df_temp_massa = pd.DataFrame(columns=colunas_essenciais_massa)
                        st.session_state.reset_key += 1
                        st.success(f"{len(df_editavel)} notas integradas ao banco de dados com sucesso!")
                        st.cache_data.clear()
                        st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                        st.rerun()
            else:
                st.warning("A tabela está vazia. Cole os dados antes de salvar.")
# endregion

# --- 5.3. ABA 3: CONFIGURAÇÃO ---
with aba_configuracao: 
    tab_resp, tab_bases_apoio, tab_backups = st.tabs(["Responsáveis por Conjunto", "Bases de Apoio (Excel)", "Backups do Sistema"])
    
    with tab_resp:
        st.markdown("### Responsáveis por Conjunto")
        st.write("Gerencie os engenheiros responsáveis pelo acompanhamento de cada conjunto regional.")
        
        with st.expander("Editar Responsáveis por Conjunto", expanded=False):
            if "df_responsaveis" not in st.session_state:
                dict_atual = carregar_responsaveis()
                st.session_state.df_responsaveis = pd.DataFrame(list(dict_atual.items()), columns=["Conjunto", "Responsável Conjunto"])
                
            df_editado_resp = st.data_editor(
                st.session_state.df_responsaveis, 
                column_config={
                    "Conjunto": st.column_config.TextColumn("Conjunto", width="medium", disabled=False), 
                    "Responsável Conjunto": st.column_config.TextColumn("Responsável Conjunto", width="medium")
                }, 
                use_container_width=True, 
                hide_index=True, 
                key="editor_responsaveis_v2"
            )
            
            col_btn1, col_btn2 = st.columns([2, 10])
            with col_btn1:
                if st.button("Adicionar Novo Conjunto", type="secondary", key="btn_add_conjunto"):
                    novo_conjunto = f"Novo Conjunto {len(df_editado_resp) + 1}"
                    df_novo = pd.DataFrame({"Conjunto": [novo_conjunto], "Responsável Conjunto": [""]})
                    st.session_state.df_responsaveis = pd.concat([df_editado_resp, df_novo], ignore_index=True)
                    st.rerun()
                    
            with col_btn2:
                if st.button("Salvar Responsáveis", type="primary", key="btn_salvar_resp"):
                    salvar_responsaveis(dict(zip(df_editado_resp["Conjunto"], df_editado_resp["Responsável Conjunto"])))
                    st.success("Tabela de responsáveis atualizada com sucesso!")
                    st.session_state.df_responsaveis = df_editado_resp
                    st.cache_data.clear()
                    st.rerun()

    with tab_bases_apoio:
        st.markdown("### Gestão das Bases de Apoio (Excel)")
        st.info("**Dica:** Para atualizar as regras de negócio, baixe a planilha atual, faça as alterações no seu computador e faça o upload para substituir a versão da rede.")
        
        with st.expander("Ler Tutorial Completo de Atualização de Bases"):
            st.markdown("""
            **Como funcionam as Bases de Apoio?**
            As Bases de Apoio são planilhas Excel armazenadas na rede que servem como "dicionários" e parâmetros para o nosso sistema. Quando o painel carrega as notas, ele lê essas planilhas para calcular os indicadores de engenharia (DEC, FEC, CHI, Custo Modular, Rankeamentos, etc.).
            
            **Passo a passo para edição:**
            1. **Baixar:** Na lista abaixo, encontre a base que deseja alterar e clique no botão **📥 Baixar Atual**.
            2. **Editar:** Abra o arquivo Excel baixado no seu computador, faça as alterações necessárias (atualizar valores, adicionar novas linhas) e **salve**. 
               *(⚠️ Atenção: Não altere o nome das abas nem o cabeçalho das colunas, pois o sistema os procura exatamente como estão!)*
            3. **Substituir:** Volte ao painel, clique em **'Browse files'** ao lado da base correspondente, selecione o arquivo que você editou e clique no botão de confirmar substituição.
            4. **Pronto!** O sistema limpará o cache e os próximos dados já refletirão as suas novas regras automaticamente!
            """)
            
        PASTA_BASES = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL"
        
        BASES_APOIO = {
            "Indicador de Continuidade (Limite ANEEL)": "Indicador base conjunto - Limite Aneel.xlsx",
            "Clientes por Conjunto": "Clientes_Conjunto.xlsx",
            "Custos Modulares e Sazonalidade": "Custo_Modular.xlsx",
            "Ganhos (CHI-Conjunto)": "Ganhos.xlsx",
            "Históricos (Table1 - 12M e 3M)": "Table1.xlsx"
        }
        
        for nome_base, nome_arquivo in BASES_APOIO.items():
            caminho_completo = os.path.join(PASTA_BASES, nome_arquivo)
            with st.expander(f"{nome_base}"):
                col_info, col_download, col_upload = st.columns([4, 2, 4])
                
                with col_info:
                    st.markdown(f"**Arquivo:** `{nome_arquivo}`")
                    if os.path.exists(caminho_completo):
                        st.markdown("<span style='color:green;'>Conectado à rede</span>", unsafe_allow_html=True)
                    else:
                        st.markdown("<span style='color:red;'>Arquivo não encontrado na rede</span>", unsafe_allow_html=True)
                
                with col_download:
                    if os.path.exists(caminho_completo):
                        with open(caminho_completo, "rb") as file:
                            st.download_button(
                                label="Baixar Atual",
                                data=file,
                                file_name=nome_arquivo,
                                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                key=f"dl_{nome_arquivo}",
                                use_container_width=True
                            )
                            
                with col_upload:
                    uploaded_file = st.file_uploader("Substituir arquivo", type=["xlsx"], key=f"up_{nome_arquivo}", label_visibility="collapsed")
                    if uploaded_file is not None:
                        if st.button(f"Confirmar Substituição", key=f"btn_sub_{nome_arquivo}", type="primary", use_container_width=True):
                            try:
                                with open(caminho_completo, "wb") as f:
                                    f.write(uploaded_file.getbuffer())
                                usuario_logado = os.getlogin() if hasattr(os, 'getlogin') else 'Desconhecido'
                                data_hora_log = datetime.datetime.now()
                                salvar_log_arquivo(nome_arquivo, usuario_logado, data_hora_log, "Substituição")
                                st.success(f"Arquivo '{nome_arquivo}' atualizado com sucesso!")
                                st.cache_data.clear()
                                time.sleep(2)
                                st.rerun()
                            except Exception as e:
                                st.error(f"Erro ao salvar arquivo na rede: {e}")

    with tab_backups:
        st.markdown("### Gerenciamento de Backups")
        st.write("O sistema realiza backups automáticos do banco de dados a cada 2 horas de uso ativo (sempre que alguma alteração for salva), mantendo um ciclo rotativo dos últimos 20 arquivos.")
        
        caminho_db = obter_caminho_banco()
        diretorio_backup = os.path.join(os.path.dirname(caminho_db), "backups")
        
        if os.path.exists(diretorio_backup):
            backups = glob.glob(os.path.join(diretorio_backup, "notas_departamento_*.db"))
            backups.sort(key=os.path.getmtime, reverse=True) # Exibe os mais recentes no topo
            
            if backups:
                st.success(f"{len(backups)} backups encontrados no servidor.")
                for bkp in backups:
                    nome_arq = os.path.basename(bkp)
                    tamanho_mb = os.path.getsize(bkp) / (1024 * 1024)
                    data_mod = datetime.datetime.fromtimestamp(os.path.getmtime(bkp)).strftime('%d/%m/%Y %H:%M:%S')
                    
                    col1, col2, col3 = st.columns([4, 2, 2])
                    with col1:
                        st.write(f"**{nome_arq}**")
                    with col2:
                        st.write(f"{data_mod} | {tamanho_mb:.2f} MB")
                    with col3:
                        with open(bkp, "rb") as f:
                            st.download_button(
                                label="Baixar Arquivo",
                                data=f,
                                file_name=nome_arq,
                                mime="application/octet-stream",
                                key=f"dl_bkp_{nome_arq}",
                                use_container_width=True
                            )
            else:
                st.info("A pasta de backups está vazia no momento.")
        else:
            st.info("O diretório de backups ainda não foi criado. O primeiro backup será gerado automaticamente assim que alguma nova alteração de nota for salva!")
# endregion

#region 5.4. ABA 4: RELATÓRIOS
# --- 5.4. ABA 4: RELATÓRIOS ---
with aba_relatorios:
    tab_auditoria = st.tabs(["Auditoria de Prazos (DDPM vs SAP)"])[0]
    with tab_auditoria:
        st.markdown("### Auditoria de Prazos e Cumprimento de Cronograma (DDPM vs SAP)")
        st.write("Este relatório cruza o planejamento estratégico da DDPM com as datas reais de encerramento extraídas do SAP.")

        with st.expander("Entenda as Regras de Negócio desta Auditoria"):
            st.markdown("""
            **Para Notas EM ANDAMENTO (Sem Status 99):**
            - **⚠️ Passível de Encerramento:** A Ordem consta como executada no SAP, mas a nota não possui o status 99 (Encerrado).
            - **🔴 Com Atraso:** O prazo para a execução (Mês/Ano planejado) já expirou em relação à data de hoje.
            - **⚪ Em Andamento (No Prazo):** O prazo planejado para execução ainda não venceu (ou estamos no mês de vencimento).
            - **🟣 Fora do Plano:** O ano planejado de execução é maior que o ano corrente.
            
            **Para Notas ENCERRADAS (Com Status 99):**
            - **🟢 Adiantado:** O encerramento real extraído do SAP ocorreu em um mês/ano anterior ao planejado no DDPM.
            - **🔵 No Prazo:** O encerramento no SAP ocorreu exatamente no mesmo mês/ano planejado.
            - **🔴 Com Atraso:** O encerramento no SAP ocorreu em um mês/ano posterior ao planejado.
            
            **Alertas e Exceções de Integridade:**
            - **⚪ Sem Planejamento / ⚠️ Sem Mês Planejado:** Notas que não possuem uma data de planejamento válida.
            - **⏳ Sem Data SAP / ⚠️ Data SAP Inválida:** Falha ou ausência na identificação da data de encerramento no SAP.
            """)

        col_rel_pop1, col_rel_pop2, _ = st.columns([4, 4, 6])
        
        with col_rel_pop1:
            with st.popover("⚡ Filtros Rápidos", use_container_width=True):
                st.write("Atalhos de pesquisa:")
                filtro_rapido_rel = st.radio("Atalhos", ["(Nenhum)", "Passíveis de Encerramento", "Em Andamento", "Encerradas", "Ordem Executada (SAP)"], key="fr_rel", label_visibility="collapsed")
                
        df_auditoria = df_filtrado.copy()
        
        if filtro_rapido_rel == "Passíveis de Encerramento":
            df_auditoria = df_auditoria[(df_auditoria['Status_Nota'] != "99 Encerrado") & (df_auditoria['Ordem_Executada'] == 'SIM')]
        elif filtro_rapido_rel == "Em Andamento":
            df_auditoria = df_auditoria[df_auditoria['Status_Nota'] != "99 Encerrado"]
        elif filtro_rapido_rel == "Encerradas":
            df_auditoria = df_auditoria[df_auditoria['Status_Nota'] == "99 Encerrado"]
        elif filtro_rapido_rel == "Ordem Executada (SAP)":
            df_auditoria = df_auditoria[df_auditoria['Ordem_Executada'] == 'SIM']

        # Função de inteligência cronológica imune a variações de formato
        def avaliar_prazo_sap(row):
            try:
                status_final = str(row.get('Status_Final', ''))
                ordem_executada = str(row.get('Ordem_Executada', 'NÃO')).strip().upper()
                is_99 = '99' in status_final

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

        filtro_anos = []
        filtro_mes_plan = []
        filtro_status_prazo = []
        filtro_reg = []
        filtro_conj = []
        filtro_centro = []

        if not df_auditoria.empty:
            # Aplica a auditoria em todas as notas do painel
            df_auditoria['Auditoria_Cronograma'] = df_auditoria.apply(avaliar_prazo_sap, axis=1)
            
            # Extrai o ano de encerramento para criar o filtro
            df_auditoria['Ano_Encerramento'] = pd.to_datetime(df_auditoria['Encerram.por data'], errors='coerce').dt.year.fillna(0).astype(int)
            
            with col_rel_pop2:
                with st.popover("🔎 Filtros Específicos", use_container_width=True):
                    anos_unicos = sorted([int(ano) for ano in df_auditoria['Ano_Encerramento'].unique() if ano > 0], reverse=True)
                    ano_default = 2026
                    
                    default_anos = [ano_default] if ano_default in anos_unicos else []
                    filtro_anos = st.multiselect("Ano Encerramento (SAP):", options=anos_unicos, default=default_anos)
                    
                    meses_unicos = [str(m) for m in df_auditoria['Mes_Execucao_Planejado'].unique() if str(m).strip() not in ["", "-", "None", "nan"]]
                    meses_unicos = sorted(meses_unicos, key=ordenar_datas)
                    
                    anos_planejados = set()
                    for m in meses_unicos:
                        partes = m.split('-')
                        if len(partes) == 2 and partes[1].isdigit():
                            anos_planejados.add(partes[1])
                            
                    opcoes_todos_ano = [f"Todos de {ano}" for ano in sorted(list(anos_planejados))]
                    opcoes_meses = opcoes_todos_ano + meses_unicos
                    
                    filtro_mes_plan = st.multiselect("Mês Execução Planejado:", options=opcoes_meses, default=[])

                    status_unicos = sorted([str(s) for s in df_auditoria['Auditoria_Cronograma'].unique()])
                    
                    filtro_status_prazo = st.multiselect("Status de Prazo:", options=status_unicos, default=[])
                    
                    regioes_unicas = sorted([str(r) for r in df_auditoria['Regional'].unique() if pd.notna(r) and str(r).strip() not in ["", "nan", "-"]])
                    filtro_reg = st.multiselect("Regional:", options=regioes_unicas, default=[])
                    
                    conjuntos_unicos = sorted([str(c) for c in df_auditoria['Conjunto'].unique() if pd.notna(c) and str(c).strip() not in ["", "nan", "-"]])
                    filtro_conj = st.multiselect("Conjunto:", options=conjuntos_unicos, default=[])
                    
                    centros_unicos = sorted([str(c) for c in df_auditoria['Centro_Responsavel'].unique() if pd.notna(c) and str(c).strip() not in ["", "nan", "-"]])
                    filtro_centro = st.multiselect("Centro Responsável:", options=centros_unicos, default=[])

            # Aplica os filtros selecionados
            if len(filtro_anos) > 0:
                df_auditoria = df_auditoria[df_auditoria['Ano_Encerramento'].isin(filtro_anos)]
                
            if len(filtro_mes_plan) > 0:
                mask_mes = pd.Series(False, index=df_auditoria.index)
                for m in filtro_mes_plan:
                    if m.startswith("Todos de "):
                        ano_alvo = m.split(" ")[-1]
                        mask_mes = mask_mes | df_auditoria['Mes_Execucao_Planejado'].astype(str).str.contains(ano_alvo, na=False)
                    else:
                        mask_mes = mask_mes | (df_auditoria['Mes_Execucao_Planejado'].astype(str) == m)
                df_auditoria = df_auditoria[mask_mes]
                
            if len(filtro_status_prazo) > 0:
                df_auditoria = df_auditoria[df_auditoria['Auditoria_Cronograma'].isin(filtro_status_prazo)]
            if len(filtro_reg) > 0:
                df_auditoria = df_auditoria[df_auditoria['Regional'].astype(str).isin(filtro_reg)]
            if len(filtro_conj) > 0:
                df_auditoria = df_auditoria[df_auditoria['Conjunto'].astype(str).isin(filtro_conj)]
            if len(filtro_centro) > 0:
                df_auditoria = df_auditoria[df_auditoria['Centro_Responsavel'].astype(str).isin(filtro_centro)]
                
            # Contabiliza os KPIs reais (métricas) baseados no resultado analítico do DataFrame já filtrado
            novas_adiantadas = len(df_auditoria[df_auditoria['Auditoria_Cronograma'] == '🟢 Adiantado'])
            novas_no_prazo = len(df_auditoria[df_auditoria['Auditoria_Cronograma'] == '🔵 No Prazo'])
            novas_atrasadas = len(df_auditoria[df_auditoria['Auditoria_Cronograma'] == '🔴 Com Atraso'])
            novas_fora_plano = len(df_auditoria[df_auditoria['Auditoria_Cronograma'] == '🟣 Fora do Plano'])
            novas_passiveis = len(df_auditoria[df_auditoria['Auditoria_Cronograma'] == '⚠️ Passível de Encerramento'])
            
            # Exibição dos Painéis Executivos (KPIs no topo da seção de relatórios)
            c1, c2, c3, c4, c5, c6 = st.columns(6)
            with c1:
                st.metric("Total Auditadas", len(df_auditoria))
            with c2:
                st.metric("No Prazo", novas_no_prazo)
            with c3:
                st.metric("Antecipadas", novas_adiantadas, delta_color="inverse" if novas_adiantadas > 0 else "normal")
            with c4:
                st.metric("Com Atraso", novas_atrasadas, delta_color="off")
            with c5:
                st.metric("Fora do Plano", novas_fora_plano, delta_color="off")
            with c6:
                st.metric("Passíveis Encerram.", novas_passiveis, delta_color="off")
            
            st.markdown("---")
            st.markdown("#### Listagem Consolidada de Auditoria")
            
            st.dataframe(
                df_auditoria,
                column_order=["Numero_Nota","Conjunto", "Status_Nota", "Status_Final", "Ordem_Executada", "Encerram.por data", "Mes_Execucao_Planejado", "Auditoria_Cronograma", "Regional", "Centro_Responsavel"],
                column_config={
                    **config_colunas_total,
                    "Auditoria_Cronograma": st.column_config.TextColumn("Resultado da Auditoria", width="large"),
                    "Encerram.por data": st.column_config.DateColumn("Data Encerramento SAP", format="DD/MM/YYYY")
                },
                use_container_width=True,
                hide_index=True,
                height=500
            )
            
            col_btn_export, _ = st.columns([3, 7])
            with col_btn_export:
                output_aud = io.BytesIO()
                with pd.ExcelWriter(output_aud, engine='openpyxl') as writer:
                    df_export_aud = df_auditoria[["Numero_Nota", "Conjunto", "Status_Nota", "Status_Final", "Ordem_Executada", "Encerram.por data", "Mes_Execucao_Planejado", "Auditoria_Cronograma", "Regional", "Centro_Responsavel"]].copy()
                    df_export_aud.to_excel(writer, index=False, sheet_name='Auditoria')
                
                st.download_button(
                    label="Baixar Relatório de Auditoria",
                    data=output_aud.getvalue(),
                    file_name=f"Auditoria_Prazos_{datetime.datetime.now().strftime('%Y%m%d')}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True
                )

            # Cria um layout de duas colunas para posicionar o gráfico apenas na metade esquerda da tela
            col_grafico, col_vazia = st.columns(2)
            
            with col_grafico:
                st.markdown("#### Gráfico de Distribuição por Status de Prazo") 
                
                # Agrupa e conta a quantidade de notas por cada status para servir de base para o gráfico
                df_grafico = df_auditoria['Auditoria_Cronograma'].value_counts().reset_index()
                df_grafico.columns = ['Status de Prazo', 'Quantidade']
                
                # Define um dicionário de cores customizadas associando o nome do status às cores do "semáforo"
                mapa_cores = {
                    '🟢 Adiantado': '#28a745', '🔵 No Prazo': '#007bff', 
                    '🔴 Com Atraso': '#dc3545', '🟣 Fora do Plano': '#6f42c1',
                    '⚠️ Passível de Encerramento': '#ffc107', '⚪ Em Andamento (No Prazo)': "#585c5d",
                    '⚪ Sem Planejamento': '#6c757d', '⏳Sem Data SAP': "#410707",
                    '⚠️ Data SAP Inválida': '#343a40', '⚠️ Sem Mês Planejado Válido': '#fd7e14',
                    '⚠️ Erro na Análise': '#000000'
                }
                
                # Gera o gráfico de pizza (com o centro vazado estilo rosca, 'hole=0.3') utilizando o Plotly
                fig = px.pie(df_grafico, names='Status de Prazo', values='Quantidade', hole=0.3, color='Status de Prazo', color_discrete_map=mapa_cores)
                st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Nenhuma nota foi encontrada na seleção atual de filtros para gerar a auditoria.")
#endregion

# --- 5.5. ABA 5: LOG DE ALTERAÇÕES ---
with aba_logs:
    st.markdown("### Histórico de Alterações")
    
    sub_log_notas, sub_log_bases, sub_timeline = st.tabs(["Alterações nas Notas", "Atualizações de Bases de Apoio", "Linha do Tempo (Por Nota)"])
    
    with sub_log_notas:
        st.write("Esta tela exibe todas as modificações realizadas nos dados através do painel de gerenciamento.")

        # Usa a função de cache do Streamlit para não recarregar o log a cada interação
        @st.cache_data
        def carregar_logs_cached():
            df = carregar_logs()
            if not df.empty and 'Data_Hora' in df.columns:
                df['Data_Hora'] = pd.to_datetime(df['Data_Hora'], errors='coerce')
            return df
        
        df_logs_completos = carregar_logs_cached()

        if not df_logs_completos.empty:
            # Filtros para o log
            col_filtro_log1, col_filtro_log2 = st.columns(2)
            with col_filtro_log1:
                filtro_nota_log = st.number_input("Filtrar por Nº da Nota:", min_value=0, step=1, format="%d", key="log_filtro_nota")
            with col_filtro_log2:
                usuarios_unicos = ["Todos"] + df_logs_completos['Usuario'].unique().tolist()
                filtro_usuario_log = st.selectbox("Filtrar por Usuário:", options=usuarios_unicos, key="log_filtro_usuario")

            df_logs_filtrado = df_logs_completos.copy()
            if filtro_nota_log > 0:
                df_logs_filtrado = df_logs_filtrado[df_logs_filtrado['Numero_Nota'] == filtro_nota_log]
            if filtro_usuario_log != "Todos":
                df_logs_filtrado = df_logs_filtrado[df_logs_filtrado['Usuario'] == filtro_usuario_log]
            
            st.dataframe(
                df_logs_filtrado,
                column_config={
                    "ID_Log": None, # Oculta a coluna de ID do log
                    "Numero_Nota": st.column_config.NumberColumn("Nº Nota", format="%d"),
                    "Data_Hora": st.column_config.DatetimeColumn("Data e Hora", format="DD/MM/YYYY HH:mm:ss"),
                },
                use_container_width=True, hide_index=True
            )
        else:
            st.info("Nenhum registro de alteração encontrado nas notas.")
            
    with sub_log_bases:
        st.write("Este histórico exibe as atualizações realizadas nas planilhas de Bases de Apoio.")
        
        @st.cache_data
        def carregar_log_arquivos_cached():
            df = carregar_log_arquivos()
            if not df.empty and 'Data_Hora' in df.columns:
                df['Data_Hora'] = pd.to_datetime(df['Data_Hora'], errors='coerce')
            return df
            
        df_logs_arquivos = carregar_log_arquivos_cached()
        
        if not df_logs_arquivos.empty:
            col_filtro_arq1, col_filtro_arq2 = st.columns(2)
            with col_filtro_arq1:
                arquivos_unicos = ["Todos"] + df_logs_arquivos['Nome_Arquivo'].unique().tolist()
                filtro_arquivo = st.selectbox("Filtrar por Arquivo:", options=arquivos_unicos, key="log_filtro_arquivo")
            with col_filtro_arq2:
                usuarios_arq_unicos = ["Todos"] + df_logs_arquivos['Usuario'].unique().tolist()
                filtro_usuario_arq = st.selectbox("Filtrar por Usuário:", options=usuarios_arq_unicos, key="log_filtro_usuario_arq")
                
            df_logs_arq_filtrado = df_logs_arquivos.copy()
            if filtro_arquivo != "Todos":
                df_logs_arq_filtrado = df_logs_arq_filtrado[df_logs_arq_filtrado['Nome_Arquivo'] == filtro_arquivo]
            if filtro_usuario_arq != "Todos":
                df_logs_arq_filtrado = df_logs_arq_filtrado[df_logs_arq_filtrado['Usuario'] == filtro_usuario_arq]
                
            st.dataframe(
                df_logs_arq_filtrado,
                column_config={
                    "ID_Log": None,
                    "Data_Hora": st.column_config.DatetimeColumn("Data e Hora", format="DD/MM/YYYY HH:mm:ss"),
                    "Nome_Arquivo": "Arquivo Atualizado",
                    "Usuario": "Usuário",
                    "Acao": "Ação"
                },
                use_container_width=True, hide_index=True
            )
        else:
            st.info("Nenhum registro de alteração de arquivo encontrado.")
            
    with sub_timeline:
        st.write("Pesquise o histórico de vida de uma nota específica.")
        nota_pesquisa = st.number_input("Digite o Nº da Nota:", min_value=0, step=1, format="%d", key="timeline_busca_nota")
        
        if nota_pesquisa > 0:
            df_timeline = df_logs_completos[df_logs_completos['Numero_Nota'] == nota_pesquisa].copy()
            if not df_timeline.empty:
                df_timeline = df_timeline.sort_values(by="Data_Hora", ascending=False)
                
                for _, row in df_timeline.iterrows():
                    dt_val = row['Data_Hora']
                    if pd.notnull(dt_val):
                        data_formatada = dt_val.strftime('%d/%m/%Y %H:%M:%S') if hasattr(dt_val, 'strftime') else str(dt_val)
                    else:
                        data_formatada = 'Data Desconhecida'
                    usuario = row['Usuario']
                    campo = row['Campo_Alterado']
                    val_antigo = row['Valor_Antigo']
                    val_novo = row['Valor_Novo']
                    
                    with st.container(border=True):
                        st.markdown(f"**{data_formatada}** | Modificado por: `{usuario}`")
                        st.write(f"Alterou o campo **{campo}** de `{val_antigo}` para `{val_novo}`")
            else:
                st.warning(f"Nenhum histórico de alterações encontrado para a nota {nota_pesquisa}.")