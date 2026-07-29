# Relatórios (Home) — Dashboard Plano de Recomposição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova seção Relatórios (home do app) com dashboard vivo do Plano de Recomposição: metas auto-sincronizadas do xlsx OneDrive, carteira/executado computados do banco, hero do mês, visão anual Construção/CSD, mensalização, saldo por regional e R$.

**Architecture:** Metas e de-para de planos espelhados do Excel para SQLite via sync automático por mtime (`input_module/metas.py`); agregação server-side pura em `input_module/relatorios.py`; endpoint `GET /api/input/relatorios/dashboard` com ETag pela versão de dataset; contador COFFEE-fora-do-plano no `integracao_module`; frontend `features/relatorios/` consumindo payload pronto, com navegação por handoff de filtros pro Input.

**Tech Stack:** FastAPI + pandas + sqlite3 (backend, TDD com pytest); React 18 + TypeScript + React Query v5 + SVG próprio para gráfico (sem lib nova).

## Global Constraints

- Spec fonte: `docs/superpowers/specs/2026-07-17-relatorios-home-design.md` — decisões de produto lá são vinculantes.
- Regra Executado: `Status_Nota` começa com "99" OU `Export_status == "ENCE EXEC"`, atribuído ao mês de `Encerram.por data`. Nada além disso na v1 (suspeitas = futuro).
- Fonte metas: arquivo em `config.CAMINHO_CONTROLE_RECOMPOSICAO` (default `C:\Users\e713611\EDP\O365_Planejamento_Manutencao_EDP_Brasil - Documentos\PLANO RECOMPOSIÇÃO\SP\2026\Controle Plano de Recomposição 2026.xlsx`, env `CONTROLE_RECOMPOSICAO_PATH`). Import SEMPRE copia para temp antes de ler (lock Excel/OneDrive é real). Falha nunca quebra o dashboard: mantém última sync + erro no estado.
- Sem editor de metas no app — Excel é a fonte da verdade; app espelha.
- Área da planilha: `"Projeto"` exibe como `"Construção"`; `"CSD"` fica `"CSD"`. Conjunto de nota sem de-para → balde `"Outros"` (visível).
- Eixo regional: coluna `Regional_CSD` do dataset (fallback `Regional` quando `"-"`); 6 valores: Guaratinguetá, Guarulhos, Litoral Norte, Mogi das Cruzes, Poa/Suzano, São José dos Campos. RAMAL (de `notas_ramal`, sem Regional_CSD): derivar por prefixo do `Local_Instalacao` via `DE_PARA_REGIONAL` com override `{155,160,165,170} → "Poa/Suzano"`.
- Nome curto do plano: par `Plano→Conjunto` da aba `base`; em colisão (dois planos com o mesmo curto, ex. POSTE), o plano NÃO-idêntico ao curto usa o nome longo sem o sufixo `" - CAPEX"` (→ "POSTE DEMANDA").
- Farol %Disp: verde ≥ 1.0, âmbar ≥ 0.85, vermelho < 0.85; Meta 0 → pct `null` → exibe "—".
- CLAUDE.md: sem `any`; lógica em services/engine, endpoints finos; tokens de design apenas; docs/dev atualizados NO MESMO COMMIT; sem dependência nova (gráfico = SVG próprio).
- Testes backend: `cd backend && ./venv/Scripts/python -m pytest <arquivos> -v`. Frontend: `cd frontend && npm run build`.
- Tasks de UI (7–12): invocar skill `frontend-design` antes do JSX; task do gráfico (9) invoca também a skill `dataviz`.
- Commits convencionais, um por task, docs incluídos.

---

## Contrato do payload do dashboard (referência para Tasks 3, 4, 6–10)

```json
{
  "ano": 2026, "mes_corrente": 7,
  "regional": null,
  "regionais_disponiveis": ["Guaratinguetá","Guarulhos","Litoral Norte","Mogi das Cruzes","Poa/Suzano","São José dos Campos"],
  "hero": {"mes_nome":"julho","meta":12.5,"carteira":13.1,"executado":4.2,"pct_disp":1.05,
           "meta_rs":250000.0,"carteira_rs":262000.0},
  "visao_anual": [{"plano":"POSTES - CAPEX","nome_curto":"POSTE","area":"Construção","unidade":"Und.",
                   "meta":1759.0,"carteira":2402.0,"saldo":643.0,"pct_disp":1.365,"gap_rs":4450203.0}],
  "mensalizacao": [{"mes":1,"meta":9.0,"carteira":11.0,"executado":7.0}],
  "regionais": [{"regional":"Guarulhos","meta":100.0,"carteira":90.0,"saldo":-10.0,"pct_disp":0.9}],
  "financeiro_ano": {"meta_rs":1.0,"carteira_rs":2.0,"gap_rs":1.0},
  "metas_info": {"atualizadas_em":"2026-07-17T08:00:00","arquivo_mtime":1752684000.0,"erro":null}
}
```

`pct_disp` é `null` quando meta = 0. `visao_anual` ordenada por `area` (Construção, CSD, Outros) e `ordem_exibicao`. `mensalizacao` sempre 12 itens. `regionais` sempre os 6 (mesmo zerados); quando `regional` está filtrado, `regionais` continua vindo completo (o bloco não é afetado pelo filtro — mostra o comparativo).

---

### Task 1: Schema e helpers de metas no `input_module/db.py`

**Files:**
- Modify: `backend/input_module/db.py` (em `inicializar_banco`, ~linha 50; helpers no fim)
- Test: `backend/test_input_module.py`

**Interfaces:**
- Produces: tabelas `metas_plano`, `planos_depara`, `metas_sync_estado`; helpers `db.substituir_metas(df_metas, df_depara) -> None` (replace transacional das duas tabelas), `db.carregar_metas(ano: int) -> pd.DataFrame` (colunas Ano, Mes, Regional, Plano, Meta), `db.carregar_planos_depara() -> pd.DataFrame` (Plano, Nome_Curto, Unidade, Area, Modular_RS, Ordem_Exibicao), `db.obter_estado_metas() -> dict | None` (`{arquivo_mtime: float, atualizadas_em: str, erro: str | None}`), `db.gravar_estado_metas(arquivo_mtime: float, erro: str | None) -> None` (atualizadas_em = agora). Tasks 2–4 consomem.

- [ ] **Step 1: Testes que falham** — adicionar em `backend/test_input_module.py`:

```python
def test_metas_schema_e_helpers(banco_temporario):
    from input_module import db
    conn = db.get_db_connection()
    tabelas = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert {"metas_plano", "planos_depara", "metas_sync_estado"} <= tabelas

    metas = pd.DataFrame([
        {"Ano": 2026, "Mes": 1, "Regional": "Guarulhos", "Plano": "POSTES - CAPEX", "Meta": 17.0},
        {"Ano": 2026, "Mes": 2, "Regional": "Guarulhos", "Plano": "POSTES - CAPEX", "Meta": 19.0},
    ])
    depara = pd.DataFrame([
        {"Plano": "POSTES - CAPEX", "Nome_Curto": "POSTE", "Unidade": "Und.",
         "Area": "Construção", "Modular_RS": 6921.0, "Ordem_Exibicao": 1},
    ])
    db.substituir_metas(metas, depara)
    assert len(db.carregar_metas(2026)) == 2
    assert db.carregar_metas(2025).empty
    dp = db.carregar_planos_depara()
    assert dp.iloc[0]["Nome_Curto"] == "POSTE"

    # replace: segunda chamada substitui, não acumula
    db.substituir_metas(metas.head(1), depara)
    assert len(db.carregar_metas(2026)) == 1

    # estado de sync sobrevive e guarda erro
    assert db.obter_estado_metas() is None
    db.gravar_estado_metas(arquivo_mtime=1234.5, erro=None)
    estado = db.obter_estado_metas()
    assert estado["arquivo_mtime"] == 1234.5 and estado["erro"] is None
    db.gravar_estado_metas(arquivo_mtime=1234.5, erro="lock")
    assert db.obter_estado_metas()["erro"] == "lock"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_input_module.py -k metas_schema -v`
Expected: FAIL (tabelas ausentes / AttributeError).

- [ ] **Step 3: Implementar** — em `inicializar_banco()` (junto dos outros CREATE):

```python
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS metas_plano (
            Ano INTEGER NOT NULL, Mes INTEGER NOT NULL,
            Regional TEXT NOT NULL, Plano TEXT NOT NULL,
            Meta REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (Ano, Mes, Regional, Plano)
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS planos_depara (
            Plano TEXT PRIMARY KEY, Nome_Curto TEXT NOT NULL,
            Unidade TEXT NOT NULL, Area TEXT NOT NULL,
            Modular_RS REAL NOT NULL DEFAULT 0,
            Ordem_Exibicao INTEGER NOT NULL DEFAULT 999
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS metas_sync_estado (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            arquivo_mtime REAL, atualizadas_em TEXT, erro TEXT
        )
    ''')
```

E no fim de `db.py`:

```python
# ==============================================================================
# METAS DO PLANO DE RECOMPOSIÇÃO (espelho do Controle...xlsx — ver metas.py)
# ==============================================================================
def substituir_metas(df_metas: pd.DataFrame, df_depara: pd.DataFrame) -> None:
    """Replace transacional das metas e do de-para (sync sempre traz o conjunto completo)."""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM metas_plano")
        conn.execute("DELETE FROM planos_depara")
        df_metas[["Ano", "Mes", "Regional", "Plano", "Meta"]].to_sql(
            "metas_plano", conn, if_exists="append", index=False)
        df_depara[["Plano", "Nome_Curto", "Unidade", "Area", "Modular_RS",
                   "Ordem_Exibicao"]].to_sql(
            "planos_depara", conn, if_exists="append", index=False)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def carregar_metas(ano: int) -> pd.DataFrame:
    conn = get_db_connection()
    try:
        return pd.read_sql("SELECT * FROM metas_plano WHERE Ano = ?", conn, params=(ano,))
    finally:
        conn.close()


def carregar_planos_depara() -> pd.DataFrame:
    conn = get_db_connection()
    try:
        return pd.read_sql(
            "SELECT * FROM planos_depara ORDER BY Ordem_Exibicao, Plano", conn)
    finally:
        conn.close()


def obter_estado_metas() -> dict | None:
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT arquivo_mtime, atualizadas_em, erro FROM metas_sync_estado WHERE id = 1"
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {"arquivo_mtime": row[0], "atualizadas_em": row[1], "erro": row[2]}


def gravar_estado_metas(arquivo_mtime: float, erro: str | None) -> None:
    agora = datetime.datetime.now().isoformat()
    conn = get_db_connection()
    try:
        conn.execute(
            """INSERT INTO metas_sync_estado (id, arquivo_mtime, atualizadas_em, erro)
               VALUES (1, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 arquivo_mtime=excluded.arquivo_mtime,
                 atualizadas_em=excluded.atualizadas_em,
                 erro=excluded.erro""",
            (arquivo_mtime, agora, erro))
        conn.commit()
    finally:
        conn.close()
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_input_module.py -v` → PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/db.py backend/test_input_module.py
git commit -m "feat(input): tabelas e helpers de metas do Plano de Recomposicao"
```

### Task 2: `input_module/metas.py` — sync automático do xlsx

**Files:**
- Create: `backend/input_module/metas.py`
- Modify: `backend/input_module/config.py` (após `caminho_sap_robot`)
- Test: `backend/test_input_module.py`
- Docs: `docs/dev/06-backend-input-module.md` (seção nova "Metas — sync do Controle Plano de Recomposição")

**Interfaces:**
- Consumes: helpers da Task 1.
- Produces: `config.caminho_controle_recomposicao() -> Path`; `metas.sincronizar_se_preciso(forcar: bool = False) -> dict` (retorna o estado no formato de `obter_estado_metas()` + chave `"sincronizou": bool`). Tasks 4 e 12 consomem.

- [ ] **Step 1: Testes que falham** — em `test_input_module.py`:

```python
def _xlsx_controle(caminho, meta_jan=17.0):
    """Planilha sintética mínima com abas base e dexpara."""
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
    with pd.ExcelWriter(caminho, engine="openpyxl") as w:
        base.to_excel(w, sheet_name="base", index=False)
        dexpara.to_excel(w, sheet_name="dexpara", index=False)


def test_metas_sincronizar(banco_temporario, monkeypatch, tmp_path):
    from input_module import config, db, metas
    arquivo = tmp_path / "Controle.xlsx"
    _xlsx_controle(arquivo)
    monkeypatch.setenv("CONTROLE_RECOMPOSICAO_PATH", str(arquivo))

    estado = metas.sincronizar_se_preciso()
    assert estado["sincronizou"] is True and estado["erro"] is None
    m = db.carregar_metas(2026)
    assert len(m) == 3
    assert m[(m["Regional"] == "Poa/Suzano") & (m["Plano"] == "RAMAL")].iloc[0]["Meta"] == 100.0
    dp = db.carregar_planos_depara().set_index("Plano")
    assert dp.loc["POSTES - CAPEX", "Nome_Curto"] == "POSTE"
    # colisão de nome curto: POSTE DEMANDA - CAPEX não pode virar "POSTE" também
    assert dp.loc["POSTE DEMANDA - CAPEX", "Nome_Curto"] == "POSTE DEMANDA"
    assert dp.loc["POSTES - CAPEX", "Area"] == "Construção"   # "Projeto" -> exibição
    assert dp.loc["RAMAL", "Area"] == "CSD"

    # mtime igual: no-op
    assert metas.sincronizar_se_preciso()["sincronizou"] is False
    # arquivo mudou: reimporta
    import time as _t; _t.sleep(0.05)
    _xlsx_controle(arquivo, meta_jan=99.0)
    estado = metas.sincronizar_se_preciso()
    assert estado["sincronizou"] is True
    m = db.carregar_metas(2026)
    assert m[(m["Plano"] == "POSTES - CAPEX") & (m["Mes"] == 1)].iloc[0]["Meta"] == 99.0
    # sync registra em log_arquivos (bumpa a versão do dataset)
    logs = db.carregar_log_arquivos()
    assert (logs["Usuario"] == "metas-sync").any()


def test_metas_sincronizar_falha_preserva(banco_temporario, monkeypatch, tmp_path):
    from input_module import db, metas
    arquivo = tmp_path / "Controle.xlsx"
    _xlsx_controle(arquivo)
    monkeypatch.setenv("CONTROLE_RECOMPOSICAO_PATH", str(arquivo))
    metas.sincronizar_se_preciso()
    assert len(db.carregar_metas(2026)) == 3

    arquivo.unlink()  # arquivo some (rede/OneDrive fora)
    estado = metas.sincronizar_se_preciso(forcar=True)
    assert estado["erro"] is not None
    assert len(db.carregar_metas(2026)) == 3  # última sync preservada
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_input_module.py -k metas_sincronizar -v` → FAIL.

- [ ] **Step 3: Implementar** — `config.py` (após `caminho_sap_robot`):

```python
def caminho_controle_recomposicao() -> Path:
    """Planilha Controle Plano de Recomposição (OneDrive local sincronizado).

    Default aponta para o perfil do usuário que hospeda o servidor hoje;
    outra máquina sobrescreve via env CONTROLE_RECOMPOSICAO_PATH.
    """
    return Path(os.environ.get(
        "CONTROLE_RECOMPOSICAO_PATH",
        r"C:\Users\e713611\EDP\O365_Planejamento_Manutencao_EDP_Brasil - Documentos"
        r"\PLANO RECOMPOSIÇÃO\SP\2026\Controle Plano de Recomposição 2026.xlsx",
    ))
```

`backend/input_module/metas.py`:

```python
"""Sync das metas do Plano de Recomposição a partir do Controle...xlsx.

O Excel (OneDrive sincronizado) segue sendo a fonte da verdade das metas —
o app apenas espelha. Import sempre copia para temp antes de ler (o arquivo
vive lockado pelo Excel/OneDrive). Falha nunca derruba nada: mantém a última
importação boa e registra o erro no estado.
"""
import datetime
import os
import shutil
import tempfile

import pandas as pd

from input_module import config, db

_USUARIO_SYNC = "metas-sync"


def _nome_curto(df_base: pd.DataFrame) -> dict:
    """Plano -> nome curto (par da aba base); colisão usa o longo sem ' - CAPEX'."""
    pares = (df_base.dropna(subset=["Plano", "Conjunto"])
             .groupby("Plano")["Conjunto"]
             .agg(lambda s: s.mode().iloc[0]).to_dict())
    # Determinístico: o plano de nome mais curto fica com o apelido; os
    # demais em colisão usam o nome longo sem " - CAPEX" (ex.: POSTE DEMANDA).
    usados: set = set()
    for plano in sorted(pares, key=lambda p: (len(p), p)):
        if pares[plano] in usados:
            pares[plano] = plano.replace(" - CAPEX", "").strip()
        usados.add(pares[plano])
    return pares


def _importar(caminho: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        copia = os.path.join(tmp, "controle.xlsx")
        shutil.copy2(caminho, copia)
        xl = pd.ExcelFile(copia)
        base = pd.read_excel(xl, sheet_name="base")
        dexpara = pd.read_excel(xl, sheet_name="dexpara")

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

    db.substituir_metas(df_metas, df_depara)
    db.salvar_log_arquivo(os.path.basename(caminho), _USUARIO_SYNC,
                          datetime.datetime.now(), "Sync Metas")


def sincronizar_se_preciso(forcar: bool = False) -> dict:
    """Reimporta se o mtime do arquivo mudou desde a última importação."""
    caminho = str(config.caminho_controle_recomposicao())
    estado = db.obter_estado_metas()
    try:
        mtime = os.path.getmtime(caminho)
    except OSError as e:
        db.gravar_estado_metas(
            arquivo_mtime=(estado or {}).get("arquivo_mtime") or 0.0,
            erro=f"Arquivo inacessível: {e}")
        novo = db.obter_estado_metas()
        return {**novo, "sincronizou": False}

    if not forcar and estado and estado.get("arquivo_mtime") == mtime and not estado.get("erro"):
        return {**estado, "sincronizou": False}

    try:
        _importar(caminho)
        db.gravar_estado_metas(arquivo_mtime=mtime, erro=None)
        sincronizou = True
    except Exception as e:  # lock na cópia, aba renomeada, xlsx corrompido
        db.gravar_estado_metas(
            arquivo_mtime=(estado or {}).get("arquivo_mtime") or 0.0,
            erro=f"Falha ao importar: {e}")
        sincronizou = False
    novo = db.obter_estado_metas()
    return {**novo, "sincronizou": sincronizou}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_input_module.py -v` → PASS.

- [ ] **Step 5: Docs + commit** — `06-backend-input-module.md`: seção "Metas — sync do Controle Plano de Recomposição" (caminho/env, mtime, cópia-temp por causa de lock, replace, log_arquivos→versão, falha preserva última sync; sem editor no app).

```bash
git add backend/input_module/metas.py backend/input_module/config.py backend/test_input_module.py docs/dev/06-backend-input-module.md
git commit -m "feat(input): sync automatico de metas do Controle Plano de Recomposicao"
```

### Task 3: `input_module/relatorios.py` — engine de agregação

**Files:**
- Create: `backend/input_module/relatorios.py`
- Test: `backend/test_input_module.py`

**Interfaces:**
- Consumes: DataFrames (`engine.get_dataset()`-like, `db.carregar_dados_ramal()`-like, `db.carregar_metas`, `db.carregar_planos_depara`) — a função é PURA, recebe tudo por parâmetro.
- Produces: `montar_dashboard(df_notas, df_ramal, df_metas, df_depara, ano: int, mes_corrente: int, regional: str | None) -> dict` no formato do "Contrato do payload" (exceto `metas_info` e `regionais_disponiveis`, adicionados pela rota). Task 4 consome.

- [ ] **Step 1: Testes que falham** — em `test_input_module.py`:

```python
def _fx_relatorios():
    """Fixtures mínimas para o dashboard: 2 notas + 1 ramal + metas/depara."""
    df_notas = pd.DataFrame([
        # carteira jul/2026, Guarulhos (via Regional_CSD), POSTES: 2 und, uma executada (99)
        {"Numero_Nota": 1, "Conjunto": "POSTES - CAPEX", "Planejado_DDPM": 1.0,
         "Mes_Execucao_Planejado": "jul-2026", "Regional": "Mogi das Cruzes",
         "Regional_CSD": "Guarulhos", "Status_Nota": "99 Encerrado",
         "Export_status": "-", "Encerram.por data": "2026-07-10"},
        {"Numero_Nota": 2, "Conjunto": "POSTES - CAPEX", "Planejado_DDPM": 1.0,
         "Mes_Execucao_Planejado": "jul-2026", "Regional": "Guarulhos",
         "Regional_CSD": "-", "Status_Nota": "10 Em planejamento",
         "Export_status": "ENCE EXEC", "Encerram.por data": "2026-08-02"},
        # conjunto fora do de-para -> balde Outros
        {"Numero_Nota": 3, "Conjunto": "MISTERIOSO", "Planejado_DDPM": 2.0,
         "Mes_Execucao_Planejado": "jan-2026", "Regional": "Guarulhos",
         "Regional_CSD": "Guarulhos", "Status_Nota": "01 Sem providência",
         "Export_status": "-", "Encerram.por data": None},
    ])
    df_ramal = pd.DataFrame([
        # prefixo 160 (Poá) -> Poa/Suzano
        {"Numero_Nota": 9, "Local_Instalacao": "160RL00000001", "Planejado_DDPM": 1.0,
         "Mes_Execucao_Planejado": "jul-2026", "Status_Nota": "ENCE EXEC"},
    ])
    df_metas = pd.DataFrame([
        {"Ano": 2026, "Mes": 7, "Regional": "Guarulhos", "Plano": "POSTES - CAPEX", "Meta": 4.0},
        {"Ano": 2026, "Mes": 7, "Regional": "Poa/Suzano", "Plano": "RAMAL", "Meta": 2.0},
    ])
    df_depara = pd.DataFrame([
        {"Plano": "POSTES - CAPEX", "Nome_Curto": "POSTE", "Unidade": "Und.",
         "Area": "Construção", "Modular_RS": 10.0, "Ordem_Exibicao": 1},
        {"Plano": "RAMAL", "Nome_Curto": "RAMAL", "Unidade": "Ponto",
         "Area": "CSD", "Modular_RS": 2.0, "Ordem_Exibicao": 2},
    ])
    return df_notas, df_ramal, df_metas, df_depara


def test_dashboard_agregacao_basica(banco_temporario):
    from input_module import relatorios
    d = relatorios.montar_dashboard(*_fx_relatorios(), ano=2026, mes_corrente=7, regional=None)

    # hero de julho: carteira POSTES 2 + RAMAL 1 = 3; meta 4+2=6; executado jul = 1 (nota 1; a nota 2 encerra em ago)
    assert d["hero"]["carteira"] == 3.0
    assert d["hero"]["meta"] == 6.0
    assert d["hero"]["executado"] == 1.0
    assert round(d["hero"]["pct_disp"], 3) == 0.5
    assert d["hero"]["carteira_rs"] == 2 * 10.0 + 1 * 2.0

    anual = {l["plano"]: l for l in d["visao_anual"]}
    assert anual["POSTES - CAPEX"]["area"] == "Construção"
    assert anual["POSTES - CAPEX"]["carteira"] == 2.0
    assert anual["POSTES - CAPEX"]["saldo"] == -2.0
    assert anual["RAMAL"]["carteira"] == 1.0
    assert anual["MISTERIOSO"]["area"] == "Outros"        # nunca some silenciosamente
    assert anual["MISTERIOSO"]["pct_disp"] is None        # meta 0 -> null

    assert len(d["mensalizacao"]) == 12
    jul = next(m for m in d["mensalizacao"] if m["mes"] == 7)
    assert jul["carteira"] == 3.0 and jul["executado"] == 1.0

    regs = {r["regional"]: r for r in d["regionais"]}
    assert len(regs) == 6
    assert regs["Guarulhos"]["carteira"] == 2.0           # Regional_CSD + fallback Regional
    assert regs["Poa/Suzano"]["carteira"] == 1.0          # ramal 160 -> Poa/Suzano


def test_dashboard_filtro_regional(banco_temporario):
    from input_module import relatorios
    d = relatorios.montar_dashboard(*_fx_relatorios(), ano=2026, mes_corrente=7,
                                    regional="Guarulhos")
    assert d["hero"]["carteira"] == 2.0                   # só POSTES; ramal era Poa/Suzano
    assert d["hero"]["meta"] == 4.0
    regs = {r["regional"]: r for r in d["regionais"]}
    assert len(regs) == 6                                 # bloco regionais não filtra
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_input_module.py -k dashboard -v` → FAIL.

- [ ] **Step 3: Implementar `backend/input_module/relatorios.py`**

```python
"""Agregação do dashboard do Plano de Recomposição (funções puras).

Regras (spec 2026-07-17-relatorios-home-design.md):
- Carteira: soma de Planejado_DDPM por Plano (== Conjunto da nota) no ano,
  mês de Mes_Execucao_Planejado; notas_ramal inteira soma no plano RAMAL.
- Executado: Status_Nota começando com "99" OU Export_status == "ENCE EXEC",
  no mês de "Encerram.por data".
- Eixo regional: Regional_CSD (fallback Regional quando "-"); ramal deriva
  do prefixo do Local_Instalacao com override Poá/Suzano/Itaquá/Ferraz.
- Conjunto sem de-para cai no balde visível "Outros".
"""
import pandas as pd

from input_module import config

MESES_ABREV = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "maio": 5,
               "jun": 6, "jul": 7, "ago": 8, "set": 9, "out": 10,
               "nov": 11, "dez": 12}
MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
              "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
REGIONAIS_CSD = ["Guaratinguetá", "Guarulhos", "Litoral Norte",
                 "Mogi das Cruzes", "Poa/Suzano", "São José dos Campos"]
_PREFIXOS_POA_SUZANO = {"155", "160", "165", "170"}
PLANO_RAMAL = "RAMAL"


def _mes_de_execucao(valor) -> tuple[int | None, int | None]:
    """'jul-2026' -> (7, 2026); tolera vazio/lixo -> (None, None)."""
    s = str(valor or "").strip().lower()
    if "-" not in s:
        return None, None
    abrev, _, ano = s.partition("-")
    mes = MESES_ABREV.get(abrev)
    try:
        return mes, int(ano)
    except ValueError:
        return None, None


def _regional_csd_nota(row) -> str:
    csd = str(row.get("Regional_CSD") or "-").strip()
    if csd not in ("-", "", "nan"):
        return csd
    return str(row.get("Regional") or "-").strip()


def _regional_csd_ramal(local) -> str:
    prefixo = str(local or "")[:3]
    if prefixo in _PREFIXOS_POA_SUZANO:
        return "Poa/Suzano"
    return config.DE_PARA_REGIONAL.get(prefixo, "-")


def _executada(row) -> bool:
    status = str(row.get("Status_Nota") or "")
    return status.startswith("99") or str(row.get("Export_status") or "") == "ENCE EXEC"


def _linhas_fato(df_notas: pd.DataFrame, df_ramal: pd.DataFrame, ano: int) -> pd.DataFrame:
    """Normaliza notas+ramal em um fato único: plano, regional, mes, qtd, exec_mes."""
    fatos = []
    for _, row in df_notas.iterrows():
        mes, ano_exec = _mes_de_execucao(row.get("Mes_Execucao_Planejado"))
        if ano_exec != ano or mes is None:
            continue
        enc = pd.to_datetime(row.get("Encerram.por data"), errors="coerce")
        exec_mes = None
        if _executada(row) and pd.notna(enc) and enc.year == ano:
            exec_mes = int(enc.month)
        fatos.append({
            "plano": str(row.get("Conjunto") or "-").strip(),
            "regional": _regional_csd_nota(row),
            "mes": mes,
            "qtd": float(row.get("Planejado_DDPM") or 0),
            "exec_mes": exec_mes,
        })
    for _, row in df_ramal.iterrows():
        mes, ano_exec = _mes_de_execucao(row.get("Mes_Execucao_Planejado"))
        if ano_exec != ano or mes is None:
            continue
        executada = str(row.get("Status_Nota") or "").startswith(("99", "ENCE EXEC"))
        fatos.append({
            "plano": PLANO_RAMAL,
            "regional": _regional_csd_ramal(row.get("Local_Instalacao")),
            "mes": mes,
            "qtd": float(row.get("Planejado_DDPM") or 0),
            # ramal não tem Encerram.por data: executado cai no mês planejado
            "exec_mes": mes if executada else None,
        })
    if not fatos:
        return pd.DataFrame(columns=["plano", "regional", "mes", "qtd", "exec_mes"])
    return pd.DataFrame(fatos)


def _pct(carteira: float, meta: float) -> float | None:
    return None if meta == 0 else carteira / meta


def montar_dashboard(df_notas: pd.DataFrame, df_ramal: pd.DataFrame,
                     df_metas: pd.DataFrame, df_depara: pd.DataFrame,
                     ano: int, mes_corrente: int, regional: str | None) -> dict:
    fato = _linhas_fato(df_notas, df_ramal, ano)
    depara = df_depara.set_index("Plano") if not df_depara.empty else pd.DataFrame()
    metas = df_metas.copy()

    def soma_fato(f, por_mes=None, so_exec=False):
        if f.empty:
            return 0.0
        m = f
        if por_mes is not None:
            m = m[m["exec_mes"] == por_mes] if so_exec else m[m["mes"] == por_mes]
        elif so_exec:
            m = m[m["exec_mes"].notna()]
        return float(m["qtd"].sum())

    fato_f = fato if regional is None else fato[fato["regional"] == regional]
    metas_f = metas if regional is None else metas[metas["Regional"] == regional]

    def modular(plano: str) -> float:
        try:
            return float(depara.loc[plano, "Modular_RS"])
        except (KeyError, AttributeError):
            return 0.0

    def rs(f_plano_qtd: dict) -> float:
        return sum(q * modular(p) for p, q in f_plano_qtd.items())

    # ── hero do mês ──────────────────────────────────────────────────
    cart_mes_por_plano = (fato_f[fato_f["mes"] == mes_corrente]
                          .groupby("plano")["qtd"].sum().to_dict()) if not fato_f.empty else {}
    meta_mes_por_plano = (metas_f[metas_f["Mes"] == mes_corrente]
                          .groupby("Plano")["Meta"].sum().to_dict()) if not metas_f.empty else {}
    hero_carteira = sum(cart_mes_por_plano.values())
    hero_meta = sum(meta_mes_por_plano.values())
    hero = {
        "mes_nome": MESES_NOME[mes_corrente - 1],
        "meta": hero_meta, "carteira": hero_carteira,
        "executado": soma_fato(fato_f, por_mes=mes_corrente, so_exec=True),
        "pct_disp": _pct(hero_carteira, hero_meta),
        "meta_rs": rs(meta_mes_por_plano), "carteira_rs": rs(cart_mes_por_plano),
    }

    # ── visão anual por plano ────────────────────────────────────────
    planos = set(fato_f["plano"]) if not fato_f.empty else set()
    planos |= set(metas_f["Plano"]) if not metas_f.empty else set()
    linhas = []
    for plano in planos:
        cart = soma_fato(fato_f[fato_f["plano"] == plano]) if not fato_f.empty else 0.0
        meta = float(metas_f[metas_f["Plano"] == plano]["Meta"].sum()) if not metas_f.empty else 0.0
        if plano in getattr(depara, "index", []):
            info = depara.loc[plano]
            nome, area, unidade = str(info["Nome_Curto"]), str(info["Area"]), str(info["Unidade"])
            ordem = int(info["Ordem_Exibicao"])
        else:
            nome, area, unidade, ordem = plano, "Outros", "-", 9999
        linhas.append({
            "plano": plano, "nome_curto": nome, "area": area, "unidade": unidade,
            "meta": meta, "carteira": cart, "saldo": cart - meta,
            "pct_disp": _pct(cart, meta), "gap_rs": (cart - meta) * modular(plano),
            "_ordem": ordem,
        })
    ordem_area = {"Construção": 0, "CSD": 1, "Outros": 2}
    linhas.sort(key=lambda l: (ordem_area.get(l["area"], 3), l["_ordem"], l["plano"]))
    for l in linhas:
        l.pop("_ordem")

    # ── mensalização ─────────────────────────────────────────────────
    mensalizacao = [{
        "mes": m,
        "meta": float(metas_f[metas_f["Mes"] == m]["Meta"].sum()) if not metas_f.empty else 0.0,
        "carteira": soma_fato(fato_f, por_mes=m),
        "executado": soma_fato(fato_f, por_mes=m, so_exec=True),
    } for m in range(1, 13)]

    # ── regionais (sempre as 6, sem filtro) ──────────────────────────
    regionais = []
    for reg in REGIONAIS_CSD:
        cart = soma_fato(fato[fato["regional"] == reg]) if not fato.empty else 0.0
        meta = float(metas[metas["Regional"] == reg]["Meta"].sum()) if not metas.empty else 0.0
        regionais.append({"regional": reg, "meta": meta, "carteira": cart,
                          "saldo": cart - meta, "pct_disp": _pct(cart, meta)})

    # ── financeiro do ano ────────────────────────────────────────────
    cart_ano = (fato_f.groupby("plano")["qtd"].sum().to_dict()) if not fato_f.empty else {}
    meta_ano = (metas_f.groupby("Plano")["Meta"].sum().to_dict()) if not metas_f.empty else {}
    fin = {"meta_rs": rs(meta_ano), "carteira_rs": rs(cart_ano)}
    fin["gap_rs"] = fin["carteira_rs"] - fin["meta_rs"]

    return {"ano": ano, "mes_corrente": mes_corrente, "regional": regional,
            "hero": hero, "visao_anual": linhas, "mensalizacao": mensalizacao,
            "regionais": regionais, "financeiro_ano": fin}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_input_module.py -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/relatorios.py backend/test_input_module.py
git commit -m "feat(input): engine de agregacao do dashboard do Plano de Recomposicao"
```

### Task 4: Endpoints do dashboard e sync de metas

**Files:**
- Modify: `backend/input_module/routes.py`
- Test: `backend/test_input_module.py`
- Docs: `docs/dev/06-backend-input-module.md` (endpoints novos na tabela)

**Interfaces:**
- Consumes: `metas.sincronizar_se_preciso` (Task 2), `relatorios.montar_dashboard` (Task 3), `engine.get_dataset`, `db.carregar_dados_ramal`, `db.carregar_metas`, `db.carregar_planos_depara`, `db.obter_versao_dataset`, `garantir_banco`.
- Produces (contrato HTTP para Tasks 6–10, 12):
  - `GET /api/input/relatorios/dashboard?regional=<opcional>` → payload do contrato + `regionais_disponiveis` + `metas_info`; `ETag W/"<versao>"`, 304 via `If-None-Match`.
  - `POST /api/input/metas/sincronizar` → estado da sync (forçada).

- [ ] **Step 1: Testes que falham**

```python
def test_api_relatorios_dashboard(banco_temporario, monkeypatch, tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from input_module.routes import router
    arquivo = tmp_path / "Controle.xlsx"
    _xlsx_controle(arquivo)
    monkeypatch.setenv("CONTROLE_RECOMPOSICAO_PATH", str(arquivo))
    app = FastAPI(); app.include_router(router)
    client = TestClient(app)

    r = client.get("/api/input/relatorios/dashboard")
    assert r.status_code == 200
    corpo = r.json()
    assert {"hero", "visao_anual", "mensalizacao", "regionais",
            "financeiro_ano", "metas_info", "regionais_disponiveis"} <= set(corpo)
    assert corpo["metas_info"]["erro"] is None
    assert len(corpo["regionais_disponiveis"]) == 6
    etag = r.headers["etag"]
    assert client.get("/api/input/relatorios/dashboard",
                      headers={"If-None-Match": etag}).status_code == 304
    # filtro por regional aceito
    assert client.get("/api/input/relatorios/dashboard?regional=Guarulhos").status_code == 200

    r = client.post("/api/input/metas/sincronizar")
    assert r.status_code == 200 and "sincronizou" in r.json()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_input_module.py -k api_relatorios -v` → FAIL (404).

- [ ] **Step 3: Implementar** — em `routes.py` (após o bloco de `/sync`; adicionar `from input_module import metas, relatorios` ao import existente `from input_module import config, db, engine`):

```python
@router.get("/relatorios/dashboard")
def relatorios_dashboard(request: Request, response: Response,
                         regional: Optional[str] = None):
    garantir_banco()
    estado_metas = metas.sincronizar_se_preciso()
    versao = db.obter_versao_dataset()
    etag = f'W/"{versao}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    agora = datetime.datetime.now()
    corpo = relatorios.montar_dashboard(
        engine.get_dataset(), db.carregar_dados_ramal(),
        db.carregar_metas(agora.year), db.carregar_planos_depara(),
        ano=agora.year, mes_corrente=agora.month, regional=regional)
    corpo["regionais_disponiveis"] = relatorios.REGIONAIS_CSD
    corpo["metas_info"] = {
        "atualizadas_em": estado_metas.get("atualizadas_em"),
        "arquivo_mtime": estado_metas.get("arquivo_mtime"),
        "erro": estado_metas.get("erro"),
    }
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "no-cache"
    return corpo


@router.post("/metas/sincronizar")
def metas_sincronizar():
    garantir_banco()
    return metas.sincronizar_se_preciso(forcar=True)
```

Nota: o sync de metas grava em `log_arquivos`, então quando ele importa algo novo a `versao` computada logo depois já reflete a mudança — o ETag nunca serve dado velho pós-sync.

- [ ] **Step 4: Rodar TODOS os testes**

Run: `cd backend && ./venv/Scripts/python -m pytest test_input_module.py test_integracao_module.py -v` → PASS.

- [ ] **Step 5: Docs + commit** — tabela de endpoints do `06-backend-input-module.md` ganha as 2 rotas.

```bash
git add backend/input_module/routes.py backend/test_input_module.py docs/dev/06-backend-input-module.md
git commit -m "feat(input): endpoints do dashboard de relatorios e sync de metas"
```

### Task 5: `GET /api/integracao/resumo-fora-do-plano`

**Files:**
- Modify: `backend/integracao_module/routes.py`, `backend/integracao_module/service.py`
- Test: `backend/test_integracao_module.py`
- Docs: `docs/dev/08-integracao-coffee-input.md`

**Interfaces:**
- Consumes: `coffee_db.listar_notas`, `input_db.obter_nota_plano` — na verdade contagem via SQL direto é N+1; usar leitura de `notas` uma vez.
- Produces: `GET /api/integracao/resumo-fora-do-plano` → `{"corrigidas_fora_do_plano": int}` (notas coffee com SAP real, não arquivadas localmente, cujo id_sap não existe na tabela `notas` do plano). Task 10 consome.

- [ ] **Step 1: Teste que falha** — em `test_integracao_module.py`:

```python
def test_api_resumo_fora_do_plano(ambiente):
    client = _client()
    r = client.get("/api/integracao/resumo-fora-do-plano")
    assert r.status_code == 200
    assert r.json()["corrigidas_fora_do_plano"] == 1   # 4242 tem SAP real e não está no plano
    client.post("/api/integracao/mover-para-plano",
                json={"pks": [4242], "campos_usuario": CAMPOS},
                headers={"X-User": "teste"})
    assert client.get("/api/integracao/resumo-fora-do-plano"
                      ).json()["corrigidas_fora_do_plano"] == 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_integracao_module.py -k fora_do_plano -v` → FAIL.

- [ ] **Step 3: Implementar** — `integracao_module/service.py`:

```python
def contar_fora_do_plano() -> int:
    """Notas COFFEE com SAP real, não arquivadas, ainda ausentes do plano."""
    candidatas = [n for n in coffee_db.listar_notas() if _sap_real(n)]
    if not candidatas:
        return 0
    df_plano = input_db.carregar_dados()
    existentes = set(df_plano["Numero_Nota"].tolist()) if not df_plano.empty else set()
    return sum(1 for n in candidatas if n["id_sap"] not in existentes)
```

(`listar_notas()` já exclui arquivadas; carrega o plano UMA vez — sem N+1.)

`integracao_module/routes.py`:

```python
@router.get("/resumo-fora-do-plano")
def resumo_fora_do_plano():
    garantir_banco()
    return {"corrigidas_fora_do_plano": service.contar_fora_do_plano()}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ./venv/Scripts/python -m pytest test_integracao_module.py -v` → PASS.

- [ ] **Step 5: Docs + commit** — `08-integracao-coffee-input.md`: endpoint novo na tabela.

```bash
git add backend/integracao_module/ backend/test_integracao_module.py docs/dev/08-integracao-coffee-input.md
git commit -m "feat(integracao): contador de corrigidas fora do plano para a home"
```

### Task 6: Frontend — tipos, API e hook do dashboard

**Files:**
- Create: `frontend/src/features/relatorios/types.ts`
- Create: `frontend/src/features/relatorios/use-dashboard.ts`
- Modify: `frontend/src/features/input/api.ts` (funções `dashboardRelatorios`/`sincronizarMetas` no `InputApi`)
- Modify: `frontend/src/api.ts` (função `resumoForaDoPlano` no `EDPApi`)

**Interfaces:**
- Consumes: contratos HTTP das Tasks 4–5.
- Produces (Tasks 7–12 consomem):

```ts
// features/relatorios/types.ts — todos exportados
export interface HeroMes { mes_nome: string; meta: number; carteira: number;
  executado: number; pct_disp: number | null; meta_rs: number; carteira_rs: number; }
export interface LinhaAnual { plano: string; nome_curto: string;
  area: 'Construção' | 'CSD' | 'Outros'; unidade: string; meta: number;
  carteira: number; saldo: number; pct_disp: number | null; gap_rs: number; }
export interface MesMensalizacao { mes: number; meta: number; carteira: number; executado: number; }
export interface RegionalResumo { regional: string; meta: number; carteira: number;
  saldo: number; pct_disp: number | null; }
export interface MetasInfo { atualizadas_em: string | null;
  arquivo_mtime: number | null; erro: string | null; }
export interface DashboardRelatorios { ano: number; mes_corrente: number;
  regional: string | null; regionais_disponiveis: string[]; hero: HeroMes;
  visao_anual: LinhaAnual[]; mensalizacao: MesMensalizacao[];
  regionais: RegionalResumo[];
  financeiro_ano: { meta_rs: number; carteira_rs: number; gap_rs: number };
  metas_info: MetasInfo; }
```

- `InputApi.dashboardRelatorios(regional?: string) => Promise<DashboardRelatorios>`; `InputApi.sincronizarMetas() => Promise<MetasInfo & { sincronizou: boolean }>`; `EDPApi.resumoForaDoPlano() => Promise<{ corrigidas_fora_do_plano: number }>`.
- `useDashboardRelatorios(regional: string | null)` → `useQuery({ queryKey: ['relatorios-dashboard', regional], staleTime: 60_000 })`; `useForaDoPlano()` → `useQuery({ queryKey: ['relatorios-fora-do-plano'], staleTime: 60_000 })`.

- [ ] **Step 1: Escrever `types.ts`** (código acima, verbatim).

- [ ] **Step 2: `features/input/api.ts`** — dentro do objeto `InputApi`:

```ts
  dashboardRelatorios: (regional?: string) =>
    req<import('../relatorios/types').DashboardRelatorios>(
      `/relatorios/dashboard${regional ? `?regional=${encodeURIComponent(regional)}` : ''}`),
  sincronizarMetas: () =>
    req<import('../relatorios/types').MetasInfo & { sincronizou: boolean }>(
      '/metas/sincronizar', escrita('POST')),
```

Atenção: `POST /metas/sincronizar` não exige X-User no backend; `escrita('POST')` só adiciona o header se existir — ok.

- [ ] **Step 3: `src/api.ts`** — padrão `erroComDetail`:

```ts
export async function resumoForaDoPlano(): Promise<{ corrigidas_fora_do_plano: number }> {
  const res = await fetch(BASE + "/integracao/resumo-fora-do-plano", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw await erroComDetail(res, "GET /integracao/resumo-fora-do-plano");
  return res.json() as Promise<{ corrigidas_fora_do_plano: number }>;
}
```

Adicionar `resumoForaDoPlano` ao facade `EDPApi`.

- [ ] **Step 4: `use-dashboard.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { InputApi } from '../input/api';
import { EDPApi } from '../../api';

export function useDashboardRelatorios(regional: string | null) {
  return useQuery({
    queryKey: ['relatorios-dashboard', regional],
    queryFn: () => InputApi.dashboardRelatorios(regional ?? undefined),
    staleTime: 60_000,
  });
}

export function useForaDoPlano() {
  return useQuery({
    queryKey: ['relatorios-fora-do-plano'],
    queryFn: EDPApi.resumoForaDoPlano,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 5: Build + commit**

Run: `cd frontend && npm run build` → PASS.

```bash
git add frontend/src/features/relatorios/ frontend/src/features/input/api.ts frontend/src/api.ts
git commit -m "feat(front): tipos, api e hooks do dashboard de relatorios"
```

### Task 7: Frontend — casca da seção, seletor de regional e hero do mês

**Files:**
- Create: `frontend/src/features/relatorios/relatorios-section.tsx`
- Create: `frontend/src/features/relatorios/hero-mes.tsx`

**Interfaces:**
- Consumes: hooks da Task 6; `PageHeader`/`StatTile` de `@/components/branded/section`; `Select` de ui; tokens existentes.
- Produces:

```ts
export interface RelatoriosSectionProps {
  onVerNotasDoMes: (mes: number, ano: number) => void;
  onVerPlano: (plano: string, regional: string | null) => void;
  onIrParaCoffee: () => void;
}
export function RelatoriosSection(props: RelatoriosSectionProps): React.JSX.Element;
export function HeroMes({ hero, financeiroAno, aoVerNotas }: {
  hero: HeroMes; financeiroAno: DashboardRelatorios['financeiro_ano'];
  aoVerNotas: () => void }): React.JSX.Element;
```

Task 11 monta `RelatoriosSection` no App.
- Antes do JSX: invocar skill `frontend-design` (conformidade com a linguagem visual existente).
- Formatação de números (helper local `fmt.ts` na feature): `fmtQtd(v)` = `toLocaleString('pt-BR', {maximumFractionDigits: 2})`; `fmtPct(p)` = `p === null ? '—' : (p*100).toFixed(0)+'%'`; `fmtRS(v)` = compacto pt-BR (`Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',notation:'compact'})`).

- [ ] **Step 1: Criar `fmt.ts`, `hero-mes.tsx` e `relatorios-section.tsx`.** Estrutura da section (esqueleto obrigatório; visual calibrado pela skill):

```tsx
export function RelatoriosSection({ onVerNotasDoMes, onVerPlano, onIrParaCoffee }: RelatoriosSectionProps): React.JSX.Element {
  const [regional, setRegional] = React.useState<string | null>(null);
  const { data, isLoading, error } = useDashboardRelatorios(regional);
  const foraDoPlano = useForaDoPlano();
  // header: PageHeader eyebrow "Relatórios" título "Plano de Recomposição {ano}"
  //   + Select de regional ("SP (todas)" = null + regionais_disponiveis)
  //   + aviso discreto quando data.metas_info.erro != null ("metas de {atualizadas_em}")
  // corpo: <HeroMes .../> com botão "ver notas do mês" -> onVerNotasDoMes(data.mes_corrente, data.ano)
  //   + card fora-do-plano (Task 10) + tabela anual (Task 8) + mensalização (Task 9) + regionais (Task 10)
  // estados: isLoading -> "Carregando…" | error -> bloco text-red padrão das outras seções
}
```

Hero: 5 `StatTile` (Meta do mês, Carteira, Executado, % Disp., R$ carteira/meta) + barra de progresso fina (executado/meta, `div` com width %, tokens `--green`/`--surface-2`) + botão ghost "ver notas do mês".

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build` → PASS (a section ainda não é montada no App — sem consumidor, mas compila; export usado na Task 11).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/relatorios/
git commit -m "feat(relatorios): casca da secao, seletor de regional e hero do mes"
```

### Task 8: Frontend — tabela visão anual (Construção/CSD/Outros)

**Files:**
- Create: `frontend/src/features/relatorios/tabela-anual.tsx`
- Modify: `frontend/src/features/relatorios/relatorios-section.tsx` (montar o bloco)

**Interfaces:**
- Consumes: `LinhaAnual[]`; `Table*` de `@/components/ui/table`.
- Produces: `TabelaAnual({ linhas, aoClicarPlano }: { linhas: LinhaAnual[]; aoClicarPlano: (plano: string) => void })`.
- Regras: agrupar por `area` na ordem Construção→CSD→Outros com linha de cabeçalho de grupo; colunas Nome (nome_curto, title=plano longo), U.M, Meta, Carteira, Saldo, %Disp (badge farol: verde pct≥1, âmbar ≥0.85, vermelho <0.85, "—" null), R$ gap (`fmtRS`, só quando `gap_rs !== 0`); linha inteira clicável (`onClick` + `cursor-pointer` + `aria-label`); grupo vazio não renderiza.
- Skill `frontend-design` antes do JSX.

- [ ] **Step 1: Implementar componente + montagem na section** (`aoClicarPlano={(plano) => onVerPlano(plano, regional)}`).

- [ ] **Step 2: Build + commit**

Run: `cd frontend && npm run build` → PASS.

```bash
git add frontend/src/features/relatorios/
git commit -m "feat(relatorios): tabela visao anual com grupos Construcao/CSD e farol"
```

### Task 9: Frontend — gráfico de mensalização (SVG)

**Files:**
- Create: `frontend/src/features/relatorios/mensalizacao-chart.tsx`
- Modify: `frontend/src/features/relatorios/relatorios-section.tsx` (montar o bloco)

**Interfaces:**
- Consumes: `MesMensalizacao[]` (sempre 12).
- Produces: `MensalizacaoChart({ meses, mesCorrente }: { meses: MesMensalizacao[]; mesCorrente: number })`.
- **Invocar as skills `dataviz` e `frontend-design` ANTES de escrever o SVG.**
- Requisitos: SVG responsivo (`viewBox`, width 100%); por mês, barra de Meta (contorno/neutro `var(--surface-2)` + borda `var(--line)`) e barra de Carteira (`var(--accent)`); Executado como barra sobreposta (`var(--green)`) apenas em meses ≤ mesCorrente; rótulos dos meses (jan..dez) em `edp-mono` 10px; `<title>` por barra para tooltip nativo (acessibilidade); escala = max(meta, carteira) do ano; sem lib externa.

- [ ] **Step 1: Implementar + montar na section (coluna esquerda do grid inferior).**

- [ ] **Step 2: Build + commit**

Run: `cd frontend && npm run build` → PASS.

```bash
git add frontend/src/features/relatorios/
git commit -m "feat(relatorios): grafico SVG de mensalizacao meta vs carteira vs executado"
```

### Task 10: Frontend — cards por regional, card COFFEE e financeiro

**Files:**
- Create: `frontend/src/features/relatorios/regionais-cards.tsx`
- Modify: `frontend/src/features/relatorios/relatorios-section.tsx` (montagem final)

**Interfaces:**
- Consumes: `RegionalResumo[]`, `useForaDoPlano` (Task 6), `financeiro_ano`.
- Produces: `RegionaisCards({ regionais }: { regionais: RegionalResumo[] })` — 6 cards (grid 2×3) com nome, %Disp grande (cor do farol), saldo com sinal (`fmtQtd`), meta/carteira pequenos.
- Card fora-do-plano no hero: quando `corrigidas_fora_do_plano > 0`, card clicável "N corrigidas no COFFEE fora do plano →" chamando `onIrParaCoffee()`; quando 0 ou query com erro, não renderiza.
- Financeiro do ano: linha discreta sob a tabela anual — "Carteira {fmtRS} · Meta {fmtRS} · Gap {fmtRS}".
- Skill `frontend-design` antes do JSX.

- [ ] **Step 1: Implementar + montagem final da section (layout aprovado da spec).**

- [ ] **Step 2: Build + commit**

Run: `cd frontend && npm run build` → PASS.

```bash
git add frontend/src/features/relatorios/
git commit -m "feat(relatorios): cards por regional, card fora-do-plano e financeiro do ano"
```

### Task 11: App — seção default, sidebar e handoff de filtros pro Input

**Files:**
- Modify: `frontend/src/types.ts:8` (`AppSection`)
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/app-sidebar.tsx`
- Modify: `frontend/src/features/input/input-section.tsx`
- Modify: `frontend/src/features/input/overview.tsx`
- Docs: `docs/dev/00-overview.md` (mapa), `docs/dev/03-frontend-input.md` (handoff), `docs/dev/04-frontend-shared.md` (nova seção/navegação)

**Interfaces:**
- Consumes: `RelatoriosSection` (Task 7), `FiltersState`/`FILTROS_INICIAIS` de `features/input/filters`, tipo `Filtro` de `features/input/lib`.
- Produces: `AppSection = "relatorios" | "coffee" | "input" | "configuracoes"`; **default `useState<AppSection>("relatorios")`**; item "Relatórios" no topo do sidebar; handoff:

```tsx
// App.tsx
const [filtrosHandoff, setFiltrosHandoff] =
  React.useState<{ estado: FiltersState; id: number } | null>(null);

function irParaInputFiltrado(filtros: Filtro[]): void {
  setFiltrosHandoff((prev) => ({ estado: { busca: "", filtros }, id: (prev?.id ?? 0) + 1 }));
  setInputSub("visao");
  changeSection("input");
}
```

Render (lazy import de `RelatoriosSection` igual às outras):

```tsx
{section === "relatorios" ? (
  <RelatoriosSection
    onVerNotasDoMes={(mes, ano) => irParaInputFiltrado([
      { campo: "Mes_Execucao_Planejado", tipo: "multi",
        valores: [`${MESES_ABREV_PT[mes - 1]}-${ano}`] },
    ])}
    onVerPlano={(plano, regional) => irParaInputFiltrado([
      { campo: "Conjunto", tipo: "multi", valores: [plano] },
      ...(regional ? [{ campo: "Regional_CSD", tipo: "multi" as const, valores: [regional] }] : []),
    ])}
    onIrParaCoffee={() => { setCoffeeSub("corrigidas"); changeSection("coffee"); }}
  /> ) : ...}
```

`MESES_ABREV_PT = ["jan","fev","mar","abr","maio","jun","jul","ago","set","out","nov","dez"]` (formato de exibição do dataset — "maio" por extenso, demais com 3 letras; declarar no App.tsx).

`InputSection` ganha prop `filtrosHandoff?: { estado: FiltersState; id: number } | null` e repassa ao `Overview` como `key={filtrosHandoff?.id ?? 0}` + `filtrosIniciais={filtrosHandoff?.estado}`. `Overview` ganha `filtrosIniciais?: FiltersState` e muda a linha 24 para `React.useState<FiltersState>(filtrosIniciais ?? FILTROS_INICIAIS)` (a `key` força remontagem a cada novo handoff; semântica: filtros iniciais aplicam na montagem, usuário edita livremente depois).

Sidebar: item "Relatórios" (ícone `ChartNoAxesCombined` do lucide, ou `LayoutDashboard`) acima de COFFEE, sem sub-abas.

- [ ] **Step 1: Implementar tudo acima.**
- [ ] **Step 2: Build**

Run: `cd frontend && npm run build` → PASS.

- [ ] **Step 3: Docs + commit** — `00-overview.md` (linha no mapa de módulos), `04-frontend-shared.md` (nova seção default + handoff), `03-frontend-input.md` (prop `filtrosIniciais`/`filtrosHandoff`).

```bash
git add frontend/src docs/dev/00-overview.md docs/dev/03-frontend-input.md docs/dev/04-frontend-shared.md
git commit -m "feat(app): Relatorios vira home com handoff de filtros para o Input"
```

### Task 12: Configurações — card de status das metas

**Files:**
- Modify: `frontend/src/features/input/settings.tsx`
- Docs: `docs/dev/03-frontend-input.md`

**Interfaces:**
- Consumes: `InputApi.sincronizarMetas` (Task 6); `metas_info` não é necessário aqui — o próprio POST retorna o estado.
- Produces: card "Metas do Plano de Recomposição" na aba Configurações do Input: mostra última sincronização (`atualizadas_em` formatada pt-BR), erro em `text-red` quando houver, botão "Sincronizar agora" (`toast.promise`, invalida `['relatorios-dashboard']` no sucesso via `useQueryClient`). Estado exibido SEM forçar sync: o card lê `data.metas_info` de `useDashboardRelatorios(null)` (query já cacheada, staleTime 60s) — nunca usar o POST `sincronizarMetas` só para exibir estado, pois ele tem efeito colateral (força reimport). Skill `frontend-design` antes do JSX.

- [ ] **Step 1: Implementar o card em `settings.tsx`.**
- [ ] **Step 2: Build + docs + commit**

Run: `cd frontend && npm run build` → PASS.

```bash
git add frontend/src/features/input/settings.tsx docs/dev/03-frontend-input.md
git commit -m "feat(input): card de status e sync manual das metas em Configuracoes"
```

### Task 13: Verificação de ponta a ponta + auditoria

**Files:** nenhum novo — validação e limpeza.

- [ ] **Step 1: Suíte completa**

Run: `cd backend && ./venv/Scripts/python -m pytest test_upload.py test_input_module.py test_coffee_module.py test_integracao_module.py -v` → PASS.
Run: `cd frontend && npm run build` → PASS.

- [ ] **Step 2: Subir e exercitar o fluxo real** (skill `verify`; backend `uvicorn main:app`)

Roteiro: (1) home abre em Relatórios com hero do mês e dados reais (planilha do OneDrive sincronizada automaticamente — conferir `metas_info` sem erro); (2) trocar Regional no seletor → todos os blocos mudam; (3) clicar num plano da tabela → Input abre filtrado por Conjunto (+Regional se selecionada); (4) "ver notas do mês" → Input filtrado pelo mês corrente; (5) card fora-do-plano → COFFEE·Corrigidas; (6) editar a Meta de um mês na planilha Excel, salvar, F5 na home → valor novo aparece (mtime-sync) e ETag mudou (Network); (7) Configurações → card de metas mostra última sync; "Sincronizar agora" funciona; (8) `GET /api/input/relatorios/dashboard` com `If-None-Match` → 304.

- [ ] **Step 3: Auditoria pós-feature**: `/simplify` e depois `/code-review` no diff da branch; aplicar o que for real.

- [ ] **Step 4: Checklist CLAUDE.md** (sem console.log, sem import morto, docs atualizados) e commit final de ajustes, se houver.
