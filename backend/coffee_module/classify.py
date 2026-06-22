"""Classificação de notas COFFEE a partir do id_sap (atual × anterior)."""
from coffee_module import config


def classificar(id_sap_atual, id_sap_anterior) -> str:
    """nao_gerada | pendente | corrigida | gerada — ver spec. arquivado NÃO entra aqui."""
    if not id_sap_atual:
        return "nao_gerada"
    if id_sap_atual == config.SAP_PENDENTE:
        return "pendente"
    if id_sap_anterior == config.SAP_PENDENTE and id_sap_atual != config.SAP_PENDENTE:
        return "corrigida"
    return "gerada"
