"""Configuração do módulo COFFEE: chave da API, URL base, delays e constantes."""
import os
from pathlib import Path


def data_dir() -> Path:
    """Diretório de dados local (sobrescritível por env para testes)."""
    return Path(
        os.environ.get(
            "COFFEE_DATA_DIR", str(Path(__file__).resolve().parent.parent / "data")
        )
    )


COFFEE_API_KEY = os.environ.get(
    "COFFEE_API_KEY", "CC575E3C071BB24932AC90F1D9E59537AD9974D47582042098DA28E1"
)
DELAY_BUSCA = float(os.environ.get("COFFEE_DELAY_BUSCA", "1.0"))
DELAY_GERACAO = float(os.environ.get("COFFEE_DELAY_GERACAO", "0.5"))
SAP_PENDENTE = 10000000


def base_url() -> str:
    """URL base da API externa. Falha claro se a chave não estiver definida."""
    if not COFFEE_API_KEY:
        raise RuntimeError(
            "COFFEE_API_KEY não definida — defina a variável de ambiente."
        )
    return f"https://coffee.edp.gpti.com.br/api/{COFFEE_API_KEY}/deolhonarede"
