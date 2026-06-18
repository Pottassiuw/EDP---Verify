"""Testes do módulo COFFEE (backend)."""
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
