"""Testes do modulo Carteira (backend). Origem Databricks sempre mockada."""
import pytest


@pytest.fixture
def carteira_tmp(monkeypatch, tmp_path):
    monkeypatch.setenv("CARTEIRA_DATA_DIR", str(tmp_path))
    from carteira_module import db
    db.inicializar_banco()
    return tmp_path


def test_inicializar_cria_tabelas(carteira_tmp):
    from carteira_module import db
    conn = db.conectar()
    nomes = {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    conn.close()
    assert {"nota_carteira", "carteira_sync_execucoes",
            "carteira_logs", "carteira_meta"} <= nomes


def test_versao_e_meta(carteira_tmp):
    from carteira_module import db
    v0 = db.obter_versao()
    conn = db.conectar()
    db.definir_meta(conn, "ultimo_refresh_marker", "22-07-2026 07:33")
    db.bump_versao(conn)
    conn.commit()
    conn.close()
    assert db.obter_meta("ultimo_refresh_marker") == "22-07-2026 07:33"
    assert db.obter_versao() != v0


def test_regionais_sp_e_depara():
    from carteira_module import config
    assert "GUARULHOS" in config.REGIONAIS_SP
    assert config.DE_PARA_REGIONAL["LITORAL"] == "Litoral Norte"
    assert config.DE_PARA_REGIONAL["SUZANO"] == "Poá-Suzano"


def _origem_exemplo(**over):
    base = {
        "id_onr": 555, "id_sap": "17247854", "conjunto": "POSTE",
        "descrição_conjunto": "POSTE DEMANDA", "CSD": "LITORAL",
        "EMPRESA": "EDP SP", "quantidade": 12, "prioridade": "3",
        "Prioridade_SAP": 3, "Status_SAP": "Pendente",
        "Data_encerramento_exec": None, "local_instalacao": "718ET00026773",
        "alimentador": "AL1", "executor": "EMPRESA X", "sintoma": "queda",
        "componente_novo": "N", "kit": "", "n_trafo": "", "dispositivo_protecao": "",
        "latitude": "-23.1", "longitude": "-45.2",
        "matriculaSAP": "123", "nomeColaborador": "Fulano", "colaborador": "F",
        "Solicitante": "Sol",
    }
    base.update(over)
    return base


def test_de_para_regional():
    from carteira_module import mapping
    assert mapping.de_para_regional("LITORAL") == "Litoral Norte"
    assert mapping.de_para_regional("SUZANO") == "Poá-Suzano"
    assert mapping.de_para_regional("GUARULHOS") == "GUARULHOS"
    assert mapping.de_para_regional(None) is None


def test_normalizar_linha_deriva_e_dropa_pii():
    from carteira_module import mapping
    n = mapping.normalizar_linha(_origem_exemplo())
    assert n["id_onr"] == 555
    assert n["regional"] == "Litoral Norte"
    assert n["csd_origem"] == "LITORAL"
    assert n["sap_real"] == 1
    assert n["quantidade_valida"] == 1
    assert "matriculaSAP" not in n and "nomeColaborador" not in n
    assert "colaborador" not in n and "Solicitante" not in n


def test_normalizar_linha_sap_pendente_e_quantidade_sentinela():
    from carteira_module import mapping
    n = mapping.normalizar_linha(
        _origem_exemplo(id_sap="10000000", quantidade=9999)
    )
    assert n["sap_real"] == 0
    assert n["quantidade_valida"] == 0


def test_hash_estavel_e_sensivel():
    from carteira_module import mapping
    a = mapping.normalizar_linha(_origem_exemplo())
    b = mapping.normalizar_linha(_origem_exemplo())
    assert mapping.hash_conteudo(a) == mapping.hash_conteudo(b)
    c = mapping.normalizar_linha(_origem_exemplo(Status_SAP="Encerrado"))
    assert mapping.hash_conteudo(a) != mapping.hash_conteudo(c)
