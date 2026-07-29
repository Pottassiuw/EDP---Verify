"""Testes do modulo Carteira (backend). Origem Databricks sempre mockada."""
import pytest


@pytest.fixture
def carteira_tmp(monkeypatch, tmp_path):
    monkeypatch.setenv("CARTEIRA_DATA_DIR", str(tmp_path))
    from carteira_module import db
    db.inicializar_banco()
    return tmp_path


def test_inicializar_cria_tabelas(carteira_tmp):
    from carteira_module import db
    conn = db.conectar()
    nomes = {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    conn.close()
    assert {"nota_carteira", "carteira_sync_execucoes",
            "carteira_logs", "carteira_meta"} <= nomes


def test_versao_e_meta(carteira_tmp):
    from carteira_module import db
    v0 = db.obter_versao()
    conn = db.conectar()
    db.definir_meta(conn, "ultimo_refresh_marker", "22-07-2026 07:33")
    db.bump_versao(conn)
    conn.commit()
    conn.close()
    assert db.obter_meta("ultimo_refresh_marker") == "22-07-2026 07:33"
    assert db.obter_versao() != v0


def test_regionais_sp_e_depara():
    from carteira_module import config
    assert "GUARULHOS" in config.REGIONAIS_SP
    assert config.DE_PARA_REGIONAL["LITORAL"] == "Litoral Norte"
    assert config.DE_PARA_REGIONAL["SUZANO"] == "Poá-Suzano"


def _origem_exemplo(**over):
    base = {
        "id_onr": 555, "id_sap": "17247854", "conjunto": "POSTE",
        "descrição_conjunto": "POSTE DEMANDA", "CSD": "LITORAL",
        "EMPRESA": "EDP SP", "quantidade": 12, "prioridade": "3",
        "Prioridade_SAP": 3, "Status_SAP": "Pendente",
        "Data_encerramento_exec": None, "local_instalacao": "718ET00026773",
        "alimentador": "AL1", "executor": "EMPRESA X", "sintoma": "queda",
        "componente_novo": "N", "kit": "", "n_trafo": "", "dispositivo_protecao": "",
        "latitude": "-23.1", "longitude": "-45.2",
        "matriculaSAP": "123", "nomeColaborador": "Fulano", "colaborador": "F",
        "Solicitante": "Sol",
    }
    base.update(over)
    return base


def test_de_para_regional():
    from carteira_module import mapping
    assert mapping.de_para_regional("LITORAL") == "Litoral Norte"
    assert mapping.de_para_regional("SUZANO") == "Poá-Suzano"
    assert mapping.de_para_regional("GUARULHOS") == "GUARULHOS"
    assert mapping.de_para_regional(None) is None


def test_normalizar_linha_deriva_e_dropa_pii():
    from carteira_module import mapping
    n = mapping.normalizar_linha(_origem_exemplo())
    assert n["id_onr"] == 555
    assert n["regional"] == "Litoral Norte"
    assert n["csd_origem"] == "LITORAL"
    assert n["sap_real"] == 1
    assert n["quantidade_valida"] == 1
    assert "matriculaSAP" not in n and "nomeColaborador" not in n
    assert "colaborador" not in n and "Solicitante" not in n


def test_normalizar_linha_sap_pendente_e_quantidade_sentinela():
    from carteira_module import mapping
    n = mapping.normalizar_linha(
        _origem_exemplo(id_sap="10000000", quantidade=9999)
    )
    assert n["sap_real"] == 0
    assert n["quantidade_valida"] == 0


def test_normalizar_linha_trata_nan_do_pandas_como_ausente():
    """Bug real achado na validacao visual da Fase 1b: DataFrame.to_dict('records')
    preserva float('nan') para celulas vazias; 'valor is None' nao pega NaN, entao
    a coluna virava a string literal "nan" (visivel no Explorador/Sheet)."""
    from carteira_module import mapping
    n = mapping.normalizar_linha(
        _origem_exemplo(Status_SAP=float('nan'), dispositivo_protecao=float('nan'))
    )
    assert n["status_sap"] is None
    assert n["dispositivo_protecao"] is None


def test_hash_estavel_e_sensivel():
    from carteira_module import mapping
    a = mapping.normalizar_linha(_origem_exemplo())
    b = mapping.normalizar_linha(_origem_exemplo())
    assert mapping.hash_conteudo(a) == mapping.hash_conteudo(b)
    c = mapping.normalizar_linha(_origem_exemplo(Status_SAP="Encerrado"))
    assert mapping.hash_conteudo(a) != mapping.hash_conteudo(c)


def test_situacao_precedencia():
    from carteira_module import situacao
    cancelada = {"status_sap": "Cancelado", "data_encerramento_exec": None,
                 "sap_real": 1, "id_sap": "1"}
    assert situacao.derivar(cancelada, {1}) == "cancelada"

    executada = {"status_sap": "Encerrado", "data_encerramento_exec": None,
                 "sap_real": 1, "id_sap": "2"}
    assert situacao.derivar(executada, set()) == "executada"

    exec_por_data = {"status_sap": None, "data_encerramento_exec": "2025-06-01",
                     "sap_real": 1, "id_sap": "3"}
    assert situacao.derivar(exec_por_data, set()) == "executada"

    no_plano = {"status_sap": "Pendente", "data_encerramento_exec": None,
                "sap_real": 1, "id_sap": "44"}
    assert situacao.derivar(no_plano, {44}) == "no_plano"

    fora = {"status_sap": None, "data_encerramento_exec": None,
            "sap_real": 1, "id_sap": "99"}
    assert situacao.derivar(fora, {44}) == "fora_do_plano"


def test_situacao_sem_sap_nunca_no_plano():
    from carteira_module import situacao
    sem_sap = {"status_sap": "Pendente", "data_encerramento_exec": None,
               "sap_real": 0, "id_sap": "10000000"}
    assert situacao.derivar(sem_sap, {10000000}) == "fora_do_plano"


def test_listar_numeros_nota(monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path))
    from input_module import db as idb
    idb.inicializar_banco()
    conn = idb.get_db_connection()
    conn.execute("INSERT INTO notas(Numero_Nota) VALUES(111),(222)")
    conn.commit()
    conn.close()
    assert idb.listar_numeros_nota() == {111, 222}


def _inserir(conn, notas):
    from carteira_module import repository
    repository.carregar_staging(conn, notas)
    return repository.reconciliar(conn, "2026-07-22T00:00:00")


def test_reconciliar_idempotente_e_tombstone(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    n1 = mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="1001"))
    n2 = mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="1002"))
    r1 = _inserir(conn, [n1, n2])
    assert r1["novas"] == 2
    # rodar de novo com os mesmos dados: nada muda (idempotente)
    r2 = _inserir(conn, [n1, n2])
    assert r2["novas"] == 0 and r2["atualizadas"] == 0 and r2["inalteradas"] == 2
    # n2 some da origem -> tombstone (nunca deletado)
    r3 = _inserir(conn, [n1])
    assert r3["ausentes"] == 1
    row = conn.execute(
        "SELECT ausente_na_origem_em FROM nota_carteira WHERE id_onr=2"
    ).fetchone()
    assert row["ausente_na_origem_em"] is not None
    # n2 volta -> tombstone limpo
    _inserir(conn, [n1, n2])
    row = conn.execute(
        "SELECT ausente_na_origem_em FROM nota_carteira WHERE id_onr=2"
    ).fetchone()
    assert row["ausente_na_origem_em"] is None
    conn.close()


def test_reconciliar_detecta_alteracao(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    _inserir(conn, [mapping.normalizar_linha(_origem_exemplo(id_onr=1, Status_SAP="Pendente"))])
    r = _inserir(conn, [mapping.normalizar_linha(_origem_exemplo(id_onr=1, Status_SAP="Encerrado"))])
    assert r["atualizadas"] == 1
    conn.close()


def test_listar_filtra_por_situacao_e_regional(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="500", CSD="GUARULHOS", Status_SAP="Pendente")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="600", CSD="GUARULHOS", Status_SAP="Encerrado")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=3, id_sap="700", CSD="SUZANO", Status_SAP="Pendente")),
    ])
    linhas, total = repository.listar(
        conn, numeros_no_plano={500}, filtros={"regional": "GUARULHOS"},
        page=1, size=10, ordenar_por="id_onr", ordem="asc",
    )
    assert total == 2
    sit = {l["id_onr"]: l["situacao"] for l in linhas}
    assert sit[1] == "no_plano"      # id_sap 500 no plano
    assert sit[2] == "executada"     # Encerrado
    # filtro por situacao
    _l, t_fora = repository.listar(
        conn, numeros_no_plano=set(), filtros={"situacao": "fora_do_plano"},
        page=1, size=10, ordenar_por="id_onr", ordem="asc",
    )
    assert t_fora == 2               # onr 1 e 3 (Pendente, sem plano)
    conn.close()


def test_resumo_agrega(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="500", CSD="GUARULHOS", Status_SAP="Encerrado")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="600", CSD="SUZANO", Status_SAP="Pendente")),
    ])
    r = repository.resumo(conn, numeros_no_plano=set())
    assert r["total"] == 2
    assert r["por_situacao"].get("executada") == 1
    assert r["por_regional"].get("Poá-Suzano") == 1
    conn.close()


def test_sync_completo_e_skip(carteira_tmp):
    from carteira_module import sync
    origem = [_origem_exemplo(id_onr=1, id_sap="1"),
              _origem_exemplo(id_onr=2, id_sap="2")]
    e1 = sync.sincronizar(ler_origem=lambda: origem, ler_marker=lambda: "M1",
                          agora="2026-07-22T00:00:00")
    assert e1["estrategia"] == "completa" and e1["status"] == "ok"
    assert e1["novas"] == 2
    # mesmo marker -> skip (nao reconcilia)
    e2 = sync.sincronizar(ler_origem=lambda: origem, ler_marker=lambda: "M1",
                          agora="2026-07-22T01:00:00")
    assert e2["estrategia"] == "skip"
    # marker novo -> reconcilia de novo, idempotente
    e3 = sync.sincronizar(ler_origem=lambda: origem, ler_marker=lambda: "M2",
                          agora="2026-07-22T02:00:00")
    assert e3["estrategia"] == "completa"
    assert e3["novas"] == 0 and e3["inalteradas"] == 2


def test_sync_registra_execucao(carteira_tmp):
    from carteira_module import sync
    sync.sincronizar(ler_origem=lambda: [_origem_exemplo(id_onr=1, id_sap="1")],
                     ler_marker=lambda: "M1", agora="2026-07-22T00:00:00")
    est = sync.estado()
    assert est["ultimo_refresh_marker"] == "M1"
    assert len(est["execucoes"]) >= 1


def test_service_pagina_e_resumo(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from carteira_module import service, sync
    sync.sincronizar(
        ler_origem=lambda: [
            _origem_exemplo(id_onr=1, id_sap="500", CSD="GUARULHOS", Status_SAP="Encerrado"),
            _origem_exemplo(id_onr=2, id_sap="600", CSD="SUZANO", Status_SAP="Pendente"),
        ],
        ler_marker=lambda: "M1", agora="2026-07-22T00:00:00",
    )
    pag = service.pagina_notas({}, page=1, size=10, ordenar_por="id_onr", ordem="asc")
    assert pag["total"] == 2 and len(pag["registros"]) == 2
    assert "versao" in pag
    r = service.resumo()
    assert r["total"] == 2
    d = service.detalhe(1)
    assert d["id_onr"] == 1 and d["situacao"] == "executada"
    assert service.detalhe(9999) is None


def test_rotas_notas_e_sincronizar(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from carteira_module import routes, sync

    sync.sincronizar(
        ler_origem=lambda: [_origem_exemplo(id_onr=1, id_sap="500", CSD="GUARULHOS")],
        ler_marker=lambda: "M1", agora="2026-07-22T00:00:00",
    )
    app = FastAPI()
    app.include_router(routes.router)
    cliente = TestClient(app)

    r = cliente.get("/api/carteira/notas", params={"regional": "GUARULHOS"})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["total"] == 1 and corpo["registros"][0]["id_onr"] == 1

    assert cliente.get("/api/carteira/notas/1").status_code == 200
    assert cliente.get("/api/carteira/notas/9999").status_code == 404
    assert cliente.get("/api/carteira/resumo").json()["total"] == 1
    assert "execucoes" in cliente.get("/api/carteira/sincronizacao").json()


def test_plano_movimentacoes(carteira_tmp):
    from carteira_module import db
    conn = db.conectar()
    db.registrar_movimentacao(conn, [{
        "id_onr": 1, "numero_nota": "17247854", "acao": "entrada",
        "usuario": "teste", "lote_id": "lote-abc", "mes_execucao": "jul-2026",
        "status_obra": "Planejada", "snapshot": '{"x":1}',
        "movido_em": "2026-07-23T00:00:00",
    }])
    conn.commit()
    linhas = conn.execute(
        "SELECT id_onr, acao, lote_id FROM plano_movimentacoes"
    ).fetchall()
    conn.close()
    assert len(linhas) == 1
    assert linhas[0]["id_onr"] == 1 and linhas[0]["acao"] == "entrada"


def test_obter_muitas(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=10, id_sap="500")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=11, id_sap="501")),
    ])
    achadas = repository.obter_muitas(conn, [10, 11, 999])
    conn.close()
    assert set(achadas.keys()) == {10, 11}
    assert achadas[10]["id_sap"] == "500"


def test_listar_divergencias(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    # 100: cancelada e no plano -> divergente
    # 101: cancelada mas NAO no plano -> nao
    # 102: ativa e no plano -> nao
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=100, id_sap="900", Status_SAP="Cancelado")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=101, id_sap="901", Status_SAP="Cancelado")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=102, id_sap="902", Status_SAP="Pendente")),
    ])
    div = repository.listar_divergencias(conn, numeros_no_plano={900, 902})
    conn.close()
    assert len(div) == 1
    assert div[0]["id_onr"] == 100
    assert div[0]["tipo_divergencia"] == "cancelada"


def test_preview_classifica_movivel_e_bloqueada(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from input_module import db as idb
    idb.inicializar_banco()
    from carteira_module import db, mapping, movimentacao, repository
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="500", conjunto="POSTE")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="10000000")),  # pendente
    ])
    conn.close()
    prev = {p["id_onr"]: p for p in movimentacao.preview([1, 2])}
    assert prev[1]["movivel"] is True
    assert prev[1]["proposta"]["Conjunto"] == "POSTE"
    assert prev[2]["movivel"] is False   # sem SAP real
    assert prev[2]["motivo_bloqueio"]


def test_mover_para_plano_insere_e_registra(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from input_module import db as idb
    idb.inicializar_banco()
    from carteira_module import db, mapping, movimentacao
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="700500", conjunto="POSTE")),
    ])
    conn.close()
    res = movimentacao.mover_para_plano(
        [1], {"Mes_Execucao_Planejado": "jul-2026", "Status_Obra": "Planejada"},
        usuario="teste")
    assert res["inseridas"] == 1 and res["lote_id"]
    # gravou no plano com origem carteira
    iconn = idb.get_db_connection()
    row = iconn.execute("SELECT origem, Conjunto FROM notas WHERE Numero_Nota=700500").fetchone()
    iconn.close()
    assert row[0] == "carteira" and row[1] == "POSTE"
    # gravou movimentacao
    cconn = db.conectar()
    n = cconn.execute("SELECT COUNT(*) FROM plano_movimentacoes WHERE id_onr=1").fetchone()[0]
    cconn.close()
    assert n == 1


def test_mover_all_or_nothing(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from input_module import db as idb
    idb.inicializar_banco()
    from carteira_module import db, mapping, movimentacao
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="700600")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="10000000")),  # bloqueada
    ])
    conn.close()
    with pytest.raises(movimentacao.MovimentacaoBloqueadaErro):
        movimentacao.mover_para_plano([1, 2], {"Mes_Execucao_Planejado": "jul-2026"},
                                      usuario="teste")
    # nada inserido (all-or-nothing)
    iconn = idb.get_db_connection()
    total = iconn.execute("SELECT COUNT(*) FROM notas").fetchone()[0]
    iconn.close()
    assert total == 0


def test_rotas_mover_e_divergencias(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from input_module import db as idb
    idb.inicializar_banco()
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from carteira_module import routes, db, mapping
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="700700", conjunto="POSTE")),
    ])
    conn.close()
    app = FastAPI()
    app.include_router(routes.router)
    cli = TestClient(app)

    prev = cli.post("/api/carteira/mover/preview", json={"id_onrs": [1]})
    assert prev.status_code == 200 and prev.json()[0]["movivel"] is True

    cab = {"X-User": "teste"}
    mov = cli.post("/api/carteira/mover-para-plano", headers=cab,
                   json={"id_onrs": [1], "mes_execucao": "jul-2026",
                         "status_obra": "Planejada"})
    assert mov.status_code == 200 and mov.json()["inseridas"] == 1

    # mover de novo -> 422 (ja no plano, bloqueado no preview)
    again = cli.post("/api/carteira/mover-para-plano", headers=cab,
                     json={"id_onrs": [1], "mes_execucao": "jul-2026"})
    assert again.status_code == 422

    assert cli.get("/api/carteira/movimentacoes").status_code == 200
    assert cli.get("/api/carteira/divergencias").status_code == 200


def test_normalizar_regional_dashboard():
    from carteira_module import config
    assert config.normalizar_regional_dashboard("GUARULHOS") == "Guarulhos"
    assert config.normalizar_regional_dashboard("Poá-Suzano") == "Poa/Suzano"
    assert config.normalizar_regional_dashboard("SÃO JOSÉ DOS CAMPOS") == "São José dos Campos"
    assert config.normalizar_regional_dashboard("Litoral Norte") == "Litoral Norte"
    assert config.normalizar_regional_dashboard(None) is None


def test_base_por_plano(carteira_tmp):
    from carteira_module import db, mapping, repository
    conn = db.conectar()
    _inserir(conn, [
        # fora do plano (sap real, ativo) -> conta
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="800", CSD="GUARULHOS",
            conjunto="46", **{"descrição_conjunto": "POSTES - CAPEX"}, quantidade=10, Status_SAP="Pendente")),
        mapping.normalizar_linha(_origem_exemplo(id_onr=2, id_sap="801", CSD="GUARULHOS",
            conjunto="46", **{"descrição_conjunto": "POSTES - CAPEX"}, quantidade=5, Status_SAP="Pendente")),
        # cancelada -> NAO conta
        mapping.normalizar_linha(_origem_exemplo(id_onr=3, id_sap="802", CSD="GUARULHOS",
            conjunto="46", **{"descrição_conjunto": "POSTES - CAPEX"}, quantidade=99, Status_SAP="Cancelado")),
        # no plano (900) -> NAO conta como base
        mapping.normalizar_linha(_origem_exemplo(id_onr=4, id_sap="900", CSD="SUZANO",
            conjunto="56", **{"descrição_conjunto": "PODA DE ARVORES - OPEX"}, quantidade=7, Status_SAP="Pendente")),
    ])
    base = repository.base_por_plano(conn, numeros_no_plano={900})
    conn.close()
    por = {(b["regional"], b["plano"]): b for b in base}
    assert por[("GUARULHOS", "POSTES - CAPEX")]["quantidade_bruta"] == 15
    assert por[("GUARULHOS", "POSTES - CAPEX")]["n_notas"] == 2
    assert ("SUZANO", "PODA DE ARVORES - OPEX") not in por  # 900 esta no plano


def test_converter_ddpm():
    from carteira_module import dashboard
    assert dashboard.converter_ddpm(2000, "KM") == 2.0
    assert dashboard.converter_ddpm(10, "Und.") == 10.0
    assert dashboard.converter_ddpm(10, None) == 10.0


def test_dashboard_montar_junta_base_e_meta():
    from carteira_module import dashboard
    dash = {
        "hero": {"meta": 40, "carteira": 30, "executado": 5},
        "mensalizacao": [{"mes": 1, "meta": 40, "carteira": 30, "executado": 5}],
        "visao_anual": [
            {"plano": "POSTES - CAPEX", "nome_curto": "POSTE", "area": "Construção",
             "meta": 40.0, "carteira": 30.0},
        ],
        "regionais": [{"regional": "Guarulhos", "meta": 40.0, "carteira": 30.0}],
        "regionais_disponiveis": ["Guarulhos"],
    }
    base_bruta = [
        {"regional": "GUARULHOS", "plano": "POSTES - CAPEX", "quantidade_bruta": 15, "n_notas": 2},
        {"regional": "SUZANO", "plano": "PODA DE ARVORES - OPEX", "quantidade_bruta": 7, "n_notas": 1},
    ]
    unidade = {"POSTES - CAPEX": "Und."}
    nome_area = {"POSTES - CAPEX": ("POSTE", "Construção")}
    out = dashboard.montar(dash, base_bruta, unidade, nome_area)

    postes = next(p for p in out["por_plano"] if p["plano"] == "POSTES - CAPEX")
    assert postes["meta"] == 40.0 and postes["planejado"] == 30.0
    assert postes["base_disponivel"] == 15.0
    assert postes["gap"] == 10.0                     # meta - planejado
    assert abs(postes["cobertura_pct"] - (30 + 15) / 40) < 1e-9
    assert postes["suficiente"] is True              # base 15 >= gap 10

    # OPEX sem meta -> só na camada base_por_plano_sem_meta
    sem_meta = {p["plano"]: p for p in out["base_por_plano_sem_meta"]}
    assert sem_meta["PODA DE ARVORES - OPEX"]["base_disponivel"] == 7.0
    assert all(p["plano"] != "PODA DE ARVORES - OPEX" for p in out["por_plano"])


def test_rota_dashboard(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from input_module import db as idb
    idb.inicializar_banco()
    import datetime
    iconn = idb.get_db_connection()
    iconn.execute("INSERT INTO metas_plano(Ano,Mes,Regional,Plano,Meta) VALUES(?,?,?,?,?)",
                  (datetime.datetime.now().year, 1, "Guarulhos", "POSTES - CAPEX", 40))
    iconn.execute("INSERT INTO planos_depara(Plano,Nome_Curto,Unidade,Area,Modular_RS,Ordem_Exibicao) "
                  "VALUES('POSTES - CAPEX','POSTE','Und.','Construção',6921,1)")
    iconn.commit(); iconn.close()
    from carteira_module import db, mapping, routes
    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(id_onr=1, id_sap="800", CSD="GUARULHOS",
            conjunto="46", **{"descrição_conjunto": "POSTES - CAPEX"}, quantidade=15, Status_SAP="Pendente")),
    ])
    conn.close()
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    app = FastAPI(); app.include_router(routes.router)
    r = TestClient(app).get("/api/carteira/dashboard?mes=1")
    assert r.status_code == 200
    corpo = r.json()
    postes = next(p for p in corpo["por_plano"] if p["plano"] == "POSTES - CAPEX")
    assert postes["meta"] == 40.0
    assert postes["base_disponivel"] == 15.0
