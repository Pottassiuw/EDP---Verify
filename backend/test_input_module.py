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
