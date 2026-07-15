"""Testes do módulo de integração COFFEE → INPUT."""
import pandas as pd
import pytest


def _nota_coffee(pk=4242, id_sap=12345678, **fields_extras):
    fields = {
        "prioridade": 3, "observacoes": "Trocar poste podre",
        "cidade": "718", "tipo_local_instalacao": "ET",
        "local_instalacao_numero": 26773, "alimentador": "BJU02",
        "arquivado": True,
    }
    fields.update(fields_extras)
    return {"pk": pk, "id_sap": id_sap, "dados_json": fields,
            "classificacao": "gerada", "buscado_em": "2026-07-15T08:00:00"}


def test_montar_proposta_mapeia_campos():
    from integracao_module import mapping
    proposta = mapping.montar_proposta(_nota_coffee())
    assert proposta["Numero_Nota"] == 12345678
    assert proposta["Local_Instalacao"] == "718ET00026773"
    assert proposta["Circuito"] == "BJU02"
    assert proposta["Prioridade_Nota"] == "Importante"      # 3 -> índice na lista
    assert proposta["Status_Nota"] == "00 Pendente"
    assert proposta["Observacao"] == "Trocar poste podre"
    assert mapping.avisos_proposta(_nota_coffee()) == []


def test_montar_proposta_prioridade_fora_da_faixa():
    from integracao_module import mapping
    nota = _nota_coffee(prioridade=7)
    proposta = mapping.montar_proposta(nota)
    assert proposta["Prioridade_Nota"] == "Programável"     # fallback decidido pelo usuário
    assert any("prioridade" in a.lower() for a in mapping.avisos_proposta(nota))


def test_montar_proposta_sem_local_composto():
    from integracao_module import mapping
    proposta = mapping.montar_proposta(_nota_coffee(cidade=None))
    assert proposta["Local_Instalacao"] == "-"


def test_montar_nova_nota_manual_vence():
    from integracao_module import mapping
    nova = mapping.montar_nova_nota(_nota_coffee(), {
        "Mes_Execucao_Planejado": "ago-2026", "Status_Obra": "Linha Viva",
        "Observacao": "Texto editado pelo usuário", "Check": "OK",
    })
    assert nova.Numero_Nota == 12345678
    assert nova.Mes_Execucao_Planejado == "ago-2026"
    assert nova.Observacao == "Texto editado pelo usuário"
    assert nova.Check == "OK"
