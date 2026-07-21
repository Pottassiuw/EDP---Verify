"""Testes do módulo de integração COFFEE → INPUT."""
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client():
    from integracao_module.routes import router
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


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
    assert proposta["Status_Nota"] == "01 Sem providência"
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
    nova = mapping.montar_nova_nota(_nota_coffee(), None, {
        "Mes_Execucao_Planejado": "ago-2026", "Status_Obra": "Linha Viva",
        "Observacao": "Texto editado pelo usuário", "Check": "OK",
    })
    assert nova.Numero_Nota == 12345678
    assert nova.Mes_Execucao_Planejado == "ago-2026"
    assert nova.Observacao == "Texto editado pelo usuário"
    assert nova.Check == "OK"


def test_planejado_ddpm_conjunto_metrico_converte_para_km():
    from integracao_module import mapping
    nota = _nota_coffee(quantidade=1500)
    iw28 = {"Denom.conjunto": "RDA - EXTENSAO REDE DISTR. AEREA"}
    proposta = mapping.montar_proposta(nota, iw28)
    assert proposta["Planejado_DDPM"] == 1.5
    assert proposta["Planejado_Unidade"] == "Km"


def test_planejado_ddpm_conjunto_nao_metrico_fica_unitario():
    from integracao_module import mapping
    nota = _nota_coffee(quantidade=3)
    iw28 = {"Denom.conjunto": "SUBESTACAO - CAPEX"}
    proposta = mapping.montar_proposta(nota, iw28)
    assert proposta["Planejado_DDPM"] == 3.0
    assert proposta["Planejado_Unidade"] is None


def test_planejado_ddpm_sem_iw28_fica_unitario_e_avisa():
    from integracao_module import mapping
    nota = _nota_coffee(quantidade=1500)
    proposta = mapping.montar_proposta(nota, None)
    assert proposta["Planejado_DDPM"] == 1500.0
    assert proposta["Planejado_Unidade"] is None
    avisos = mapping.avisos_proposta(nota, None)
    assert any("IW28" in a for a in avisos)


def test_montar_nova_nota_planejado_ddpm_via_iw28():
    from integracao_module import mapping
    nota = _nota_coffee(quantidade=2000)
    iw28 = {"Denom.conjunto": "REDE MULTIPLEXADA BT - CAPEX"}
    nova = mapping.montar_nova_nota(nota, iw28, {
        "Mes_Execucao_Planejado": "ago-2026", "Status_Obra": "-",
        "Observacao": "", "Check": "-",
    })
    assert nova.Planejado_DDPM == 2.0


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
    assert registro["Status_Nota"] == "01 Sem providência"   # atualização NÃO reseta status


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


def test_api_revisao(ambiente):
    client = _client()
    r = client.get("/api/integracao/nota/4242/revisao")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["proposta"]["Numero_Nota"] == 12345678
    assert corpo["iw28"]["Ordem"] == 900001
    assert client.get("/api/integracao/nota/999999/revisao").status_code == 404


def test_api_mover_fluxo_completo(ambiente):
    client = _client()
    payload = {"pks": [4242], "campos_usuario": CAMPOS}
    assert client.post("/api/integracao/mover-para-plano", json=payload).status_code == 400  # sem X-User
    r = client.post("/api/integracao/mover-para-plano", json=payload, headers={"X-User": "teste"})
    assert r.status_code == 200 and r.json()["inseridas"] == 1
    assert client.post("/api/integracao/mover-para-plano", json=payload,
                       headers={"X-User": "teste"}).status_code == 409
    r = client.post("/api/integracao/mover-para-plano",
                    json={**payload, "atualizar_existente": True},
                    headers={"X-User": "teste"})
    assert r.status_code == 200 and r.json()["atualizadas"] >= 0
    assert client.post("/api/integracao/mover-para-plano",
                       json={"pks": [4243], "campos_usuario": CAMPOS},
                       headers={"X-User": "teste"}).status_code == 422


def test_api_mover_pk_desconhecido_retorna_404(ambiente):
    client = _client()
    r = client.post("/api/integracao/mover-para-plano",
                     json={"pks": [4242, 999999], "campos_usuario": CAMPOS},
                     headers={"X-User": "teste"})
    assert r.status_code == 404


def test_api_mover_atualizar_existente_sem_estar_no_plano_retorna_404(ambiente):
    client = _client()
    r = client.post("/api/integracao/mover-para-plano",
                     json={"pks": [4242], "campos_usuario": CAMPOS, "atualizar_existente": True},
                     headers={"X-User": "teste"})
    assert r.status_code == 404


def test_contar_fora_do_plano_filtrado_por_usuario(ambiente):
    from coffee_module import db as coffee_db
    from integracao_module import service
    coffee_db.definir_usuario("alice")
    coffee_db.upsert_nota(9001, 90000001, _nota_coffee()["dados_json"])
    coffee_db.definir_usuario("bob")
    coffee_db.upsert_nota(9002, 90000002, _nota_coffee()["dados_json"])
    coffee_db.definir_usuario(None)
    # simula 4242 (criada pela fixture 'ambiente') como nota legada, sem dono
    conn = coffee_db.get_db_connection()
    conn.execute("UPDATE notas_coffee SET usuario = NULL WHERE pk = 4242")
    conn.commit()
    conn.close()

    # 4242 (sem dono) + 9001 (alice) contam para alice; 9002 (bob) nao
    assert service.contar_fora_do_plano(usuario="alice") == 2
    assert service.contar_fora_do_plano(usuario="bob") == 2  # 4242 (sem dono) + 9002 (bob)
    assert service.contar_fora_do_plano() == 3  # sem filtro: todas


def test_api_resumo_fora_do_plano(ambiente):
    client = _client()
    r = client.get("/api/integracao/resumo-fora-do-plano")
    assert r.status_code == 200
    assert r.json()["corrigidas_fora_do_plano"] == 1   # 4242 tem SAP real e não está no plano
    client.post("/api/integracao/mover-para-plano",
                json={"pks": [4242], "campos_usuario": CAMPOS},
                headers={"X-User": "teste"})
    assert client.get("/api/integracao/resumo-fora-do-plano"
                      ).json()["corrigidas_fora_do_plano"] == 0
