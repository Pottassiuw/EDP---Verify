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
import unicodedata
from streamlit_autorefresh import st_autorefresh

from config import (
    STATUS_MAP, config_colunas_secundarias, 
    MAP_FILTROS,
    DE_PARA_CIDADES, DE_PARA_REGIONAL, CAMINHO_PASTA_SQL
)

from database import (
    inicializar_banco, salvar_em_massa, 
    carregar_responsaveis, salvar_responsaveis, 
    salvar_projeto_construcao, carregar_projeto_construcao, salvar_log_alteracoes, carregar_logs,
    deletar_notas, reverter_ultima_alteracao, obter_data_ultima_alteracao,
    salvar_log_arquivo, carregar_log_arquivos, obter_caminho_banco,
    carregar_dados_ramal, salvar_em_massa_ramal, deletar_notas_ramal,
    vincular_notas_hierarquia
)

from processamento import puxar_dados_completos_da_rede, gerar_copia_excel_rede
import threading

def travar_fechamento_aba(travar=True):
    if travar:
        js = """
        <script>
            if (window.parent) {
                if (!window.parent._beforeUnloadHandler) {
                    window.parent._beforeUnloadHandler = function (e) {
                        e.preventDefault();
                        e.returnValue = 'Processamento em andamento. Tem certeza que deseja sair?';
                        return e.returnValue;
                    };
                }
                window.parent.removeEventListener('beforeunload', window.parent._beforeUnloadHandler);
                window.parent.addEventListener('beforeunload', window.parent._beforeUnloadHandler);
            }
        </script>
        """
    else:
        js = """
        <script>
            if (window.parent && window.parent._beforeUnloadHandler) {
                window.parent.removeEventListener('beforeunload', window.parent._beforeUnloadHandler);
            }
        </script>
        """
    components.html(js, height=0, width=0)

def disparar_excel_segundo_plano(df_fresco):
    from streamlit.runtime.scriptrunner import add_script_run_ctx
    
    def rodar_tarefa(df):
        try:
            gerar_copia_excel_rede(df)
            st.session_state.excel_atualizado_sucesso = True
        except Exception as e:
            st.session_state.excel_atualizado_erro = str(e)

    t = threading.Thread(target=rodar_tarefa, args=(df_fresco,))
    add_script_run_ctx(t)
    t.start()

# region 1. CONFIGURAÇÃO GERAL DA PÁGINA
st.set_page_config(page_title="Gestão de Notas EDP", layout="wide", initial_sidebar_state="collapsed")
st_autorefresh(interval=600000, limit=None, key="data_autorefresh")

if st.session_state.get("excel_atualizado_sucesso", False):
    st.toast("Planilha Excel da rede atualizada com sucesso! 🚀", icon="✅")
    st.session_state.excel_atualizado_sucesso = False

if st.session_state.get("excel_atualizado_erro"):
    st.error(f"Erro ao atualizar planilha da rede em segundo plano: {st.session_state.excel_atualizado_erro}")
    st.session_state.excel_atualizado_erro = None

st.markdown("""
    <style>
        .block-container { padding-bottom: 1rem !important; padding-top: 2rem !important; max-width: 95% !important; padding-left: 1rem !important; padding-right: 1rem !important; }
        [data-testid="stDataFrame"] th { text-align: center !important; }
        [data-testid="stDataFrame"] th > div { justify-content: center !important; }
    </style>
""", unsafe_allow_html=True)
# endregion

# region 2. VARIÁVEIS E FUNÇÕES GLOBAIS DE INTERFACE
def remover_acentos(texto):
    if not texto: return ""
    return "".join(c for c in unicodedata.normalize('NFD', str(texto)) if unicodedata.category(c) != 'Mn')

def normalizar_status_nota(val):
    if pd.isna(val) or str(val).strip() == "": return ""
    val_str = remover_acentos(str(val).strip().lower())
    for v in STATUS_MAP.values():
        if val_str == remover_acentos(v.lower()): return v
    clean_val = str(val).strip()
    if clean_val.endswith('.0'): clean_val = clean_val[:-2]
    if clean_val.isdigit():
        num = int(clean_val)
        if num in STATUS_MAP: return STATUS_MAP[num]
    match = re.match(r'^(\d+)\b', clean_val)
    if match:
        num = int(match.group(1))
        if num in STATUS_MAP: return STATUS_MAP[num]
    for v in STATUS_MAP.values():
        v_clean = remover_acentos(v.lower())
        if len(val_str) >= 3 and val_str in v_clean: return v
    return str(val).strip()

def normalizar_prioridade_nota(val):
    if pd.isna(val) or str(val).strip() == "": return ""
    val_str = remover_acentos(str(val).strip().lower())
    opcoes = ["Emergente", "Urgente", "Importante", "Prioritário", "Programável", "Informativo", "Protheus", "Nota Projetos"]
    for op in opcoes:
        if val_str == remover_acentos(op.lower()): return op
    for op in opcoes:
        op_clean = remover_acentos(op.lower())
        if len(val_str) >= 3 and val_str in op_clean: return op
    return str(val).strip()

ano_atual = datetime.datetime.now().year
meses_pt_rev = {'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'maio': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12}

def ordenar_datas(val):
    try:
        mes_str, ano_str = str(val).split('-')
        mes_num, ano_num = meses_pt_rev.get(mes_str.lower(), 99), int(ano_str)
        return (1, ano_num, mes_num) if ano_num > ano_atual else (0, -ano_num, mes_num) 
    except:
        return (2, 0, 0) 

def filtrar_por_busca_nota(df, busca_texto):
    if not busca_texto: return df
    import re
    lista_busca = [int(n.strip()) for n in re.split(r'[ ,;]+', busca_texto.strip()) if n.strip().isdigit()]
    if lista_busca:
        return df[df['Numero_Nota'].astype(int).isin(lista_busca)]
    else:
        termo = busca_texto.strip().upper()
        colunas_busca = ['Conjunto', 'Regional', 'Local_Instalacao', 'Observacao']
        mascara = pd.Series(False, index=df.index)
        for col in colunas_busca:
            if col in df.columns:
                mascara = mascara | df[col].astype(str).str.upper().str.contains(termo, na=False)
        return df[mascara]

@st.cache_data
def to_excel(df, colunas_exportar):
    df_export = df[colunas_exportar].copy()
    mapa_nomes = {v: k for k, v in MAP_FILTROS.items()}
    mapa_nomes.update({
        "Numero_Nota": "Nº Nota (ID)",
        "Status_Nota": "Status Nota",
        "Prioridade_Nota": "Prioridade Nota",
        "Status_Obra": "Status Obra",
        "Planejado_DDPM": "Planejado DDPM",
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
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name='Selecao_Filtrada')
    return output.getvalue()

def st_checkbox_list_search(label, options, key_prefix, default=None):
    if default is None: default = []
    key_sel = f"{key_prefix}_sel"
    key_busca = f"{key_prefix}_busca"
    if key_sel not in st.session_state: st.session_state[key_sel] = set(default)
    label_clean = label.rstrip(":")
    st.markdown(f"**{label_clean}**")
    busca_term = st.text_input(f"Buscar em {label_clean}:", key=key_busca, placeholder="Digite para filtrar as opções...", label_visibility="collapsed")
    opcoes_filtradas = [opt for opt in options if busca_term.lower() in str(opt).lower()] if busca_term.strip() else list(options)
    if busca_term.strip():
        col_all, col_none = st.columns(2)
        with col_all:
            if st.button(f"Selecionar todos ({len(opcoes_filtradas)})", key=f"btn_all_{key_prefix}", use_container_width=True):
                for opt in opcoes_filtradas:
                    st.session_state[key_sel].add(opt)
                    st.session_state[f"cb_{key_prefix}_{opt}"] = True
                st.rerun()
        with col_none:
            if st.button(f"Deselecionar todos ({len(opcoes_filtradas)})", key=f"btn_none_{key_prefix}", use_container_width=True):
                for opt in opcoes_filtradas:
                    st.session_state[key_sel].discard(opt)
                    st.session_state[f"cb_{key_prefix}_{opt}"] = False
                st.rerun()
    else:
        if st.session_state[key_sel]:
            if st.button(f"Limpar seleção ({len(st.session_state[key_sel])} selecionados)", key=f"btn_clear_{key_prefix}", use_container_width=True):
                for opt in list(st.session_state[key_sel]):
                    st.session_state[f"cb_{key_prefix}_{opt}"] = False
                st.session_state[key_sel].clear()
                st.rerun()

    with st.container(height=180):
        for opt in opcoes_filtradas:
            cb_key = f"cb_{key_prefix}_{opt}"
            if cb_key not in st.session_state:
                st.session_state[cb_key] = opt in st.session_state[key_sel]
            checked = st.checkbox(str(opt), key=cb_key)
            if checked: st.session_state[key_sel].add(opt)
            else: st.session_state[key_sel].discard(opt)
    return list(st.session_state[key_sel])
# endregion

# region 3. CARREGAMENTO DOS DADOS
@st.cache_resource
def setup_banco_uma_vez():
    inicializar_banco()

setup_banco_uma_vez()

@st.cache_data(ttl=300)
def buscar_dados_base_com_cache(ano=2026):
    from processamento import puxar_dados_completos_da_rede
    return puxar_dados_completos_da_rede(ano=ano)

def carregar_base_pronta(ano=2026):
    return buscar_dados_base_com_cache(ano=ano)

carregar_base_pronta.clear = buscar_dados_base_com_cache.clear

@st.cache_data(ttl=10)
def obter_data_ultima_alteracao_cached():
    return obter_data_ultima_alteracao()

@st.cache_data(ttl=10)
def obter_usuario_ultima_alteracao_cached(timestamp):
    from database import obter_usuario_ultima_alteracao
    return obter_usuario_ultima_alteracao(timestamp)

@st.cache_data
def carregar_logs_cached(limite=2000, numero_nota=None):
    from database import carregar_logs
    df = carregar_logs(limite, numero_nota)
    if not df.empty and 'Data_Hora' in df.columns:
        df['Data_Hora'] = pd.to_datetime(df['Data_Hora'], errors='coerce')
    return df

@st.cache_data
def carregar_log_arquivos_cached():
    from database import carregar_log_arquivos
    df = carregar_log_arquivos()
    if not df.empty and 'Data_Hora' in df.columns:
        df['Data_Hora'] = pd.to_datetime(df['Data_Hora'], errors='coerce')
    return df

if 'carregar_todos_anos' not in st.session_state:
    st.session_state.carregar_todos_anos = False

ano_filtro_db = None if st.session_state.carregar_todos_anos else 2026
df_cache = buscar_dados_base_com_cache(ano=ano_filtro_db)

if 'sincronizando' not in st.session_state:
    st.session_state.sincronizando = False

if 'df_base' not in st.session_state:
    # CORREÇÃO: Sem o assassino de status 99, permite que o histórico carregue.
    st.session_state.df_base = df_cache.copy()

df_base = st.session_state.df_base

if 'ramal_carregado' not in st.session_state:
    st.session_state.ramal_carregado = False

@st.cache_data
def carregar_base_ramal_pronta():
    from processamento import puxar_dados_ramal_da_rede
    return puxar_dados_ramal_da_rede()

if st.session_state.ramal_carregado:
    df_base_ramal = carregar_base_ramal_pronta()
else:
    df_base_ramal = pd.DataFrame(columns=[
        "ID_Cronologia", "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", 
        "Local_Instalacao", "Cidade", "Regional", "Planejado_DDPM", 
        "Mes_Execucao_Planejado", "CenTrab_Respon", "Prioridade_Nota", 
        "Observacao", "Extracao_Antiga", "Status_Nota", "Status_Anterior", "Check_Btzero", "Plano", "Ano", "Acao", "Coluna1"
    ])

timestamp_banco_agora = obter_data_ultima_alteracao_cached()
if "timestamp_sessao" not in st.session_state:
    st.session_state.timestamp_sessao = timestamp_banco_agora

if timestamp_banco_agora and st.session_state.timestamp_sessao and timestamp_banco_agora != st.session_state.timestamp_sessao:
    carregar_base_pronta.clear()
    carregar_logs_cached.clear()
    if 'df_base' in st.session_state:
        del st.session_state.df_base
    st.session_state.aviso_sincronizacao = True
    st.session_state.usuario_sincronizacao = obter_usuario_ultima_alteracao_cached(timestamp_banco_agora)
    st.session_state.timestamp_sessao = timestamp_banco_agora
    st.rerun()

if st.session_state.get("aviso_sincronizacao", False):
    col_aviso, col_fechar = st.columns([9, 1])
    with col_aviso:
        usuario_responsavel = st.session_state.get("usuario_sincronizacao", "Desconhecido")
        st.info(f"**Sincronização automática:** Os dados foram atualizados pelo usuário **{usuario_responsavel}** e sua tela foi recarregada.")
    with col_fechar:
        if st.button("Fechar", key="btn_fechar_aviso"):
            st.session_state.aviso_sincronizacao = False
            st.session_state.usuario_sincronizacao = None
            st.rerun()
# endregion

# region 4. BARRA LATERAL
def alterar_carregamento_anos():
    # CORREÇÃO: Captura a mudança instantânea do checkbox
    st.session_state.carregar_todos_anos = st.session_state.chk_carregar_todos_anos
    buscar_dados_base_com_cache.clear()
    if 'df_base' in st.session_state:
        del st.session_state.df_base

st.sidebar.markdown("### 🔌 Configurações de Dados")
st.sidebar.checkbox(
    "Carregar Todos os Anos (Geral)",
    value=st.session_state.get('carregar_todos_anos', False),
    key="chk_carregar_todos_anos",
    on_change=alterar_carregamento_anos,
    help="Por padrão, apenas as notas de 2026 são carregadas para maior rapidez de inicialização."
)

st.sidebar.header("Pesquisa Global")
busca_nota = st.sidebar.text_input("Buscar Notas:", placeholder="Ex: 12345, 54321")

if busca_nota:
    lista_busca = list(set([int(n.strip()) for n in re.split(r'[ ,;]+', busca_nota.strip()) if n.strip().isdigit()]))
    if lista_busca:
        notas_existentes_gerais = set(df_base['Numero_Nota'].dropna().astype(int).tolist())
        notas_existentes_ramal = set(df_base_ramal['Numero_Nota'].dropna().astype(int).tolist())
        notas_encontradas_ramal = [n for n in lista_busca if n in notas_existentes_ramal]
        notas_nao_encontradas = [n for n in lista_busca if n not in notas_existentes_gerais and n not in notas_existentes_ramal]
        df_filtrado = df_base[df_base['Numero_Nota'].isin(lista_busca)]
        df_filtrado_ramal = df_base_ramal[df_base_ramal['Numero_Nota'].isin(lista_busca)]
        if notas_encontradas_ramal:
            st.sidebar.info(f"💡 **Aviso:** {len(notas_encontradas_ramal)} nota(s) pertencem a **Ramal**! Verifique a aba 'Notas de Ramal'.")
        if notas_nao_encontradas:
            st.sidebar.warning("⚠️ Notas não localizadas:")
            st.sidebar.text_area("Copiar:", value="\n".join(map(str, notas_nao_encontradas)), height=150)
            if not st.session_state.ramal_carregado:
                st.sidebar.info("💡 A base de **Ramais** não está ativa.")
                if st.sidebar.button("🔍 Carregar e Buscar em Ramal", type="primary", use_container_width=True):
                    st.session_state.ramal_carregado = True
                    st.rerun()
    else:
        df_filtrado = pd.DataFrame(columns=df_base.columns)
        df_filtrado_ramal = pd.DataFrame(columns=df_base_ramal.columns)
else:
    df_filtrado = df_base.copy()
    df_filtrado_ramal = df_base_ramal.copy()

st.sidebar.markdown("---")
if st.sidebar.button("Encerrar Sessão"):
    components.html("""
        <script>
        var corpo = window.parent.document.body;
        corpo.innerHTML = "<div style='display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;'><h1 style='color:#FF4B4B;'>Sessão Encerrada</h1></div>";
        setTimeout(function(){ window.parent.location.reload(); }, 1000);
        </script>
    """, height=0, width=0)


    
# endregion

# region 5. FRONTEND PRINCIPAL (Cabeçalho e Abas)
config_colunas_total = {
    "ID_Cronologia": st.column_config.NumberColumn("Linha Orig.", disabled=True, format="%d"),
    "Status_Nota": st.column_config.SelectboxColumn("Status Nota", options=list(STATUS_MAP.values()), required=True),
    "Prioridade_Nota": st.column_config.SelectboxColumn("Prioridade Nota", options=["Emergente", "Urgente", "Importante", "Prioritário", "Programável", "Informativo","Protheus","Nota Projetos"], required=True),
    "Planejado_DDPM": st.column_config.NumberColumn("Planejado DDPM", format="%.2f", alignment="center"),
    "Numero_Nota": st.column_config.NumberColumn("Nº Nota (ID)", required=True, format="%d"),
    "Nota_Mae": st.column_config.TextColumn("Nota Mãe", disabled=False),
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
    "Regional", "Numero_Nota", "Nota_Mae", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao",
    "Planejado_DDPM","Medida_SAP", "Medida_vs_Planejado", "Mes_Execucao_Planejado", "Data_Envio_Projeto","Centro_Responsavel",
    "Prioridade_Nota", "Status_Nota","Cidade", "Observacao",  "CJ_Aneel", 
    "substacao_conjunto", "Conj.critico", "ranking", "Check", "Export_status", "Status_Final", "Status_Anterior", "Check_Cancelado",
    "Ordem", "Status_Usuário_Ordem", "Status_Sistema", "Total_planejado_ordem", "Total_real_ordem", "Exec_percentagem_ordem", "Ordem_Executada", "Modular",
    "Total_planejado_modular", "Regional_CSD", "N_Clientes_Conjunto", "CHI", "CI", "Ocorrencia", "DEC", "FEC","CHI_Conjunto","Equipamento_Protecao"
]
colunas_para_exibir = [col for col in colunas_para_exibir if col in df_base.columns]

aba_visualizacao, aba_gerenciamento, aba_relatorios, aba_logs, aba_configuracao = st.tabs(["Visualização (Leitura)", "Gerenciar Notas", "Relatórios", "Log de Alterações", "Configurações"])

with aba_visualizacao:
    if "reset_key_vis" not in st.session_state: st.session_state.reset_key_vis = 0
    if "reset_key_editor" not in st.session_state: st.session_state.reset_key_editor = 0

    sub_vis_geral, sub_vis_ramal = st.tabs(["Notas Gerais", "Notas de Ramal"])
    
    with sub_vis_geral:
        st.subheader(" Visualização - Notas Gerais")
        
        col_topo_g1, col_topo_g2 = st.columns([8, 8])
        with col_topo_g1:
            travar_toggle = not st.session_state.get('carregar_todos_anos', False)
            filtro_plano_geral = st.toggle(
                "Mostrar apenas notas do Plano (Ano Atual - 2026)", 
                value=True, 
                key="toggle_plano_geral",
                disabled=travar_toggle,
                help="Para ver anos anteriores, ative 'Carregar Todos os Anos' na barra lateral." if travar_toggle else "Desligue para ver o histórico."
            )
        with col_topo_g2:
            indicador_total_registros = st.empty()
        st.divider()

        col_pop_fa, col_pop_calc, col_pop_limpar, _ = st.columns([8, 4, 4, 4])

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
        if filtro_plano_geral:
            def obter_ano_da_nota(val):
                import re
                val_str = str(val).strip()
                if val_str in ["", "-", "nan", "None"]: return 0
                match = re.search(r'\b(20\d{2})\b', val_str)
                if match: return int(match.group(1))
                match_2d = re.search(r'\b(1[5-9]|2[0-9]|3[0-5])\b', val_str)
                if match_2d: return 2000 + int(match_2d.group(1))
                dt = pd.to_datetime(val_str, errors='coerce', format='mixed')
                if pd.notna(dt): return int(dt.year)
                return 0
            df_vis_base = df_vis_base[df_vis_base['Mes_Execucao_Planejado'].apply(obter_ano_da_nota) == ano_atual]

        def obter_categorias_numericas(df, coluna_df, nome_filtro):
            vals = pd.to_numeric(df[coluna_df], errors='coerce').dropna()
            if vals.empty: return []
            min_v = vals.min()
            max_v = vals.max()
            if min_v == max_v: return [(f"{min_v}", min_v, max_v)]
            if "exec" in coluna_df.lower() or "%" in nome_filtro:
                return [("0% (Não executado)", -0.01, 0.0), ("1% a 50% (Execução Inicial)", 0.0, 50.0), ("51% a 99% (Fase Final)", 50.0, 99.99), ("100% (Concluído)", 99.99, 1000.0)]
            q1, q2, q3 = vals.quantile(0.25), vals.quantile(0.50), vals.quantile(0.75)
            quantiles = sorted(list(set([min_v, q1, q2, q3, max_v])))
            bins = []
            for i in range(len(quantiles) - 1):
                low, high = quantiles[i], quantiles[i+1]
                def fmt(val):
                    if val >= 1000000: return f"{val/1000000:.1f}M"
                    elif val >= 1000: return f"{val/1000:.1f}k"
                    elif val.is_integer(): return f"{int(val)}"
                    else: return f"{val:.2f}"
                if i == 0: label = f"Até {fmt(high)}"
                elif i == len(quantiles) - 2: label = f"Acima de {fmt(low)}"
                else: label = f"De {fmt(low)} a {fmt(high)}"
                if low == high and i > 0: continue
                bins.append((label, low, high))
            return bins

        dict_filtros_selecionados = {}
        with col_pop_fa:
            with st.popover("🔎 Filtros Avançados", use_container_width=True):
                filtros_ativos = st.multiselect("Campos de filtro:", options=list(MAP_FILTROS.keys()), default=["Status", "Regional", "Mês Execução Planejado","Local Instalação"])
                st.divider()
                filtros_texto = ["Nº Nota", "Local Instalação", "Observação", "Ordem", "DIS Proteção", "Centro Responsável"]
                lista_numericos = ["Planejado", "Ranking", "Total Planejado Ordem", "Total Real Ordem", "Exec %", "Total Planejado Modular", "Nº Clientes Conjunto", "CHI", "CIH", "Ocorrências", "DEC", "FEC", "CHI Conjunto", "DEC Prog. CHI"]
                for nome_filtro in filtros_ativos:
                    coluna_df = MAP_FILTROS[nome_filtro]
                    if nome_filtro in filtros_texto:
                        dict_filtros_selecionados[coluna_df] = st.text_input(f"{nome_filtro}:", placeholder="Digite...", key=f"vis_txt_{nome_filtro}_{st.session_state.reset_key_vis}")
                    elif nome_filtro == "Mês Execução":
                        opcoes = sorted(df_vis_base[coluna_df].astype(str).unique(), key=ordenar_datas)
                        dict_filtros_selecionados[coluna_df] = st_checkbox_list_search(f"{nome_filtro}:", options=opcoes, key_prefix=f"vis_sel_{nome_filtro}_{st.session_state.reset_key_vis}")
                    elif nome_filtro == "Medida SAP":
                        st.markdown("**Tipo de Medida SAP:**")
                        tipos = st.multiselect("Selecionar tipos:", options=["km (Obra Linear)", "un (Equipamento)", "Misto (km / un)", "Sem Medida (-)"], default=["km (Obra Linear)", "un (Equipamento)", "Misto (km / un)", "Sem Medida (-)"], key=f"medida_tipo_{st.session_state.reset_key_vis}", label_visibility="collapsed")
                        selected_km_bins, selected_un_bins = [], []
                        if "km (Obra Linear)" in tipos or "Misto (km / un)" in tipos:
                            st.markdown("**Faixa de Medida (km):**")
                            km_bins = [("Até 0.10 km", 0.0, 0.1), ("De 0.10 a 0.50 km", 0.1, 0.5), ("De 0.50 a 1.00 km", 0.5, 1.0), ("Acima de 1.00 km", 1.0, 9999.0)]
                            for label, low, high in km_bins:
                                if st.checkbox(label, value=False, key=f"medida_bin_km_{label}_{st.session_state.reset_key_vis}"): selected_km_bins.append((label, low, high))
                        if "un (Equipamento)" in tipos or "Misto (km / un)" in tipos:
                            st.markdown("**Faixa de Medida (un):**")
                            un_bins = [("1 un", 1.0, 1.0), ("De 2 a 5 un", 2.0, 5.0), ("Acima de 5 un", 5.0, 999.0)]
                            for label, low, high in un_bins:
                                if st.checkbox(label, value=False, key=f"medida_bin_un_{label}_{st.session_state.reset_key_vis}"): selected_un_bins.append((label, low, high))
                        dict_filtros_selecionados[coluna_df] = (tipos, selected_km_bins, selected_un_bins)
                        st.divider()
                    elif nome_filtro == "Hierarquia":
                        dict_filtros_selecionados[coluna_df] = st.toggle("Ocultar Notas Filhas (Mostrar apenas Mães/Órfãs)", value=False, key=f"vis_hierarquia_{st.session_state.reset_key_vis}")
                        st.divider()
                    elif nome_filtro in lista_numericos:
                        bins = obter_categorias_numericas(df_vis_base, coluna_df, nome_filtro)
                        if bins:
                            st.markdown(f"**{nome_filtro} (Selecione Faixas):**")
                            selected_labels = []
                            for label, low, high in bins:
                                if st.checkbox(label, value=False, key=f"num_bin_{nome_filtro}_{label}_{st.session_state.reset_key_vis}"): selected_labels.append(label)
                            incluir_nulos = st.checkbox(f"Incluir não preenchidos (-)", value=True, key=f"num_null_{nome_filtro}_{st.session_state.reset_key_vis}")
                            selected_bins = [b for b in bins if b[0] in selected_labels]
                            dict_filtros_selecionados[coluna_df] = (selected_bins, incluir_nulos)
                        else: dict_filtros_selecionados[coluna_df] = None
                        st.divider()
                    else:
                        opcoes = sorted(df_vis_base[coluna_df].dropna().astype(str).unique())
                        dict_filtros_selecionados[coluna_df] = st_checkbox_list_search(f"{nome_filtro}:", options=opcoes, key_prefix=f"vis_sel_{nome_filtro}_{st.session_state.reset_key_vis}")

        with col_pop_limpar:
            if st.button("🧹 Limpar Filtros", use_container_width=True):
                st.session_state.reset_key_vis += 1
                st.rerun()

        calculadora_resultados_placeholder = st.container()

        df_vis = df_vis_base.copy()
        for col_nome, valores_selecionados in dict_filtros_selecionados.items():
            if col_nome == 'Hierarquia' and valores_selecionados: df_vis = df_vis[df_vis['Nota_Mae'] == '-']
            elif valores_selecionados is not None:
                if col_nome == "Medida_SAP":
                    tipos, selected_km_bins, selected_un_bins = valores_selecionados
                    df_vis['_temp_is_km'] = df_vis['Medida_SAP'].str.contains('km', case=False, na=False) & ~df_vis['Medida_SAP'].str.contains('un', case=False, na=False)
                    df_vis['_temp_is_un'] = df_vis['Medida_SAP'].str.contains('un', case=False, na=False) & ~df_vis['Medida_SAP'].str.contains('km', case=False, na=False)
                    df_vis['_temp_is_misto'] = df_vis['Medida_SAP'].str.contains('km', case=False, na=False) & df_vis['Medida_SAP'].str.contains('un', case=False, na=False)
                    df_vis['_temp_is_vazio'] = (df_vis['Medida_SAP'] == "-") | df_vis['Medida_SAP'].isna()

                    cond_tipo = pd.Series(False, index=df_vis.index)
                    if "km (Obra Linear)" in tipos: cond_tipo = cond_tipo | df_vis['_temp_is_km']
                    if "un (Equipamento)" in tipos: cond_tipo = cond_tipo | df_vis['_temp_is_un']
                    if "Misto (km / un)" in tipos: cond_tipo = cond_tipo | df_vis['_temp_is_misto']
                    if "Sem Medida (-)" in tipos: cond_tipo = cond_tipo | df_vis['_temp_is_vazio']
                    df_vis = df_vis[cond_tipo]

                    def get_km(val):
                        m = re.search(r'([\d\.]+)\s*km', str(val).lower())
                        return float(m.group(1)) if m else 0.0

                    def get_un(val):
                        m = re.search(r'([\d\.]+)\s*un', str(val).lower())
                        return float(m.group(1)) if m else 0.0

                    if selected_km_bins:
                        df_vis['_temp_km_val'] = df_vis['Medida_SAP'].apply(get_km)
                        cond_km = pd.Series(False, index=df_vis.index)
                        for label, low, high in selected_km_bins:
                            cond_km = cond_km | ((df_vis['_temp_km_val'] >= low) & (df_vis['_temp_km_val'] < high + 0.0001))
                        has_km = df_vis['_temp_is_km'] | df_vis['_temp_is_misto']
                        df_vis = df_vis[~has_km | cond_km]
                        df_vis = df_vis.drop(columns=['_temp_km_val'])

                    if selected_un_bins:
                        df_vis['_temp_un_val'] = df_vis['Medida_SAP'].apply(get_un)
                        cond_un = pd.Series(False, index=df_vis.index)
                        for label, low, high in selected_un_bins:
                            cond_un = cond_un | ((df_vis['_temp_un_val'] >= low) & (df_vis['_temp_un_val'] <= high))
                        has_un = df_vis['_temp_is_un'] | df_vis['_temp_is_misto']
                        df_vis = df_vis[~has_un | cond_un]
                        df_vis = df_vis.drop(columns=['_temp_un_val'])

                    df_vis = df_vis.drop(columns=['_temp_is_km', '_temp_is_un', '_temp_is_misto', '_temp_is_vazio'])
                elif isinstance(valores_selecionados, tuple) and len(valores_selecionados) == 2 and isinstance(valores_selecionados[0], list):
                    selected_bins, incluir_nulos = valores_selecionados
                    df_vis['temp_num'] = pd.to_numeric(df_vis[col_nome], errors='coerce')
                    cond_bins = pd.Series(False, index=df_vis.index)
                    for label, low, high in selected_bins: cond_bins = cond_bins | ((df_vis['temp_num'] >= low) & (df_vis['temp_num'] <= high))
                    if not selected_bins:
                        if not incluir_nulos: df_vis = df_vis[df_vis['temp_num'].notna()]
                    else:
                        if incluir_nulos: df_vis = df_vis[df_vis['temp_num'].isna() | cond_bins]
                        else: df_vis = df_vis[df_vis['temp_num'].notna() & cond_bins]
                    df_vis = df_vis.drop(columns=['temp_num'])
                elif isinstance(valores_selecionados, tuple) and len(valores_selecionados) == 2:
                    df_vis['temp_num'] = pd.to_numeric(df_vis[col_nome], errors='coerce')
                    df_vis = df_vis[(df_vis['temp_num'] >= valores_selecionados[0]) & (df_vis['temp_num'] <= valores_selecionados[1])]
                    df_vis = df_vis.drop(columns=['temp_num'])
                elif isinstance(valores_selecionados, list) and len(valores_selecionados) > 0:
                    df_vis = df_vis[df_vis[col_nome].astype(str).isin(valores_selecionados)]
                elif isinstance(valores_selecionados, str) and valores_selecionados.strip() != "":
                    termo_busca = valores_selecionados.strip().upper()
                    df_vis = df_vis[df_vis[col_nome].astype(str).str.upper().str.contains(termo_busca, na=False)]

        indicador_total_registros.text(f"Total de registros: {len(df_vis)}")

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
                                soma_coluna, media_coluna, contagem_coluna = serie_numerica.sum(), serie_numerica.mean(), serie_numerica.count()
                                st.info(f"**{nome_amigavel}**\n- Soma: `{soma_coluna:,.2f}`\n- Média: `{media_coluna:,.2f}`\n- Contagem: `{contagem_coluna}`")

        st.dataframe(df_vis, column_config=config_colunas_total, column_order=colunas_para_exibir, use_container_width=True, hide_index=True, height=500)
    
        col_btn_download, _ = st.columns([2,6])
        with col_btn_download:
            if not df_vis.empty:
                with st.expander("Exportar para Excel", expanded=False):
                    estado_filtro = f"{len(df_vis)}_{df_vis['Numero_Nota'].sum() if 'Numero_Nota' in df_vis.columns else 0}"
                    if st.button("1. Preparar Arquivo", use_container_width=True):
                        with st.spinner("Processando planilha pesada..."):
                            st.session_state['excel_data'] = to_excel(df_vis, colunas_para_exibir)
                            st.session_state['estado_planilha'] = estado_filtro
                    if st.session_state.get('excel_data') is not None and st.session_state.get('estado_planilha') == estado_filtro:
                        st.download_button(label="2. Baixar Planilha", data=st.session_state['excel_data'], file_name=f"export_notas_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", use_container_width=True)

    with sub_vis_ramal:
        st.subheader("Visualização - Notas de Ramal")
        if not st.session_state.ramal_carregado:
            st.warning("⚠️ **Base de Dados de Ramal Desativada**")
            st.info("A planilha e tabela de Ramais possuem mais de 52.000 registros e não são carregadas por padrão.")
            if st.button("📥 Carregar Banco de Dados de Ramal", key="btn_load_ramal_vis", type="primary", use_container_width=True):
                st.session_state.ramal_carregado = True
                st.rerun()
        else:
            col_topo_r1, col_topo_r2 = st.columns([8, 8])
            with col_topo_r1: filtro_plano_ramal = st.toggle("Mostrar apenas notas do Plano (Ano Atual - 2026)", value=True, key="toggle_plano_ramal")
            with col_topo_r2: indicador_total_ramal = st.empty()
            st.divider()

            if "reset_key_ramal_vis" not in st.session_state: st.session_state.reset_key_ramal_vis = 0

            col_pop_fa_ramal, col_pop_limpar_ramal, _ = st.columns([8, 4, 8])
            df_vis_ramal_base = df_filtrado_ramal.copy()
            if filtro_plano_ramal: df_vis_ramal_base = df_vis_ramal_base[df_vis_ramal_base['Ano'] == ano_atual]
            dict_filtros_ramal_selecionados = {}

            with col_pop_fa_ramal:
                with st.popover("🔎 Filtros Avançados (Ramal)", use_container_width=True):
                    mapa_filtros_ramal = {"Status (Regra Final)": "Status", "Ação (GERAR/NÃO)": "Acao", "Regional": "Regional", "Mês Execução Planejado": "Mes_Execucao_Planejado", "Local Instalação": "Local_Instalacao", "Plano (Detalhes1)": "Plano", "Check Btzero": "Check_Btzero", "Classificação (Cluster)": "Coluna1", "Centro Responsável": "CenTrab_Respon", "Extracao Antiga (Excel)": "Extracao_Antiga"}
                    filtros_ativos_ramal = st.multiselect("Campos de filtro:", options=list(mapa_filtros_ramal.keys()), default=["Status (Regra Final)", "Ação (GERAR/NÃO)", "Regional", "Plano (Detalhes1)"], key=f"fa_ramal_ativo_{st.session_state.reset_key_ramal_vis}")
                    st.divider()
                    for nome_filtro in filtros_ativos_ramal:
                        coluna_df = mapa_filtros_ramal[nome_filtro]
                        if nome_filtro == "Local Instalação": dict_filtros_ramal_selecionados[coluna_df] = st.text_input(f"{nome_filtro}:", placeholder="Digite...", key=f"vis_txt_ramal_{nome_filtro}_{st.session_state.reset_key_ramal_vis}")
                        elif nome_filtro == "Mês Execução Planejado":
                            opcoes = sorted(df_vis_ramal_base[coluna_df].astype(str).unique(), key=ordenar_datas)
                            dict_filtros_ramal_selecionados[coluna_df] = st_checkbox_list_search(f"{nome_filtro}:", options=opcoes, key_prefix=f"vis_sel_ramal_{nome_filtro}_{st.session_state.reset_key_ramal_vis}")
                        else:
                            opcoes = sorted(df_vis_ramal_base[coluna_df].dropna().astype(str).unique())
                            dict_filtros_ramal_selecionados[coluna_df] = st_checkbox_list_search(f"{nome_filtro}:", options=opcoes, key_prefix=f"vis_sel_ramal_{nome_filtro}_{st.session_state.reset_key_ramal_vis}")

            with col_pop_limpar_ramal:
                if st.button("🧹 Limpar Filtros", key="btn_limpar_ramal", use_container_width=True):
                    st.session_state.reset_key_ramal_vis += 1
                    st.rerun()

            df_vis_ramal = df_vis_ramal_base.copy()
            for col_nome, valores_selecionados in dict_filtros_ramal_selecionados.items():
                if valores_selecionados: 
                    if isinstance(valores_selecionados, str): df_vis_ramal = df_vis_ramal[df_vis_ramal[col_nome].astype(str).str.upper().str.contains(valores_selecionados.strip().upper(), na=False)]
                    elif isinstance(valores_selecionados, list): df_vis_ramal = df_vis_ramal[df_vis_ramal[col_nome].astype(str).isin(valores_selecionados)]

            indicador_total_ramal.text(f"Total de registros: {len(df_vis_ramal)}")

            colunas_exibir_ramal = [col for col in ["Numero_Nota", "Regional", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", "Planejado_DDPM", "Mes_Execucao_Planejado", "CenTrab_Respon", "Prioridade_Nota", "Observacao", "Ano", "Status", "Status_Nota", "CJ_Aneel", "Conjunto_Exec", "Check_Btzero", "Acao", "Cluster", "Coluna1", "Plano", "Extracao_Antiga", "Extracao_SAP_Atual"] if col in df_vis_ramal.columns]
            st.dataframe(df_vis_ramal[colunas_exibir_ramal], use_container_width=True, column_config=config_colunas_total, hide_index=True, height=500)

            col_btn_down_ramal, _ = st.columns([2, 6])
            with col_btn_down_ramal:
                if not df_vis_ramal.empty:
                    with st.expander("Exportar para Excel", expanded=False):
                        estado_filtro_ramal = f"{len(df_vis_ramal)}_{df_vis_ramal['Numero_Nota'].sum() if 'Numero_Nota' in df_vis_ramal.columns else 0}"
                        if st.button("1. Preparar Arquivo (Ramal)", use_container_width=True, key="btn_prep_ramal"):
                            with st.spinner("Processando planilha de ramal..."):
                                st.session_state['excel_data_ramal'] = to_excel(df_vis_ramal, colunas_exibir_ramal)
                                st.session_state['estado_planilha_ramal'] = estado_filtro_ramal
                        if st.session_state.get('excel_data_ramal') is not None and st.session_state.get('estado_planilha_ramal') == estado_filtro_ramal:
                            st.download_button(label="2. Baixar Planilha Filtrada", data=st.session_state['excel_data_ramal'], file_name=f"export_ramais_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", use_container_width=True, key="btn_down_ramal_ok")
# endregion

# region 6. GERENCIAR NOTAS
@st.dialog("ATENÇÃO: CONFIRMAÇÃO DE REVERSÃO")
def modal_confirmacao_reversao():
    st.markdown("#### Você está prestes a desfazer a última alteração salva no banco de dados.")
    st.markdown("Tem certeza que deseja continuar?")
    col_conf_sim, col_conf_nao = st.columns(2)
    with col_conf_sim:
        if st.button("Sim, Desfazer Ação", type="primary", use_container_width=True):
            with st.spinner("Desfazendo última ação..."):
                sucesso, msg = reverter_ultima_alteracao()
                if sucesso:
                    st.success(msg)
                    df_fresco = puxar_dados_completos_da_rede()
                    disparar_excel_segundo_plano(df_fresco)
                else: st.warning(msg)
            st.session_state.reset_key_editor += 1
            st.session_state.aguardando_confirmacao_reversao = False
            carregar_base_pronta.clear()
            carregar_logs_cached.clear()
            if 'df_base' in st.session_state: del st.session_state.df_base
            st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
            time.sleep(3.5)
            st.rerun()
    with col_conf_nao:
        if st.button("Cancelar", use_container_width=True):
            st.session_state.aguardando_confirmacao_reversao = False
            st.rerun()

with aba_gerenciamento:
    st.subheader("Gestão de Notas (INPUT)")
    st.text("Total de registros: " + str(len(df_vis)))
    st.divider()
    
    sub_editar, sub_inserir_unica, sub_inserir_massa = st.tabs(["Editar Notas Existentes", "Cadastrar Nova Nota", "Colar Planilha (Massa)"])
    
    with sub_editar:
        tipo_edicao_tab = st.radio("Selecione o Painel para Edição:", ["Notas Gerais", "Notas de Ramal"], horizontal=True, key="tipo_edicao_tab_radio")

        if tipo_edicao_tab == "Notas Gerais":
            if "reset_key_editor" not in st.session_state: st.session_state.reset_key_editor = 0

            modo_operacao = st.radio("Modo de Operação:", ("Edição Rápida", "Edição em Lote", "Exclusão de Notas"), horizontal=True, key="modo_operacao_editor")
            st.info("Não é possivel alterar os IDs das notas para evitar inconsistências.")

            df_para_editar = df_vis.copy()
            config_editor = {
                **config_colunas_total,
                "Numero_Nota": st.column_config.NumberColumn("Nº Nota (ID)", disabled=True, format="%d"),
                "Conjunto": st.column_config.TextColumn("Conjunto", disabled=False),
                "Local_Instalacao": st.column_config.TextColumn("Local Inst.", disabled=False),
                "Planejado_DDPM": st.column_config.NumberColumn("Planejado", disabled=False, format="%.2f"),
                "Nota_Mae": st.column_config.TextColumn("Nota Mãe", disabled=False),
                "Observacao": st.column_config.TextColumn("Observação", width="large"),
            }
            ordem_colunas_editor = colunas_para_exibir

            if modo_operacao == "Exclusão de Notas":
                marcar_todos_excluir = st.checkbox("Marcar todas para exclusão", value=False, key=f"marcar_todos_excluir_{st.session_state.reset_key_editor}")
                if "Excluir" not in df_para_editar.columns: df_para_editar.insert(0, "Excluir", marcar_todos_excluir)
                config_editor["Excluir"] = st.column_config.CheckboxColumn("Excluir?", width="small")
                ordem_colunas_editor = ["Excluir"] + colunas_para_exibir
            
            elif modo_operacao == "Edição em Lote":
                marcar_todos_lote = st.checkbox("Selecionar todas para lote", value=False, key=f"marcar_todos_lote_{st.session_state.reset_key_editor}")
                if "Selecionar" not in df_para_editar.columns: df_para_editar.insert(0, "Selecionar", marcar_todos_lote)
                config_editor["Selecionar"] = st.column_config.CheckboxColumn("Selecionar", width="small")
                ordem_colunas_editor = ["Selecionar"] + colunas_para_exibir
        
            with st.form("form_editar"):
                df_editado = st.data_editor(df_para_editar, column_config=config_editor, column_order=ordem_colunas_editor, num_rows="fixed", use_container_width=True, hide_index=True, key=f"editor_principal_notas_{st.session_state.reset_key_editor}")
                botao_salvar, botao_deletar, botao_salvar_lote = False, False, False
            
                if modo_operacao == "Exclusão de Notas":
                    col_salvar, col_deletar, col_desfazer, col_reverter, _ = st.columns([2, 3, 2, 3, 2])
                    with col_salvar: botao_salvar = st.form_submit_button("💾 Salvar Edições", type="primary", use_container_width=True, disabled=st.session_state.get('sincronizando', False))
                    with col_deletar: botao_deletar = st.form_submit_button("🗑️ Excluir Notas", use_container_width=True, disabled=st.session_state.get('sincronizando', False))
                    with col_desfazer: botao_desfazer = st.form_submit_button("❌ Descartar", use_container_width=True)
                    with col_reverter: botao_reverter = st.form_submit_button("📄Reverter", use_container_width=True)
                elif modo_operacao == "Edição em Lote":
                    col_lote1, col_lote2, col_lote3 = st.columns(3)
                    with col_lote1: lote_status = st.selectbox("Novo Status:", options=["(Manter Atual)"] + list(STATUS_MAP.values()))
                    with col_lote2: lote_prioridade = st.selectbox("Nova Prioridade:", options=["(Manter Atual)", "Emergente", "Urgente", "Importante", "Prioritário", "Programável", "Informativo","Protheus","Nota Projetos"])
                    with col_lote3: lote_mes = st.text_input("Novo Mês Execução:", placeholder="Ex: 05-2024", value="(Manter Atual)")
                    col_salvar_lote, col_desfazer, col_reverter, _ = st.columns([3, 2, 3, 4])
                    with col_salvar_lote: botao_salvar_lote = st.form_submit_button("Aplicar Lote", type="primary", use_container_width=True, disabled=st.session_state.get('sincronizando', False))
                    with col_desfazer: botao_desfazer = st.form_submit_button("Descartar", use_container_width=True)
                    with col_reverter: botao_reverter = st.form_submit_button("Reverter", use_container_width=True)
                else: 
                    col_salvar, col_desfazer, col_reverter, _ = st.columns([2, 2, 3, 5])
                    with col_salvar: botao_salvar = st.form_submit_button("💾 Salvar Edições", type="primary", use_container_width=True, disabled=st.session_state.get('sincronizando', False))
                    with col_desfazer: botao_desfazer = st.form_submit_button("❌ Descartar", use_container_width=True)
                    with col_reverter: botao_reverter = st.form_submit_button("📄Reverter", use_container_width=True)
            
                if botao_desfazer:
                    st.session_state.reset_key_editor += 1
                    st.rerun()
                if botao_reverter: st.session_state.aguardando_confirmacao_reversao = True
                
                if botao_deletar:
                    notas_a_deletar = df_editado[df_editado["Excluir"] == True]
                    if not notas_a_deletar.empty:
                        lista_ids_deletar = notas_a_deletar["Numero_Nota"].tolist()
                        st.session_state.sincronizando = True
                        travar_fechamento_aba(travar=True)
                        try:
                            with st.spinner(f"Excluindo {len(lista_ids_deletar)} nota(s)..."):
                                deletar_notas(lista_ids_deletar)
                                disparar_excel_segundo_plano(puxar_dados_completos_da_rede())
                            st.session_state.df_base = st.session_state.df_base[~st.session_state.df_base['Numero_Nota'].isin(lista_ids_deletar)].copy()
                            st.toast(f"{len(lista_ids_deletar)} nota(s) excluída(s)!", icon="🗑️")
                            carregar_logs_cached.clear()
                            st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                            st.session_state.reset_key_editor += 1
                        except Exception as e: st.error(f"Erro: {e}")
                        finally:
                            st.session_state.sincronizando = False
                            travar_fechamento_aba(travar=False)
                            time.sleep(1)
                            st.rerun()
                    else: st.warning("Nenhuma marcada.")
                    
                if botao_salvar_lote:
                    notas_selecionadas = df_editado[df_editado["Selecionar"] == True].copy()
                    if notas_selecionadas.empty: st.warning("Nenhuma nota selecionada.")
                    else:
                        mudou_algo = False
                        if lote_status != "(Manter Atual)": notas_selecionadas['Status_Nota'] = lote_status; mudou_algo = True
                        if lote_prioridade != "(Manter Atual)": notas_selecionadas['Prioridade_Nota'] = lote_prioridade; mudou_algo = True
                        if lote_mes.strip() not in ["(Manter Atual)", ""]: notas_selecionadas['Mes_Execucao_Planejado'] = lote_mes.strip(); mudou_algo = True

                        if not mudou_algo: st.warning("Nenhum novo valor.")
                        else:
                            logs_para_salvar = []
                            usuario_logado = os.getlogin() if hasattr(os, 'getlogin') else 'Desconhecido'
                            data_hora_log = datetime.datetime.now()

                            for index, row_alterada in notas_selecionadas.iterrows():
                                numero_nota = row_alterada['Numero_Nota']
                                row_original = df_vis.loc[index]
                                for coluna in ["Status_Nota", "Prioridade_Nota", "Mes_Execucao_Planejado"]:
                                    valor_novo = str(row_alterada.get(coluna, "")) if pd.notna(row_alterada.get(coluna)) else ""
                                    valor_antigo = str(row_original.get(coluna, "")) if pd.notna(row_original.get(coluna)) else ""
                                    if valor_novo.strip() != valor_antigo.strip():
                                        logs_para_salvar.append((int(numero_nota), usuario_logado, data_hora_log, coluna, valor_antigo, valor_novo))

                            status_original_map = dict(zip(df_base['Numero_Nota'], df_base['Status_Nota']))
                            status_anterior_map = dict(zip(df_base['Numero_Nota'], df_base['Status_Anterior']))

                            def identificar_status_anterior_lote(row):
                                nota = row['Numero_Nota']
                                status_novo = row['Status_Nota']
                                status_antigo_banco = status_original_map.get(nota, status_novo)
                                if status_novo != status_antigo_banco: return status_antigo_banco
                                return status_anterior_map.get(nota, '-')

                            notas_selecionadas['Status_Anterior'] = notas_selecionadas.apply(identificar_status_anterior_lote, axis=1)
                            if 'Local_Instalacao' in notas_selecionadas.columns: notas_selecionadas['Regional'] = notas_selecionadas['Local_Instalacao'].astype(str).str[:3].map(DE_PARA_REGIONAL).fillna("-")

                            if logs_para_salvar:
                                 st.session_state.sincronizando = True
                                 travar_fechamento_aba(travar=True)
                                 try:
                                     with st.spinner(f"Aplicando lote em {len(notas_selecionadas)} nota(s)..."):
                                         salvar_log_alteracoes(logs_para_salvar)
                                         salvar_em_massa(notas_selecionadas)
                                         disparar_excel_segundo_plano(puxar_dados_completos_da_rede())
                                         
                                         # CORREÇÃO: Lote Otimista Livre
                                         for idx_row, row in notas_selecionadas.iterrows():
                                             cond = st.session_state.df_base['Numero_Nota'] == row['Numero_Nota']
                                             for col in notas_selecionadas.columns:
                                                 if col in st.session_state.df_base.columns:
                                                     st.session_state.df_base.loc[cond, col] = row[col]

                                         st.toast(f"Edição em lote concluída!", icon="✅")
                                         carregar_logs_cached.clear()
                                         st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                                         st.session_state.reset_key_editor += 1
                                 except Exception as e: st.error(f"Erro: {e}")
                                 finally:
                                     st.session_state.sincronizando = False
                                     travar_fechamento_aba(travar=False)
                                     time.sleep(1)
                                     st.rerun()
            
                if botao_salvar:
                    colunas_analise = ["Status_Nota", "Prioridade_Nota", "Planejado_DDPM", "Observacao", "Status_Obra", "Local_Instalacao", "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Check", "Nota_Mae"]
                    colunas_analise = [c for c in colunas_analise if c in df_editado.columns]
                    mudou = pd.Series(False, index=df_editado.index)
                    for col in colunas_analise:
                        s_orig = df_vis[col].fillna("___NULL___").astype(str).str.strip()
                        s_edit = df_editado[col].fillna("___NULL___").astype(str).str.strip()
                        mudou = mudou | (s_orig != s_edit)
                
                    df_apenas_alterados = df_editado[mudou].copy()
                    if 'Local_Instalacao' in df_apenas_alterados.columns: df_apenas_alterados['Regional'] = df_apenas_alterados['Local_Instalacao'].astype(str).str[:3].map(DE_PARA_REGIONAL).fillna("-")
                
                    if not df_apenas_alterados.empty:
                        st.session_state.sincronizando = True
                        travar_fechamento_aba(travar=True)
                        try:
                            logs_para_salvar = []
                            usuario_logado = os.getlogin() if hasattr(os, 'getlogin') else 'Desconhecido'
                            data_hora_log = datetime.datetime.now()

                            for index, row_alterada in df_apenas_alterados.iterrows():
                                numero_nota = row_alterada['Numero_Nota']
                                row_original = df_vis.loc[index]
                                for coluna in colunas_analise:
                                    valor_novo = str(row_alterada.get(coluna, "")) if pd.notna(row_alterada.get(coluna)) else ""
                                    valor_antigo = str(row_original.get(coluna, "")) if pd.notna(row_original.get(coluna)) else ""
                                    if valor_novo.strip() != valor_antigo.strip():
                                        logs_para_salvar.append((int(numero_nota), usuario_logado, data_hora_log, coluna, valor_antigo, valor_novo))

                            status_original_map = dict(zip(df_base['Numero_Nota'], df_base['Status_Nota']))
                            status_anterior_map = dict(zip(df_base['Numero_Nota'], df_base['Status_Anterior']))
                        
                            def identificar_status_anterior(row):
                                nota = row['Numero_Nota']
                                status_novo = row['Status_Nota']
                                status_antigo_banco = status_original_map.get(nota, status_novo)
                                if status_novo != status_antigo_banco: return status_antigo_banco
                                return status_anterior_map.get(nota, '-')

                            df_apenas_alterados['Status_Anterior'] = df_apenas_alterados.apply(identificar_status_anterior, axis=1)
                        
                            with st.spinner(f"Gravando {len(df_apenas_alterados)} nota(s)... ⏳"):
                                salvar_log_alteracoes(logs_para_salvar)
                                salvar_em_massa(df_apenas_alterados)     
                                disparar_excel_segundo_plano(puxar_dados_completos_da_rede())
                            
                                # CORREÇÃO: Atualização Otimista Livre
                                for idx_row, row in df_apenas_alterados.iterrows():
                                    cond = st.session_state.df_base['Numero_Nota'] == row['Numero_Nota']
                                    for col in df_apenas_alterados.columns:
                                        if col in st.session_state.df_base.columns:
                                            st.session_state.df_base.loc[cond, col] = row[col]

                            st.toast(f"Sucesso! {len(df_apenas_alterados)} nota(s) atualizada(s).", icon="💾")
                            carregar_logs_cached.clear()
                            st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                        except Exception as e: st.error(f"Erro: {e}")
                        finally:
                            st.session_state.sincronizando = False
                            travar_fechamento_aba(travar=False)
                            time.sleep(1)
                            st.rerun()

            if st.session_state.get("aguardando_confirmacao_reversao", False): modal_confirmacao_reversao()

            st.markdown("---")
            with st.expander("🔗 Gerenciamento de Hierarquia (Vincular Notas Filhas)", expanded=False):
                tab_unico, tab_lote = st.tabs(["Vínculo Único", "Vínculo em Lote (Via Detetive)"])
                with tab_unico:
                    col_mae, col_filhas = st.columns([3, 7])
                    with col_mae: input_nota_mae = st.text_input("Nº da Nota MÃE:", placeholder="Ex: 1002540")
                    with col_filhas: input_notas_filhas = st.text_input("Nº das Notas FILHAS (Separadas por vírgula):", placeholder="Ex: 1002541, 1002542")
                    if st.button("Aplicar Vínculo Único", type="primary", use_container_width=True, key="btn_vinculo_unico", disabled=st.session_state.get('sincronizando', False)):
                        if input_nota_mae.strip() and input_notas_filhas.strip():
                            try:
                                import re
                                nota_mae_limpa = int(re.sub(r'\D', '', input_nota_mae))
                                filhas_limpas = [int(n.strip()) for n in re.split(r'[ ,;]+', input_notas_filhas) if n.strip().isdigit()]
                                if filhas_limpas:
                                    df_mae = df_base[df_base['Numero_Nota'] == nota_mae_limpa]
                                    if df_mae.empty: st.error(f"❌ A Nota Mãe {nota_mae_limpa} não encontrada.")
                                    else:
                                        conjunto_mae = str(df_mae['Conjunto'].iloc[0]).strip().upper()
                                        filhas_validas, filhas_invalidas = [], []
                                        for f in filhas_limpas:
                                            df_f = df_base[df_base['Numero_Nota'] == f]
                                            if df_f.empty: filhas_invalidas.append(f"Nota {f}")
                                            else:
                                                if str(df_f['Conjunto'].iloc[0]).strip().upper() == conjunto_mae: filhas_validas.append(f)
                                                else: filhas_invalidas.append(f"Nota {f} (Outro Conj)")
                                        if filhas_invalidas: st.warning(f"⚠️ Vínculo bloqueado: {', '.join(filhas_invalidas)}")
                                        if filhas_validas:
                                            st.session_state.sincronizando = True
                                            travar_fechamento_aba(travar=True)
                                            try:
                                                with st.spinner("Gravando..."):
                                                    vincular_notas_hierarquia(nota_mae_limpa, filhas_validas)
                                                    st.session_state.df_base.loc[st.session_state.df_base['Numero_Nota'].isin(filhas_validas), 'Nota_Mae'] = str(nota_mae_limpa)
                                                st.success(f"✅ Vínculo concluído.")
                                                carregar_logs_cached.clear()
                                                st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                                            finally:
                                                st.session_state.sincronizando = False
                                                travar_fechamento_aba(travar=False)
                                                time.sleep(1)
                                                st.rerun()
                            except: st.error("Digite números válidos.")
                with tab_lote:
                    texto_lote = st.text_area("Colar Resumo do Detetive:", height=250, placeholder="MÃE: 1234567\nFILHAS: 8901, 8902")
                    if st.button("🚀 Aplicar Vínculos em Lote", type="primary", use_container_width=True, key="btn_vinculo_lote", disabled=st.session_state.get('sincronizando', False)):
                        if texto_lote.strip():
                            st.session_state.sincronizando = True
                            travar_fechamento_aba(travar=True)
                            try:
                                with st.spinner("Preparando transação..."):
                                    import re
                                    from database import vincular_notas_hierarquia_lote
                                    linhas = texto_lote.split('\n')
                                    mae_atual, mapa_lote = None, {}
                                    for linha in linhas:
                                        linha_limpa = linha.strip().upper()
                                        if linha_limpa.startswith("MÃE:"):
                                            num = re.findall(r'\d+', linha_limpa)
                                            if num: mae_atual = int(num[0])
                                        elif linha_limpa.startswith("FILHAS:") and mae_atual:
                                            filhas_limpas = [int(n.strip()) for n in re.split(r'[ ,;]+', linha_limpa.replace("FILHAS:", "")) if n.strip().isdigit()]
                                            if filhas_limpas: mapa_lote.setdefault(mae_atual, []).extend(filhas_limpas)
                                            mae_atual = None
                                    if mapa_lote:
                                        vincular_notas_hierarquia_lote(mapa_lote)
                                        for mae_lote, filhas_lote in mapa_lote.items(): st.session_state.df_base.loc[st.session_state.df_base['Numero_Nota'].isin(filhas_lote), 'Nota_Mae'] = str(mae_lote)
                                        st.success("✅ Vínculos em lote concluídos.")
                                        carregar_logs_cached.clear()
                                        st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                            finally:
                                st.session_state.sincronizando = False
                                travar_fechamento_aba(travar=False)
                                time.sleep(1)
                                st.rerun()

            with st.expander("🕵️ Detetive de Vínculos", expanded=False):
                if st.button("🔎 Iniciar Varredura no Histórico", key="btn_detetive"):
                    with st.spinner("Analisando textos..."):
                        import re
                        df_orfas = df_base[(df_base.get('Nota_Mae', '-') == '-') & (df_base['Planejado_DDPM'] == 0)].copy()
                        dict_conj = dict(zip(df_base['Numero_Nota'].astype(str), df_base['Conjunto'].astype(str).str.strip().str.upper()))
                        sugestoes = []
                        palavras_proibidas = ["SUBSTITUIDA", "SUBSTITUÍDA", "SUBST.", "SUBST ", "CANCELADA"]
                        for _, row in df_orfas.iterrows():
                            texto = f"{row.get('Status_Obra', '')} {row.get('Observacao', '')}".upper()
                            if any(p in texto for p in palavras_proibidas): continue
                            nums = re.findall(r'\b\d{6,9}\b', texto)
                            conj_orfa = str(row.get('Conjunto', '')).strip().upper()
                            for num in nums:
                                if num in dict_conj and num != str(row['Numero_Nota']) and dict_conj[num] == conj_orfa:
                                    sugestoes.append({"Nota_Filha_Órfã": row['Numero_Nota'], "Possível_Nota_Mãe": num, "Texto_Encontrado": texto[:100] + "..."})
                        if sugestoes:
                            df_sugestoes = pd.DataFrame(sugestoes).drop_duplicates(subset=['Nota_Filha_Órfã'])
                            st.success(f"{len(df_sugestoes)} sugestões válidas encontradas.")
                            df_agrupado = df_sugestoes.groupby('Possível_Nota_Mãe')['Nota_Filha_Órfã'].apply(lambda x: ', '.join(x.astype(str))).reset_index()
                            texto_copia = ""
                            for _, row in df_agrupado.iterrows(): texto_copia += f"MÃE: {row['Possível_Nota_Mãe']}\nFILHAS: {row['Nota_Filha_Órfã']}\n{'-'*30}\n"
                            st.text_area("Copie o bloco e cole:", value=texto_copia, height=250)

        else:
            if not st.session_state.ramal_carregado:
                st.warning("⚠️ **Base de Dados de Ramal Desativada**")
                if st.button("📥 Carregar Banco de Dados de Ramal", key="btn_load_ramal_edit", type="primary"):
                    st.session_state.ramal_carregado = True; st.rerun()
            else:
                df_vis_ramal_edit = df_filtrado_ramal.copy()
                busca_edit_ramal = st.text_input("Filtrar por Nota ou Local:", key="busca_edit_ramal").strip().lower()
                if busca_edit_ramal:
                    df_vis_ramal_edit = df_vis_ramal_edit[df_vis_ramal_edit['Numero_Nota'].astype(str).str.contains(busca_edit_ramal, case=False, na=False) | df_vis_ramal_edit['Local_Instalacao'].astype(str).str.contains(busca_edit_ramal, case=False, na=False)]
                
                with st.form("form_editar_ramal"):
                    df_editado_ramal = st.data_editor(df_vis_ramal_edit, column_config={**config_colunas_total, "Numero_Nota": st.column_config.NumberColumn("Nº Nota", disabled=True, format="%d")}, column_order=["Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", "Planejado_DDPM", "Mes_Execucao_Planejado", "CenTrab_Respon", "Prioridade_Nota", "Observacao", "Extracao_Antiga"], num_rows="dynamic", use_container_width=True, key=f"editor_ramal_{st.session_state.reset_key_editor}")
                    botao_salvar_ramal = st.form_submit_button("💾 Salvar Alterações de Ramal", type="primary", disabled=st.session_state.get('sincronizando', False))
                    
                if botao_salvar_ramal:
                    col_analise = ["Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", "Planejado_DDPM", "Mes_Execucao_Planejado", "CenTrab_Respon", "Prioridade_Nota", "Observacao", "Extracao_Antiga"]
                    mudou_ramal = pd.Series(False, index=df_editado_ramal.index)
                    for col in col_analise: mudou_ramal = mudou_ramal | (df_vis_ramal_edit[col].fillna("___NULL___").astype(str).str.strip() != df_editado_ramal[col].fillna("___NULL___").astype(str).str.strip())
                    notas_antes, notas_depois = set(df_vis_ramal_edit['Numero_Nota'].astype(int).tolist()), set(df_editado_ramal['Numero_Nota'].dropna().astype(int).tolist())
                    notas_deletadas = list(notas_antes - notas_depois)
                    df_alteradas_ramal = df_editado_ramal[mudou_ramal & df_editado_ramal['Numero_Nota'].isin(notas_depois)].copy()
                    
                    if not df_alteradas_ramal.empty or notas_deletadas:
                        st.session_state.sincronizando = True
                        travar_fechamento_aba(travar=True)
                        try:
                            logs = []
                            usr, dt = os.getlogin() if hasattr(os, 'getlogin') else "Desconhecido", datetime.datetime.now()
                            for idx, row in df_alteradas_ramal.iterrows():
                                n = int(row['Numero_Nota'])
                                orig = df_vis_ramal_edit[df_vis_ramal_edit['Numero_Nota'] == n]
                                if not orig.empty:
                                    for c in col_analise:
                                        if str(orig.iloc[0][c]).strip() != str(row[c]).strip(): logs.append((n, usr, dt, c, str(orig.iloc[0][c]).strip(), str(row[c]).strip()))
                            
                            from database import salvar_em_massa_ramal, deletar_notas_ramal
                            if not df_alteradas_ramal.empty: salvar_em_massa_ramal(df_alteradas_ramal)
                            if notas_deletadas: deletar_notas_ramal(notas_deletadas)
                            if 'df_base_ramal' in st.session_state: st.session_state.df_base_ramal = df_editado_ramal[df_editado_ramal['Numero_Nota'].isin(notas_depois)].copy()
                            if logs: salvar_log_alteracoes(logs)
                            carregar_base_ramal_pronta.clear()
                            if logs or notas_deletadas: carregar_logs_cached.clear(); st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                            st.toast("Ramal salvo!", icon="✅"); st.session_state.reset_key_editor += 1
                        finally:
                            st.session_state.sincronizando = False; travar_fechamento_aba(travar=False); time.sleep(1); st.rerun()

    with sub_inserir_unica:
        tipo_cadastro_unica = st.selectbox("Tipo de Nota para Cadastrar:", ["Nota Geral", "Nota de Ramal"], key="tipo_cadastro_unica_sel")
        st.divider()

        if tipo_cadastro_unica == "Nota Geral":
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
                    nova_obs = st.text_area("Observação", height=150)
                    novo_check = st.text_input("Check*", value="-")
                    novo_status_anterior = st.text_input("Status Anterior*", value="-")

                if st.form_submit_button("💾 Salvar Nova Nota", type="primary", disabled=st.session_state.get('sincronizando', False)):
                    if novo_id in df_base['Numero_Nota'].values: st.error("Nota já existe!")
                    else:
                        st.session_state.sincronizando = True
                        travar_fechamento_aba(travar=True)
                        try:
                            max_id_cron = df_base['ID_Cronologia'].max() if not df_base.empty and 'ID_Cronologia' in df_base.columns and df_base['ID_Cronologia'].notna().any() else 0
                            nova_linha_df = pd.DataFrame([{
                                "ID_Cronologia": int(max_id_cron) + 1, "Numero_Nota": novo_id, "Status_Obra": novo_status_obra, "Conjunto": novo_conjunto, 
                                "Circuito": novo_circuito, "Local_Instalacao": novo_local, "Regional": DE_PARA_REGIONAL.get(str(novo_local)[:3], "-"),
                                "Planejado_DDPM": novo_planejado, "Mes_Execucao_Planejado": novo_mes, "Data_Envio_Projeto": nova_data, "Status_Nota": novo_status, 
                                "Prioridade_Nota": novo_prioridade, "Observacao": nova_obs, "Check": novo_check, "Status_Anterior": novo_status_anterior, "Centro_Responsavel": "-"
                            }])
                            with st.spinner("Salvando..."):
                                salvar_em_massa(nova_linha_df)
                                disparar_excel_segundo_plano(puxar_dados_completos_da_rede())
                            
                            # CORREÇÃO: Cadastro Otimista Livre
                            st.session_state.df_base = pd.concat([st.session_state.df_base, nova_linha_df], ignore_index=True)
                            st.toast(f"Nota {novo_id} cadastrada!", icon="✅")
                            carregar_logs_cached.clear()
                            st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                        finally:
                            st.session_state.sincronizando = False; travar_fechamento_aba(travar=False); time.sleep(1); st.rerun()
        else:
            if not st.session_state.ramal_carregado:
                st.warning("⚠️ **Base de Dados de Ramal Desativada**")
                if st.button("📥 Carregar Banco de Dados de Ramal", key="btn_load_ramal_insert_unica", type="primary"): st.session_state.ramal_carregado = True; st.rerun()
            else:
                with st.form("form_unica_ramal", clear_on_submit=True):
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        novo_id = st.number_input("Nº Nota*", min_value=1, format="%d", key="rf_id")
                        novo_planejado = st.number_input("Planejado*", min_value=0.0, format="%.2f", key="rf_plan")
                        novo_status_obra = st.text_input("Status Obra*", key="rf_st")
                        novo_prioridade = st.selectbox("Prioridade*", options=["Emergente", "Urgente", "Importante", "Prioritário", "Programável", "Informativo","Protheus","Nota Projetos"], index=4, key="rf_prio")
                    with col2:
                        novo_conjunto = st.text_input("Conjunto*", key="rf_conj")
                        novo_circuito = st.text_input("Circuito*", key="rf_circ")
                        novo_local = st.text_input("Local*", key="rf_loc")
                    with col3:
                        novo_mes = st.text_input("Mês Execução*", key="rf_mes")
                        novo_centrab = st.text_input("CenTrab respon/*", key="rf_cen")
                        novo_ext_antiga = st.text_input("Extração Antiga*", key="rf_ext")
                    nova_obs = st.text_area("Observação", height=150)
                    
                    if st.form_submit_button("💾 Salvar Nova Nota de Ramal", type="primary", disabled=st.session_state.get('sincronizando', False)):
                        if novo_id in df_base_ramal['Numero_Nota'].values: st.error("Nota já existe!")
                        else:
                            st.session_state.sincronizando = True
                            travar_fechamento_aba(travar=True)
                            try:
                                max_id_cron = df_base_ramal['ID_Cronologia'].max() if not df_base_ramal.empty and 'ID_Cronologia' in df_base_ramal.columns and df_base_ramal['ID_Cronologia'].notna().any() else 0
                                nova_linha_df = pd.DataFrame([{"ID_Cronologia": int(max_id_cron) + 1, "Numero_Nota": novo_id, "Status_Obra": novo_status_obra, "Conjunto": novo_conjunto, "Circuito": novo_circuito, "Local_Instalacao": novo_local, "Planejado_DDPM": novo_planejado, "Mes_Execucao_Planejado": novo_mes, "CenTrab_Respon": novo_centrab, "Prioridade_Nota": novo_prioridade, "Observacao": nova_obs, "Extracao_Antiga": novo_ext_antiga, "Status_Nota": "-", "Status_Anterior": "-", "Check_Btzero": "-", "Plano": "-"}])
                                with st.spinner("Salvando..."):
                                    salvar_em_massa_ramal(nova_linha_df)
                                    carregar_base_ramal_pronta.clear()
                                    st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                                st.toast("Salvo!", icon="✅")
                            finally:
                                st.session_state.sincronizando = False; travar_fechamento_aba(travar=False); time.sleep(1); st.rerun()

    with sub_inserir_massa:
        tipo_cadastro_massa = st.selectbox("Selecione o Tipo de Carga em Massa:", ["Notas Gerais", "Notas de Ramal"], key="tipo_cadastro_massa_sel")
        st.divider()

        if tipo_cadastro_massa == "Notas Gerais":
            col_essenciais = ["Numero_Nota", "Status_Nota", "Prioridade_Nota", "Planejado_DDPM", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Observacao", "Check"]
            if "df_temp_massa" not in st.session_state: st.session_state.df_temp_massa = pd.DataFrame(columns=col_essenciais)
            if "reset_key" not in st.session_state: st.session_state.reset_key = 0
            if st.button("Limpar Tabela"): st.session_state.df_temp_massa = pd.DataFrame(columns=col_essenciais); st.session_state.reset_key += 1; st.rerun()

            with st.form("form_inserir_massa", clear_on_submit=True):
                df_editavel = st.data_editor(st.session_state.df_temp_massa, column_config={**config_colunas_total, "Status_Nota": st.column_config.TextColumn("Status", required=True), "Prioridade_Nota": st.column_config.TextColumn("Prioridade", required=True)}, column_order=col_essenciais, num_rows="dynamic", use_container_width=True, key=f"editor_massa_{st.session_state.reset_key}")
                botao_salvar = st.form_submit_button("💾 Salvar Lote", type="primary", disabled=st.session_state.get('sincronizando', False))

            if botao_salvar:
                if not df_editavel.empty:
                    df_c = df_editavel.copy()
                    df_c['Status_Nota'], df_c['Prioridade_Nota'] = df_c['Status_Nota'].apply(normalizar_status_nota), df_c['Prioridade_Nota'].apply(normalizar_prioridade_nota)
                    if df_c['Numero_Nota'].isnull().any(): st.error("Existem linhas sem o Número da Nota.")
                    else:
                        st_inv = df_c[~df_c['Status_Nota'].isin(set(STATUS_MAP.values()))]['Status_Nota'].dropna().unique()
                        pr_inv = df_c[~df_c['Prioridade_Nota'].isin({"Emergente", "Urgente", "Importante", "Prioritário", "Programável", "Informativo", "Protheus", "Nota Projetos"})]['Prioridade_Nota'].dropna().unique()
                        if st_inv or pr_inv: st.error("Valores inválidos nas colunas de Status ou Prioridade.")
                        else:
                            dup_banco = df_c[df_c['Numero_Nota'].isin(df_base['Numero_Nota'].values)]['Numero_Nota'].astype(int).tolist()
                            dup_lote = df_c[df_c.duplicated(subset=['Numero_Nota'])]['Numero_Nota'].astype(int).tolist()
                            if dup_lote: st.error("Notas duplicadas no lote.")
                            elif dup_banco: st.error("Notas já existem no banco.")
                            else:
                                st.session_state.sincronizando = True
                                travar_fechamento_aba(travar=True)
                                try:
                                    max_id = df_base['ID_Cronologia'].max() if not df_base.empty and 'ID_Cronologia' in df_base.columns and df_base['ID_Cronologia'].notna().any() else 0
                                    df_c['ID_Cronologia'] = range(int(max_id) + 1, int(max_id) + 1 + len(df_c))
                                    df_c['Regional'] = df_c['Local_Instalacao'].astype(str).str[:3].map(DE_PARA_REGIONAL).fillna("-")
                                    if 'Centro_Responsavel' not in df_c.columns: df_c['Centro_Responsavel'] = "-"
                                
                                    with st.spinner("Processando..."):
                                        salvar_em_massa(df_c)
                                        disparar_excel_segundo_plano(puxar_dados_completos_da_rede())
                                
                                    # CORREÇÃO: Lote Otimista Livre
                                    st.session_state.df_base = pd.concat([st.session_state.df_base, df_c], ignore_index=True)
                                    st.session_state.df_temp_massa = pd.DataFrame(columns=col_essenciais)
                                    st.session_state.reset_key += 1
                                    st.toast("Sucesso!", icon="✅")
                                    carregar_logs_cached.clear()
                                    st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                                finally:
                                    st.session_state.sincronizando = False; travar_fechamento_aba(travar=False); time.sleep(1); st.rerun()

        else:
            if not st.session_state.ramal_carregado:
                st.warning("⚠️ **Base de Dados de Ramal Desativada**")
                if st.button("📥 Carregar Banco", key="btn_load_rm_ms", type="primary"): st.session_state.ramal_carregado = True; st.rerun()
            else:
                col_r = ["Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao", "Planejado_DDPM", "Mes_Execucao_Planejado", "CenTrab_Respon", "Prioridade_Nota", "Observacao", "Extracao_Antiga"]
                if "df_tmp_r" not in st.session_state: st.session_state.df_tmp_r = pd.DataFrame(columns=col_r)
                if "rk_rm" not in st.session_state: st.session_state.rk_rm = 0
                if st.button("Limpar"): st.session_state.df_tmp_r = pd.DataFrame(columns=col_r); st.session_state.rk_rm += 1; st.rerun()
                
                with st.form("f_rm", clear_on_submit=True):
                    df_er = st.data_editor(st.session_state.df_tmp_r, column_config={**config_colunas_total, "Prioridade_Nota": st.column_config.TextColumn("Prioridade", required=True)}, column_order=col_r, num_rows="dynamic", use_container_width=True, key=f"e_rm_{st.session_state.rk_rm}")
                    b_sr = st.form_submit_button("💾 Salvar", type="primary", disabled=st.session_state.get('sincronizando', False))
                    
                if b_sr:
                    if not df_er.empty:
                        df_erc = df_er.copy()
                        if df_erc['Numero_Nota'].isnull().any(): st.error("Erro!")
                        else:
                            st.session_state.sincronizando = True
                            travar_fechamento_aba(travar=True)
                            try:
                                max_id = df_base_ramal['ID_Cronologia'].max() if not df_base_ramal.empty and 'ID_Cronologia' in df_base_ramal.columns and df_base_ramal['ID_Cronologia'].notna().any() else 0
                                df_erc['ID_Cronologia'] = range(int(max_id) + 1, int(max_id) + 1 + len(df_erc))
                                with st.spinner("Processando..."):
                                    salvar_em_massa_ramal(df_erc)
                                    carregar_base_ramal_pronta.clear()
                                    st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                                st.session_state.df_tmp_r = pd.DataFrame(columns=col_r)
                                st.session_state.rk_rm += 1
                                st.toast("Sucesso!", icon="✅")
                            finally:
                                st.session_state.sincronizando = False; travar_fechamento_aba(travar=False); time.sleep(1); st.rerun()

# region 7. CONFIGURAÇÕES
with aba_configuracao: 
    tab_resp, tab_bases_apoio, tab_backups = st.tabs(["Responsáveis por Conjunto", "Bases de Apoio (Excel)", "Backups do Sistema"])
    
    with tab_resp:
        st.markdown("### Responsáveis por Conjunto")
        with st.expander("Editar Responsáveis", expanded=False):
            if "df_responsaveis" not in st.session_state:
                st.session_state.df_responsaveis = pd.DataFrame(list(carregar_responsaveis().items()), columns=["Conjunto", "Responsável Conjunto"])
            df_editado_resp = st.data_editor(st.session_state.df_responsaveis, column_config={"Conjunto": st.column_config.TextColumn("Conjunto", disabled=False)}, use_container_width=True, hide_index=True)
            col_btn1, col_btn2 = st.columns([2, 10])
            with col_btn1:
                if st.button("Adicionar", type="secondary"):
                    st.session_state.df_responsaveis = pd.concat([df_editado_resp, pd.DataFrame({"Conjunto": [f"Novo {len(df_editado_resp) + 1}"], "Responsável Conjunto": [""]})], ignore_index=True)
                    st.rerun()
            with col_btn2:
                if st.button("Salvar", type="primary"):
                    salvar_responsaveis(dict(zip(df_editado_resp["Conjunto"], df_editado_resp["Responsável Conjunto"])))
                    st.success("Atualizado!")
                    st.session_state.df_responsaveis = df_editado_resp
                    carregar_base_pronta.clear(); st.rerun()

    with tab_bases_apoio:
        st.markdown("### Gestão das Bases de Apoio (Excel)")
        PASTA_BASES = os.path.join(CAMINHO_PASTA_SQL, "Bases_Apoio")
        BASES_APOIO = {"Indicador": "Indicador base conjunto - Limite Aneel.xlsx", "Clientes": "Clientes_Conjunto.xlsx", "Custos Modulares": "Custo_Modular.xlsx", "Ganhos": "Ganhos.xlsx", "Históricos": "Table1.xlsx"}
        for nome_base, nome_arquivo in BASES_APOIO.items():
            caminho_completo = os.path.join(PASTA_BASES, nome_arquivo)
            with st.expander(nome_base):
                col_info, col_download, col_upload = st.columns([4, 2, 4])
                with col_info: st.markdown(f"`{nome_arquivo}`")
                with col_download:
                    if os.path.exists(caminho_completo):
                        with open(caminho_completo, "rb") as file: st.download_button("Baixar Atual", data=file, file_name=nome_arquivo, key=f"dl_{nome_arquivo}", use_container_width=True)
                with col_upload:
                    uploaded_file = st.file_uploader("Substituir", type=["xlsx"], key=f"up_{nome_arquivo}", label_visibility="collapsed")
                    if uploaded_file and st.button("Confirmar Substituição", key=f"btn_sub_{nome_arquivo}", type="primary"):
                        with open(caminho_completo, "wb") as f: f.write(uploaded_file.getbuffer())
                        salvar_log_arquivo(nome_arquivo, os.getlogin() if hasattr(os, 'getlogin') else 'Desconhecido', datetime.datetime.now(), "Substituição")
                        st.success("Atualizado!"); st.cache_data.clear(); time.sleep(1); st.rerun()

    with tab_backups:
        st.markdown("### Gerenciamento de Backups")
        caminho_db = obter_caminho_banco()
        diretorio_backup = os.path.join(os.path.dirname(caminho_db), "backups")
        if not os.path.exists(diretorio_backup): os.makedirs(diretorio_backup, exist_ok=True)
            
        col_btn_abrir, _ = st.columns([3, 7])
        with col_btn_abrir:
            if st.button("📂 Abrir Pasta de Backups no Windows", use_container_width=True):
                try: os.startfile(diretorio_backup)
                except Exception: st.info(f"Acesse: {diretorio_backup}")
                    
        st.divider()
        st.markdown("#### ⚠️ Restaurar Banco de Dados")
        st.warning("Restaurar um backup SUBSTITUIRÁ o banco atual.")
        arquivo_restauracao = st.file_uploader("Arraste o backup (.db):", type=["db", "sqlite", "db3"])
        if arquivo_restauracao and st.button("🚨 CONFIRMAR RESTAURAÇÃO", type="primary"):
            try:
                st.session_state.sincronizando = True
                travar_fechamento_aba(travar=True)
                with st.spinner("Restaurando... NÃO FECHE A PÁGINA."):
                    with open(caminho_db, "wb") as f: f.write(arquivo_restauracao.getbuffer())
                    st.cache_data.clear()
                    if 'df_base' in st.session_state: del st.session_state.df_base
                    st.session_state.timestamp_sessao = obter_data_ultima_alteracao()
                st.success("Restaurado!"); time.sleep(2)
            finally:
                st.session_state.sincronizando = False; travar_fechamento_aba(travar=False); st.rerun()
# endregion

# region 8. RELATÓRIOS
with aba_relatorios:
    st.markdown("### 📊 Relatórios e Dashboards Gerenciais")
    st.info("💡 **Dica:** Os gráficos abaixo respondem aos filtros globais da barra lateral (Pesquisa de Notas) e ao seletor de Anos.")
    
    df_vis = df_base.copy()
    
    tab_dashboard, tab_financeiro, tab_indicadores, tab_auditoria = st.tabs([
        "📊 Dashboard Geral", "💰 Financeiro & Custos", "📈 Indicadores", "⏱️ Auditoria e Qualidade"
    ])
    
    with tab_dashboard:
        busca_dash = st.text_input("🔎 Pesquisar no Dashboard Geral:", key="busca_dash_input")
        df_dash = filtrar_por_busca_nota(df_vis, busca_dash)
        
        if not df_dash.empty:
            # 1. KPIs Principais
            qtd_total = len(df_dash)
            # Conta as encerradas (qualquer status que comece com 99)
            qtd_encerradas = df_dash['Status_Nota'].astype(str).str.startswith('99', na=False).sum()
            qtd_andamento = qtd_total - qtd_encerradas
            vol_plan = pd.to_numeric(df_dash['Planejado_DDPM'], errors='coerce').sum()
            
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("📌 Total de Notas", f"{qtd_total:,}")
            c2.metric("⏳ Em Andamento", f"{qtd_andamento:,}")
            c3.metric("✅ Encerradas (Status 99)", f"{qtd_encerradas:,}")
            c4.metric("💵 Volume Planejado (DDPM)", f"R$ {vol_plan:,.2f}")
            
            st.divider()
            
            # 2. Gráficos Plotly
            col_chart1, col_chart2 = st.columns(2)
            
            with col_chart1:
                # Gráfico de Barras: Status das Notas
                df_status = df_dash['Status_Nota'].value_counts().reset_index()
                df_status.columns = ['Status_Nota', 'Contagem']
                fig_status = px.bar(df_status, x='Contagem', y='Status_Nota', orientation='h', 
                                    title='Distribuição por Status', text='Contagem', color='Status_Nota')
                fig_status.update_layout(showlegend=False, yaxis={'categoryorder':'total ascending'})
                st.plotly_chart(fig_status, use_container_width=True)
                
            with col_chart2:
                # Gráfico de Pizza: Regional
                df_reg = df_dash['Regional'].value_counts().reset_index()
                df_reg.columns = ['Regional', 'Contagem']
                fig_reg = px.pie(df_reg, names='Regional', values='Contagem', hole=0.4, 
                                 title='Distribuição por Regional')
                fig_reg.update_traces(textposition='inside', textinfo='percent+label')
                st.plotly_chart(fig_reg, use_container_width=True)
                
            # Gráfico de Barras: Mês de Execução Planejado
            st.markdown("#### Volume de Notas por Mês de Execução Planejado")
            df_mes = df_dash['Mes_Execucao_Planejado'].value_counts().reset_index()
            df_mes.columns = ['Mes_Execucao', 'Quantidade']
            # Remove os vazios para o gráfico ficar limpo
            df_mes = df_mes[~df_mes['Mes_Execucao'].isin(['-', '', 'nan', 'None'])]
            
            if not df_mes.empty:
                fig_mes = px.bar(df_mes, x='Mes_Execucao', y='Quantidade', text='Quantidade', 
                                 title='Cronograma Planejado', color_discrete_sequence=['#1f77b4'])
                st.plotly_chart(fig_mes, use_container_width=True)

    with tab_financeiro:
        busca_fin = st.text_input("🔎 Pesquisar no Financeiro:", key="busca_fin_input")
        df_fin = filtrar_por_busca_nota(df_vis, busca_fin)
        
        if not df_fin.empty:
            # Força a leitura numérica dos campos financeiros
            df_fin['Total_planejado_ordem'] = pd.to_numeric(df_fin.get('Total_planejado_ordem', 0), errors='coerce').fillna(0)
            df_fin['Total_real_ordem'] = pd.to_numeric(df_fin.get('Total_real_ordem', 0), errors='coerce').fillna(0)
            
            tot_plan_sap = df_fin['Total_planejado_ordem'].sum()
            tot_real_sap = df_fin['Total_real_ordem'].sum()
            
            c1, c2, c3 = st.columns(3)
            c1.metric("💰 Total Planejado SAP (Ordem)", f"R$ {tot_plan_sap:,.2f}")
            c2.metric("💸 Total Realizado SAP (Ordem)", f"R$ {tot_real_sap:,.2f}")
            
            # Calcula o desvio (Delta)
            delta_fin = tot_real_sap - tot_plan_sap
            cor_delta = "normal" if delta_fin <= 0 else "inverse" # Vermelho se gastou mais do que devia
            c3.metric("📉 Desvio (Real vs Plan)", f"R$ {delta_fin:,.2f}", delta=f"R$ {delta_fin:,.2f}", delta_color=cor_delta)
            
            st.divider()
            
            col_f1, col_f2 = st.columns(2)
            with col_f1:
                st.markdown("#### 🏆 Top 10 Obras mais Caras (Realizado)")
                if 'Conjunto' in df_fin.columns:
                    top_10_caras = df_fin.nlargest(10, 'Total_real_ordem')[['Numero_Nota', 'Conjunto', 'Total_real_ordem']]
                    st.dataframe(top_10_caras, use_container_width=True, hide_index=True)
            
            with col_f2:
                st.markdown("#### 🏢 Custos por Regional")
                df_fin_reg = df_fin.groupby('Regional')[['Total_planejado_ordem', 'Total_real_ordem']].sum().reset_index()
                fig_fin_reg = px.bar(df_fin_reg, x='Regional', y=['Total_planejado_ordem', 'Total_real_ordem'], 
                                     barmode='group', title='Planejado vs Realizado SAP',
                                     labels={'value': 'Valor (R$)', 'variable': 'Tipo de Custo'})
                st.plotly_chart(fig_fin_reg, use_container_width=True)

    with tab_indicadores:
        busca_ind = st.text_input("🔎 Pesquisar em Indicadores:", key="busca_ind_input")
        df_ind = filtrar_por_busca_nota(df_vis, busca_ind)
        
        if not df_ind.empty:
            # Formatação numérica
            for col in ['CHI', 'CI', 'DEC', 'FEC']:
                df_ind[col] = pd.to_numeric(df_ind.get(col, 0), errors='coerce').fillna(0)
                
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("📊 Impacto Total DEC", f"{df_ind['DEC'].sum():,.4f}")
            c2.metric("📉 Impacto Total FEC", f"{df_ind['FEC'].sum():,.4f}")
            c3.metric("⚡ Soma CHI", f"{df_ind['CHI'].sum():,.2f}")
            c4.metric("🔌 Soma CI", f"{df_ind['CI'].sum():,.2f}")
            
            st.divider()
            
            col_i1, col_i2 = st.columns(2)
            with col_i1:
                st.markdown("#### 🏆 Top 10 Conjuntos Críticos (Maior Impacto DEC)")
                if 'Conjunto' in df_ind.columns:
                    # Agrupa DEC e FEC por Conjunto
                    df_dec_conj = df_ind.groupby('Conjunto')[['DEC', 'FEC']].sum().reset_index()
                    # Ordena pelo pior DEC
                    top_10_dec = df_dec_conj.nlargest(10, 'DEC')
                    
                    st.dataframe(
                        top_10_dec, 
                        column_config={
                            "DEC": st.column_config.NumberColumn("Impacto DEC", format="%.4f"),
                            "FEC": st.column_config.NumberColumn("Impacto FEC", format="%.4f")
                        },
                        use_container_width=True, 
                        hide_index=True
                    )
            with col_i2:
                st.markdown("#### 📊 Impacto DEC e FEC por Regional")
                df_dec_reg = df_ind.groupby('Regional')[['DEC', 'FEC']].sum().reset_index()
                
                # Gráfico de barras agrupadas (Plotly Graph Objects para múltiplas barras)
                import plotly.graph_objects as go
                fig_ind = go.Figure()
                fig_ind.add_trace(go.Bar(x=df_dec_reg['Regional'], y=df_dec_reg['DEC'], name='DEC', marker_color='#ef553b'))
                fig_ind.add_trace(go.Bar(x=df_dec_reg['Regional'], y=df_dec_reg['FEC'], name='FEC', marker_color='#636efa'))
                
                fig_ind.update_layout(
                    title='Desempenho dos Indicadores por Regional',
                    barmode='group',
                    xaxis_title="Regional",
                    yaxis_title="Impacto Acumulado",
                    legend_title="Indicador"
                )
                
                st.plotly_chart(fig_ind, use_container_width=True)

    with tab_auditoria:
        st.info("⚠️ Para auditar notas antigas ou pendências do ano passado, ative a opção **'Carregar Todos os Anos'** na barra lateral da esquerda.")
        busca_aud = st.text_input("🔎 Pesquisar na Auditoria:", key="busca_aud_input")
        df_aud = filtrar_por_busca_nota(df_vis, busca_aud)
        
        if not df_aud.empty:
            col_a1, col_a2 = st.columns(2)
            
            with col_a1:
                st.markdown("#### 🚨 Anomalia: Notas Abertas sem Ordem SAP")
                # Filtra notas que não estão encerradas (99) mas não têm a Ordem preenchida
                df_sem_ordem = df_aud[
                    (~df_aud['Status_Nota'].astype(str).str.startswith('99', na=False)) & 
                    (df_aud.get('Ordem', '').astype(str).replace(['nan', 'None', '-', ''], '').str.strip() == '')
                ]
                st.warning(f"{len(df_sem_ordem)} notas ativas não possuem Número de Ordem registrado.")
                if not df_sem_ordem.empty:
                    st.dataframe(df_sem_ordem[['Numero_Nota', 'Status_Nota', 'Regional']], use_container_width=True, hide_index=True)
                
            with col_a2:
                st.markdown("#### 🚨 Anomalia: Planejamento Zerado")
                # Filtra notas que não estão encerradas mas têm Planejado DDPM zerado
                df_zeradas = df_aud[
                    (~df_aud['Status_Nota'].astype(str).str.startswith('99', na=False)) & 
                    (pd.to_numeric(df_aud['Planejado_DDPM'], errors='coerce').fillna(0) == 0)
                ]
                st.warning(f"{len(df_zeradas)} notas ativas possuem Orçamento Planejado (DDPM) igual a zero.")
                if not df_zeradas.empty:
                    if 'Conjunto' in df_zeradas.columns:
                        st.dataframe(df_zeradas[['Numero_Nota', 'Conjunto', 'Planejado_DDPM']], use_container_width=True, hide_index=True)
                    else:
                        st.dataframe(df_zeradas[['Numero_Nota', 'Planejado_DDPM']], use_container_width=True, hide_index=True)
# endregion
# region 9. LOGS E AUDITORIA
with aba_logs:
    st.markdown("### 📜 Histórico e Auditoria de Sistema")
    
    sub_log_geral, sub_timeline = st.tabs(["Log Geral de Alterações", "Timeline da Nota"])
    
    with sub_log_geral:
        col_refresh, _ = st.columns([2, 10])
        with col_refresh:
            if st.button("🔄 Atualizar Histórico", key="btn_refresh_logs", use_container_width=True):
                carregar_logs_cached.clear()
                st.rerun()
                
        df_logs = carregar_logs_cached(limite=2000)
        
        if not df_logs.empty:
            st.dataframe(
                df_logs.sort_values(by="Data_Hora", ascending=False),
                column_config={
                    "ID_Log": st.column_config.NumberColumn("ID", format="%d"),
                    "Nota_ID": st.column_config.NumberColumn("Nº Nota", format="%d"),
                    "Usuario": st.column_config.TextColumn("Usuário"),
                    "Data_Hora": st.column_config.DatetimeColumn("Data/Hora", format="DD/MM/YYYY HH:mm:ss"),
                    "Campo_Alterado": st.column_config.TextColumn("Campo Alterado"),
                    "Valor_Antigo": st.column_config.TextColumn("Valor Antigo (De)"),
                    "Valor_Novo": st.column_config.TextColumn("Valor Novo (Para)"),
                },
                use_container_width=True,
                hide_index=True,
                height=500
            )
        else:
            st.info("Nenhuma alteração manual foi registrada no banco de dados ainda.")

    with sub_timeline:
        st.markdown("#### Timeline Individual")
        st.write("Pesquise o histórico de vida (todas as edições) de uma nota específica.")
        
        nota_pesquisa = st.number_input("Digite o Nº da Nota:", min_value=0, step=1, format="%d", key="timeline_busca_nota")
        
        if nota_pesquisa > 0:
            df_timeline = carregar_logs_cached(limite=None, numero_nota=nota_pesquisa)
            
            if not df_timeline.empty:
                df_timeline = df_timeline.sort_values(by="Data_Hora", ascending=False)
                
                for _, row in df_timeline.iterrows():
                    dt_val = row['Data_Hora']
                    if pd.notnull(dt_val):
                        data_formatada = dt_val.strftime('%d/%m/%Y %H:%M:%S') if hasattr(dt_val, 'strftime') else str(dt_val)
                    else:
                        data_formatada = 'Data Desconhecida'
                        
                    with st.container(border=True):
                        st.markdown(f"**{data_formatada}** | Modificado por: `{row['Usuario']}`")
                        st.markdown(f"Alterou o campo **{row['Campo_Alterado']}** de `{row['Valor_Antigo']}` ➡️ `{row['Valor_Novo']}`")
            else:
                st.warning(f"Nenhum histórico de edições encontrado para a nota {nota_pesquisa}.")
# endregion