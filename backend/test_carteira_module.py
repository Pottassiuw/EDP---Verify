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
