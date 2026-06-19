"""Testes do módulo COFFEE (backend)."""
import time as _time

import pytest

import httpx

from coffee_module import classify, config


def test_classificacao_pendente():
    assert classify.classificar(config.SAP_PENDENTE, None) == "pendente"
    assert classify.classificar(config.SAP_PENDENTE, 17247854) == "pendente"


def test_classificacao_corrigida_na_transicao():
    # anterior era placeholder, atual virou SAP real
    assert classify.classificar(17247854, config.SAP_PENDENTE) == "corrigida"


def test_classificacao_gerada():
    # primeira busca já com SAP real (sem anterior conhecido)
    assert classify.classificar(17247854, None) == "gerada"
    # transição já "consumida": anterior também é real
    assert classify.classificar(17247854, 17247854) == "gerada"


@pytest.fixture
def coffee_tmp(monkeypatch, tmp_path):
    """Aponta o módulo para dados temporários, chave fake, e inicializa o banco."""
    monkeypatch.setenv("COFFEE_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    monkeypatch.setattr(config, "DELAY_BUSCA", 0)
    monkeypatch.setattr(config, "DELAY_GERACAO", 0)
    from coffee_module import db
    db.inicializar_banco()
    return tmp_path


def test_upsert_primeira_busca_pendente(coffee_tmp):
    from coffee_module import db
    classe = db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    assert classe == "pendente"
    notas = db.listar_notas("pendente")
    assert len(notas) == 1
    assert notas[0]["pk"] == 355617
    assert notas[0]["id_sap_anterior"] is None
    assert notas[0]["arquivado"] is False


def test_upsert_transicao_corrigida_depois_gerada(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    # SAP atribuído: 10000000 -> real
    classe = db.upsert_nota(355617, 17247854, True, {"id_sap": 17247854})
    assert classe == "corrigida"
    nota = db.listar_notas("corrigida")[0]
    assert nota["id_sap_anterior"] == 10000000
    assert nota["arquivado"] is True
    # re-busca: transição consumida -> gerada
    classe = db.upsert_nota(355617, 17247854, True, {"id_sap": 17247854})
    assert classe == "gerada"
    assert db.listar_notas("corrigida") == []
    assert len(db.listar_notas("gerada")) == 1


def test_registrar_erro_e_listar_tudo(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(1, 10000000, False, {})
    db.registrar_erro(2, "timeout")
    todas = db.listar_notas()
    assert len(todas) == 2
    erro = [n for n in todas if n["pk"] == 2][0]
    assert erro["erro"] == "timeout"


# ---------------------------------------------------------------------------
# Sub-projeto 1 — Sistema de logs (coffee_logs)
# ---------------------------------------------------------------------------


def test_registrar_e_listar_log_roundtrip(coffee_tmp):
    from coffee_module import db
    db.registrar_log("api_call", "buscar_nota", 355617,
                     {"id": 355617, "status_http": 200, "tempo_ms": 12}, True)
    logs = db.listar_logs()
    assert len(logs) == 1
    log = logs[0]
    assert log["tipo"] == "api_call"
    assert log["acao"] == "buscar_nota"
    assert log["nota_pk"] == 355617
    assert log["sucesso"] is True
    assert log["detalhes"]["status_http"] == 200
    assert isinstance(log["id"], int)


def test_listar_logs_filtra_por_nota_e_tipo(coffee_tmp):
    from coffee_module import db
    db.registrar_log("api_call", "buscar_nota", 1, {"id": 1}, True)
    db.registrar_log("api_call", "arquivar", 2, {"id": 2}, True)
    db.registrar_log("transicao", "classificar", 1, {"anterior": "pendente"}, True)
    assert len(db.listar_logs(nota_pk=1)) == 2
    assert len(db.listar_logs(tipo="api_call")) == 2
    assert len(db.listar_logs(nota_pk=1, tipo="transicao")) == 1


def test_listar_logs_ordena_desc_e_respeita_limit(coffee_tmp):
    from coffee_module import db
    for i in range(5):
        db.registrar_log("acao_usuario", "regerar", i, {"i": i}, True)
    logs = db.listar_logs(limit=3)
    assert len(logs) == 3
    # mais recentes primeiro: o último inserido (i=4) deve vir antes
    assert logs[0]["detalhes"]["i"] >= logs[-1]["detalhes"]["i"]


def test_registrar_log_nunca_levanta(coffee_tmp):
    from coffee_module import db
    # detalhes não-serializável não deve quebrar o chamador
    db.registrar_log("api_call", "x", None, {"obj": object()}, False)
    # erro de sucesso=False registrado normalmente continua funcionando
    db.registrar_log("api_call", "y", None, None, False)
    assert any(l["acao"] == "y" for l in db.listar_logs())


# ---------------------------------------------------------------------------
# Task 3 — client.py (httpx wrapper)
# ---------------------------------------------------------------------------


class _FakeResp:
    def __init__(self, payload=None, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code != 200:
            raise httpx.HTTPStatusError(
                "erro",
                request=httpx.Request("GET", "test"),
                response=httpx.Response(self.status_code),
            )

    def json(self):
        return self._payload


# json_all retorna uma STRING JSON (duplamente codificada)
_JSON_ALL = (
    '[{"model": "AppDeOlhoNaRede2.informativo", "pk": 355617, '
    '"fields": {"id_sap": 17247854, "arquivado": true, "sintoma": "EEST"}}]'
)


def test_buscar_nota_faz_duplo_parse(monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    capturado = {}

    def fake_get(url, timeout=None):
        capturado["url"] = url
        return _FakeResp(payload=_JSON_ALL)

    monkeypatch.setattr(httpx, "get", fake_get)
    from coffee_module import client
    nota = client.buscar_nota(355617)
    assert nota["pk"] == 355617
    assert nota["id_sap"] == 17247854
    assert nota["arquivado"] is True
    assert nota["fields"]["sintoma"] == "EEST"
    assert capturado["url"].endswith("/deolhonarede/json_all/355617")


def test_buscar_nota_propaga_erro_http(monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    monkeypatch.setattr(httpx, "get", lambda url, timeout=None: _FakeResp(status=500))
    from coffee_module import client
    with pytest.raises(httpx.HTTPStatusError):
        client.buscar_nota(1)


def test_escritas_montam_url(monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    urls = []

    def fake_get(url, timeout=None):
        urls.append(url)
        return _FakeResp(payload="ok")

    monkeypatch.setattr(httpx, "get", fake_get)
    from coffee_module import client
    assert client.arquivar(123321, 10000000) is True
    assert client.desarquivar(123321) is True
    assert client.alterar_local(123321, "701CF12345678") is True
    assert urls[0].endswith("/deolhonarede/sap/123321/10000000")
    assert urls[1].endswith("/deolhonarede/desarquivar/123321")
    assert urls[2].endswith("/deolhonarede/local_instalacao/123321/701CF12345678")


# ---------------------------------------------------------------------------
# Task 4 — jobs.py (batch fetch runner with progress)
# ---------------------------------------------------------------------------


def _aguardar_job(jobs, job_id, limite_s=3.0):
    """Faz polling do job até concluir (ou estourar o tempo)."""
    fim = _time.time() + limite_s
    while _time.time() < fim:
        j = jobs.obter_job(job_id)
        if j and j["estado"] == "concluido":
            return j
        _time.sleep(0.01)
    raise TimeoutError("job não concluiu a tempo")


def test_job_busca_lote_com_progresso_e_erros(coffee_tmp, monkeypatch):
    from coffee_module import client, db, jobs

    def fake_buscar(id):
        if str(id) == "999":
            raise RuntimeError("timeout")
        return {"pk": int(id), "id_sap": 17247854, "arquivado": True,
                "fields": {"id_sap": 17247854}}

    monkeypatch.setattr(client, "buscar_nota", fake_buscar)
    job_id = jobs.iniciar_busca(["355617", "999", "355618"])
    j = _aguardar_job(jobs, job_id)
    assert j["total"] == 3
    assert j["feitas"] == 3
    assert len(j["erros"]) == 1
    assert j["erros"][0]["pk"] == "999"
    # as duas notas válidas foram persistidas
    assert len(db.listar_notas("gerada")) == 2


def test_obter_job_inexistente(coffee_tmp):
    from coffee_module import jobs
    assert jobs.obter_job("nao-existe") is None


# ---------------------------------------------------------------------------
# Task 5 — routes.py (API router)
# ---------------------------------------------------------------------------

from fastapi.testclient import TestClient


@pytest.fixture
def coffee_cliente(coffee_tmp, monkeypatch):
    from coffee_module import client
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda id: {"pk": int(id), "id_sap": 17247854, "arquivado": True,
                    "fields": {"id_sap": 17247854}},
    )
    from main import app
    return TestClient(app)


def test_rota_buscar_job_e_notas(coffee_cliente):
    from coffee_module import jobs
    r = coffee_cliente.post("/api/coffee/buscar", json={"ids": ["355617"]})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    _aguardar_job(jobs, job_id)
    rj = coffee_cliente.get(f"/api/coffee/job/{job_id}")
    assert rj.json()["feitas"] == 1
    notas = coffee_cliente.get("/api/coffee/notas").json()["registros"]
    assert len(notas) == 1 and notas[0]["pk"] == 355617
    assert coffee_cliente.get("/api/coffee/notas?status=gerada").json()["registros"][0]["pk"] == 355617


def test_rota_buscar_lista_vazia_400(coffee_cliente):
    assert coffee_cliente.post("/api/coffee/buscar", json={"ids": []}).status_code == 400


def test_rota_job_inexistente_404(coffee_cliente):
    assert coffee_cliente.get("/api/coffee/job/nao-existe").status_code == 404


def test_rotas_de_escrita(coffee_cliente, monkeypatch):
    from coffee_module import client
    chamadas = []
    monkeypatch.setattr(client, "arquivar", lambda i, s: chamadas.append(("sap", i, s)) or True)
    monkeypatch.setattr(client, "desarquivar", lambda i: chamadas.append(("des", i)) or True)
    monkeypatch.setattr(client, "alterar_local", lambda i, l: chamadas.append(("loc", i, l)) or True)
    assert coffee_cliente.post("/api/coffee/sap", json={"id": 1, "sap": 10000000}).json()["ok"] is True
    assert coffee_cliente.post("/api/coffee/desarquivar", json={"id": 1}).json()["ok"] is True
    assert coffee_cliente.post("/api/coffee/local-instalacao", json={"id": 1, "local": "X"}).json()["ok"] is True
    assert ("sap", 1, 10000000) in chamadas
