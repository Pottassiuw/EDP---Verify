"""Caminho canônico de escrita do módulo Input (reusado por rotas e integração)."""
import threading

import pandas as pd
from fastapi import BackgroundTasks
from pydantic import BaseModel

from input_module import config, db, engine

# Estado da migração inicial (resolvido uma vez por processo)
_migracao = {"resultado": None}
_banco_lock = threading.Lock()


def garantir_banco() -> str:
    with _banco_lock:
        if _migracao["resultado"] is None:
            _migracao["resultado"] = db.migrar_da_rede_se_preciso()
            db.inicializar_banco()
    return _migracao["resultado"]


def resetar_migracao() -> None:
    _migracao["resultado"] = None


def pos_escrita(tasks: BackgroundTasks) -> None:
    """Efeitos pós-escrita comuns a toda mutação do plano: invalida o cache em
    memória e agenda a cópia Excel de rede em background."""
    engine.invalidar_cache()
    tasks.add_task(engine.gerar_copia_excel_rede)


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


class NotasDuplicadasErro(Exception):
    """Numero_Nota repetido no lote ou já existente no banco."""


def _preparar_novas(notas: list[NovaNota], df_banco: pd.DataFrame) -> pd.DataFrame:
    """Valida duplicatas e completa Regional/ID_Cronologia (Input/app.py:640-728)."""
    numeros = [n.Numero_Nota for n in notas]
    repetidas_lote = {str(n) for n in numeros if numeros.count(n) > 1}
    if repetidas_lote:
        raise NotasDuplicadasErro(
            "Notas duplicadas no próprio lote: " + ", ".join(sorted(repetidas_lote)))
    existentes = set(df_banco["Numero_Nota"].tolist()) if not df_banco.empty else set()
    repetidas_banco = sorted(str(n) for n in numeros if n in existentes)
    if repetidas_banco:
        raise NotasDuplicadasErro(
            "Notas já existentes no banco: " + ", ".join(repetidas_banco))
    base_id = db.proximo_id_cronologia(df_banco)
    linhas = []
    for i, nota in enumerate(notas):
        registro = nota.model_dump()
        registro["ID_Cronologia"] = base_id + i
        registro["Regional"] = config.DE_PARA_REGIONAL.get(str(nota.Local_Instalacao)[:3], "-")
        registro["Centro_Responsavel"] = "-"
        registro["Status_Anterior"] = "-"
        linhas.append(registro)
    return pd.DataFrame(linhas)


def criar_notas(notas: list[NovaNota], usuario: str) -> int:
    """Insere notas novas no plano; levanta NotasDuplicadasErro em conflito."""
    df_novas = _preparar_novas(notas, db.carregar_dados())
    db.salvar_em_massa(df_novas)
    return len(df_novas)
