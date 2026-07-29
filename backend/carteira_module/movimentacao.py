"""Movimentacao carteira -> plano do Input. Espelha integracao_module para a
carteira; funila por input_service.criar_notas (nao acopla os modulos)."""
import datetime
import json
import uuid

from carteira_module import db, repository
from input_module import config as input_config
from input_module import db as input_db
from input_module.service import NovaNota

DE_PARA_PRIORIDADE = {i: input_config.PRIORIDADES[i - 1] for i in range(1, 7)}
PRIORIDADE_PADRAO = "Programável"
STATUS_NOTA_INICIAL = "01 Sem providência"
CAMPOS_MANUAIS = ("Mes_Execucao_Planejado", "Status_Obra", "Observacao", "Check")


def _prioridade(valor) -> str:
    try:
        return DE_PARA_PRIORIDADE.get(int(valor), PRIORIDADE_PADRAO)
    except (TypeError, ValueError):
        return PRIORIDADE_PADRAO


def _numero(nota: dict) -> int:
    return int(nota["id_sap"])


def proposta(nota: dict) -> dict:
    return {
        "Numero_Nota": _numero(nota),
        "Conjunto": nota.get("conjunto") or "-",
        "Local_Instalacao": nota.get("local_instalacao") or "-",
        "Circuito": nota.get("alimentador") or "-",
        "Prioridade_Nota": _prioridade(nota.get("prioridade")),
        "Planejado_DDPM": float(nota.get("quantidade") or 0),
        "Status_Nota": STATUS_NOTA_INICIAL,
        "Data_Envio_Projeto": datetime.date.today().strftime("%d/%m/%Y"),
    }


def avisos(nota: dict) -> list[str]:
    saida = []
    try:
        tem_de_para = int(nota.get("prioridade")) in DE_PARA_PRIORIDADE
    except (TypeError, ValueError):
        tem_de_para = False
    if not tem_de_para:
        saida.append(f"Prioridade {nota.get('prioridade')!r} fora do de-para (1-6); "
                     f"usando '{PRIORIDADE_PADRAO}'.")
    if not (nota.get("local_instalacao") or "").strip():
        saida.append("Local de instalação vazio na carteira.")
    if not nota.get("quantidade_valida"):
        saida.append("Quantidade sem valor válido (Planejado_DDPM pode sair 0/sentinela).")
    return saida


def mapear_nova_nota(nota: dict, campos_usuario: dict) -> NovaNota:
    base = proposta(nota)
    manuais = {c: campos_usuario[c] for c in CAMPOS_MANUAIS if c in campos_usuario}
    return NovaNota(**{**base, **manuais})


def _motivo_bloqueio(nota: dict) -> str | None:
    if not nota.get("sap_real"):
        return "Nota sem SAP real (pendente/sem SAP) — não movível."
    if nota.get("ausente_na_origem_em"):
        return "Nota ausente na origem (tombstone) — não movível."
    if input_db.obter_nota_plano(_numero(nota)) is not None:
        return "Nota já está no plano."
    return None


def preview(id_onrs: list[int]) -> list[dict]:
    conn = db.conectar()
    try:
        achadas = repository.obter_muitas(conn, id_onrs)
    finally:
        conn.close()
    resultado = []
    for id_onr in id_onrs:
        nota = achadas.get(id_onr)
        if nota is None:
            resultado.append({"id_onr": id_onr, "numero_nota": None,
                              "movivel": False,
                              "motivo_bloqueio": "Nota não está na projeção da carteira.",
                              "proposta": None, "avisos": []})
            continue
        motivo = _motivo_bloqueio(nota)
        resultado.append({
            "id_onr": id_onr, "numero_nota": nota.get("id_sap"),
            "movivel": motivo is None, "motivo_bloqueio": motivo,
            "proposta": proposta(nota) if motivo is None else None,
            "avisos": avisos(nota),
        })
    return resultado


class MovimentacaoBloqueadaErro(Exception):
    """Alguma nota do lote não é movível — lote abortado (all-or-nothing)."""


def mover_para_plano(id_onrs: list[int], campos_usuario: dict,
                     usuario: str) -> dict:
    from input_module import service as input_service
    prev = preview(id_onrs)
    bloqueadas = [p for p in prev if not p["movivel"]]
    if bloqueadas:
        detalhe = "; ".join(f"{p['id_onr']}: {p['motivo_bloqueio']}" for p in bloqueadas)
        raise MovimentacaoBloqueadaErro(detalhe)

    conn = db.conectar()
    try:
        achadas = repository.obter_muitas(conn, id_onrs)
    finally:
        conn.close()
    notas = [achadas[i] for i in id_onrs]
    novas = [mapear_nova_nota(n, campos_usuario) for n in notas]
    inseridas = input_service.criar_notas(novas, usuario=usuario, origem="carteira")

    lote_id = uuid.uuid4().hex[:12]
    agora = datetime.datetime.now().isoformat(timespec="seconds")
    movimentos = [{
        "id_onr": n["id_onr"], "numero_nota": n["id_sap"], "acao": "entrada",
        "usuario": usuario, "lote_id": lote_id,
        "mes_execucao": campos_usuario.get("Mes_Execucao_Planejado"),
        "status_obra": campos_usuario.get("Status_Obra"),
        "snapshot": json.dumps(campos_usuario, ensure_ascii=False),
        "movido_em": agora,
    } for n in notas]
    conn = db.conectar()
    try:
        db.registrar_movimentacao(conn, movimentos)
        conn.commit()
    finally:
        conn.close()
    return {"inseridas": inseridas, "lote_id": lote_id}


def listar_divergencias() -> list[dict]:
    numeros = input_db.listar_numeros_nota()
    conn = db.conectar()
    try:
        return repository.listar_divergencias(conn, numeros)
    finally:
        conn.close()
