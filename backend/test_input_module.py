"""Testes do módulo Input (backend)."""
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
    assert len(config.BASES_REDE) == 7
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
