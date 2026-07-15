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


@pytest.fixture
def ambiente(monkeypatch, tmp_path):
    """Bancos COFFEE e INPUT temporários, com uma nota gerada e base IW28."""
    monkeypatch.setenv("COFFEE_DATA_DIR", str(tmp_path / "coffee"))
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from coffee_module import db as coffee_db
    from input_module import db as input_db
    coffee_db.inicializar_banco()
    input_db.inicializar_banco()
    coffee_db.upsert_nota(4242, 12345678, _nota_coffee()["dados_json"])
    coffee_db.upsert_nota(4243, 10000000, _nota_coffee(prioridade=2)["dados_json"])  # pendente
    input_db.salvar_base_dataframe("base_iw28", pd.DataFrame([{
        "Nota": 12345678, "Status usuário": "PLAN", "CenTrabalho princ.": "POA",
        "Ordem": 900001, "Encerram.por data": "2026-08-01",
    }]))
    return tmp_path


def test_montar_revisao_completa(ambiente):
    from integracao_module import service
    revisao = service.montar_revisao(4242)
    assert revisao["coffee"]["id_sap"] == 12345678
    assert revisao["iw28"]["Status usuário"] == "PLAN"
    assert revisao["ja_no_plano"] is False
    assert revisao["pode_mover"] is True
    assert revisao["proposta"]["Local_Instalacao"] == "718ET00026773"


def test_montar_revisao_pendente_bloqueia(ambiente):
    from integracao_module import service
    revisao = service.montar_revisao(4243)
    assert revisao["pode_mover"] is False
    assert revisao["iw28"] is None
    assert "SAP" in revisao["motivo_bloqueio"]


def test_montar_revisao_pk_desconhecido(ambiente):
    from integracao_module import service
    with pytest.raises(service.NotaNaoEncontradaErro):
        service.montar_revisao(999999)


CAMPOS = {"Mes_Execucao_Planejado": "ago-2026", "Status_Obra": "Linha Viva",
          "Observacao": "Obs final", "Check": "OK"}


def test_mover_para_plano_cria_registro(ambiente):
    from input_module import db as input_db
    from integracao_module import service
    resultado = service.mover_para_plano([4242], CAMPOS, usuario="teste")
    assert resultado == {"inseridas": 1, "atualizadas": 0}
    registro = input_db.obter_nota_plano(12345678)
    assert registro["Circuito"] == "BJU02"
    assert registro["Prioridade_Nota"] == "Importante"
    assert registro["Observacao"] == "Obs final"


def test_mover_pendente_recusa(ambiente):
    from integracao_module import service
    with pytest.raises(service.SapPendenteErro):
        service.mover_para_plano([4243], CAMPOS, usuario="teste")


def test_mover_ja_no_plano_recusa_e_atualiza(ambiente):
    from input_module import db as input_db
    from integracao_module import service
    service.mover_para_plano([4242], CAMPOS, usuario="teste")
    with pytest.raises(service.JaNoPlanoErro):
        service.mover_para_plano([4242], CAMPOS, usuario="teste")
    resultado = service.mover_para_plano(
        [4242], {**CAMPOS, "Status_Obra": "Linha Morta"},
        usuario="teste", atualizar_existente=True)
    assert resultado["atualizadas"] == 1
    registro = input_db.obter_nota_plano(12345678)
    assert registro["Status_Obra"] == "Linha Morta"
    assert registro["Status_Nota"] == "00 Pendente"   # atualização NÃO reseta status


def test_mover_lote_all_or_nothing(ambiente):
    from integracao_module import service
    with pytest.raises(service.SapPendenteErro):
        service.mover_para_plano([4242, 4243], CAMPOS, usuario="teste")


def test_mover_lote_pk_desconhecido_nao_encontrada(ambiente):
    from integracao_module import service
    with pytest.raises(service.NotaNaoEncontradaErro):
        service.mover_para_plano([4242, 999999], CAMPOS, usuario="teste")


def test_mover_atualizar_existente_sem_estar_no_plano_recusa(ambiente):
    from integracao_module import service
    with pytest.raises(service.NotaNaoEncontradaErro):
        service.mover_para_plano(
            [4242], CAMPOS, usuario="teste", atualizar_existente=True)
