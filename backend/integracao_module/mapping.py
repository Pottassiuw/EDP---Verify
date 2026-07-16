"""De-para COFFEE → INPUT. Único arquivo do sistema que conhece os dois vocabulários.

Decisões do usuário (2026-07-15): prioridade COFFEE é o índice 1-6 da lista
config.PRIORIDADES do INPUT; 7-8 não são usados pelo COFFEE (fallback + aviso).

Decisão do usuário (2026-07-16): Planejado_DDPM vem de fields.quantidade
(COFFEE). Quando a nota já está na extração IW28 e seu "Denom.conjunto" é um
dos conjuntos de rede (CONJUNTOS_METRICOS), a quantidade é convertida de
metros para quilômetros (÷1000, rótulo "Km" só na exibição — o valor
armazenado é sempre o número puro). Para qualquer outro conjunto — ou quando
o IW28 ainda não tem a nota — o valor é usado como veio, sem conversão nem
rótulo (é uma contagem de unidades).
"""
import datetime

from coffee_module.client import compor_local_instalacao
from input_module import config
from input_module.service import NovaNota

# Índice 1-6 de config.PRIORIDADES (COFFEE nunca emite 7/8 — categorias
# administrativas "Protheus"/"Nota Projetos" não existem no fluxo COFFEE).
DE_PARA_PRIORIDADE = {i: config.PRIORIDADES[i - 1] for i in range(1, 7)}
PRIORIDADE_PADRAO = "Programável"
STATUS_NOTA_INICIAL = "01 Sem providência"

# Denom.conjunto (IW28) cuja quantidade do COFFEE representa metros de rede,
# não unidades — convertidos para Km na proposta.
CONJUNTOS_METRICOS = {
    "BLINDAGEM DA REDE DISTR - CAPEX",
    "MELHORIA OPERATIVA - CAPEX",
    "RDA - EXTENSAO REDE DISTR. AEREA",
    "RDS - EXTENSAO REDE DISTR. SUBTERR",
    "REDE MULTIPLEXADA BT - CAPEX",
    "REDE COMPACTA PROTEGIDA MONO - CAPEX",
    "REDE COMPACTA PROTEGIDA TRIF - CAPEX",
    "REDE CONDUTOR SINGELO NU/ISOLADO-CAPEX",
    "REDE MULTIPLEXADA MT / PRE REUNIDO-CAPEX",
}

# O que o usuário preenche no modal (spec)
CAMPOS_MANUAIS = ["Mes_Execucao_Planejado", "Status_Obra", "Observacao", "Check"]
# O que "Atualizar dados" pode sobrescrever num registro já existente no plano
# (nunca Status_Nota/Data_Envio_Projeto — são estado do planejamento, não da nota)
CAMPOS_ATUALIZAVEIS = ["Local_Instalacao", "Circuito", "Prioridade_Nota", "Planejado_DDPM"]


def _calcular_planejado(fields: dict, iw28_registro: dict | None) -> tuple[float, str | None]:
    """Retorna (Planejado_DDPM, unidade) — unidade é "Km" ou None (unitário)."""
    try:
        quantidade = float(fields.get("quantidade") or 0)
    except (TypeError, ValueError):
        quantidade = 0.0
    conjunto = (iw28_registro or {}).get("Denom.conjunto")
    if conjunto in CONJUNTOS_METRICOS:
        return quantidade / 1000, "Km"
    return quantidade, None


def montar_proposta(nota_coffee: dict, iw28_registro: dict | None = None) -> dict:
    """Campos do plano deriváveis do snapshot COFFEE + IW28 (sem os manuais)."""
    fields = nota_coffee.get("dados_json") or {}
    prioridade = DE_PARA_PRIORIDADE.get(fields.get("prioridade"))
    planejado, unidade = _calcular_planejado(fields, iw28_registro)
    return {
        "Numero_Nota": nota_coffee.get("id_sap"),
        "Local_Instalacao": compor_local_instalacao(fields) or "-",
        "Circuito": str(fields.get("alimentador") or "-"),
        "Prioridade_Nota": prioridade or PRIORIDADE_PADRAO,
        "Status_Nota": STATUS_NOTA_INICIAL,
        "Data_Envio_Projeto": datetime.date.today().strftime("%d/%m/%Y"),
        "Observacao": str(fields.get("observacoes") or ""),
        "Planejado_DDPM": planejado,
        "Planejado_Unidade": unidade,
    }


def avisos_proposta(nota_coffee: dict, iw28_registro: dict | None = None) -> list[str]:
    """Mapeamentos incertos que o usuário deve conferir na revisão."""
    fields = nota_coffee.get("dados_json") or {}
    avisos = []
    if fields.get("prioridade") not in DE_PARA_PRIORIDADE:
        avisos.append(
            f"Prioridade {fields.get('prioridade')!r} do COFFEE está fora do de-para (1-6); "
            f"usando '{PRIORIDADE_PADRAO}' — confira antes de mover.")
    if compor_local_instalacao(fields) is None:
        avisos.append("Local de instalação incompleto no COFFEE (cidade/tipo/número).")
    if iw28_registro is None and fields.get("quantidade"):
        avisos.append(
            "Nota ainda não está na extração IW28 — Planejado calculado como valor "
            "unitário (sem conversão para Km); confira depois que o SAP sincronizar.")
    return avisos


def montar_nova_nota(nota_coffee: dict, iw28_registro: dict | None,
                     campos_usuario: dict) -> NovaNota:
    """Proposta automática (COFFEE + IW28) + campos manuais do usuário (manual vence)."""
    proposta = montar_proposta(nota_coffee, iw28_registro)
    proposta.pop("Planejado_Unidade", None)  # rótulo de exibição, não é campo de NovaNota
    manuais = {c: campos_usuario[c] for c in CAMPOS_MANUAIS if c in campos_usuario}
    return NovaNota(**{**proposta, **manuais})
