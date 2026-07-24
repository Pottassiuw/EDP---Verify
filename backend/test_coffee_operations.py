import pytest

from coffee_module import config, db


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
