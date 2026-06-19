"""Rotas /api/coffee/* -- fundacao do hub COFFEE."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from coffee_module import client, db, jobs

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
    client.arquivar(pedido.id, pedido.sap)
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


@router.post("/regerar")
def regerar(pedido: IdPedido):
    _garantir_banco()
    try:
        client.desarquivar(pedido.id)
        nota = client.buscar_nota(pedido.id)
        db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
    except Exception:
        db.registrar_log("acao_usuario", "regerar", pedido.id,
                         {"id": pedido.id, "origem": "ui"}, False)
        raise
    db.registrar_log("acao_usuario", "regerar", pedido.id,
                     {"id": pedido.id, "origem": "ui"}, True)
    return {"ok": True, "nota": nota}
