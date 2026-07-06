"""Testes do módulo Input (backend)."""
import io

from input_module import config


def test_config_dicionarios_completos():
    assert config.STATUS_MAP[99] == "99 Encerrado"
    assert config.STATUS_MAP[0] == "00 Pendente"
    assert config.INV_STATUS_MAP["99 Encerrado"] == 99
    assert config.DE_PARA_REGIONAL["045"] == "Guarulhos"
    assert config.DE_PARA_CIDADES["130"] == "Mogi das Cruzes - SP"
    assert config.DE_PARA_CJ_ANEEL["POA"] == "POA"
    assert config.MAP_FILTROS["Status"] == "Status_Nota"
    assert config.MAP_ORDEM_EXECUTADA["JAND INVE"] == "SIM"
    assert config.MAP_REGIONAL_CSD["POA"] == "Poa/Suzano"
    assert len(config.BASES_REDE) == 8
    assert len(config.BASES_APOIO) == 5
    assert "Emergente" in config.PRIORIDADES
    assert config.NOMES_AMIGAVEIS["Numero_Nota"] == "Nº Nota (ID)"
    assert "Numero_Nota" in config.COLUNAS_PAINEL


def test_data_dir_respeita_env(monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path))
    assert config.data_dir() == tmp_path


import sqlite3

import pytest


@pytest.fixture
def banco_temporario(monkeypatch, tmp_path):
    """Aponta o módulo para um diretório de dados temporário e inicializa o banco."""
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path))
    from input_module import db
    db.inicializar_banco()
    return tmp_path


def test_inicializar_banco_cria_tabelas(banco_temporario):
    from input_module import db
    conn = db.get_db_connection()
    tabelas = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert {"notas", "log_alteracoes", "log_arquivos"} <= tabelas
    assert "bloqueios" not in tabelas  # fora do escopo (spec)


def test_inicializar_banco_cria_indices(banco_temporario):
    from input_module import db
    conn = db.get_db_connection()
    indices = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index'").fetchall()}
    conn.close()
    assert {"idx_log_alteracoes_nota", "idx_log_alteracoes_data",
            "idx_log_arquivos_data"} <= indices


def test_migracao_copia_banco_da_rede(monkeypatch, tmp_path):
    from input_module import config, db
    # Simula o banco "da rede" como um sqlite real noutro tmp
    origem = tmp_path / "rede.db"
    conn = sqlite3.connect(origem)
    conn.execute("CREATE TABLE notas (Numero_Nota INTEGER PRIMARY KEY)")
    conn.execute("INSERT INTO notas VALUES (123)")
    conn.commit(); conn.close()
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "dados"))
    monkeypatch.setattr(config, "REDE_DB_ORIGEM", str(origem))
    resultado = db.migrar_da_rede_se_preciso()
    assert resultado == "migrado"
    conn = db.get_db_connection()
    assert conn.execute("SELECT COUNT(*) FROM notas").fetchone()[0] == 1
    conn.close()
    # Segunda chamada: banco já existe, não migra de novo
    assert db.migrar_da_rede_se_preciso() == "ja-existe"


def test_migracao_sem_rede_retorna_indisponivel(monkeypatch, tmp_path):
    from input_module import config, db
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(config, "REDE_DB_ORIGEM", str(tmp_path / "nao_existe.db"))
    assert db.migrar_da_rede_se_preciso() == "rede-indisponivel"


# ── Tarefa 3: CRUD, logs, undo, backups, responsáveis e edição com diff ──
import pandas as pd


def _nota(numero=1000, **extras):
    base = {
        "ID_Cronologia": 1, "Numero_Nota": numero, "Status_Obra": "-",
        "Conjunto": "POA", "Circuito": "POA 123", "Local_Instalacao": "045 RL TESTE",
        "Regional": "Guarulhos", "Planejado_DDPM": 2.0,
        "Mes_Execucao_Planejado": "jun-2026", "Data_Envio_Projeto": "01/06/2026",
        "Status_Nota": "10 Em planejamento", "Prioridade_Nota": "Programável",
        "Observacao": "", "Check": "-", "Status_Anterior": "-",
        "Centro_Responsavel": "-",
    }
    base.update(extras)
    return base


def test_upsert_e_carregar(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(1000), _nota(1001, Conjunto="SUZANO")]))
    df = db.carregar_dados()
    assert len(df) == 2
    linha = df[df["Numero_Nota"] == 1000].iloc[0]
    assert linha["Status_Nota"] == "10 Em planejamento"
    assert linha["Cidade"] == "Guarulhos"
    db.salvar_em_massa(pd.DataFrame([_nota(1000, Observacao="editada")]))
    df = db.carregar_dados()
    assert len(df) == 2
    assert df[df["Numero_Nota"] == 1000].iloc[0]["Observacao"] == "editada"


def test_aplicar_edicoes_gera_diff_log_e_status_anterior(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    resultado = db.aplicar_edicoes(
        [{"Numero_Nota": 2000, "Status_Nota": "99 Encerrado", "Observacao": "feita"}],
        usuario="tester")
    assert resultado["alteradas"] == 1
    assert resultado["campos"] == 2
    df = db.carregar_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert linha["Status_Nota"] == "99 Encerrado"
    assert str(linha["Status_Anterior"]).startswith("10")  # status antigo preservado (numérico)
    logs = db.carregar_logs()
    assert set(logs["Campo_Alterado"]) == {"Status_Nota", "Observacao"}
    assert logs.iloc[0]["Usuario"] == "tester"
    resultado = db.aplicar_edicoes([{"Numero_Nota": 2000, "Observacao": "feita"}], usuario="tester")
    assert resultado["alteradas"] == 0


def test_aplicar_edicoes_nota_inexistente_da_erro(banco_temporario):
    from input_module import db
    with pytest.raises(ValueError):
        db.aplicar_edicoes([{"Numero_Nota": 999999, "Observacao": "x"}], usuario="t")


def test_reverter_ultima_alteracao(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(3000)]))
    db.aplicar_edicoes([{"Numero_Nota": 3000, "Status_Nota": "99 Encerrado"}], usuario="t")
    ok, _msg = db.reverter_ultima_alteracao()
    assert ok
    df = db.carregar_dados()
    assert df[df["Numero_Nota"] == 3000].iloc[0]["Status_Nota"] == "10 Em planejamento"
    ok, _msg = db.reverter_ultima_alteracao()
    assert not ok


def test_deletar_notas(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(4000), _nota(4001)]))
    assert db.deletar_notas([4000]) == 1
    assert list(db.carregar_dados()["Numero_Nota"]) == [4001]


def test_carregar_dados_qualidade(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([
        _nota(4300, Prioridade_Nota="Programavel", Mes_Execucao_Planejado="jun-2026"),
        _nota(4301, Prioridade_Nota="Prioritario", Mes_Execucao_Planejado="2026-12-01 00:00:00"),
    ]))
    df = db.carregar_dados()
    assert len(df) == 2
    pri = dict(zip(df["Numero_Nota"], df["Prioridade_Nota"]))
    assert pri[4300] == "Programável"
    assert pri[4301] == "Prioritário"


def test_carregar_logs_fallback_em_erro(banco_temporario, monkeypatch):
    from input_module import db

    def boom(*args, **kwargs):
        raise RuntimeError("falha simulada de leitura")

    monkeypatch.setattr(db.pd, "read_sql", boom)
    logs = db.carregar_logs()
    assert logs.empty
    assert "Campo_Alterado" in logs.columns
    arquivos = db.carregar_log_arquivos()
    assert arquivos.empty
    assert "Nome_Arquivo" in arquivos.columns


def test_deletar_notas_gera_log(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(4100)]))
    assert db.deletar_notas([4100], usuario="tester") == 1
    logs = db.carregar_logs()
    linha = logs[logs["Numero_Nota"] == 4100].iloc[0]
    assert linha["Campo_Alterado"] == "EXCLUSÃO DE NOTA"
    assert linha["Usuario"] == "tester"


def test_backup_rotativo(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(5000)]))
    db.realizar_backup(limite=20, intervalo_horas=0)
    pasta = config_backups_dir()
    arquivos = list(pasta.glob("notas_departamento_*.db"))
    assert len(arquivos) == 1
    db.realizar_backup(limite=20, intervalo_horas=2)
    assert len(list(pasta.glob("notas_departamento_*.db"))) == 1


def config_backups_dir():
    from input_module import config
    return config.data_dir() / "backups"


def test_responsaveis_roundtrip(banco_temporario):
    from input_module import db
    padrao = db.carregar_responsaveis()
    assert padrao["Poa"] == "Danilo"
    db.salvar_responsaveis({"Poa": "Maria"})
    assert db.carregar_responsaveis() == {"Poa": "Maria"}


# ── Tarefa 4: motor de enriquecimento, auditoria, cache e cópia Excel ────
def _excel_iw28(caminho):
    pd.DataFrame({
        "Nota": [2000], "Status usuário": ["LIBE"],
        "CenTrabalho princ.": ["CT-01"], "Ordem": [777],
        "Encerram.por data": [pd.Timestamp("2026-05-10")],
    }).to_excel(caminho, index=False)


def _excel_iw38(caminho):
    pd.DataFrame({
        "Ordem": [777], "Status usuário": ["JAND INVE"],
        "Status do sistema": ["ENTE"], "Total planejado": [1000.0],
        "Total real": [800.0],
    }).to_excel(caminho, index=False)


# engine.py lê IW28/IW38/IW66 do SQLite nativo (base_iw28/base_iw38/base_iw66),
# não mais do Excel de rede — os helpers acima continuam servindo test_status_bases
# (que checa existência do arquivo, não o carregamento dos dados).
def _sqlite_iw28():
    from input_module import db
    db.salvar_base_dataframe("base_iw28", pd.DataFrame({
        "Nota": [2000], "Status usuário": ["LIBE"],
        "CenTrabalho princ.": ["CT-01"], "Ordem": [777],
        "Encerram.por data": [pd.Timestamp("2026-05-10")],
    }))


def _sqlite_iw38():
    from input_module import db
    db.salvar_base_dataframe("base_iw38", pd.DataFrame({
        "Ordem": [777], "Status usuário": ["JAND INVE"],
        "Status do sistema": ["ENTE"], "Total planejado": [1000.0],
        "Total real": [800.0],
    }))


@pytest.fixture
def engine_isolado(banco_temporario, monkeypatch, tmp_path):
    """Banco temporário + caminhos de rede apontando para tmp (inexistentes por padrão)."""
    from input_module import config, engine
    for attr in ["CAMINHO_INDICADOR_CONTINUIDADE", "CAMINHO_BASE_IW28",
                 "CAMINHO_CUSTO_ORD_IW38", "CAMINHO_CLIENTES_CONJUNTO",
                 "CAMINHO_CUSTO_MODULAR", "CAMINHO_GANHOS", "CAMINHO_TABLE1",
                 "CAMINHO_PROJETO_CONSTRUCAO", "CAMINHO_BASE_IW66"]:
        monkeypatch.setattr(config, attr, str(tmp_path / f"{attr}.xlsx"))
    monkeypatch.setattr(config, "BASES_REDE", {
        "IW28": config.CAMINHO_BASE_IW28, "IW38": config.CAMINHO_CUSTO_ORD_IW38})
    engine.invalidar_cache()
    return tmp_path


def test_engine_fallbacks_sem_rede(engine_isolado):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    df = engine.enriquecer_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert linha["Export_status"] == "Pendente Extração SAP"
    assert linha["Conj.critico"] == "-"
    assert linha["Cidade"] == "Guarulhos"
    assert "Auditoria_Cronograma" in df.columns


def test_engine_cruza_iw28_iw38(engine_isolado):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000, Status_Nota="99 Encerrado")]))
    _sqlite_iw28()
    _sqlite_iw38()
    df = engine.enriquecer_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert linha["Export_status"] == "LIBE"
    assert linha["Ordem"] == "777"
    assert linha["Ordem_Executada"] == "SIM"
    assert float(linha["Total_real_ordem"]) == 800.0
    assert float(linha["Exec_percentagem_ordem"]) == pytest.approx(80.0)


def test_auditoria_cronograma(engine_isolado):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000, Status_Nota="99 Encerrado")]))
    _sqlite_iw28()
    _sqlite_iw38()
    df = engine.enriquecer_dados()
    assert df.iloc[0]["Auditoria_Cronograma"] == "🟢 Adiantado"


def test_engine_totais_numericos_e_modular(engine_isolado):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000, Status_Nota="99 Encerrado")]))
    _sqlite_iw28()
    _sqlite_iw38()
    df = engine.enriquecer_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert isinstance(linha["Total_planejado_ordem"], (int, float))
    assert isinstance(linha["Total_real_ordem"], (int, float))
    assert float(linha["Total_planejado_ordem"]) == 1000.0
    assert float(linha["Total_real_ordem"]) == 800.0
    assert "Total_planejado_modular" in df.columns
    assert float(linha["Total_planejado_modular"]) == 0.0


def test_status_map_grupo_c():
    assert config.STATUS_MAP[53].startswith("53 "), "53 deve ter prefixo numérico"
    assert 997 in config.STATUS_MAP, "997 (SUPR CANC) ausente do STATUS_MAP"
    assert config.STATUS_MAP[997] == "SUPR CANC"
    assert config.INV_STATUS_MAP[config.STATUS_MAP[53]] == 53
    assert config.INV_STATUS_MAP["SUPR CANC"] == 997


def test_status_para_int_grupo_c(banco_temporario):
    from input_module.db import status_para_int
    assert status_para_int("53 Programado Execução") == 53
    assert status_para_int("SUPR CANC") == 997
    assert status_para_int("SUPR") == 998
    assert status_para_int("ENCE EXEC") == 999


def test_converter_para_iso_data(banco_temporario):
    from input_module.db import converter_para_iso_data
    assert converter_para_iso_data("-") == "-"
    assert converter_para_iso_data("") == "-"
    assert converter_para_iso_data("jun-2026") == "2026-06-01"
    assert converter_para_iso_data("junho-2026") == "2026-06-01"
    assert converter_para_iso_data("2026-06-01") == "2026-06-01"
    assert converter_para_iso_data("2026-06-01 00:00:00") == "2026-06-01"
    assert converter_para_iso_data("dez-2025") == "2025-12-01"


def test_salvar_em_massa_preserva_mes_iso(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(9900, Mes_Execucao_Planejado="jun-2026")]))
    conn = db.get_db_connection()
    row = conn.execute("SELECT Mes_Execucao_Planejado FROM notas WHERE Numero_Nota=9900").fetchone()
    conn.close()
    assert row[0] == "2026-06-01", f"DB deve guardar ISO, encontrado: {row[0]}"


def test_config_iw66():
    assert hasattr(config, "CAMINHO_BASE_IW66")
    assert "IW66" in config.CAMINHO_BASE_IW66.upper() or "medidas" in config.CAMINHO_BASE_IW66.lower()
    assert len(config.BASES_REDE) == 8
    assert "Medida_SAP" in config.COLUNAS_PAINEL
    assert "Medida_vs_Planejado" in config.COLUNAS_PAINEL
    assert "Medida SAP" in config.MAP_FILTROS


def _excel_iw66(caminho):
    pd.DataFrame({
        "Nota": [2000, 2000, 2000],
        "Denominação do conjunto": ["REDE", "POSTE", "REDE"],
        "Texto medida": ["CABO", "POSTE", "CONDUTOR"],
        "Descrição": ["", "", ""],
        "Nº de ordenação": [500.0, 2.0, 300.0],
    }).to_excel(caminho, index=False)


def _sqlite_iw66():
    from input_module import db
    db.salvar_base_dataframe("base_iw66", pd.DataFrame({
        "Nota": [2000, 2000, 2000],
        "Denominação do conjunto": ["REDE", "POSTE", "REDE"],
        "Texto medida": ["CABO", "POSTE", "CONDUTOR"],
        "Descrição": ["", "", ""],
        "Nº de ordenação": [500.0, 2.0, 300.0],
    }))


def test_engine_medidas_iw66_sem_arquivo(engine_isolado):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    df = engine.enriquecer_dados()
    assert "Medida_SAP" in df.columns
    assert "Medida_vs_Planejado" in df.columns
    assert df.iloc[0]["Medida_SAP"] == "-"
    assert df.iloc[0]["Medida_vs_Planejado"] == "-"


def test_engine_medidas_iw66_com_dados(engine_isolado):
    from input_module import db, engine
    _sqlite_iw66()
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    engine.invalidar_cache()
    df = engine.enriquecer_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert "km" in str(linha["Medida_SAP"])
    assert "un" in str(linha["Medida_SAP"])
    assert linha["Medida_vs_Planejado"] in ("Sim", "Não")


def test_comparar_medida_planejado():
    from input_module.engine import _comparar_medida_planejado
    assert _comparar_medida_planejado("-", 2.0) == "-"
    assert _comparar_medida_planejado("0.8 km", float("nan")) == "-"
    assert _comparar_medida_planejado("0.8 km", 800.0) == "Sim"
    assert _comparar_medida_planejado("0.8 km", 900.0) == "Não"
    assert _comparar_medida_planejado("2 un", 2.0) == "Sim"
    assert _comparar_medida_planejado("0.8 km / 2 un", 800.0) == "Sim"


def test_cache_e_invalidacao(engine_isolado):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    df1 = engine.get_dataset()
    db.salvar_em_massa(pd.DataFrame([_nota(2001)]))
    assert len(engine.get_dataset()) == len(df1)  # cache segura
    engine.invalidar_cache()
    assert len(engine.get_dataset()) == len(df1) + 1


def test_status_bases(engine_isolado):
    from input_module import config, engine
    _excel_iw28(config.CAMINHO_BASE_IW28)
    bases = engine.status_bases()
    por_nome = {b["nome"]: b for b in bases}
    assert por_nome["IW28"]["encontrada"] is True
    assert por_nome["IW38"]["encontrada"] is False


# ── Tarefa 5: endpoints de leitura /api/input/* ──────────────────────────
from fastapi.testclient import TestClient


@pytest.fixture
def cliente(engine_isolado):
    from main import app
    from input_module import routes
    routes._migracao["resultado"] = None
    return TestClient(app)


def test_get_notas_traz_registros_e_meta(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    from input_module import engine
    engine.invalidar_cache()
    r = cliente.get("/api/input/notas")
    assert r.status_code == 200
    corpo = r.json()
    assert len(corpo["registros"]) == 1
    assert corpo["registros"][0]["Numero_Nota"] == 2000
    meta = corpo["meta"]
    assert "99 Encerrado" in meta["status_opcoes"]
    assert "Emergente" in meta["prioridade_opcoes"]
    assert isinstance(meta["bases"], list)
    assert "ultima_alteracao" in meta
    assert meta["migracao"] in ("ja-existe", "migrado", "rede-indisponivel")


def test_get_sync(cliente):
    r = cliente.get("/api/input/sync")
    assert r.status_code == 200
    assert "ultima_alteracao" in r.json()


def test_get_logs_e_timeline(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    db.aplicar_edicoes([{"Numero_Nota": 2000, "Observacao": "oi"}], usuario="ana")
    assert len(cliente.get("/api/input/logs").json()["registros"]) == 1
    assert len(cliente.get("/api/input/logs/nota/2000").json()["registros"]) == 1
    assert cliente.get("/api/input/logs/nota/999").json()["registros"] == []
    assert cliente.get("/api/input/logs/arquivos").json()["registros"] == []


# ── Tarefa 6: endpoints de escrita /api/input/* ──────────────────────────
CABECALHO_USER = {"X-User": "ana"}


def test_escrita_exige_x_user(cliente):
    r = cliente.patch("/api/input/notas", json={"linhas": []})
    assert r.status_code == 400
    assert "X-User" in r.json()["detail"]


def test_patch_edita_e_loga(cliente):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    engine.invalidar_cache()
    r = cliente.patch("/api/input/notas", headers=CABECALHO_USER,
                      json={"linhas": [{"Numero_Nota": 2000, "Observacao": "via api"}]})
    assert r.status_code == 200
    assert r.json()["alteradas"] == 1
    registros = cliente.get("/api/input/notas").json()["registros"]
    assert registros[0]["Observacao"] == "via api"


def test_patch_nota_inexistente_404(cliente):
    r = cliente.patch("/api/input/notas", headers=CABECALHO_USER,
                      json={"linhas": [{"Numero_Nota": 31337, "Observacao": "x"}]})
    assert r.status_code == 404


def test_post_cria_e_rejeita_duplicata(cliente):
    nova = {"Numero_Nota": 6000, "Status_Nota": "00 Pendente",
            "Prioridade_Nota": "Programável", "Local_Instalacao": "045 RL X"}
    r = cliente.post("/api/input/notas", headers=CABECALHO_USER, json=nova)
    assert r.status_code == 200
    from input_module import db
    df = db.carregar_dados()
    linha = df[df["Numero_Nota"] == 6000].iloc[0]
    assert linha["Regional"] == "Guarulhos"
    r = cliente.post("/api/input/notas", headers=CABECALHO_USER, json=nova)
    assert r.status_code == 409


def test_bulk_valida_duplicatas(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(7000)]))
    lote = {"notas": [
        {"Numero_Nota": 7000, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
        {"Numero_Nota": 7001, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
    ]}
    r = cliente.post("/api/input/notas/bulk", headers=CABECALHO_USER, json=lote)
    assert r.status_code == 409
    assert "7000" in r.json()["detail"]
    lote = {"notas": [
        {"Numero_Nota": 7002, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
        {"Numero_Nota": 7002, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
    ]}
    assert cliente.post("/api/input/notas/bulk", headers=CABECALHO_USER, json=lote).status_code == 409
    lote = {"notas": [
        {"Numero_Nota": 7003, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
        {"Numero_Nota": 7004, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
    ]}
    r = cliente.post("/api/input/notas/bulk", headers=CABECALHO_USER, json=lote)
    assert r.status_code == 200
    assert r.json()["inseridas"] == 2


def test_delete_e_desfazer(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(8000)]))
    cliente.patch("/api/input/notas", headers=CABECALHO_USER,
                  json={"linhas": [{"Numero_Nota": 8000, "Observacao": "antes do undo"}]})
    r = cliente.post("/api/input/desfazer", headers=CABECALHO_USER, json={})
    assert r.status_code == 200 and r.json()["ok"] is True
    r = cliente.request("DELETE", "/api/input/notas", headers=CABECALHO_USER,
                        json={"numeros": [8000]})
    assert r.status_code == 200 and r.json()["excluidas"] == 1


def test_export_gera_xlsx(cliente):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(9000)]))
    engine.invalidar_cache()
    r = cliente.post("/api/input/export",
                     json={"numeros": [9000], "colunas": ["Numero_Nota", "Status_Nota"]})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    df = pd.read_excel(io.BytesIO(r.content))
    assert list(df.columns) == ["Nº Nota (ID)", "Status Nota"]


# ── Tarefa 7: endpoints de configuração (responsáveis, bases, backups, migração) ──
def test_responsaveis_api(cliente):
    r = cliente.get("/api/input/responsaveis")
    assert r.json()["Poa"] == "Danilo"
    r = cliente.put("/api/input/responsaveis", headers=CABECALHO_USER,
                    json={"Poa": "Maria"})
    assert r.status_code == 200
    assert cliente.get("/api/input/responsaveis").json() == {"Poa": "Maria"}


def test_bases_lista_download_upload(cliente, monkeypatch, tmp_path):
    from input_module import config
    caminho = tmp_path / "Clientes_Conjunto.xlsx"
    pd.DataFrame({"CONJUNTO_DESC": ["POA"], "QTDE_CONJUNTO": [10]}).to_excel(caminho, index=False)
    monkeypatch.setattr(config, "BASES_APOIO", {"Clientes por Conjunto": str(caminho)})
    r = cliente.get("/api/input/bases")
    assert r.json()["bases"][0]["encontrada"] is True
    r = cliente.get("/api/input/bases/Clientes_Conjunto.xlsx/download")
    assert r.status_code == 200
    # Upload substitui o arquivo e registra no log
    conteudo = caminho.read_bytes()
    r = cliente.post("/api/input/bases/Clientes_Conjunto.xlsx",
                     headers=CABECALHO_USER,
                     files={"arquivo": ("novo.xlsx", conteudo)})
    assert r.status_code == 200
    logs = cliente.get("/api/input/logs/arquivos").json()["registros"]
    assert logs[0]["Nome_Arquivo"] == "Clientes_Conjunto.xlsx"
    assert logs[0]["Acao"] == "Substituição"
    # Base desconhecida -> 404
    assert cliente.get("/api/input/bases/nao_existe.xlsx/download").status_code == 404


def test_backups_lista_e_download(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(9500)]))
    db.realizar_backup(limite=20, intervalo_horas=0)
    r = cliente.get("/api/input/backups")
    backups = r.json()["backups"]
    assert len(backups) >= 1
    nome = backups[0]["arquivo"]
    assert cliente.get(f"/api/input/backups/{nome}/download").status_code == 200
    assert cliente.get("/api/input/backups/..%2Fhack.db/download").status_code in (400, 404)


def test_migrar_endpoint(cliente):
    r = cliente.post("/api/input/migrar", headers=CABECALHO_USER)
    assert r.status_code == 200
    assert r.json()["resultado"] in ("ja-existe", "migrado", "rede-indisponivel")


# ── Fase 4 (Grupo D): Ramal + Nota_Mae + Hierarquia ─────────────────────────
def test_inicializar_banco_cria_notas_ramal(banco_temporario):
    from input_module import db
    conn = db.get_db_connection()
    tabelas = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    colunas_notas = [r[1] for r in conn.execute("PRAGMA table_info(notas)").fetchall()]
    conn.close()
    assert "notas_ramal" in tabelas
    assert "Nota_Mae" in colunas_notas


def _nota_ramal(numero=5000, **extras):
    base = {
        "ID_Cronologia": 1, "Numero_Nota": numero,
        "Status_Obra": "-", "Conjunto": "POA", "Circuito": "POA 123",
        "Local_Instalacao": "045 RL TESTE", "Planejado_DDPM": 1.0,
        "Mes_Execucao_Planejado": "jun-2026", "CenTrab_Respon": "-",
        "Prioridade_Nota": "Programável", "Observacao": "",
        "Extracao_Antiga": "-", "Status_Nota": "00 Pendente",
        "Status_Anterior": "-", "Check_Btzero": "-", "Plano": "-",
    }
    base.update(extras)
    return base


def test_carregar_dados_ramal_vazio(banco_temporario):
    from input_module import db
    df = db.carregar_dados_ramal()
    assert df.empty
    assert "Numero_Nota" in df.columns


def test_salvar_e_carregar_ramal(banco_temporario):
    from input_module import db
    db.salvar_ramal_em_massa(pd.DataFrame([_nota_ramal(5001), _nota_ramal(5002)]))
    df = db.carregar_dados_ramal()
    assert len(df) == 2
    assert set(df["Numero_Nota"].tolist()) == {5001, 5002}
    db.salvar_ramal_em_massa(pd.DataFrame([_nota_ramal(5001, Observacao="atualizada")]))
    assert len(db.carregar_dados_ramal()) == 2  # upsert, sem duplicata


def test_deletar_notas_ramal(banco_temporario):
    from input_module import db
    db.salvar_ramal_em_massa(pd.DataFrame([_nota_ramal(5010), _nota_ramal(5011)]))
    assert db.deletar_notas_ramal([5010], usuario="tester") == 1
    assert len(db.carregar_dados_ramal()) == 1


def test_vincular_nota_mae(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(6001), _nota(6002)]))
    n = db.vincular_nota_mae_lote({"6001": [6002]}, usuario="tester")
    assert n >= 1
    df = db.carregar_dados()
    assert df[df["Numero_Nota"] == 6002].iloc[0]["Nota_Mae"] == "6001"


def test_nota_mae_nao_sobrescrita_por_salvar(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(6010), _nota(6011)]))
    db.vincular_nota_mae_lote({"6010": [6011]}, usuario="tester")
    db.salvar_em_massa(pd.DataFrame([_nota(6011, Observacao="editada")]))
    df = db.carregar_dados()
    assert df[df["Numero_Nota"] == 6011].iloc[0]["Nota_Mae"] == "6010"


def test_api_ramal_crud(cliente):
    from input_module import db, engine
    ramal_payload = {"notas": [{"Numero_Nota": 5100, "Conjunto": "POA"}]}
    r = cliente.post("/api/input/ramal/bulk", headers=CABECALHO_USER, json=ramal_payload)
    assert r.status_code == 200
    assert r.json()["inseridas"] == 1
    r = cliente.get("/api/input/ramal")
    assert r.status_code == 200
    assert len(r.json()["registros"]) == 1
    r = cliente.request("DELETE", "/api/input/ramal", headers=CABECALHO_USER,
                        json={"numeros": [5100]})
    assert r.status_code == 200
    assert r.json()["excluidas"] == 1
    assert cliente.get("/api/input/ramal").json()["registros"] == []


def test_api_hierarquia(cliente):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(7010), _nota(7011)]))
    engine.invalidar_cache()
    r = cliente.post("/api/input/hierarquia", headers=CABECALHO_USER,
                     json={"dados": {"7010": [7011]}})
    assert r.status_code == 200
    assert r.json()["atualizadas"] >= 1
    r = cliente.get("/api/input/hierarquia/7011")
    assert r.status_code == 200
    assert r.json()["nota_mae"] == "7010"
