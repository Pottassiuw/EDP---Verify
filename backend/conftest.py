"""Configuração global do Pytest para blindagem do banco de dados real.

Este arquivo é carregado AUTOMATICAMENTE pelo pytest antes de qualquer módulo de teste.
Ele garante que NENHUM teste possa ler ou alterar o banco de dados oficial em backend/data/.
"""
import os
import tempfile
import pytest

# Garante que durante a execução do pytest os diretórios de dados sejam SEMPRE isolados
_tmp_test_dir = tempfile.mkdtemp(prefix="edp_global_test_")
os.environ["INPUT_DATA_DIR"] = _tmp_test_dir
os.environ["COFFEE_DATA_DIR"] = _tmp_test_dir

@pytest.fixture(scope="session", autouse=True)
def blindar_banco_producao():
    """Fixture de sessão executada automaticamente em todos os testes."""
    assert os.environ.get("INPUT_DATA_DIR") == _tmp_test_dir
    assert os.environ.get("COFFEE_DATA_DIR") == _tmp_test_dir
    yield
