"""Configuracao do modulo Carteira: caminhos, fonte e dominio."""
import os
from pathlib import Path

from databricks_module import config as dbx


def data_dir() -> Path:
    return Path(
        os.environ.get(
            "CARTEIRA_DATA_DIR", str(Path(__file__).resolve().parent.parent / "data")
        )
    )


CATALOGO = dbx.catalogo()      # sandbox_uc (via .env)
SCHEMA = dbx.schema_padrao()   # ddpm (via .env)
TABELA = "coffee_onr_es_sp"

REGIONAIS_SP = (
    "GUARATINGUETÁ", "SÃO JOSÉ DOS CAMPOS", "GUARULHOS",
    "SUZANO", "MOGI DAS CRUZES", "LITORAL",
)

DE_PARA_REGIONAL = {
    "LITORAL": "Litoral Norte",
    "SUZANO": "Poá-Suzano",
}

TAMANHO_CHUNK = 10000
