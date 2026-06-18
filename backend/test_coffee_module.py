"""Testes do módulo COFFEE (backend)."""
from coffee_module import classify, config


def test_classificacao_pendente():
    assert classify.classificar(config.SAP_PENDENTE, None) == "pendente"
    assert classify.classificar(config.SAP_PENDENTE, 17247854) == "pendente"


def test_classificacao_corrigida_na_transicao():
    # anterior era placeholder, atual virou SAP real
    assert classify.classificar(17247854, config.SAP_PENDENTE) == "corrigida"


def test_classificacao_gerada():
    # primeira busca já com SAP real (sem anterior conhecido)
    assert classify.classificar(17247854, None) == "gerada"
    # transição já "consumida": anterior também é real
    assert classify.classificar(17247854, 17247854) == "gerada"
