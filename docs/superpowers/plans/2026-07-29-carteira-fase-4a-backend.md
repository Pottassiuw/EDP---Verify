# Carteira de Notas — Fase 4a (Backend: dashboard superset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `/api/carteira/dashboard` devolver o **superset** do contrato de Relatórios (`DashboardRelatorios`), com a camada "base disponível / cobertura" **fundida em `visao_anual`/`regionais`** (em vez das estruturas paralelas `por_plano`/`por_regional`), para que os Relatórios passem a derivar da carteira sem duplicar agregação nem inverter a dependência entre módulos.

**Architecture:** `carteira_module.dashboard.montar` deixa de emitir `por_plano`/`por_regional` e passa a enriquecer **as próprias linhas** de `visao_anual`/`regionais` do `montar_dashboard` com `base_disponivel`/`cobertura_pct`/`suficiente`, preservando todo o resto do contrato (`hero`, `mensalizacao`, `financeiro_ano`, `ano`, `mes_referencia`, `regional`, `regionais_disponiveis`) + o extra específico da Carteira (`base_por_plano_sem_meta`). O `service.dashboard` adiciona `metas_info` (via `metas.sincronizar_se_preciso`) e a rota ganha ETag/304 por `versao`. **A regra de agregação não muda** — só o posicionamento no shape de saída. Read-only sobre o Input; nenhuma escrita.

**Tech Stack:** Python, FastAPI, SQLite, pandas, pytest.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-29-carteira-fase-4a-convergencia-relatorios-design.md`.
- **Boundary:** `carteira_module` importa `input_module` (já faz); `input_module` **nunca** importa `carteira_module`. `input_module` intocado nesta fase.
- **Zero-regressão da agregação:** a Fase 3 já validou os números do dashboard da Carteira. A regra de split e de cobertura é **preservada verbatim**: `planos_com_meta = {plano em visao_anual com meta>0}`; base por regional soma só planos com meta; `base_por_plano_sem_meta` = planos com base **sem meta** (idêntico a hoje). A mudança é: os dados de `por_plano`/`por_regional` passam a viver **dentro** das linhas de `visao_anual`/`regionais`.
- **Contrato de Relatórios (superset alvo)** — o endpoint deve devolver as MESMAS chaves que `GET /api/input/relatorios/dashboard` emite hoje (`ano`, `mes_referencia`, `regional`, `regionais_disponiveis`, `hero`, `visao_anual`, `mensalizacao`, `regionais`, `financeiro_ano`, `metas_info`) + `base_por_plano_sem_meta` + `versao`. **Não renomear** `mes_referencia` (a divergência `mes_corrente` no type do front é pré-existente e fora do escopo).
- **Campos novos** em cada `visao_anual[]`: `base_disponivel: float`, `cobertura_pct: float|null`, `suficiente: bool`. Em cada `regionais[]`: `base_disponivel: float`, `cobertura_pct: float|null`.
- **CLAUDE.md:** endpoints finos; nunca engolir exceção; SQL separado das regras; funções 30–40 linhas; sem `any`; docs na mesma entrega.
- **Comando de teste (de `backend/`):** `venv/Scripts/python -m pytest test_carteira_module.py -v` (o `venv/`, não `.venv/`, tem pytest+databricks).
- **Isolamento de teste:** `CARTEIRA_DATA_DIR` + `INPUT_DATA_DIR` = tmp; `inicializar_banco()` de ambos; Databricks nunca lido em teste (fixtures existentes de `test_carteira_module.py`).

---

## File Structure

- `backend/carteira_module/dashboard.py` — `montar` reescrito p/ superset.
- `backend/carteira_module/service.py` — `dashboard` + `metas_info`.
- `backend/carteira_module/routes.py` — `GET /dashboard` + ETag/304.
- `backend/test_carteira_module.py` — testes atualizados/novos.
- `docs/dev/10-backend-carteira-module.md` — novo shape.

---

### Task 1: `dashboard.montar` → superset (funde base em visao_anual/regionais)

**Files:**
- Modify: `backend/carteira_module/dashboard.py`
- Modify: `backend/test_carteira_module.py` (atualizar `test_dashboard_montar_junta_base_e_meta`)

**Interfaces:**
- Mantém: `converter_ddpm(quantidade, unidade)`, `_pct(numerador, meta)`.
- `montar(dash, base_bruta, unidade_por_plano, nome_area_por_plano) -> dict` passa a devolver:
  `{ano, mes_referencia, regional, regionais_disponiveis, hero, visao_anual (enriquecido), mensalizacao, regionais (enriquecido), financeiro_ano, base_por_plano_sem_meta}`.
  **Some** `por_plano` e `por_regional`.

- [ ] **Step 1: Atualizar o teste (novo shape)**

Substitua `test_dashboard_montar_junta_base_e_meta` em `backend/test_carteira_module.py` por:
```python
def test_dashboard_montar_superset_funde_base_em_visao_anual():
    from carteira_module import dashboard
    dash = {
        "ano": 2026, "mes_referencia": 1, "regional": None,
        "hero": {"meta": 40, "carteira": 30, "executado": 5},
        "mensalizacao": [{"mes": 1, "meta": 40, "carteira": 30, "executado": 5}],
        "visao_anual": [
            {"plano": "POSTES - CAPEX", "nome_curto": "POSTE", "area": "Construção",
             "unidade": "Und.", "meta": 40.0, "carteira": 30.0, "saldo": -10.0,
             "pct_disp": 0.75, "gap_rs": -69210.0, "postergado": 0.0},
            {"plano": "SEM META - X", "nome_curto": "X", "area": "Outros",
             "unidade": "Und.", "meta": 0.0, "carteira": 0.0, "saldo": 0.0,
             "pct_disp": None, "gap_rs": 0.0, "postergado": 0.0},
        ],
        "regionais": [{"regional": "Guarulhos", "meta": 40.0, "carteira": 30.0,
                       "saldo": -10.0, "pct_disp": 0.75}],
        "financeiro_ano": {"meta_rs": 1.0, "carteira_rs": 2.0},
        "regionais_disponiveis": ["Guarulhos"],
    }
    base_bruta = [
        {"regional": "GUARULHOS", "plano": "POSTES - CAPEX", "quantidade_bruta": 15, "n_notas": 2},
        {"regional": "SUZANO", "plano": "PODA DE ARVORES - OPEX", "quantidade_bruta": 7, "n_notas": 1},
    ]
    unidade = {"POSTES - CAPEX": "Und."}
    nome_area = {"POSTES - CAPEX": ("POSTE", "Construção")}
    out = dashboard.montar(dash, base_bruta, unidade, nome_area)

    # superset: contrato de Relatórios preservado
    assert out["ano"] == 2026 and out["mes_referencia"] == 1
    assert out["financeiro_ano"] == {"meta_rs": 1.0, "carteira_rs": 2.0}
    assert "por_plano" not in out and "por_regional" not in out

    # base fundida NA linha do visao_anual (meta>0)
    postes = next(l for l in out["visao_anual"] if l["plano"] == "POSTES - CAPEX")
    assert postes["saldo"] == -10.0 and postes["unidade"] == "Und."   # campos originais intactos
    assert postes["base_disponivel"] == 15.0
    assert abs(postes["cobertura_pct"] - (30 + 15) / 40) < 1e-9
    assert postes["suficiente"] is True                               # base 15 >= gap 10

    # linha meta=0 continua no visao_anual, base=0 e cobertura null (sem divisão)
    sem_meta = next(l for l in out["visao_anual"] if l["plano"] == "SEM META - X")
    assert sem_meta["base_disponivel"] == 0.0 and sem_meta["cobertura_pct"] is None

    # regional enriquecida
    guarulhos = next(r for r in out["regionais"] if r["regional"] == "Guarulhos")
    assert guarulhos["base_disponivel"] == 15.0
    assert abs(guarulhos["cobertura_pct"] - 45 / 40) < 1e-9

    # OPEX (base sem linha no visao_anual) -> só em base_por_plano_sem_meta
    sem = {p["plano"]: p for p in out["base_por_plano_sem_meta"]}
    assert sem["PODA DE ARVORES - OPEX"]["base_disponivel"] == 7.0
```

- [ ] **Step 2: Rodar o teste (falha)**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k superset_funde_base -v`
Expected: FAIL — `montar` ainda devolve `por_plano`/`por_regional`.

- [ ] **Step 3: Reescrever `montar`**

Substitua a função `montar` em `backend/carteira_module/dashboard.py` por:
```python
def montar(dash: dict, base_bruta: list[dict], unidade_por_plano: dict,
           nome_area_por_plano: dict) -> dict:
    """Superset do contrato de Relatorios: preserva o payload do
    montar_dashboard e funde a camada base disponivel (DDPM) dentro de
    visao_anual/regionais. Funcao pura, sem I/O."""
    base_por_plano: dict[str, float] = {}
    base_por_reg_plano: dict[tuple, float] = {}
    for linha in base_bruta:
        plano = linha["plano"]
        ddpm = converter_ddpm(linha["quantidade_bruta"], unidade_por_plano.get(plano))
        regional = config.normalizar_regional_dashboard(linha["regional"])
        base_por_plano[plano] = base_por_plano.get(plano, 0.0) + ddpm
        chave = (regional, plano)
        base_por_reg_plano[chave] = base_por_reg_plano.get(chave, 0.0) + ddpm

    # Split preservado da Fase 3: base entra na linha/cobertura só de planos
    # com meta>0; planos sem meta (OPEX) vao para base_por_plano_sem_meta.
    planos_com_meta = {l["plano"] for l in dash.get("visao_anual", [])
                       if float(l["meta"]) > 0}

    visao_anual = []
    for l in dash.get("visao_anual", []):
        meta, planejado = float(l["meta"]), float(l["carteira"])
        base = base_por_plano.get(l["plano"], 0.0) if meta > 0 else 0.0
        visao_anual.append({
            **l,
            "base_disponivel": base,
            "cobertura_pct": _pct(planejado + base, meta),
            "suficiente": base >= max(0.0, meta - planejado),
        })

    regionais = []
    for r in dash.get("regionais", []):
        meta, planejado = float(r["meta"]), float(r["carteira"])
        base = sum(v for (reg, pl), v in base_por_reg_plano.items()
                   if reg == r["regional"] and pl in planos_com_meta)
        regionais.append({
            **r,
            "base_disponivel": base,
            "cobertura_pct": _pct(planejado + base, meta),
        })

    base_sem_meta = []
    for plano, base in base_por_plano.items():
        if plano in planos_com_meta:
            continue
        nome, area = nome_area_por_plano.get(plano, (plano, "Outros"))
        base_sem_meta.append({"plano": plano, "nome_curto": nome,
                              "area": area, "base_disponivel": base})
    base_sem_meta.sort(key=lambda x: -x["base_disponivel"])

    return {
        "ano": dash.get("ano"),
        "mes_referencia": dash.get("mes_referencia"),
        "regional": dash.get("regional"),
        "regionais_disponiveis": dash.get("regionais_disponiveis", []),
        "hero": dash.get("hero", {}),
        "visao_anual": visao_anual,
        "mensalizacao": dash.get("mensalizacao", []),
        "regionais": regionais,
        "financeiro_ano": dash.get("financeiro_ano", {}),
        "base_por_plano_sem_meta": base_sem_meta,
    }
```

> Nota de zero-regressão: para os planos com meta>0, `base_disponivel`/
> `cobertura_pct`/`suficiente` são **numericamente idênticos** ao antigo
> `por_plano`; `base_por_plano_sem_meta` é idêntico. O dashboard da Carteira
> (front, plano 4a-frontend) passará a ler `visao_anual` filtrando `meta>0`.

- [ ] **Step 4: Rodar o teste (passa)**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k superset_funde_base -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/dashboard.py backend/test_carteira_module.py
git commit -m "feat(carteira): dashboard.montar devolve superset de Relatorios (base em visao_anual/regionais)"
```

---

### Task 2: `service.dashboard` → passthrough + `metas_info`

**Files:**
- Modify: `backend/carteira_module/service.py`
- Modify: `backend/test_carteira_module.py` (atualizar `test_rota_dashboard`)

**Interfaces:**
- `service.dashboard(ano, mes, regional) -> dict` — agora o corpo é o superset; adiciona `metas_info` (de `input_module.metas.sincronizar_se_preciso()`) e `versao` (composto, já existe).

- [ ] **Step 1: Atualizar o teste da rota (assert no superset)**

Em `backend/test_carteira_module.py`, ajuste `test_rota_dashboard` para conferir o novo shape (linha em `visao_anual`, não `por_plano`):
```python
    r = TestClient(app).get("/api/carteira/dashboard?mes=1")
    assert r.status_code == 200
    corpo = r.json()
    # superset do contrato de Relatorios
    for chave in ("ano", "mes_referencia", "hero", "visao_anual",
                  "mensalizacao", "regionais", "financeiro_ano",
                  "metas_info", "regionais_disponiveis"):
        assert chave in corpo, chave
    postes = next(l for l in corpo["visao_anual"] if l["plano"] == "POSTES - CAPEX")
    assert postes["meta"] == 40.0
    assert postes["base_disponivel"] == 15.0
    assert "cobertura_pct" in postes and "suficiente" in postes
```

- [ ] **Step 2: Rodar o teste (falha)**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k rota_dashboard -v`
Expected: FAIL — falta `metas_info`/`visao_anual` no corpo.

- [ ] **Step 3: Ajustar `service.dashboard`**

Em `backend/carteira_module/service.py`, dentro de `dashboard`, importe `metas` e preencha `metas_info` (padrão da rota do Input, `input_module/routes.py:77,90`). Após montar `corpo`:
```python
    from input_module import metas
    estado_metas = metas.sincronizar_se_preciso()

    corpo = dash_mod.montar(base_dash, base_bruta, unidade_por_plano,
                            nome_area_por_plano)
    corpo["metas_info"] = {
        "atualizadas_em": estado_metas.get("atualizadas_em"),
        "arquivo_mtime": estado_metas.get("arquivo_mtime"),
        "erro": estado_metas.get("erro"),
    }
    corpo["versao"] = f"{input_db.obter_versao_dataset()}-{db.obter_versao()}"
    return corpo
```
(`base_dash` já traz `ano`/`mes_referencia`/`regional`/`financeiro_ano`/
`visao_anual`/`regionais` do `montar_dashboard`; `montar` os repassa.)

- [ ] **Step 4: Rodar o teste (passa)**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k rota_dashboard -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/service.py backend/test_carteira_module.py
git commit -m "feat(carteira): service.dashboard adiciona metas_info (superset de Relatorios)"
```

---

### Task 3: rota `/dashboard` — ETag/304 por `versao`

**Files:**
- Modify: `backend/carteira_module/routes.py`
- Modify: `backend/test_carteira_module.py` (append)

**Interfaces:**
- `GET /api/carteira/dashboard` passa a emitir `ETag: W/"{versao}"` e responder `304` quando `If-None-Match` casa (padrão de `input_module/routes.py:81-83,95`).

- [ ] **Step 1: Teste do 304**

Append em `backend/test_carteira_module.py` (reusando o setup de `test_rota_dashboard`; extraia o setup para um helper se necessário):
```python
def test_rota_dashboard_etag_304(carteira_tmp, monkeypatch, tmp_path):
    cliente, _ = _montar_app_dashboard(monkeypatch, tmp_path)  # helper: retorna (TestClient, app)
    primeira = cliente.get("/api/carteira/dashboard?mes=1")
    etag = primeira.headers.get("ETag")
    assert etag
    segunda = cliente.get("/api/carteira/dashboard?mes=1",
                          headers={"If-None-Match": etag})
    assert segunda.status_code == 304
```
> Se ainda não houver helper, extraia o corpo de `test_rota_dashboard` para `_montar_app_dashboard(monkeypatch, tmp_path)` e reuse nos dois testes (Rule of Three não exige, mas evita duplicar o setup).

- [ ] **Step 2: Rodar o teste (falha)**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k dashboard_etag -v`
Expected: FAIL — sem ETag/304 (o corpo volta 200).

- [ ] **Step 3: Adicionar ETag/304 à rota**

Em `backend/carteira_module/routes.py`, a rota `/dashboard` passa a receber `Request`/`Response`, computar `versao` e curto-circuitar em 304:
```python
@router.get("/dashboard")
def dashboard(request: Request, response: Response,
              ano: int | None = None, mes: int | None = None,
              regional: str | None = None):
    corpo = service.dashboard(ano, mes, regional)
    etag = f'W/"{corpo["versao"]}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "no-cache"
    return corpo
```
(Importe `Request`, `Response` de `fastapi` no topo se ainda não estiverem.)

- [ ] **Step 4: Rodar o teste (passa)**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "rota_dashboard or dashboard_etag" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/routes.py backend/test_carteira_module.py
git commit -m "feat(carteira): ETag/304 no GET /dashboard (invalida por versao composto)"
```

---

### Task 4: Suíte cheia + Documentação

**Files:**
- Modify: `docs/dev/10-backend-carteira-module.md`

- [ ] **Step 1: Suíte backend inteira verde (sem regressão)**

Run (de `backend/`): `venv/Scripts/python -m pytest -q`
Expected: PASS (hoje 262). Se algum teste do dashboard antigo referenciava `por_plano`/`por_regional`, atualize-o para `visao_anual`/`regionais` — a informação é a mesma.

- [ ] **Step 2: Documentar o novo shape**

Em `docs/dev/10-backend-carteira-module.md`, na seção do dashboard: registre que `/api/carteira/dashboard` agora é **superset do contrato de Relatórios** (`DashboardRelatorios`) — a camada base (`base_disponivel`/`cobertura_pct`/`suficiente`) vive dentro de `visao_anual`/`regionais`; `por_plano`/`por_regional` foram removidos; `base_por_plano_sem_meta` permanece; `metas_info` e ETag/304 adicionados. Aponte que é a fonte única consumida por Carteira **e** Relatórios (Fase 4a).

- [ ] **Step 3: Commit**

```bash
git add docs/dev/10-backend-carteira-module.md
git commit -m "docs(carteira): dashboard vira superset de Relatorios (Fase 4a backend)"
```

---

## Self-Review

**Spec coverage (Fase 4a backend, §4/§7/§8):**
- Superset do `DashboardRelatorios` (visao_anual/regionais/financeiro_ano/metas_info/ano/mes) → Task 1+2. ✓
- Base fundida em `visao_anual`/`regionais`; `por_plano`/`por_regional` removidos → Task 1. ✓
- `base_por_plano_sem_meta` preservado (split meta>0 verbatim) → Task 1. ✓
- `metas_info` via `metas.sincronizar_se_preciso` → Task 2. ✓
- ETag/304 por `versao` composto → Task 3. ✓
- `input_module` intocado (boundary) → nenhuma edição nele. ✓
- Docs → Task 4. ✓

**Zero-regressão:** para planos meta>0 os campos base são idênticos ao antigo `por_plano`; `base_por_plano_sem_meta` idêntico; o dashboard da Carteira (front) migra de `por_plano`→`visao_anual` no plano 4a-frontend lendo os mesmos números.

**Placeholder scan:** sem TBD/TODO.

**Type consistency:** `montar(dash, base_bruta, unidade_por_plano, nome_area_por_plano)->dict` (Task 1) chamado no `service.dashboard` (Task 2) com os dicts de `planos_depara`; corpo com `versao` consumido pela rota (Task 3) para o ETag. `base_por_plano` (repository, Fase 3, inalterado) alimenta `base_bruta`.

**Escopo:** subsistema backend coeso (shape do dashboard), sem UI — este plano. Frontend (repoint + camada base nas telas + migração do dashboard da Carteira) é o plano `2026-07-29-carteira-fase-4a-frontend.md`.
