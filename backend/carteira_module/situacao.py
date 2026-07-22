"""Situacao da nota: funcao pura sobre a projecao + presenca no plano."""


def derivar(nota: dict, numeros_no_plano: set[int]) -> str:
    if nota.get("status_sap") == "Cancelado":
        return "cancelada"
    if nota.get("status_sap") == "Encerrado" or nota.get("data_encerramento_exec"):
        return "executada"
    if nota.get("sap_real") == 1:
        try:
            numero = int(nota.get("id_sap"))
        except (TypeError, ValueError):
            numero = None
        if numero is not None and numero in numeros_no_plano:
            return "no_plano"
    return "fora_do_plano"
