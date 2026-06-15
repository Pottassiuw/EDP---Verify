"""Rotas /api/input/* — módulo de Gestão de Notas (Input)."""
import datetime
import io
import json

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException

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
