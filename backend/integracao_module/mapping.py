"""De-para COFFEE → INPUT. Único arquivo do sistema que conhece os dois vocabulários.

Decisões do usuário (2026-07-15): prioridade COFFEE é o índice 1-6 da lista
config.PRIORIDADES do INPUT; 7-8 não são usados pelo COFFEE (fallback + aviso).
"""
import datetime

from coffee_module.client import compor_local_instalacao
from input_module import config
from input_module.service import NovaNota

# Índice 1-6 de config.PRIORIDADES (COFFEE nunca emite 7/8 — categorias
# administrativas "Protheus"/"Nota Projetos" não existem no fluxo COFFEE).
DE_PARA_PRIORIDADE = {i: config.PRIORIDADES[i - 1] for i in range(1, 7)}
PRIORIDADE_PADRAO = "Programável"
STATUS_NOTA_INICIAL = "00 Pendente"

# O que o usuário preenche no modal (spec)
CAMPOS_MANUAIS = ["Mes_Execucao_Planejado", "Status_Obra", "Observacao", "Check"]
# O que "Atualizar dados" pode sobrescrever num registro já existente no plano
# (nunca Status_Nota/Data_Envio_Projeto — são estado do planejamento, não da nota)
CAMPOS_ATUALIZAVEIS = ["Local_Instalacao", "Circuito", "Prioridade_Nota"]


def montar_proposta(nota_coffee: dict) -> dict:
    """Campos do plano deriváveis do snapshot COFFEE (sem os manuais)."""
    fields = nota_coffee.get("dados_json") or {}
    prioridade = DE_PARA_PRIORIDADE.get(fields.get("prioridade"))
    return {
        "Numero_Nota": nota_coffee.get("id_sap"),
        "Local_Instalacao": compor_local_instalacao(fields) or "-",
        "Circuito": str(fields.get("alimentador") or "-"),
        "Prioridade_Nota": prioridade or PRIORIDADE_PADRAO,
        "Status_Nota": STATUS_NOTA_INICIAL,
        "Data_Envio_Projeto": datetime.date.today().strftime("%d/%m/%Y"),
        "Observacao": str(fields.get("observacoes") or ""),
    }


def avisos_proposta(nota_coffee: dict) -> list[str]:
    """Mapeamentos incertos que o usuário deve conferir na revisão."""
    fields = nota_coffee.get("dados_json") or {}
    avisos = []
    if fields.get("prioridade") not in DE_PARA_PRIORIDADE:
        avisos.append(
            f"Prioridade {fields.get('prioridade')!r} do COFFEE está fora do de-para (1-6); "
            f"usando '{PRIORIDADE_PADRAO}' — confira antes de mover.")
    if compor_local_instalacao(fields) is None:
        avisos.append("Local de instalação incompleto no COFFEE (cidade/tipo/número).")
    return avisos


def montar_nova_nota(nota_coffee: dict, campos_usuario: dict) -> NovaNota:
    """Proposta automática + campos manuais do usuário (manual vence)."""
    proposta = montar_proposta(nota_coffee)
    manuais = {c: campos_usuario[c] for c in CAMPOS_MANUAIS if c in campos_usuario}
    return NovaNota(**{**proposta, **manuais})
