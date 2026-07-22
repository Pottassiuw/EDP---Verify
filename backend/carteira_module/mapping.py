"""Normalizacao origem Databricks -> dominio da Carteira."""
import hashlib
import json

from carteira_module import config

SENTINELA_SAP = "10000000"
QUANTIDADE_SENTINELA = 9999

# Nome da coluna de descricao vem com acento na origem (descrição_conjunto).
_COL_DESCRICAO = "descrição_conjunto"


def de_para_regional(csd: str | None) -> str | None:
    if csd is None:
        return None
    return config.DE_PARA_REGIONAL.get(csd, csd)


def _texto(valor) -> str | None:
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None


def _inteiro(valor) -> int | None:
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def normalizar_linha(origem: dict) -> dict:
    id_sap = _texto(origem.get("id_sap"))
    sap_real = 1 if (id_sap and id_sap != SENTINELA_SAP) else 0
    quantidade = _inteiro(origem.get("quantidade"))
    quantidade_valida = 1 if (quantidade is not None
                              and quantidade != QUANTIDADE_SENTINELA) else 0
    csd = _texto(origem.get("CSD"))
    return {
        "id_onr": _inteiro(origem.get("id_onr")),
        "id_sap": id_sap,
        "sap_real": sap_real,
        "conjunto": _texto(origem.get("conjunto")),
        "descricao_conjunto": _texto(origem.get(_COL_DESCRICAO)),
        "regional": de_para_regional(csd),
        "csd_origem": csd,
        "empresa": _texto(origem.get("EMPRESA")),
        "quantidade": quantidade,
        "quantidade_valida": quantidade_valida,
        "prioridade": _texto(origem.get("prioridade")),
        "prioridade_sap": _inteiro(origem.get("Prioridade_SAP")),
        "status_sap": _texto(origem.get("Status_SAP")),
        "data_encerramento_exec": _texto(origem.get("Data_encerramento_exec")),
        "local_instalacao": _texto(origem.get("local_instalacao")),
        "alimentador": _texto(origem.get("alimentador")),
        "executor": _texto(origem.get("executor")),
        "sintoma": _texto(origem.get("sintoma")),
        "componente_novo": _texto(origem.get("componente_novo")),
        "kit": _texto(origem.get("kit")),
        "n_trafo": _texto(origem.get("n_trafo")),
        "dispositivo_protecao": _texto(origem.get("dispositivo_protecao")),
        "latitude": _texto(origem.get("latitude")),
        "longitude": _texto(origem.get("longitude")),
    }


def hash_conteudo(nota: dict) -> str:
    """Hash estavel das colunas de negocio (o proprio dict de normalizar_linha)."""
    material = json.dumps(nota, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()
