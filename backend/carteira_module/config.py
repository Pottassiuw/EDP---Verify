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

# De-para da regional da carteira (CSD normalizado) para os nomes canônicos
# de input_module.relatorios.REGIONAIS_CSD, para casar o join meta×base.
DE_PARA_REGIONAL_DASHBOARD = {
    "GUARATINGUETÁ": "Guaratinguetá",
    "GUARULHOS": "Guarulhos",
    "MOGI DAS CRUZES": "Mogi das Cruzes",
    "SÃO JOSÉ DOS CAMPOS": "São José dos Campos",
    "Litoral Norte": "Litoral Norte",
    "Poá-Suzano": "Poa/Suzano",
}

REGIONAIS_DASHBOARD = tuple(DE_PARA_REGIONAL_DASHBOARD.values())


def normalizar_regional_dashboard(regional: str | None) -> str | None:
    if regional is None:
        return None
    return DE_PARA_REGIONAL_DASHBOARD.get(regional, regional)
