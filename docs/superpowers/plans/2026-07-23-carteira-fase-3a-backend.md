# Carteira de Notas — Fase 3a (Backend Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend do dashboard da Carteira: reusar a agregação dos Relatórios (meta/planejado/executado) e adicionar a camada "base disponível" (fora do plano) da projeção da carteira, com conversão para DDPM — expondo `GET /api/carteira/dashboard`.

**Architecture:** `carteira_module/dashboard.py` (função pura) recebe o payload de `input_module.relatorios.montar_dashboard` + o agregado da base (`repository.base_por_plano`) + `planos_depara` e produz um payload unificado. O service carrega os DataFrames do Input (mesmos loaders da rota de Relatórios), chama tudo e cacheia por versao. Read-only sobre o Input; nenhuma escrita.

**Tech Stack:** Python, FastAPI, SQLite, pandas, pytest.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-23-carteira-fase-3-dashboard-design.md`.
- **Reuso:** `input_module.relatorios.montar_dashboard(df_notas, df_ramal, df_metas, df_depara, df_postergacoes, ano, mes_referencia, regional)` retorna `{hero, visao_anual, mensalizacao, regionais, financeiro_ano, ...}`. `visao_anual` = lista de `{plano, nome_curto, area, unidade, meta, carteira, saldo, pct_disp, gap_rs, postergado}` (o `plano` == `descricao_conjunto` da carteira; `carteira` = planejado no plano).
- **Loaders do Input (reusar):** `engine.get_dataset()`, `db.carregar_dados_ramal()`, `db.carregar_metas(ano)`, `db.carregar_planos_depara()`, `db.carregar_postergacoes(ano)`.
- **De-para de plano:** `carteira.descricao_conjunto` == `metas.Plano` == `planos_depara.Plano`.
- **Conversão DDPM:** `planos_depara.Unidade == 'KM'` → `quantidade/1000`; senão as-is.
- **De-para de regional (carteira → Relatórios):** GUARATINGUETÁ→Guaratinguetá, GUARULHOS→Guarulhos, MOGI DAS CRUZES→Mogi das Cruzes, SÃO JOSÉ DOS CAMPOS→São José dos Campos, Litoral Norte→Litoral Norte, Poá-Suzano→Poa/Suzano.
- **Base disponível** = notas `fora_do_plano` (sap_real=1, quantidade_valida=1, não cancelada/executada, não no plano, não tombstone).
- **CLAUDE.md:** endpoints finos; nunca engolir exceção; SQL separado das regras; funções 30–40 linhas; sem `any`.
- **Comando de teste (de `backend/`):** `venv/Scripts/python -m pytest test_carteira_module.py -v`.
- **Isolamento de teste:** `CARTEIRA_DATA_DIR` + `INPUT_DATA_DIR` = tmp; `inicializar_banco()` de ambos; Databricks nunca lido em teste.

---

## File Structure

- `backend/carteira_module/config.py` — `DE_PARA_REGIONAL_DASHBOARD`, `REGIONAIS_DASHBOARD`.
- `backend/carteira_module/repository.py` — `base_por_plano`.
- `backend/carteira_module/dashboard.py` — `converter_ddpm`, `montar` (pura).
- `backend/carteira_module/service.py` — `dashboard(ano, mes, regional)`.
- `backend/carteira_module/routes.py` — `GET /dashboard`.
- `backend/test_carteira_module.py` — testes.
- `docs/dev/10-backend-carteira-module.md`.

---

### Task 1: config — de-para de regional (carteira → Relatórios)

**Files:**
- Modify: `backend/carteira_module/config.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Produces: `config.DE_PARA_REGIONAL_DASHBOARD: dict[str,str]`; `config.normalizar_regional_dashboard(regional: str | None) -> str | None`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def test_normalizar_regional_dashboard():
    from carteira_module import config
    assert config.normalizar_regional_dashboard("GUARULHOS") == "Guarulhos"
    assert config.normalizar_regional_dashboard("Poá-Suzano") == "Poa/Suzano"
    assert config.normalizar_regional_dashboard("SÃO JOSÉ DOS CAMPOS") == "São José dos Campos"
    assert config.normalizar_regional_dashboard("Litoral Norte") == "Litoral Norte"
    assert config.normalizar_regional_dashboard(None) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k normalizar_regional_dashboard -v`
Expected: FAIL — `AttributeError: module 'carteira_module.config' has no attribute 'normalizar_regional_dashboard'`.

- [ ] **Step 3: Write minimal implementation**

Adicione ao final de `backend/carteira_module/config.py`:
```python
# De-para da regional da carteira (CSD normalizado) para os nomes canônicos
# de input_module.relatorios.REGIONAIS_CSD, para casar o join meta×base.
DE_PARA_REGIONAL_DASHBOARD = {
    "GUARATINGUETÁ": "Guaratinguetá",
    "GUARULHOS": "Guarulhos",
    "MOGI DAS CRUZES": "Mogi das Cruzes",
    "SÃO JOSÉ DOS CAMPOS": "São José dos Campos",
    "Litoral Norte": "Litoral Norte",
    "Poá-Suzano": "Poa/Suzano",
}

REGIONAIS_DASHBOARD = tuple(DE_PARA_REGIONAL_DASHBOARD.values())


def normalizar_regional_dashboard(regional: str | None) -> str | None:
    if regional is None:
        return None
    return DE_PARA_REGIONAL_DASHBOARD.get(regional, regional)
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k normalizar_regional_dashboard -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/config.py backend/test_carteira_module.py
git commit -m "feat(carteira): de-para de regional carteira->relatorios para o dashboard"
```

---

### Task 2: repository — base disponível por regional×plano

**Files:**
- Modify: `backend/carteira_module/repository.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `_preparar_plano` (já existe).
- Produces: `repository.base_por_plano(conn, numeros_no_plano: set[int]) -> list[dict]` — por regional×`descricao_conjunto`, das notas `fora_do_plano`: `{regional, plano, quantidade_bruta, n_notas}`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k base_por_plano -v`
Expected: FAIL — `AttributeError: ... has no attribute 'base_por_plano'`.

- [ ] **Step 3: Write minimal implementation**

Adicione ao final de `backend/carteira_module/repository.py`:
```python
def base_por_plano(conn, numeros_no_plano: set[int]) -> list[dict]:
    """Base disponível (situação fora_do_plano) por regional x descricao_conjunto.

    Espelha a precedência de situacao.derivar: exclui cancelada, executada e
    o que já está no plano; só sap_real e quantidade válida; nunca tombstone.
    Devolve a quantidade BRUTA (a conversão para DDPM é feita em dashboard.py,
    que tem o Unidade de planos_depara).
    """
    _preparar_plano(conn, numeros_no_plano)
    linhas = conn.execute(
        "SELECT n.regional AS regional, n.descricao_conjunto AS plano, "
        "SUM(n.quantidade) AS quantidade_bruta, COUNT(*) AS n_notas "
        "FROM nota_carteira n "
        "LEFT JOIN plano_atual p ON p.numero = CAST(n.id_sap AS INTEGER) "
        "AND n.sap_real = 1 "
        "WHERE n.ausente_na_origem_em IS NULL AND n.sap_real = 1 "
        "AND n.quantidade_valida = 1 "
        "AND (n.status_sap IS NULL OR n.status_sap NOT IN ('Cancelado','Encerrado')) "
        "AND n.data_encerramento_exec IS NULL "
        "AND p.numero IS NULL "
        "GROUP BY n.regional, n.descricao_conjunto"
    ).fetchall()
    return [dict(l) for l in linhas]
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k base_por_plano -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/repository.py backend/test_carteira_module.py
git commit -m "feat(carteira): repository base_por_plano (base disponivel por regional x plano)"
```

---

### Task 3: dashboard.py — agregação unificada (pura)

**Files:**
- Create: `backend/carteira_module/dashboard.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `config.normalizar_regional_dashboard`.
- Produces:
  - `dashboard.converter_ddpm(quantidade: float, unidade: str | None) -> float` (÷1000 se `KM`).
  - `dashboard.montar(dash: dict, base_bruta: list[dict], unidade_por_plano: dict, nome_area_por_plano: dict) -> dict` — payload unificado: `{hero, mensalizacao, por_plano, por_regional, base_por_plano_sem_meta, regionais_disponiveis}`.

Nota: `dash` é o retorno de `montar_dashboard`. `unidade_por_plano` = `{Plano: Unidade}` e `nome_area_por_plano` = `{Plano: (Nome_Curto, Area)}` — ambos derivados de `planos_depara` (montados no service, Task 4).

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "converter_ddpm or dashboard_montar" -v`
Expected: FAIL — `No module named 'carteira_module.dashboard'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/dashboard.py`:
```python
"""Agregacao do dashboard da Carteira: reusa montar_dashboard (Relatorios) e
adiciona a camada 'base disponivel' (fora do plano). Funcao pura, sem I/O."""
from carteira_module import config


def converter_ddpm(quantidade: float, unidade: str | None) -> float:
    q = float(quantidade or 0)
    return q / 1000 if (unidade or "").strip().upper() == "KM" else q


def _pct(numerador: float, meta: float) -> float | None:
    return None if meta == 0 else numerador / meta


def montar(dash: dict, base_bruta: list[dict], unidade_por_plano: dict,
           nome_area_por_plano: dict) -> dict:
    # base convertida a DDPM, agregada por plano e por (regional, plano)
    base_por_plano: dict[str, float] = {}
    base_por_reg_plano: dict[tuple, float] = {}
    for linha in base_bruta:
        plano = linha["plano"]
        ddpm = converter_ddpm(linha["quantidade_bruta"], unidade_por_plano.get(plano))
        regional = config.normalizar_regional_dashboard(linha["regional"])
        base_por_plano[plano] = base_por_plano.get(plano, 0.0) + ddpm
        chave = (regional, plano)
        base_por_reg_plano[chave] = base_por_reg_plano.get(chave, 0.0) + ddpm

    planos_com_meta = {l["plano"] for l in dash.get("visao_anual", [])}

    por_plano = []
    for l in dash.get("visao_anual", []):
        meta, planejado = float(l["meta"]), float(l["carteira"])
        base = base_por_plano.get(l["plano"], 0.0)
        gap = meta - planejado
        por_plano.append({
            "plano": l["plano"], "nome_curto": l.get("nome_curto"),
            "area": l.get("area"), "meta": meta, "planejado": planejado,
            "base_disponivel": base, "gap": gap,
            "cobertura_pct": _pct(planejado + base, meta),
            "suficiente": base >= max(0.0, gap),
        })

    base_sem_meta = []
    for plano, base in base_por_plano.items():
        if plano in planos_com_meta:
            continue
        nome, area = nome_area_por_plano.get(plano, (plano, "Outros"))
        base_sem_meta.append({"plano": plano, "nome_curto": nome,
                              "area": area, "base_disponivel": base})
    base_sem_meta.sort(key=lambda x: -x["base_disponivel"])

    por_regional = []
    for r in dash.get("regionais", []):
        meta, planejado = float(r["meta"]), float(r["carteira"])
        base = sum(v for (reg, _pl), v in base_por_reg_plano.items()
                   if reg == r["regional"])
        por_regional.append({
            "regional": r["regional"], "meta": meta, "planejado": planejado,
            "base_disponivel": base, "gap": meta - planejado,
            "cobertura_pct": _pct(planejado + base, meta),
        })

    return {
        "hero": dash.get("hero", {}),
        "mensalizacao": dash.get("mensalizacao", []),
        "por_plano": por_plano,
        "por_regional": por_regional,
        "base_por_plano_sem_meta": base_sem_meta,
        "regionais_disponiveis": dash.get("regionais_disponiveis", []),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "converter_ddpm or dashboard_montar" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/dashboard.py backend/test_carteira_module.py
git commit -m "feat(carteira): dashboard.py (agregacao meta x planejado x base, pura)"
```

---

### Task 4: service + rota `/dashboard`

**Files:**
- Modify: `backend/carteira_module/service.py`, `backend/carteira_module/routes.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `input_module` loaders + `relatorios.montar_dashboard`, `repository.base_por_plano`, `dashboard.montar`, `input_db.listar_numeros_nota`.
- Produces:
  - `service.dashboard(ano: int | None, mes: int | None, regional: str | None) -> dict`.
  - `GET /api/carteira/dashboard`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
def test_rota_dashboard(carteira_tmp, monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from input_module import db as idb
    idb.inicializar_banco()
    # uma meta para POSTES - CAPEX em Guarulhos
    iconn = idb.get_db_connection()
    iconn.execute("INSERT INTO metas_plano(Ano,Mes,Regional,Plano,Meta) VALUES(?,?,?,?,?)",
                  (__import__("datetime").datetime.now().year, 1, "Guarulhos", "POSTES - CAPEX", 40))
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k rota_dashboard -v`
Expected: FAIL — rota inexistente (404).

- [ ] **Step 3: Write minimal implementation**

Adicione a `backend/carteira_module/service.py`:
```python
def dashboard(ano: int | None, mes: int | None, regional: str | None) -> dict:
    import datetime
    from input_module import db as input_db
    from input_module import engine, relatorios
    from carteira_module import dashboard as dash_mod
    from carteira_module import repository

    agora = datetime.datetime.now()
    ano = ano or agora.year
    mes = mes or agora.month

    df_depara = input_db.carregar_planos_depara()
    base_dash = relatorios.montar_dashboard(
        engine.get_dataset(), input_db.carregar_dados_ramal(),
        input_db.carregar_metas(ano), df_depara,
        input_db.carregar_postergacoes(ano),
        ano=ano, mes_referencia=mes, regional=regional)
    base_dash["regionais_disponiveis"] = relatorios.REGIONAIS_CSD

    unidade_por_plano, nome_area_por_plano = {}, {}
    if not df_depara.empty:
        for _, linha in df_depara.iterrows():
            unidade_por_plano[linha["Plano"]] = linha.get("Unidade")
            nome_area_por_plano[linha["Plano"]] = (
                linha.get("Nome_Curto"), linha.get("Area"))

    conn = db.conectar()
    try:
        base_bruta = repository.base_por_plano(conn, input_db.listar_numeros_nota())
    finally:
        conn.close()

    corpo = dash_mod.montar(base_dash, base_bruta, unidade_por_plano, nome_area_por_plano)
    corpo["versao"] = f"{input_db.obter_versao_dataset()}-{db.obter_versao()}"
    return corpo
```

Adicione a rota a `backend/carteira_module/routes.py` (junto das outras GET):
```python
@router.get("/dashboard")
def dashboard(ano: int | None = None, mes: int | None = None,
              regional: str | None = None):
    return service.dashboard(ano, mes, regional)
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -v`
Expected: PASS (módulo inteiro).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/service.py backend/carteira_module/routes.py backend/test_carteira_module.py
git commit -m "feat(carteira): service + rota GET /dashboard (meta x planejado x base)"
```

---

### Task 5: Documentação

**Files:**
- Modify: `docs/dev/10-backend-carteira-module.md`

- [ ] **Step 1: Documentar o dashboard**

Em `docs/dev/10-backend-carteira-module.md`, adicione a seção "Dashboard
(Fase 3)": `dashboard.py` (reusa `relatorios.montar_dashboard` para
meta/planejado/executado e adiciona a camada base disponível da
`carteira.db`), `repository.base_por_plano`, conversão DDPM via
`planos_depara.Unidade`, de-para de regional (`DE_PARA_REGIONAL_DASHBOARD`),
e a rota `GET /dashboard`. Registre que conjuntos sem meta (OPEX) aparecem
só em `base_por_plano_sem_meta`.

- [ ] **Step 2: Verificar suíte verde**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py test_input_module.py -q`
Expected: PASS (carteira + input, sem regressão).

- [ ] **Step 3: Commit**

```bash
git add docs/dev/10-backend-carteira-module.md
git commit -m "docs(carteira): dashboard da Fase 3 (meta x planejado x base disponivel)"
```

---

## Self-Review

**Spec coverage (Fase 3 backend, §4–§9):**
- Reuso de `montar_dashboard` (meta/planejado/executado) → Task 4 (service). ✓
- Camada base disponível (fora do plano, por regional×plano) → Task 2. ✓
- Conversão DDPM (KM÷1000 via planos_depara.Unidade) → Task 3 (`converter_ddpm`). ✓
- De-para de regional carteira→Relatórios → Task 1. ✓
- Cobertura=(planejado+base)/meta, gap, suficiência → Task 3 (`montar`). ✓
- Conjuntos sem meta em camada separada → Task 3 (`base_por_plano_sem_meta`). ✓
- Endpoint `/dashboard` + versao/ETag → Task 4. ✓
- Docs → Task 5. ✓
- Fora de escopo (palette, filtros salvos, incremental) → não implementado. ✓

**Placeholder scan:** sem TBD/TODO; código completo.

**Type consistency:** `normalizar_regional_dashboard` (Task 1) usado em
`dashboard.montar` (Task 3). `base_por_plano(conn, set)->list[dict]{regional,
plano,quantidade_bruta,n_notas}` (Task 2) consumido por `service.dashboard`
(Task 4) e passado a `dashboard.montar` (Task 3). `montar(dash, base_bruta,
unidade_por_plano, nome_area_por_plano)` (Task 3) chamado no service (Task 4)
com os dicts derivados de `planos_depara`. `converter_ddpm` (Task 3) coerente
com a regra `Unidade=='KM'`.

**Escopo:** subsistema backend coeso (dashboard), sem UI — plano único.
Frontend é o plano 3b.
