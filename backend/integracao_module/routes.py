"""Rotas /api/integracao/* — ponte COFFEE → INPUT (endpoints finos)."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from input_module import engine
from input_module.routes import usuario_atual
from input_module.service import NotasDuplicadasErro, garantir_banco
from integracao_module import service

router = APIRouter(prefix="/api/integracao")


class MoverPedido(BaseModel):
    pks: list[int] = Field(min_length=1)
    campos_usuario: dict[str, str] = {}
    atualizar_existente: bool = False


@router.get("/nota/{pk}/revisao")
def revisao(pk: int):
    garantir_banco()
    try:
        return service.montar_revisao(pk)
    except service.NotaNaoEncontradaErro as e:
        raise HTTPException(404, str(e))


@router.post("/mover-para-plano")
def mover(pedido: MoverPedido, tasks: BackgroundTasks,
          usuario: str = Depends(usuario_atual)):
    garantir_banco()
    try:
        resultado = service.mover_para_plano(
            pedido.pks, pedido.campos_usuario, usuario, pedido.atualizar_existente)
    except service.SapPendenteErro as e:
        raise HTTPException(422, str(e))
    except (service.JaNoPlanoErro, NotasDuplicadasErro) as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    engine.invalidar_cache()
    tasks.add_task(engine.gerar_copia_excel_rede)
    return resultado
