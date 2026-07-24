import time

import pytest

from coffee_module import client, config, db, jobs, operation_service


@pytest.fixture
def coffee_operation_tmp(monkeypatch, tmp_path):
    monkeypatch.setenv("COFFEE_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    monkeypatch.setattr(config, "DELAY_BUSCA", 0)
    monkeypatch.setattr(config, "DELAY_GERACAO", 0)
    db.inicializar_banco()
    return tmp_path


def test_operacao_snapshot_roundtrip(coffee_operation_tmp):
    criado = db.criar_operacao("job-1", "consulta", 2)
    assert criado["estado"] == "rodando"
    db.salvar_operacao("job-1", {
        **criado,
        "feitas": 1,
        "erros": [{"pk": 99, "msg": "timeout"}],
    })
    salvo = db.obter_operacao("job-1")
    assert salvo is not None
    assert salvo["feitas"] == 1
    assert salvo["erros"][0]["pk"] == 99


def test_fila_operacao_canonicaliza_por_pk(coffee_operation_tmp):
    db.upsert_item_operacao(entrada_id=777, etapa="fila", origem="avulsa")
    db.upsert_item_operacao(
        entrada_id=888,
        nota_pk=777,
        etapa="pronta",
        origem="verificar",
    )
    itens = db.listar_itens_operacao()
    assert len(itens) == 1
    assert itens[0]["nota_pk"] == 777
    assert itens[0]["etapa"] == "pronta"
    assert itens[0]["origem"] == "avulsa"


def test_recovery_interrompe_job_e_retorna_processando_para_pronta(
    coffee_operation_tmp,
):
    db.criar_operacao("job-2", "geracao", 1)
    db.upsert_item_operacao(
        entrada_id=777,
        nota_pk=777,
        etapa="processando",
        origem="avulsa",
        operacao_id="job-2",
    )
    db.interromper_operacoes_em_andamento()
    assert db.obter_operacao("job-2")["estado"] == "interrompida"
    item = db.listar_itens_operacao()[0]
    assert item["etapa"] == "pronta"
    assert item["erro"] == "Operação interrompida; reconsulte antes de tentar novamente."


def _nota(pk, sap, **fields):
    return {
        "pk": pk,
        "id_sap": sap,
        "arquivado": False,
        "local_instalacao": fields.get("local_instalacao"),
        "fields": {"id_sap": sap, **fields},
    }


def _aguardar(job_id: str, limite: float = 2.0) -> dict:
    fim = time.time() + limite
    while time.time() < fim:
        job = jobs.obter_job(job_id)
        if job and job["estado"] != "rodando":
            return job
        time.sleep(0.01)
    raise TimeoutError(job_id)


def test_job_consulta_persiste_e_atualiza_quadro(
    coffee_operation_tmp,
    monkeypatch,
):
    monkeypatch.setattr(
        client,
        "buscar_nota",
        lambda ident: _nota(int(ident), None, alimentador="ABC01"),
    )
    job_id = jobs.iniciar_consulta_operacao([101], "avulsa")
    job = _aguardar(job_id)
    assert job["estado"] == "concluido"
    assert db.obter_operacao(job_id) is not None
    assert db.listar_itens_operacao()[0]["etapa"] == "pronta"


def test_job_atualizacao_remove_nota_quando_sap_fica_real(
    coffee_operation_tmp,
    monkeypatch,
):
    operation_service.adicionar_entradas([202], "verificar", "seed")
    operation_service.aplicar_consulta(
        202, _nota(202, config.SAP_PENDENTE), "verificar", "seed"
    )
    monkeypatch.setattr(
        client,
        "buscar_nota",
        lambda ident: _nota(int(ident), 17200202),
    )
    job_id = jobs.iniciar_atualizacao_sap([202])
    assert _aguardar(job_id)["estado"] == "concluido"
    assert db.listar_itens_operacao() == []
    assert db.listar_notas("corrigida")[0]["pk"] == 202


def test_geracao_operacao_rejeita_selecao_mista_sem_mutar_fila_ou_job(
    coffee_operation_tmp,
):
    operation_service.adicionar_entradas([303, 999], "avulsa", "seed")
    operation_service.aplicar_consulta(
        303, _nota(303, None), "avulsa", "seed"
    )
    operation_service.aplicar_consulta(
        999, _nota(999, config.SAP_PENDENTE), "avulsa", "seed"
    )

    with pytest.raises(ValueError, match="Nota 999"):
        jobs.iniciar_geracao_operacao([303, 999])

    etapas = {
        item["nota_pk"]: item["etapa"]
        for item in db.listar_itens_operacao()
    }
    assert etapas == {303: "pronta", 999: "aguardando_sap"}
    assert db.listar_operacoes_ativas() == []


def test_consulta_move_sem_sap_para_pronta(coffee_operation_tmp):
    operation_service.adicionar_entradas([101], "avulsa", "job-a")
    etapa = operation_service.aplicar_consulta(
        101, _nota(101, None, alimentador="ABC01"), "avulsa", "job-a"
    )
    assert etapa == "pronta"
    assert db.listar_itens_operacao()[0]["etapa"] == "pronta"


def test_consulta_move_placeholder_para_aguardando(coffee_operation_tmp):
    operation_service.adicionar_entradas([202], "verificar", "job-b")
    etapa = operation_service.aplicar_consulta(
        202, _nota(202, config.SAP_PENDENTE), "verificar", "job-b"
    )
    assert etapa == "aguardando_sap"


def test_consulta_remove_sap_real_do_quadro(coffee_operation_tmp):
    operation_service.adicionar_entradas([303], "avulsa", "job-c")
    etapa = operation_service.aplicar_consulta(
        303, _nota(303, 17300303), "avulsa", "job-c"
    )
    assert etapa is None
    assert db.listar_itens_operacao() == []


def test_falha_de_geracao_retorna_para_pronta(coffee_operation_tmp):
    operation_service.adicionar_entradas([404], "avulsa", "job-d")
    operation_service.aplicar_consulta(
        404, _nota(404, None), "avulsa", "job-d"
    )
    operation_service.marcar_processando([404], "job-e")
    operation_service.aplicar_falha(404, "pronta", "timeout")
    item = db.listar_itens_operacao()[0]
    assert item["etapa"] == "pronta"
    assert item["erro"] == "timeout"
