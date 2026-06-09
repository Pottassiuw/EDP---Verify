import re
import pytest
from main import parse_duplicate_ids, enrich_candidate


def test_ok_returns_empty():
    assert parse_duplicate_ids("ok", "100", set()) == []

def test_empty_returns_empty():
    assert parse_duplicate_ids("", "100", set()) == []
    assert parse_duplicate_ids(None, "100", set()) == []

def test_nan_returns_empty():
    assert parse_duplicate_ids("nan", "100", set()) == []

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
