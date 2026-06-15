"""Rotas /api/input/* — módulo de Gestão de Notas (Input)."""
import io
import json
from typing import Optional

import pandas as pd
from fastapi import (APIRouter, BackgroundTasks, Depends, Header, HTTPException,
                     Response)
from pydantic import BaseModel

from input_module import config, db, engine

router = APIRouter(prefix="/api/input")

# Estado da migração inicial (resolvido no primeiro acesso)
_migracao = {"resultado": None}


def _garantir_banco() -> str:
    if _migracao["resultado"] is None:
        _migracao["resultado"] = db.migrar_da_rede_se_preciso()
        db.inicializar_banco()
    return _migracao["resultado"]


def _df_para_registros(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records", force_ascii=False))


@router.get("/notas")
def listar_notas():
    migracao = _garantir_banco()
    df = engine.get_dataset()
    return {
        "registros": _df_para_registros(df),
        "meta": {
            "status_opcoes": list(config.STATUS_MAP.values()),
            "prioridade_opcoes": config.PRIORIDADES,
            "bases": engine.status_bases(),
            "ultima_alteracao": db.obter_data_ultima_alteracao(),
            "migracao": migracao,
            "colunas": config.COLUNAS_PAINEL,
        },
    }


@router.get("/sync")
def sync():
    _garantir_banco()
    return {"ultima_alteracao": db.obter_data_ultima_alteracao()}


@router.get("/logs")
def listar_logs():
    _garantir_banco()
    return {"registros": _df_para_registros(db.carregar_logs())}


@router.get("/logs/arquivos")
def listar_logs_arquivos():
    _garantir_banco()
    return {"registros": _df_para_registros(db.carregar_log_arquivos())}


@router.get("/logs/nota/{numero}")
def timeline_nota(numero: int):
    _garantir_banco()
    df = db.carregar_logs()
    if not df.empty:
        df = df[df["Numero_Nota"] == numero]
    return {"registros": _df_para_registros(df)}


# ── Escrita ──────────────────────────────────────────────────────────────
def usuario_atual(x_user: Optional[str] = Header(default=None, alias="X-User")) -> str:
    if not x_user or not x_user.strip():
        raise HTTPException(status_code=400, detail="Header X-User obrigatório para escrita.")
    return x_user.strip()


def _pos_escrita(tasks: BackgroundTasks) -> None:
    engine.invalidar_cache()
    tasks.add_task(engine.gerar_copia_excel_rede)


class EdicaoPedido(BaseModel):
    linhas: list[dict]


class NovaNota(BaseModel):
    Numero_Nota: int
    Status_Nota: str
    Prioridade_Nota: str
    Planejado_DDPM: float = 0.0
    Status_Obra: str = "-"
    Conjunto: str = "-"
    Circuito: str = "-"
    Local_Instalacao: str = "-"
    Mes_Execucao_Planejado: str = "-"
    Data_Envio_Projeto: str = "-"
    Observacao: str = ""
    Check: str = "-"
    Status_Anterior: str = "-"


class LotePedido(BaseModel):
    notas: list[NovaNota]


class ExclusaoPedido(BaseModel):
    numeros: list[int]


class ExportPedido(BaseModel):
    numeros: list[int]
    colunas: list[str]


def _proximo_id_cronologia(df: pd.DataFrame) -> int:
    if df.empty or "ID_Cronologia" not in df.columns or not df["ID_Cronologia"].notna().any():
        return 1
    return int(pd.to_numeric(df["ID_Cronologia"], errors="coerce").max()) + 1


def _preparar_novas(notas: list, df_banco: pd.DataFrame) -> pd.DataFrame:
    """Valida duplicatas e completa Regional/ID_Cronologia (Input/app.py:640-728)."""
    numeros = [n.Numero_Nota for n in notas]
    repetidas_lote = {str(n) for n in numeros if numeros.count(n) > 1}
    if repetidas_lote:
        raise HTTPException(409, "Notas duplicadas no próprio lote: " + ", ".join(sorted(repetidas_lote)))
    existentes = set(df_banco["Numero_Nota"].tolist()) if not df_banco.empty else set()
    repetidas_banco = sorted(str(n) for n in numeros if n in existentes)
    if repetidas_banco:
        raise HTTPException(409, "Notas já existentes no banco: " + ", ".join(repetidas_banco))
    base_id = _proximo_id_cronologia(df_banco)
    linhas = []
    for i, nota in enumerate(notas):
        registro = nota.model_dump()
        registro["ID_Cronologia"] = base_id + i
        registro["Regional"] = config.DE_PARA_REGIONAL.get(str(nota.Local_Instalacao)[:3], "-")
        registro["Centro_Responsavel"] = "-"
        linhas.append(registro)
    return pd.DataFrame(linhas)


@router.patch("/notas")
def editar_notas(pedido: EdicaoPedido, tasks: BackgroundTasks,
                 usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    try:
        resultado = db.aplicar_edicoes(pedido.linhas, usuario=usuario)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if resultado["alteradas"]:
        _pos_escrita(tasks)
    return {**resultado, "ultima_alteracao": db.obter_data_ultima_alteracao()}


@router.post("/notas")
def criar_nota(nota: NovaNota, tasks: BackgroundTasks,
               usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    df_novas = _preparar_novas([nota], db.carregar_dados())
    db.salvar_em_massa(df_novas)
    _pos_escrita(tasks)
    return {"inseridas": 1}


@router.post("/notas/bulk")
def criar_lote(pedido: LotePedido, tasks: BackgroundTasks,
               usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    if not pedido.notas:
        raise HTTPException(400, "Lote vazio.")
    df_novas = _preparar_novas(pedido.notas, db.carregar_dados())
    db.salvar_em_massa(df_novas)
    _pos_escrita(tasks)
    return {"inseridas": len(df_novas)}


@router.delete("/notas")
def excluir_notas(pedido: ExclusaoPedido, tasks: BackgroundTasks,
                  usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    excluidas = db.deletar_notas(pedido.numeros)
    if excluidas:
        _pos_escrita(tasks)
    return {"excluidas": excluidas}


@router.post("/desfazer")
def desfazer(tasks: BackgroundTasks, usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    ok, mensagem = db.reverter_ultima_alteracao()
    if ok:
        _pos_escrita(tasks)
    return {"ok": ok, "mensagem": mensagem}


@router.post("/export")
def exportar(pedido: ExportPedido):
    _garantir_banco()
    df = engine.get_dataset()
    df = df[df["Numero_Nota"].isin(pedido.numeros)]
    colunas = [c for c in pedido.colunas if c in df.columns]
    df = df[colunas].rename(columns=config.NOMES_AMIGAVEIS)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Selecao_Filtrada")
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="export_notas.xlsx"'},
    )
