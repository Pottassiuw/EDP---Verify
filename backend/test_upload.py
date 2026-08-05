import re
import pytest
from main import enrich_candidate, parse_coord, parse_duplicate_ids


def test_ok_returns_empty():
    assert parse_duplicate_ids("ok", "100", set()) == []

def test_empty_returns_empty():
    assert parse_duplicate_ids("", "100", set()) == []
    assert parse_duplicate_ids(None, "100", set()) == []

def test_nan_returns_empty():
    assert parse_duplicate_ids("nan", "100", set()) == []


def test_parse_coord_descarta_nan_e_infinito():
    assert parse_coord("nan") is None
    assert parse_coord("inf") is None
    assert parse_coord("-20,3") == -20.3

def test_non_numeric_sentinel_returns_empty():
    assert parse_duplicate_ids("coordenada_invalida", "100", set()) == []

def test_single_external():
    result = parse_duplicate_ids("171153", "100", set())
    assert result == [{"id": "171153", "in_sheet": False}]

def test_single_in_sheet():
    result = parse_duplicate_ids("200", "100", {"200", "300"})
    assert result == [{"id": "200", "in_sheet": True}]

def test_multiple_with_dedup():
    result = parse_duplicate_ids("229482 / 229482 / 229482", "100", set())
    assert result == [{"id": "229482", "in_sheet": False}]

def test_multiple_distinct():
    result = parse_duplicate_ids("278801 / 278802", "100", set())
    assert len(result) == 2
    assert result[0]["id"] == "278801"
    assert result[1]["id"] == "278802"

def test_self_reference_discarded():
    result = parse_duplicate_ids("100 / 200", "100", set())
    assert len(result) == 1
    assert result[0]["id"] == "200"

def test_mixed_in_sheet_and_external():
    id_set = {"200"}
    result = parse_duplicate_ids("200 / 300", "100", id_set)
    assert result[0] == {"id": "200", "in_sheet": True}
    assert result[1] == {"id": "300", "in_sheet": False}

def test_enrich_candidate():
    cand = {"id": "200", "in_sheet": True}
    source = {
        "local_instalacao": "SER-11",
        "poste": "TR-088",
        "referencia": "SER-11 · TR-088",
        "problema": "COND · AFRO · IN",
        "latitude": -20.3,
        "longitude": -40.3,
    }
    result = enrich_candidate(cand, source)
    assert result["local_instalacao"] == "SER-11"
    assert result["poste"] == "TR-088"
    assert result["referencia"] == "SER-11 · TR-088"
    assert result["problema"] == "COND · AFRO · IN"
    assert result["latitude"] == -20.3

def test_enrich_candidate_empty_fields():
    cand = {"id": "200", "in_sheet": True}
    source = {"local_instalacao": None, "poste": "", "referencia": None, "problema": None, "latitude": None, "longitude": None}
    result = enrich_candidate(cand, source)
    assert result["local_instalacao"] == ""
    assert result["poste"] == ""
    assert result["problema"] == ""

def test_gzip_comprime_resposta_grande(monkeypatch):
    """Respostas acima do limite saem comprimidas quando o cliente aceita gzip."""
    from fastapi.testclient import TestClient
    import main

    grande = [{"id": str(i), "errors": [], "uf": "SP", "setor": "Centro"}
              for i in range(500)]
    monkeypatch.setattr(main, "RECORDS", grande)
    client = TestClient(main.app)
    r = client.get("/api/data", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"
    # httpx descomprime transparentemente: o corpo continua íntegro
    assert len(r.json()["records"]) == 500


def test_slim_raw_mantem_so_colunas_consumidas():
    """`raw` era ~76% do corpo de GET /api/data com colunas que o front ignora."""
    from main import slim_raw

    resultado = slim_raw({
        "id": "100", "local_instalacao": "SER-11", "postes": "TR-088",
        "coluna_interna_do_excel": "x" * 500, "chk_coordenada": "ok",
    })
    assert resultado == {"id": "100", "local_instalacao": "SER-11", "postes": "TR-088"}


def test_upload_enriquece_gerador_com_de_para(tmp_path, monkeypatch):
    """O filtro de inspetores usa a matrícula da coluna colaborador da nota."""
    import io
    import pandas as pd
    from fastapi.testclient import TestClient
    import main

    de_para = tmp_path / "membros.xlsx"
    pd.DataFrame([{
        "Matrícula": 204565, "Nome": "Fabricio", "Sobrenome": "Dias",
        "Uf": "ES", "Permissoes": "colaborador, inspetor_planejamento",
    }]).to_excel(de_para, sheet_name="Colaboradores", index=False)
    monkeypatch.setenv("DE_PARA_MEMBROS_PATH", str(de_para))

    planilha = io.BytesIO()
    pd.DataFrame([{
        "id": 100728801, "prioridade": 1, "tipo_nota": "Poda",
        "referencia_fisica": "SER-11", "uf": "ES", "setor": "Centro",
        "colaborador": 204565, "chk_coordenada": "ok",
    }]).to_excel(planilha, index=False)

    cliente = TestClient(main.app)
    resposta = cliente.post("/api/upload", files={"file": ("p.xlsx", planilha.getvalue())})
    assert resposta.status_code == 200

    gerador = cliente.get("/api/data").json()["records"][0]["gerador"]
    assert gerador == {
        "matricula": "204565", "nome": "Fabricio Dias", "uf": "ES", "inspetor": True,
        "cadastrado": True,
    }


def test_upload_gerador_sem_registro_no_de_para(tmp_path, monkeypatch):
    """Matrícula da nota sem linha correspondente no De-Para vira gerador não cadastrado."""
    import io
    import pandas as pd
    from fastapi.testclient import TestClient
    import main

    de_para = tmp_path / "membros.xlsx"
    pd.DataFrame([{
        "Matrícula": 204565, "Nome": "Fabricio", "Sobrenome": "Dias",
        "Uf": "ES", "Permissoes": "colaborador, inspetor_planejamento",
    }]).to_excel(de_para, sheet_name="Colaboradores", index=False)
    monkeypatch.setenv("DE_PARA_MEMBROS_PATH", str(de_para))

    planilha = io.BytesIO()
    pd.DataFrame([{
        "id": 100728802, "prioridade": 1, "tipo_nota": "Poda",
        "referencia_fisica": "SER-12", "uf": "ES", "setor": "Centro",
        "colaborador": 999999, "chk_coordenada": "ok",
    }]).to_excel(planilha, index=False)

    cliente = TestClient(main.app)
    resposta = cliente.post("/api/upload", files={"file": ("p.xlsx", planilha.getvalue())})
    assert resposta.status_code == 200

    gerador = cliente.get("/api/data").json()["records"][0]["gerador"]
    assert gerador == {
        "matricula": "999999", "nome": "999999", "uf": "", "inspetor": False,
        "cadastrado": False,
    }


def test_upload_nao_devolve_colunas_extras_em_raw(tmp_path):
    """Round-trip: colunas fora de NoteRaw não chegam ao cliente."""
    import io
    import pandas as pd
    from fastapi.testclient import TestClient
    import main

    planilha = io.BytesIO()
    pd.DataFrame([{
        "id": 100728801, "prioridade": 1, "tipo_nota": "Poda",
        "referencia_fisica": "SER-11", "uf": "SP", "setor": "Centro",
        "postes": "TR-088", "chk_coordenada": "ok",
        "coluna_gigante_do_excel": "y" * 400,
    }]).to_excel(planilha, index=False)

    cliente = TestClient(main.app)
    r = cliente.post("/api/upload", files={"file": ("p.xlsx", planilha.getvalue())})
    assert r.status_code == 200

    registro = cliente.get("/api/data").json()["records"][0]
    assert "coluna_gigante_do_excel" not in registro["raw"]
    assert "chk_coordenada" not in registro["raw"]
    assert registro["raw"]["postes"] == "TR-088"
