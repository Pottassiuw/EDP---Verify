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
# Task 2 — Transition logs in upsert_nota
# ---------------------------------------------------------------------------


def test_upsert_registra_transicao_de_classificacao(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})  # pendente (sem anterior)
    db.upsert_nota(355617, 17247854, True, {"id_sap": 17247854})   # -> corrigida
    trans = db.listar_logs(tipo="transicao")
    classif = [t for t in trans if t["acao"] == "classificar"]
    assert len(classif) == 1
    assert classif[0]["nota_pk"] == 355617
    assert classif[0]["detalhes"]["anterior"] == "pendente"
    assert classif[0]["detalhes"]["novo"] == "corrigida"


def test_upsert_registra_transicao_de_arquivado(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})  # arquivado=False
    db.upsert_nota(355617, 10000000, True, {"id_sap": 10000000})   # -> arquivado=True
    arq = [t for t in db.listar_logs(tipo="transicao") if t["acao"] == "arquivar_estado"]
    assert len(arq) == 1
    assert arq[0]["detalhes"] == {"anterior": False, "novo": True}


def test_upsert_primeira_busca_nao_gera_transicao(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    assert db.listar_logs(tipo="transicao") == []


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


def test_buscar_nota_faz_duplo_parse(coffee_tmp, monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    capturado = {}

    def fake_get(url, timeout=None):
        capturado["url"] = url
        return _FakeResp(payload=_JSON_ALL)

    monkeypatch.setattr(httpx, "get", fake_get)
    from coffee_module import client, db
    nota = client.buscar_nota(355617)
    assert nota["pk"] == 355617
    assert nota["id_sap"] == 17247854
    assert nota["arquivado"] is True
    assert nota["fields"]["sintoma"] == "EEST"
    assert capturado["url"].endswith("/deolhonarede/json_all/355617")
    logs = db.listar_logs(tipo="api_call")
    assert len(logs) == 1 and logs[0]["acao"] == "buscar_nota" and logs[0]["sucesso"] is True
    assert "tempo_ms" in logs[0]["detalhes"]


def test_buscar_nota_propaga_erro_http(coffee_tmp, monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    monkeypatch.setattr(httpx, "get", lambda url, timeout=None: _FakeResp(status=500))
    from coffee_module import client, db
    with pytest.raises(httpx.HTTPStatusError):
        client.buscar_nota(1)
    logs = db.listar_logs(tipo="api_call")
    assert len(logs) == 1 and logs[0]["sucesso"] is False
    assert logs[0]["detalhes"]["status_http"] == 500


def test_escritas_montam_url(coffee_tmp, monkeypatch):
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    urls = []

    def fake_get(url, timeout=None):
        urls.append(url)
        return _FakeResp(payload="ok")

    monkeypatch.setattr(httpx, "get", fake_get)
    from coffee_module import client, db
    assert client.arquivar(123321, 10000000) is True
    assert client.desarquivar(123321) is True
    assert client.alterar_local(123321, "701CF12345678") is True
    assert urls[0].endswith("/deolhonarede/sap/123321/10000000")
    assert urls[1].endswith("/deolhonarede/desarquivar/123321")
    assert urls[2].endswith("/deolhonarede/local_instalacao/123321/701CF12345678")
    acoes = {l["acao"] for l in db.listar_logs(tipo="api_call")}
    assert {"arquivar", "desarquivar", "alterar_local"} <= acoes


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


# ---------------------------------------------------------------------------
# Task 4 — Routes /logs, /regerar + acao_usuario logging
# ---------------------------------------------------------------------------


def test_rota_buscar_registra_acao_usuario(coffee_cliente):
    from coffee_module import jobs, db
    r = coffee_cliente.post("/api/coffee/buscar", json={"ids": ["355617", "355618"]})
    _aguardar_job(jobs, r.json()["job_id"])
    lote = [l for l in db.listar_logs(tipo="acao_usuario") if l["acao"] == "busca_lote"]
    assert len(lote) == 1
    assert lote[0]["detalhes"]["total"] == 2


def test_rota_logs_filtra(coffee_cliente):
    from coffee_module import db
    db.registrar_log("api_call", "buscar_nota", 1, {"id": 1}, True)
    db.registrar_log("transicao", "classificar", 1, {"x": 1}, True)
    todos = coffee_cliente.get("/api/coffee/logs").json()["logs"]
    assert len(todos) >= 2
    so_api = coffee_cliente.get("/api/coffee/logs?tipo=api_call").json()["logs"]
    assert all(l["tipo"] == "api_call" for l in so_api)
    so_nota = coffee_cliente.get("/api/coffee/logs?nota_pk=1").json()["logs"]
    assert all(l["nota_pk"] == 1 for l in so_nota)


def test_rota_regerar(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    chamadas = []
    monkeypatch.setattr(client, "desarquivar", lambda i: chamadas.append(("des", i)) or True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854}},
    )
    r = coffee_cliente.post("/api/coffee/regerar", json={"id": 355617})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["nota"]["pk"] == 355617
    assert ("des", 355617) in chamadas
    assert any(l["acao"] == "regerar" for l in db.listar_logs(tipo="acao_usuario"))


# ---------------------------------------------------------------------------
# Sub-projeto 3 — usuario nos logs
# ---------------------------------------------------------------------------


def test_log_grava_usuario(coffee_tmp, monkeypatch):
    from coffee_module import db
    monkeypatch.setattr(db.getpass, "getuser", lambda: "operador.teste")
    db.registrar_log("acao_usuario", "x", None, None, True)
    logs = db.listar_logs()
    assert logs[0]["usuario"] == "operador.teste"


def test_usuario_atual_fallback_nunca_levanta(coffee_tmp, monkeypatch):
    from coffee_module import db

    def boom():
        raise OSError("sem tty")

    monkeypatch.setattr(db.getpass, "getuser", boom)
    monkeypatch.setenv("USERNAME", "via.env")
    assert db._usuario_atual() == "via.env"


# ---------------------------------------------------------------------------
# Sub-projeto 3 — flag a_gerar
# ---------------------------------------------------------------------------


def test_marcar_gerar_e_listar(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(355617, 17247854, False, {"id_sap": 17247854})
    assert db.listar_notas("a_gerar") == []
    db.marcar_gerar(355617, True)
    aged = db.listar_notas("a_gerar")
    assert len(aged) == 1 and aged[0]["pk"] == 355617
    assert aged[0]["a_gerar"] is True


def test_marcar_gerar_falso_remove_da_lista(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(1, 17247854, False, {})
    db.marcar_gerar(1, True)
    db.marcar_gerar(1, False)
    assert db.listar_notas("a_gerar") == []


def test_a_gerar_preservado_em_refetch(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(1, 10000000, False, {"id_sap": 10000000})
    db.marcar_gerar(1, True)
    db.upsert_nota(1, 17247854, True, {"id_sap": 17247854})  # re-busca
    assert db.listar_notas("a_gerar")[0]["pk"] == 1


def test_nota_existe(coffee_tmp):
    from coffee_module import db
    assert db.nota_existe(99) is False
    db.upsert_nota(99, 10000000, False, {})
    assert db.nota_existe(99) is True


# ---------------------------------------------------------------------------
# Task 3 — Routes /marcar-gerar + limpeza de a_gerar no /regerar
# ---------------------------------------------------------------------------


def test_rota_marcar_gerar_nota_existente(coffee_cliente):
    from coffee_module import db
    db.upsert_nota(355617, 17247854, False, {"id_sap": 17247854})
    r = coffee_cliente.post("/api/coffee/marcar-gerar", json={"id": 355617, "a_gerar": True})
    assert r.status_code == 200 and r.json()["ok"] is True
    assert db.listar_notas("a_gerar")[0]["pk"] == 355617
    assert any(l["acao"] == "marcar_gerar" for l in db.listar_logs(tipo="acao_usuario"))


def test_rota_marcar_gerar_busca_se_ausente(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854}},
    )
    r = coffee_cliente.post("/api/coffee/marcar-gerar", json={"id": 355617, "a_gerar": True})
    assert r.status_code == 200
    assert db.nota_existe(355617) is True
    assert db.listar_notas("a_gerar")[0]["pk"] == 355617


def test_rota_marcar_gerar_falha_busca_502(coffee_cliente, monkeypatch):
    from coffee_module import client, db

    def boom(i):
        raise RuntimeError("falha API")

    monkeypatch.setattr(client, "buscar_nota", boom)
    r = coffee_cliente.post("/api/coffee/marcar-gerar", json={"id": 999, "a_gerar": True})
    assert r.status_code == 502
    assert any(l["acao"] == "marcar_gerar" and l["sucesso"] is False
               for l in db.listar_logs(tipo="acao_usuario"))


def test_rota_regerar_limpa_a_gerar(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    db.marcar_gerar(355617, True)
    monkeypatch.setattr(client, "desarquivar", lambda i: True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854}},
    )
    r = coffee_cliente.post("/api/coffee/regerar", json={"id": 355617})
    assert r.status_code == 200
    assert db.listar_notas("a_gerar") == []


# ---------------------------------------------------------------------------
# Sub-projeto 4 — status nao_gerada
# ---------------------------------------------------------------------------


def test_classificacao_nao_gerada():
    from coffee_module import classify
    assert classify.classificar(None, None) == "nao_gerada"
    assert classify.classificar(0, None) == "nao_gerada"
    assert classify.classificar("", None) == "nao_gerada"
    # sem SAP atual = nao_gerada mesmo com anterior conhecido
    assert classify.classificar(None, config.SAP_PENDENTE) == "nao_gerada"


def test_upsert_nota_sem_sap_classifica_nao_gerada(coffee_tmp):
    from coffee_module import db
    classe = db.upsert_nota(355617, None, False, {"id_sap": None})
    assert classe == "nao_gerada"
    assert db.listar_notas("nao_gerada")[0]["pk"] == 355617
