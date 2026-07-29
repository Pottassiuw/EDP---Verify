# Relatórios v2 — Alertas de carteira e Postergadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao dashboard de Relatórios (a) um bloco de **alertas de carteira** (planos com %Disp anual < 100, clicáveis pro Input) e (b) a quantidade **postergada** (aba `Postergadas` da planilha) como coluna na visão anual + KPI no hero.

**Architecture:** Alertas = componente frontend puro derivado do payload existente (zero backend). Postergadas = estende o sync de metas (`metas.py`) e a engine (`relatorios.py`), com nova tabela `metas_postergadas` gravada atomicamente junto com metas/de-para; o payload do dashboard ganha `hero.postergadas` e `visao_anual[].postergado`.

**Tech Stack:** FastAPI + pandas + sqlite3 (backend, TDD com pytest); React 18 + TypeScript + React Query v5 (frontend).

## Global Constraints

- Spec fonte: `docs/superpowers/specs/2026-07-20-relatorios-v2-alertas-postergadas-design.md` — decisões de produto lá são vinculantes.
- Alertas: escopo = **só planos** (visão anual), `pct_disp !== null && pct_disp < 1`, ordenados por pior primeiro; clique → Input filtrado por Conjunto (reusa `onVerPlano`). Sem backend.
- Postergadas semântica: nota conta no **mês de onde saiu** (from-month). Hero = postergadas do `mes_corrente`; coluna anual = soma do ano por plano. `postergado` é **quantidade** (soma de `Qtd`), consistente com `meta`/`carteira`.
- Fonte Postergadas: mesma planilha/canal das metas (OneDrive local). Sem editor no app.
- Substituição de metas + de-para + postergadas é **atômica** (uma transação; falha no meio não deixa banco misto).
- Nomes exatos das colunas da aba `Postergadas` são verificados contra o arquivo real na implementação (Task 2, Step 6). O `try/except` do sync garante que aba/coluna errada degrada com aviso no estado, sem derrubar o dashboard.
- Farol %Disp: verde ≥ 1.0, âmbar ≥ 0.85, vermelho < 0.85; Meta 0 → pct null → "—". (Reusar `farol`/`FAROL_COR` de `features/relatorios/fmt.ts`.)
- CLAUDE.md: sem `any`; lógica em services/engine, endpoints finos; tokens de design apenas; sem dependência nova; docs/dev atualizados no mesmo commit.
- Testes backend: `cd backend && ./.venv/Scripts/python -m pytest <arquivos> -v`. Frontend: `cd frontend && npm run build`.
- Commits convencionais, um por task, docs incluídos.

## Contrato do payload (campos NOVOS desta entrega)

O payload de `GET /api/input/relatorios/dashboard` (v1) ganha dois campos:

```json
{
  "hero": { "...campos v1...": "...", "postergadas": 11.0 },
  "visao_anual": [
    { "...campos v1...": "...", "postergado": 7.0 }
  ]
}
```

`hero.postergadas` = soma de `Qtd` das postergadas com `Mes == mes_corrente` (respeita filtro de regional). `visao_anual[].postergado` = soma de `Qtd` do ano por plano (respeita filtro de regional). Ambos `float`, default `0.0`.

---

### Task 1: Tabela `metas_postergadas` e helpers no `db.py`

**Files:**
- Modify: `backend/input_module/db.py` (CREATE em `inicializar_banco` ~linha 135; `substituir_metas` ~linha 857; helper novo após `carregar_metas` ~linha 881)
- Test: `backend/test_input_module.py`

**Interfaces:**
- Produces:
  - `db.substituir_metas(df_metas, df_depara, df_postergacoes: pd.DataFrame | None = None) -> None` — agora replace transacional das TRÊS tabelas; `df_postergacoes=None` não toca `metas_postergadas` (retrocompatível com chamadas de 2 args).
  - `db.carregar_postergacoes(ano: int) -> pd.DataFrame` — colunas Ano, Mes, Regional, Plano, Qtd.
  - Tabela `metas_postergadas`. Tasks 2–3 consomem.

- [ ] **Step 1: Escrever o teste que falha** — em `backend/test_input_module.py`, após `test_metas_schema_e_helpers`:

```python
def test_postergadas_schema_e_helpers(banco_temporario):
    from input_module import db
    conn = db.get_db_connection()
    tabelas = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert "metas_postergadas" in tabelas

    metas = pd.DataFrame([
        {"Ano": 2026, "Mes": 1, "Regional": "Guarulhos", "Plano": "POSTES - CAPEX", "Meta": 17.0},
    ])
    depara = pd.DataFrame([
        {"Plano": "POSTES - CAPEX", "Nome_Curto": "POSTE", "Unidade": "Und.",
         "Area": "Construção", "Modular_RS": 6921.0, "Ordem_Exibicao": 1},
    ])
    post = pd.DataFrame([
        {"Ano": 2026, "Mes": 7, "Regional": "Guarulhos", "Plano": "POSTES - CAPEX", "Qtd": 3.0},
        {"Ano": 2026, "Mes": 8, "Regional": "Guarulhos", "Plano": "POSTES - CAPEX", "Qtd": 2.0},
    ])
    db.substituir_metas(metas, depara, post)
    p = db.carregar_postergacoes(2026)
    assert len(p) == 2
    assert db.carregar_postergacoes(2025).empty
    assert p["Qtd"].sum() == 5.0

    # replace: segunda chamada substitui, não acumula
    db.substituir_metas(metas, depara, post.head(1))
    assert len(db.carregar_postergacoes(2026)) == 1

    # df_postergacoes omitido (None) não mexe na tabela de postergadas
    db.substituir_metas(metas, depara)
    assert len(db.carregar_postergacoes(2026)) == 1
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ./.venv/Scripts/python -m pytest test_input_module.py -k postergadas_schema -v`
Expected: FAIL (tabela ausente / `carregar_postergacoes` inexistente / `substituir_metas` só aceita 2 args).

- [ ] **Step 3: Criar a tabela** — em `inicializar_banco()`, logo após o bloco `CREATE TABLE ... metas_sync_estado` (após a linha 135):

```python
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS metas_postergadas (
            Ano INTEGER NOT NULL, Mes INTEGER NOT NULL,
            Regional TEXT NOT NULL, Plano TEXT NOT NULL,
            Qtd REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (Ano, Mes, Regional, Plano)
        )
    ''')
```

- [ ] **Step 4: Estender `substituir_metas` e adicionar `carregar_postergacoes`** — substituir a função `substituir_metas` (linhas 857–873) por:

```python
def substituir_metas(df_metas: pd.DataFrame, df_depara: pd.DataFrame,
                     df_postergacoes: pd.DataFrame | None = None) -> None:
    """Replace transacional das metas, do de-para e (quando fornecidas) das
    postergadas — o sync sempre traz o conjunto completo, numa única transação.

    df_postergacoes=None mantém a tabela de postergadas intocada (chamadas de
    2 args continuam válidas)."""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM metas_plano")
        conn.execute("DELETE FROM planos_depara")
        df_metas[["Ano", "Mes", "Regional", "Plano", "Meta"]].to_sql(
            "metas_plano", conn, if_exists="append", index=False)
        df_depara[["Plano", "Nome_Curto", "Unidade", "Area", "Modular_RS",
                   "Ordem_Exibicao"]].to_sql(
            "planos_depara", conn, if_exists="append", index=False)
        if df_postergacoes is not None:
            conn.execute("DELETE FROM metas_postergadas")
            df_postergacoes[["Ano", "Mes", "Regional", "Plano", "Qtd"]].to_sql(
                "metas_postergadas", conn, if_exists="append", index=False)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

E logo após `carregar_metas` (após a linha 881) adicionar:

```python
def carregar_postergacoes(ano: int) -> pd.DataFrame:
    conn = get_db_connection()
    try:
        return pd.read_sql(
            "SELECT * FROM metas_postergadas WHERE Ano = ?", conn, params=(ano,))
    finally:
        conn.close()
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && ./.venv/Scripts/python -m pytest test_input_module.py -v`
Expected: PASS (todos, inclusive os de metas da v1 — a assinatura nova é retrocompatível).

- [ ] **Step 6: Commit**

```bash
git add backend/input_module/db.py backend/test_input_module.py
git commit -m "feat(input): tabela metas_postergadas e replace transacional"
```

### Task 2: Sync lê a aba `Postergadas`

**Files:**
- Modify: `backend/input_module/metas.py` (`_importar`; helper novo `_postergadas`)
- Test: `backend/test_input_module.py` (helper `_xlsx_controle`; testes novos)
- Docs: `docs/dev/06-backend-input-module.md` (seção Metas)

**Interfaces:**
- Consumes: `db.substituir_metas(..., df_postergacoes)` e `db.carregar_postergacoes` (Task 1).
- Produces: `_importar` passa a popular `metas_postergadas` no mesmo sync. Task 3 lê via `db.carregar_postergacoes`.

- [ ] **Step 1: Estender o fixture e escrever os testes que falham** — no `test_input_module.py`, localizar o helper `_xlsx_controle` e substituí-lo por esta versão (adiciona a aba `Postergadas` e o parâmetro `com_postergadas`):

```python
def _xlsx_controle(caminho, meta_jan=17.0, com_postergadas=True):
    """Planilha sintética mínima com abas base, dexpara e (opcional) Postergadas."""
    base = pd.DataFrame([
        {"Regionais": "Guarulhos", "Mês": pd.Timestamp(2026, 1, 1),
         "Plano": "POSTES - CAPEX", "Meta": meta_jan, "Conjunto": "POSTE"},
        {"Regionais": "Guarulhos", "Mês": pd.Timestamp(2026, 2, 1),
         "Plano": "POSTE DEMANDA - CAPEX", "Meta": 5.0, "Conjunto": "POSTE"},
        {"Regionais": "Poa/Suzano", "Mês": pd.Timestamp(2026, 1, 1),
         "Plano": "RAMAL", "Meta": 100.0, "Conjunto": "RAMAL"},
    ])
    dexpara = pd.DataFrame([
        {"Projeto": "POSTES - CAPEX", "Unidade": "Und.", "Área": "Projeto", "Modular R$": 6921.0},
        {"Projeto": "POSTE DEMANDA - CAPEX", "Unidade": "Und.", "Área": "Projeto", "Modular R$": 6921.0},
        {"Projeto": "RAMAL", "Unidade": "Ponto", "Área": "CSD", "Modular R$": 694.5},
    ])
    postergadas = pd.DataFrame([
        {"Regionais": "Guarulhos", "Mês De": pd.Timestamp(2026, 7, 1),
         "Plano": "POSTES - CAPEX", "Qtd": 3.0},
        {"Regionais": "Guarulhos", "Mês De": pd.Timestamp(2026, 8, 1),
         "Plano": "POSTES - CAPEX", "Qtd": 2.0},
    ])
    w = pd.ExcelWriter(caminho, engine="openpyxl")
    try:
        base.to_excel(w, sheet_name="base", index=False)
        dexpara.to_excel(w, sheet_name="dexpara", index=False)
        if com_postergadas:
            postergadas.to_excel(w, sheet_name="Postergadas", index=False)
    finally:
        w.close()
        del w
        gc.collect()
```

E adicionar dois testes após `test_metas_sincronizar_falha_preserva`:

```python
def test_metas_sincronizar_postergadas(banco_temporario, monkeypatch, tmp_path):
    from input_module import db, metas
    arquivo = tmp_path / "Controle.xlsx"
    _xlsx_controle(arquivo)
    monkeypatch.setenv("CONTROLE_RECOMPOSICAO_PATH", str(arquivo))
    metas.sincronizar_se_preciso()
    p = db.carregar_postergacoes(2026)
    assert p["Qtd"].sum() == 5.0
    jul = p[(p["Mes"] == 7) & (p["Plano"] == "POSTES - CAPEX")]
    assert jul.iloc[0]["Qtd"] == 3.0


def test_metas_sincronizar_sem_aba_postergadas_preserva(banco_temporario, monkeypatch, tmp_path):
    from input_module import db, metas
    arquivo = tmp_path / "Controle.xlsx"
    _xlsx_controle(arquivo)
    monkeypatch.setenv("CONTROLE_RECOMPOSICAO_PATH", str(arquivo))
    metas.sincronizar_se_preciso()
    assert len(db.carregar_postergacoes(2026)) == 2

    import time as _t; _t.sleep(0.05)
    _xlsx_controle(arquivo, com_postergadas=False)  # aba Postergadas some
    estado = metas.sincronizar_se_preciso(forcar=True)
    assert estado["erro"] is not None
    assert len(db.carregar_postergacoes(2026)) == 2   # última sync preservada
    assert len(db.carregar_metas(2026)) == 3          # metas também intactas
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ./.venv/Scripts/python -m pytest test_input_module.py -k "sincronizar_postergadas or sem_aba_postergadas" -v`
Expected: FAIL (a aba `Postergadas` é lida? ainda não — `carregar_postergacoes` vem vazio).

- [ ] **Step 3: Adicionar o parser `_postergadas`** — em `metas.py`, após a função `_nome_curto` (antes de `_importar`):

```python
def _postergadas(df: pd.DataFrame) -> pd.DataFrame:
    """Aba Postergadas -> agregado (Ano, Mes-de-onde-saiu, Regional, Plano, Qtd).

    Grão: uma linha por nota postergada, atribuída ao mês DE onde saiu (from-month).
    Nomes de coluna ('Regionais', 'Mês De', 'Plano', 'Qtd') espelham o fixture
    sintético; conferir contra o arquivo real na verificação (Step 6)."""
    df = df.dropna(subset=["Regionais", "Mês De", "Plano"])
    mes = pd.to_datetime(df["Mês De"], errors="coerce")
    out = pd.DataFrame({
        "Ano": mes.dt.year, "Mes": mes.dt.month,
        "Regional": df["Regionais"].astype(str).str.strip(),
        "Plano": df["Plano"].astype(str).str.strip(),
        "Qtd": pd.to_numeric(df["Qtd"], errors="coerce").fillna(0.0),
    }).dropna(subset=["Ano", "Mes"])
    return out.groupby(["Ano", "Mes", "Regional", "Plano"], as_index=False)["Qtd"].sum()
```

- [ ] **Step 4: Ler a aba e gravar junto** — em `_importar`, no bloco `try:` de leitura, adicionar a leitura da aba `Postergadas`; e trocar a chamada final de `substituir_metas`. Substituir o corpo atual da função por:

```python
def _importar(caminho: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        copia = os.path.join(tmp, "controle.xlsx")
        shutil.copy2(caminho, copia)
        xl = pd.ExcelFile(copia)
        try:
            base = pd.read_excel(xl, sheet_name="base")
            dexpara = pd.read_excel(xl, sheet_name="dexpara")
            postergadas = pd.read_excel(xl, sheet_name="Postergadas")
        finally:
            xl.close()

    base = base.dropna(subset=["Regionais", "Mês", "Plano"])
    mes = pd.to_datetime(base["Mês"], errors="coerce")
    df_metas = pd.DataFrame({
        "Ano": mes.dt.year, "Mes": mes.dt.month,
        "Regional": base["Regionais"].astype(str).str.strip(),
        "Plano": base["Plano"].astype(str).str.strip(),
        "Meta": pd.to_numeric(base["Meta"], errors="coerce").fillna(0.0),
    }).dropna(subset=["Ano", "Mes"])
    df_metas = df_metas.groupby(["Ano", "Mes", "Regional", "Plano"], as_index=False)["Meta"].sum()

    curtos = _nome_curto(base)
    dexpara = dexpara.dropna(subset=["Projeto"])
    df_depara = pd.DataFrame({
        "Plano": dexpara["Projeto"].astype(str).str.strip(),
        "Nome_Curto": [curtos.get(str(p).strip(), str(p).strip())
                       for p in dexpara["Projeto"]],
        "Unidade": dexpara["Unidade"].astype(str).str.strip(),
        "Area": dexpara["Área"].astype(str).str.strip().map(
            {"Projeto": "Construção", "CSD": "CSD"}).fillna("Outros"),
        "Modular_RS": pd.to_numeric(dexpara["Modular R$"], errors="coerce").fillna(0.0),
        "Ordem_Exibicao": range(1, len(dexpara) + 1),
    }).drop_duplicates(subset=["Plano"])

    df_postergacoes = _postergadas(postergadas)

    db.substituir_metas(df_metas, df_depara, df_postergacoes)
    db.salvar_log_arquivo(os.path.basename(caminho), _USUARIO_SYNC,
                          datetime.datetime.now(), "Sync Metas")
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && ./.venv/Scripts/python -m pytest test_input_module.py -v`
Expected: PASS (todos).

- [ ] **Step 6: Verificar nomes reais das colunas** — abrir o arquivo real (`config.caminho_controle_recomposicao()`, aba `Postergadas`) OU pedir ao usuário o cabeçalho real. Se os nomes diferirem de `Regionais`/`Mês De`/`Plano`/`Qtd`, ajustar as constantes em `_postergadas` (e o fixture, se quiser manter paridade). Se o arquivo não estiver acessível no ambiente, registrar isso no PR e deixar os nomes sintéticos (o `try/except` do sync degrada com aviso, sem quebrar). Este step não tem código fixo — é verificação de integração.

- [ ] **Step 7: Docs + commit** — em `06-backend-input-module.md`, na seção "Metas — sync do Controle Plano de Recomposição", acrescentar um parágrafo: a aba `Postergadas` é lida no mesmo sync (mesma cópia-temp, mesma transação de replace via `substituir_metas(..., df_postergacoes)`), agregada por from-month em `metas_postergadas`; aba ausente/renomeada cai no `try/except` e preserva a última sync.

```bash
git add backend/input_module/metas.py backend/test_input_module.py docs/dev/06-backend-input-module.md
git commit -m "feat(input): sync le a aba Postergadas do Controle Plano de Recomposicao"
```

### Task 3: Engine emite `postergado`/`postergadas` + rota

**Files:**
- Modify: `backend/input_module/relatorios.py` (`montar_dashboard`)
- Modify: `backend/input_module/routes.py` (chamada de `montar_dashboard`)
- Test: `backend/test_input_module.py` (`_fx_relatorios`; assertions novas)
- Docs: `docs/dev/06-backend-input-module.md` (contrato do payload)

**Interfaces:**
- Consumes: `db.carregar_postergacoes` (Task 1).
- Produces: `montar_dashboard(df_notas, df_ramal, df_metas, df_depara, df_postergacoes, ano, mes_corrente, regional)` — agora com `df_postergacoes` como 5º posicional; payload ganha `hero.postergadas` e `visao_anual[].postergado`. Task 4 (frontend) consome.

- [ ] **Step 1: Estender o fixture e os testes** — no `test_input_module.py`, no helper `_fx_relatorios`, adicionar `df_postergacoes` e retorná-lo (5-tupla). Localizar o `return df_notas, df_ramal, df_metas, df_depara` e substituir o final da função por:

```python
    df_postergacoes = pd.DataFrame([
        {"Ano": 2026, "Mes": 7, "Regional": "Guarulhos", "Plano": "POSTES - CAPEX", "Qtd": 2.0},
        {"Ano": 2026, "Mes": 3, "Regional": "Guarulhos", "Plano": "POSTES - CAPEX", "Qtd": 5.0},
        {"Ano": 2026, "Mes": 7, "Regional": "Poa/Suzano", "Plano": "RAMAL", "Qtd": 9.0},
    ])
    return df_notas, df_ramal, df_metas, df_depara, df_postergacoes
```

Em `test_dashboard_agregacao_basica`, após a linha que monta `anual = {...}`, adicionar:

```python
    assert d["hero"]["postergadas"] == 11.0            # jul: POSTES 2 + RAMAL 9
    assert anual["POSTES - CAPEX"]["postergado"] == 7.0  # ano: 2 + 5
    assert anual["RAMAL"]["postergado"] == 9.0
```

Em `test_dashboard_filtro_regional`, após a asserção de `d["hero"]["meta"] == 4.0`, adicionar:

```python
    assert d["hero"]["postergadas"] == 2.0             # só Guarulhos, jul
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ./.venv/Scripts/python -m pytest test_input_module.py -k dashboard -v`
Expected: FAIL (`montar_dashboard` só aceita 4 dfs / KeyError em `postergadas`/`postergado`).

- [ ] **Step 3: Estender `montar_dashboard`** — em `relatorios.py`:

(a) Trocar a assinatura (linhas 97–99) por:

```python
def montar_dashboard(df_notas: pd.DataFrame, df_ramal: pd.DataFrame,
                     df_metas: pd.DataFrame, df_depara: pd.DataFrame,
                     df_postergacoes: pd.DataFrame,
                     ano: int, mes_corrente: int, regional: str | None) -> dict:
```

(b) Logo após a linha `metas_f = metas if regional is None else metas[metas["Regional"] == regional]`, adicionar:

```python
    post_f = (df_postergacoes if regional is None
              else df_postergacoes[df_postergacoes["Regional"] == regional])
    hero_postergadas = (float(post_f[post_f["Mes"] == mes_corrente]["Qtd"].sum())
                        if not post_f.empty else 0.0)
    post_por_plano = (post_f.groupby("Plano")["Qtd"].sum().to_dict()
                      if not post_f.empty else {})
```

(c) No dict `hero`, acrescentar a chave `postergadas` (adicionar à última linha do dict):

```python
        "meta_rs": rs(meta_mes_por_plano), "carteira_rs": rs(cart_mes_por_plano),
        "postergadas": hero_postergadas,
```

(d) Na visão anual, incluir os planos que só têm postergadas e emitir `postergado`. Trocar a linha `planos = set(cart_por_plano) | set(meta_por_plano)` por:

```python
    planos = set(cart_por_plano) | set(meta_por_plano) | set(post_por_plano)
```

E no `linhas.append({...})`, acrescentar `postergado`:

```python
            "pct_disp": _pct(cart, meta), "gap_rs": (cart - meta) * modular(plano),
            "postergado": post_por_plano.get(plano, 0.0),
            "_ordem": ordem,
```

- [ ] **Step 4: Ligar a rota** — em `routes.py`, na função `relatorios_dashboard`, trocar a chamada de `montar_dashboard` por:

```python
    corpo = relatorios.montar_dashboard(
        engine.get_dataset(), db.carregar_dados_ramal(),
        db.carregar_metas(agora.year), db.carregar_planos_depara(),
        db.carregar_postergacoes(agora.year),
        ano=agora.year, mes_corrente=agora.month, regional=regional)
```

E no teste de endpoint `test_api_relatorios_dashboard`, após a asserção do conjunto de chaves do corpo, adicionar:

```python
    assert "postergadas" in corpo["hero"]
    assert all("postergado" in l for l in corpo["visao_anual"])
```

- [ ] **Step 5: Rodar TODOS os testes**

Run: `cd backend && ./.venv/Scripts/python -m pytest test_input_module.py test_integracao_module.py -v`
Expected: PASS.

- [ ] **Step 6: Docs + commit** — em `06-backend-input-module.md`, na tabela/descrição do endpoint `GET /relatorios/dashboard`, mencionar os campos novos `hero.postergadas` e `visao_anual[].postergado`.

```bash
git add backend/input_module/relatorios.py backend/input_module/routes.py backend/test_input_module.py docs/dev/06-backend-input-module.md
git commit -m "feat(input): dashboard emite postergado por plano e postergadas do mes"
```

### Task 4: Frontend — coluna Postergado e KPI no hero

**Files:**
- Modify: `frontend/src/features/relatorios/types.ts`
- Modify: `frontend/src/features/relatorios/hero-mes.tsx`
- Modify: `frontend/src/features/relatorios/tabela-anual.tsx`

**Interfaces:**
- Consumes: campos novos do payload (Task 3).
- Produces: exibição de `postergado`/`postergadas`. Sem query nova.

- [ ] **Step 1: Tipos** — em `types.ts`, adicionar `postergadas` a `HeroMes` e `postergado` a `LinhaAnual`:

Em `HeroMes`, após `carteira_rs: number;`:
```ts
  postergadas: number;
```
Em `LinhaAnual`, após `pct_disp: number | null;` (antes de `gap_rs`):
```ts
  postergado: number;
```

- [ ] **Step 2: KPI no hero** — em `hero-mes.tsx`, na fileira de `StatTile` do hero, adicionar após o tile de "Executado":

```tsx
        <StatTile label="Postergadas" value={fmtQtd(hero.postergadas)} />
```

- [ ] **Step 3: Coluna na tabela** — em `tabela-anual.tsx`:

(a) No `<TableHeader>`, adicionar uma coluna "Postergado" após a de `%Disp` (antes de "R$ gap"):
```tsx
          <TableHead className="text-right">Postergado</TableHead>
```

(b) Aumentar o `colSpan` da linha de cabeçalho de grupo de `7` para `8`:
```tsx
                <TableCell colSpan={8} className="edp-eyebrow py-[6px]">{area}</TableCell>
```

(c) Na linha de dados, adicionar a célula após a de `%Disp` (`<BadgeDisp .../>`), antes da de R$ gap:
```tsx
                  <TableCell className="text-right edp-mono">{fmtQtd(l.postergado)}</TableCell>
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/relatorios/types.ts frontend/src/features/relatorios/hero-mes.tsx frontend/src/features/relatorios/tabela-anual.tsx
git commit -m "feat(relatorios): coluna Postergado na visao anual e KPI no hero"
```

### Task 5: Frontend — bloco Alertas de carteira

**Files:**
- Create: `frontend/src/features/relatorios/alertas-carteira.tsx`
- Modify: `frontend/src/features/relatorios/relatorios-section.tsx`

**Interfaces:**
- Consumes: `LinhaAnual[]` do payload existente; `farol`/`FAROL_COR`/`fmtPct`/`fmtQtd` de `fmt.ts`; `onVerPlano` da section.
- Produces: `AlertasCarteira({ linhas, aoClicarPlano })` — retorna `null` quando não há plano abaixo de 100%.

- [ ] **Step 1: Criar `alertas-carteira.tsx`**

```tsx
import React from 'react';

import { FAROL_COR, farol, fmtPct, fmtQtd } from './fmt';
import type { LinhaAnual } from './types';

export function AlertasCarteira({ linhas, aoClicarPlano }: {
  linhas: LinhaAnual[];
  aoClicarPlano: (plano: string) => void;
}): React.JSX.Element | null {
  const abaixo = linhas
    .filter((l) => l.pct_disp !== null && l.pct_disp < 1)
    .sort((a, b) => (a.pct_disp ?? 0) - (b.pct_disp ?? 0));

  if (abaixo.length === 0) return null;

  return (
    <div className="flex flex-col gap-[8px]">
      <span className="edp-eyebrow text-amber">⚠ Carteira abaixo da meta (ação)</span>
      <div className="flex flex-col gap-[4px]">
        {abaixo.map((l) => {
          const f = farol(l.pct_disp);
          return (
            <button
              key={l.plano}
              type="button"
              onClick={() => aoClicarPlano(l.plano)}
              className="flex items-center gap-[10px] text-left py-[6px] px-[10px] rounded-[6px] hover:bg-[var(--surface-2)]"
              aria-label={`Ver notas do plano ${l.plano} (carteira abaixo da meta)`}
            >
              <span className="flex-1 text-[13px]" title={l.plano}>{l.nome_curto}</span>
              <span className="edp-mono text-[13px] font-semibold"
                    style={{ color: f ? FAROL_COR[f] : 'var(--text-mute)' }}>
                {fmtPct(l.pct_disp)}
              </span>
              <span className="edp-mono text-[12px] text-text-mute">
                faltam ~{fmtQtd(-l.saldo)} {l.unidade}
              </span>
              <span aria-hidden="true" className="text-text-mute">→</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Montar na section** — em `relatorios-section.tsx`:

(a) Adicionar o import junto aos demais imports da feature:
```tsx
import { AlertasCarteira } from './alertas-carteira';
```

(b) Dentro do bloco `{data && ( <> ... </> )}`, logo após o `<HeroMes .../>` e antes do `<TabelaAnual .../>`, inserir:
```tsx
          <AlertasCarteira
            linhas={data.visao_anual}
            aoClicarPlano={(plano) => onVerPlano(plano, regional)}
          />
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/relatorios/alertas-carteira.tsx frontend/src/features/relatorios/relatorios-section.tsx
git commit -m "feat(relatorios): bloco de alertas de carteira (%Disp < 100) com handoff pro Input"
```

### Task 6: Verificação de ponta a ponta

**Files:** nenhum — validação.

- [ ] **Step 1: Suíte completa**

Run: `cd backend && ./.venv/Scripts/python -m pytest test_input_module.py test_integracao_module.py test_coffee_module.py -v`
Expected: PASS.
Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 2: Exercitar o fluxo real** (skill `verify`; backend `uvicorn main:app`): (1) home abre; hero mostra "Postergadas"; (2) a tabela anual tem a coluna "Postergado"; (3) se houver plano com carteira < meta, o bloco de alertas aparece sob o hero e some quando não há nenhum; (4) clicar num alerta → Input filtrado por Conjunto; (5) trocar Regional → alertas e postergadas recomputam; (6) `GET /api/input/relatorios/dashboard` traz `hero.postergadas` e `visao_anual[].postergado`.

- [ ] **Step 3: Checklist CLAUDE.md** (sem `any`, sem import morto, sem console.log, docs atualizados) e commit final de ajustes, se houver.
