"""Rotas da Carteira (FastAPI). Endpoints finos: validam e chamam o service."""
from fastapi import APIRouter, HTTPException, Query

from carteira_module import service

router = APIRouter(prefix="/api/carteira", tags=["carteira"])


@router.get("/notas")
def listar_notas(
    regional: str | None = None,
    conjunto: str | None = None,
    status_sap: str | None = None,
    situacao: str | None = None,
    sap_real: int | None = None,
    q: str | None = None,
    incluir_ausentes: bool = False,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
    ordenar_por: str = "id_onr",
    ordem: str = "asc",
):
    filtros = {
        "regional": regional, "conjunto": conjunto, "status_sap": status_sap,
        "situacao": situacao, "sap_real": sap_real, "q": q,
        "incluir_ausentes": incluir_ausentes,
    }
    return service.pagina_notas(filtros, page, size, ordenar_por, ordem)


@router.get("/notas/{id_onr}")
def obter_nota(id_onr: int):
    nota = service.detalhe(id_onr)
    if nota is None:
        raise HTTPException(status_code=404, detail="Nota nao encontrada na carteira.")
    return nota


@router.get("/resumo")
def resumo():
    return service.resumo()


@router.get("/sincronizacao")
def sincronizacao():
    return service.estado_sincronizacao()


@router.post("/sincronizar")
def sincronizar():
    return service.disparar_sincronizacao()
