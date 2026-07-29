"""Blindagem global de testes: nenhum teste toca o banco de dados real.

Sobrescreve INCONDICIONALMENTE os diretórios de dados para um tmp de sessão
ANTES de qualquer import dos módulos de produção. Diferente de
``os.environ.setdefault`` (que vira no-op quando a variável já existe),
a atribuição direta vence uma env herdada apontando para ``backend/data``.

Cobre até testes que esquecem de usar a fixture de isolamento e arquivos de
teste sem guarda própria (ex.: carteira).
"""
import os
import tempfile
import pytest

_tmp_dados_teste = tempfile.mkdtemp(prefix="edp_test_")

# Todos os módulos resolvem o diretório de dados por estas envs (config.data_dir()).
for _var in ("INPUT_DATA_DIR", "COFFEE_DATA_DIR", "CARTEIRA_DATA_DIR"):
    os.environ[_var] = _tmp_dados_teste

@pytest.fixture(scope="session", autouse=True)
def blindar_banco_producao():
    """Fixture de sessão executada automaticamente em todos os testes."""
    for _var in ("INPUT_DATA_DIR", "COFFEE_DATA_DIR", "CARTEIRA_DATA_DIR"):
        assert os.environ.get(_var) == _tmp_dados_teste
    yield

