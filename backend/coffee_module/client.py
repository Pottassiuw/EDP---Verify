"""Cliente da API externa COFFEE (httpx). Encapsula as 4 chamadas."""
import json

import httpx

from coffee_module import config

_TIMEOUT = 120


def buscar_nota(id) -> dict:
    """GET json_all/{id}. Faz o duplo-parse e retorna campos-chave + fields."""
    resp = httpx.get(f"{config.base_url()}/json_all/{id}", timeout=_TIMEOUT)
    resp.raise_for_status()
    bruto = resp.json()
    if isinstance(bruto, str):          # resposta é uma string JSON
        bruto = json.loads(bruto)
    registro = bruto[0]
    fields = registro.get("fields", {})
    return {
        "pk": registro.get("pk"),
        "id_sap": fields.get("id_sap"),
        "arquivado": bool(fields.get("arquivado")),
        "fields": fields,
    }


def arquivar(id, sap) -> bool:
    resp = httpx.get(f"{config.base_url()}/sap/{id}/{sap}", timeout=_TIMEOUT)
    resp.raise_for_status()
    return True


def desarquivar(id) -> bool:
    resp = httpx.get(f"{config.base_url()}/desarquivar/{id}", timeout=_TIMEOUT)
    resp.raise_for_status()
    return True


def alterar_local(id, local) -> bool:
    resp = httpx.get(f"{config.base_url()}/local_instalacao/{id}/{local}", timeout=_TIMEOUT)
    resp.raise_for_status()
    return True
