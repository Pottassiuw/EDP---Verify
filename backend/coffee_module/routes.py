"""Rotas /api/coffee/* -- fundacao do hub COFFEE."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from coffee_module import client, config, db, jobs

router = APIRouter(prefix="/api/coffee")

_estado = {"inicializado": False}


def _garantir_banco() -> None:
    if not _estado["inicializado"]:
        db.inicializar_banco()
        _estado["inicializado"] = True


class BuscaPedido(BaseModel):
    ids: list[str]


class SapPedido(BaseModel):
    id: int
    sap: int


class IdPedido(BaseModel):
    id: int


class LocalPedido(BaseModel):
    id: int
    local: str


class MarcarGerarPedido(BaseModel):
    id: int
    a_gerar: bool = True
    justificativa: Optional[str] = None


class RegerarPedido(BaseModel):
    id: int
    justificativa: Optional[str] = None


class GerarLotePedido(BaseModel):
    ids: list[int]
    justificativa: Optional[str] = None


@router.post("/buscar")
def buscar(pedido: BuscaPedido):
    _garantir_banco()
    if not pedido.ids:
        raise HTTPException(status_code=400, detail="Lista de IDs vazia.")
    db.registrar_log("acao_usuario", "busca_lote", None,
                     {"ids": pedido.ids, "total": len(pedido.ids)}, True)
    return {"job_id": jobs.iniciar_busca(pedido.ids)}


@router.get("/job/{job_id}")
def job(job_id: str):
    j = jobs.obter_job(job_id)
    if j is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    return j


@router.get("/notas")
def notas(status: Optional[str] = None):
    _garantir_banco()
    return {"registros": db.listar_notas(status)}


@router.post("/sap")
def sap(pedido: SapPedido):
    client.definir_sap(pedido.id, pedido.sap)
    return {"ok": True}


@router.post("/desarquivar")
def desarquivar(pedido: IdPedido):
    client.desarquivar(pedido.id)
    return {"ok": True}


@router.post("/local-instalacao")
def local_instalacao(pedido: LocalPedido):
    client.alterar_local(pedido.id, pedido.local)
    return {"ok": True}


@router.get("/logs")
def logs(nota_pk: Optional[int] = None, tipo: Optional[str] = None, limit: int = 100):
    _garantir_banco()
    return {"logs": db.listar_logs(nota_pk=nota_pk, tipo=tipo, limit=limit)}


@router.post("/marcar-gerar")
def marcar_gerar(pedido: MarcarGerarPedido):
    _garantir_banco()
    if not pedido.a_gerar and not (pedido.justificativa and pedido.justificativa.strip()):
        raise HTTPException(status_code=400,
                            detail="Justificativa obrigatoria para remover da fila.")
    if pedido.a_gerar and not db.nota_existe(pedido.id):
        try:
            nota = client.buscar_nota(pedido.id)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
        except Exception:
            db.registrar_log("acao_usuario", "marcar_gerar", pedido.id,
                             {"id": pedido.id, "a_gerar": pedido.a_gerar,
                              "justificativa": pedido.justificativa}, False)
            raise HTTPException(status_code=502,
                                detail="Nao foi possivel buscar a nota na API COFFEE.")
    db.marcar_gerar(pedido.id, pedido.a_gerar)
    db.registrar_log("acao_usuario", "marcar_gerar", pedido.id,
                     {"id": pedido.id, "a_gerar": pedido.a_gerar,
                      "justificativa": pedido.justificativa}, True)
    return {"ok": True}


@router.post("/regerar")
def regerar(pedido: RegerarPedido):
    _garantir_banco()
    try:
        client.definir_sap(pedido.id, config.SAP_PENDENTE)
        nota = client.buscar_nota(pedido.id)
        db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
    except Exception:
        db.registrar_log("acao_usuario", "regerar", pedido.id,
                         {"id": pedido.id, "origem": "ui",
                          "justificativa": pedido.justificativa}, False)
        raise
    db.marcar_gerar(nota["pk"], False)
    db.registrar_log("acao_usuario", "regerar", pedido.id,
                     {"id": pedido.id, "origem": "ui",
                      "justificativa": pedido.justificativa}, True)
    return {"ok": True, "nota": nota}


@router.post("/gerar-lote")
def gerar_lote(pedido: GerarLotePedido):
    _garantir_banco()
    if not pedido.ids:
        raise HTTPException(status_code=400, detail="Lista de IDs vazia.")
    db.registrar_log("acao_usuario", "geracao_lote", None,
                     {"ids": pedido.ids, "total": len(pedido.ids),
                      "justificativa": pedido.justificativa}, True)
    return {"job_id": jobs.iniciar_geracao(pedido.ids, pedido.justificativa)}
