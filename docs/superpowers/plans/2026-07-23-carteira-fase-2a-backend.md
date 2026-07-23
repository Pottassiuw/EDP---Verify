# Carteira de Notas — Fase 2a (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend da movimentação: coluna `origem` no Input, mover-para-plano em lote a partir da carteira (all-or-nothing, funil `criar_notas`), `plano_movimentacoes`, e a query de Divergências — mais os endpoints.

**Architecture:** Espelha o `integracao_module` (que já move COFFEE→plano) para a carteira, sem acoplá-los: `carteira_module/movimentacao.py` mapeia `nota_carteira` (chave `id_onr`, lida de `carteira.db`) para `input_service.NovaNota` e funila por `input_service.criar_notas(origem="carteira")`. A coluna `origem` é adicionada ao Input com migração aditiva idempotente e um novo parâmetro em `criar_notas`.

**Tech Stack:** Python, FastAPI, SQLite, pydantic, pytest.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-23-carteira-fase-2-movimentacao-design.md`.
- **Precedente a espelhar:** `backend/integracao_module/{service.py,mapping.py,routes.py}` (mover COFFEE→plano). `carteira_module` NÃO importa `integracao_module`; ambos funilam por `input_service.criar_notas`.
- **`criar_notas` novo param:** `criar_notas(notas, usuario, origem="manual")` — default retrocompatível; `integracao`→`"coffee"`, `carteira`→`"carteira"`, rotas do Input ficam no default.
- **Movível:** `sap_real=1` E não já no plano E `ausente_na_origem_em IS NULL` E sem duplicata de `Numero_Nota` no lote. Lote **all-or-nothing**.
- **Mapa carteira→NovaNota:** `Numero_Nota=int(id_sap)`, `Conjunto=conjunto`, `Local_Instalacao=local_instalacao|'-'`, `Circuito=alimentador|'-'`, `Prioridade_Nota=de-para(prioridade)|'Programável'`, `Planejado_DDPM=quantidade` as-is, `Status_Nota='01 Sem providência'`, `Data_Envio_Projeto`=hoje `dd/mm/yyyy`; `Mes_Execucao_Planejado`/`Status_Obra`/`Observacao`/`Check` manuais (modal).
- **Divergências:** `nota_carteira` com (`status_sap='Cancelado'` OU `ausente_na_origem_em IS NOT NULL`) E `CAST(id_sap AS INT)` no conjunto de `Numero_Nota` do plano (`input_db.listar_numeros_nota()`).
- **CLAUDE.md:** endpoints finos; nunca engolir exceção; SQL separado das regras; funções 30–40 linhas; sem `any`.
- **Comando de teste (de `backend/`):** `venv/Scripts/python -m pytest test_carteira_module.py -v` (e `test_input_module.py` onde a task tocar o Input).
- **Isolamento de teste:** `CARTEIRA_DATA_DIR` + `INPUT_DATA_DIR` = tmp; `db.inicializar_banco()` de ambos no setup; origem Databricks nunca é lida em teste (a movimentação lê da projeção local já populada em staging/reconcile ou inserida direto).

---

## File Structure

- `backend/input_module/db.py` — ALTER `origem` em `inicializar_banco`; `"origem"` em `colunas_upsert` de `salvar_em_massa`.
- `backend/input_module/service.py` — `criar_notas(..., origem="manual")`; `_preparar_novas` grava `origem`.
- `backend/integracao_module/service.py` — passa `origem="coffee"`.
- `backend/carteira_module/db.py` — tabela `plano_movimentacoes` + `registrar_movimentacao`.
- `backend/carteira_module/repository.py` — `obter_muitas`, `listar_divergencias`.
- `backend/carteira_module/movimentacao.py` — mapa, preview, mover, divergências.
- `backend/carteira_module/routes.py` — 4 rotas novas.
- `backend/test_carteira_module.py` / `backend/test_input_module.py` — testes.
- `docs/dev/10-backend-carteira-module.md`, `docs/dev/06-backend-input-module.md`.

---

### Task 1: Coluna `origem` no Input (migração + criar_notas)

**Files:**
- Modify: `backend/input_module/db.py` (ALTER em `inicializar_banco` ~L155; `colunas_upsert` em `salvar_em_massa` ~L429)
- Modify: `backend/input_module/service.py` (`_preparar_novas`, `criar_notas`)
- Modify: `backend/integracao_module/service.py:98`
- Test: `backend/test_input_module.py` (append)

**Interfaces:**
- Produces: `input_service.criar_notas(notas: list[NovaNota], usuario: str, origem: str = "manual") -> int`; coluna `origem` persistida na tabela `notas`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_input_module.py`:
```python
def test_criar_notas_grava_origem(banco_temporario):
    from input_module import db, service
    nota = service.NovaNota(Numero_Nota=778001, Status_Nota="01 Sem providência",
                            Prioridade_Nota="Programável", Local_Instalacao="045BF00000123")
    service.criar_notas([nota], usuario="teste", origem="carteira")
    conn = db.get_db_connection()
    row = conn.execute("SELECT origem FROM notas WHERE Numero_Nota=778001").fetchone()
    conn.close()
    assert row[0] == "carteira"


def test_criar_notas_origem_default_manual(banco_temporario):
    from input_module import db, service
    nota = service.NovaNota(Numero_Nota=778002, Status_Nota="01 Sem providência",
                            Prioridade_Nota="Programável")
    service.criar_notas([nota], usuario="teste")
    conn = db.get_db_connection()
    row = conn.execute("SELECT origem FROM notas WHERE Numero_Nota=778002").fetchone()
    conn.close()
    assert row[0] == "manual"
```

Nota: `banco_temporario` é a fixture existente em `test_input_module.py` que
aponta `INPUT_DATA_DIR` para tmp e inicializa o banco. Confirme o nome exato
lendo o topo do arquivo antes (se diferente, use o nome real).

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_input_module.py -k origem -v`
Expected: FAIL — `criar_notas() got an unexpected keyword argument 'origem'` ou coluna inexistente.

- [ ] **Step 3: Write minimal implementation**

Em `backend/input_module/db.py`, dentro de `inicializar_banco`, junto dos
outros ALTER (após a linha do `Nota_Mae`, ~L156):
```python
    if "origem" not in colunas_existentes:
        cursor.execute("ALTER TABLE notas ADD COLUMN origem TEXT")
```

Em `backend/input_module/db.py`, na lista `colunas_upsert` de
`salvar_em_massa` (~L429-435), adicione `"origem"` ao final da lista:
```python
    colunas_upsert = [
        "ID_Cronologia",
        "Numero_Nota", "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao",
        "Regional", "Planejado_DDPM", "Mes_Execucao_Planejado", "Data_Envio_Projeto",
        "Status_Nota", "Prioridade_Nota", "Observacao", "Check", "Status_Anterior",
        "Centro_Responsavel", "origem"
    ]
```

Em `backend/input_module/service.py`, `_preparar_novas` recebe e grava a
origem. Troque a assinatura e o loop:
```python
def _preparar_novas(notas: list[NovaNota], df_banco: pd.DataFrame,
                    origem: str) -> pd.DataFrame:
    """Valida duplicatas e completa Regional/ID_Cronologia (Input/app.py:640-728)."""
    numeros = [n.Numero_Nota for n in notas]
    repetidas_lote = {str(n) for n in numeros if numeros.count(n) > 1}
    if repetidas_lote:
        raise NotasDuplicadasErro(
            "Notas duplicadas no próprio lote: " + ", ".join(sorted(repetidas_lote)))
    existentes = set(df_banco["Numero_Nota"].tolist()) if not df_banco.empty else set()
    repetidas_banco = sorted(str(n) for n in numeros if n in existentes)
    if repetidas_banco:
        raise NotasDuplicadasErro(
            "Notas já existentes no banco: " + ", ".join(repetidas_banco))
    base_id = db.proximo_id_cronologia(df_banco)
    linhas = []
    for i, nota in enumerate(notas):
        registro = nota.model_dump()
        registro["ID_Cronologia"] = base_id + i
        registro["Regional"] = config.DE_PARA_REGIONAL.get(str(nota.Local_Instalacao)[:3], "-")
        registro["Centro_Responsavel"] = "-"
        registro["Status_Anterior"] = "-"
        registro["origem"] = origem
        linhas.append(registro)
    return pd.DataFrame(linhas)
```

E `criar_notas`:
```python
def criar_notas(notas: list[NovaNota], usuario: str, origem: str = "manual") -> int:
    """Insere notas novas no plano; levanta NotasDuplicadasErro em conflito."""
    df_novas = _preparar_novas(notas, db.carregar_dados(), origem)
    db.salvar_em_massa(df_novas)
    return len(df_novas)
```

Em `backend/integracao_module/service.py:98`, passe a origem:
```python
    inseridas = input_service.criar_notas(novas, usuario=usuario, origem="coffee")
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_input_module.py -k origem -v`
Expected: PASS (2 testes). Rode também a suíte do Input inteira para garantir
que a mudança de `_preparar_novas`/`salvar_em_massa` não regrediu:
`venv/Scripts/python -m pytest test_input_module.py -q` → todos PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/db.py backend/input_module/service.py backend/integracao_module/service.py backend/test_input_module.py
git commit -m "feat(input): coluna origem em notas + criar_notas(origem)"
```

---

### Task 2: `plano_movimentacoes` (carteira.db)

**Files:**
- Modify: `backend/carteira_module/db.py` (schema em `inicializar_banco` + função)
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `db.conectar`.
- Produces: tabela `plano_movimentacoes`; `db.registrar_movimentacao(conn, movimentos: list[dict]) -> None` — cada dict: `id_onr, numero_nota, acao, usuario, lote_id, mes_execucao, status_obra, snapshot(json str), movido_em`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k movimentacoes -v`
Expected: FAIL — `no such table: plano_movimentacoes` ou `registrar_movimentacao` inexistente.

- [ ] **Step 3: Write minimal implementation**

Em `backend/carteira_module/db.py`, dentro do `conn.executescript(...)` de
`inicializar_banco`, adicione a tabela (após `carteira_meta`):
```sql
        CREATE TABLE IF NOT EXISTS plano_movimentacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_onr INTEGER,
            numero_nota TEXT,
            acao TEXT,
            usuario TEXT,
            lote_id TEXT,
            mes_execucao TEXT,
            status_obra TEXT,
            snapshot TEXT,
            movido_em TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_mov_id_onr ON plano_movimentacoes(id_onr);
        CREATE INDEX IF NOT EXISTS ix_mov_lote ON plano_movimentacoes(lote_id);
```

E adicione a função ao final de `db.py`:
```python
def registrar_movimentacao(conn: sqlite3.Connection, movimentos: list[dict]) -> None:
    conn.executemany(
        "INSERT INTO plano_movimentacoes (id_onr, numero_nota, acao, usuario, "
        "lote_id, mes_execucao, status_obra, snapshot, movido_em) "
        "VALUES (:id_onr,:numero_nota,:acao,:usuario,:lote_id,:mes_execucao,"
        ":status_obra,:snapshot,:movido_em)",
        movimentos,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k movimentacoes -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/db.py backend/test_carteira_module.py
git commit -m "feat(carteira): tabela plano_movimentacoes + registrar_movimentacao"
```

---

### Task 3: `repository` — obter_muitas + listar_divergencias

**Files:**
- Modify: `backend/carteira_module/repository.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Produces:
  - `repository.obter_muitas(conn, id_onrs: list[int]) -> dict[int, dict]` — linhas cruas de `nota_carteira` por `id_onr`.
  - `repository.listar_divergencias(conn, numeros_no_plano: set[int]) -> list[dict]` — notas cujo `id_sap` casa no plano e estão `cancelada` ou tombstoned; cada item ganha `tipo_divergencia`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
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
```

(`_inserir` é o helper já existente no arquivo de teste, de Task 5 da Fase 1a.)

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "obter_muitas or divergencias" -v`
Expected: FAIL — funções inexistentes.

- [ ] **Step 3: Write minimal implementation**

Adicione ao final de `backend/carteira_module/repository.py`:
```python
def obter_muitas(conn, id_onrs: list[int]) -> dict:
    if not id_onrs:
        return {}
    marcadores = ", ".join(["?"] * len(id_onrs))
    linhas = conn.execute(
        f"SELECT * FROM nota_carteira WHERE id_onr IN ({marcadores})",
        [int(i) for i in id_onrs],
    ).fetchall()
    return {linha["id_onr"]: dict(linha) for linha in linhas}


def listar_divergencias(conn, numeros_no_plano: set[int]) -> list[dict]:
    _preparar_plano(conn, numeros_no_plano)
    linhas = conn.execute(
        "SELECT n.*, CASE WHEN n.status_sap = 'Cancelado' THEN 'cancelada' "
        "ELSE 'ausente_na_origem' END AS tipo_divergencia "
        "FROM nota_carteira n "
        "JOIN plano_atual p ON p.numero = CAST(n.id_sap AS INTEGER) "
        "WHERE n.sap_real = 1 AND "
        "(n.status_sap = 'Cancelado' OR n.ausente_na_origem_em IS NOT NULL)"
    ).fetchall()
    return [dict(l) for l in linhas]
```

Nota: `_preparar_plano` (TEMP TABLE `plano_atual`) já existe no arquivo,
criado na Fase 1a — reutilizado aqui.

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "obter_muitas or divergencias" -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/repository.py backend/test_carteira_module.py
git commit -m "feat(carteira): repository obter_muitas + listar_divergencias"
```

---

### Task 4: `movimentacao.py` — mapa + preview

**Files:**
- Create: `backend/carteira_module/movimentacao.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `repository.obter_muitas`, `input_service.NovaNota`, `input_db.obter_nota_plano`, `input_config.PRIORIDADES`.
- Produces:
  - `movimentacao.mapear_nova_nota(nota: dict, campos_usuario: dict) -> NovaNota`
  - `movimentacao.avisos(nota: dict) -> list[str]`
  - `movimentacao.preview(id_onrs: list[int]) -> list[dict]` — por nota: `{id_onr, numero_nota, movivel, motivo_bloqueio, proposta, avisos}`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k preview -v`
Expected: FAIL — `No module named 'carteira_module.movimentacao'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/carteira_module/movimentacao.py`:
```python
"""Movimentacao carteira -> plano do Input. Espelha integracao_module para a
carteira; funila por input_service.criar_notas (nao acopla os modulos)."""
import datetime
import json
import uuid

from carteira_module import db, repository
from input_module import config as input_config
from input_module import db as input_db
from input_module.service import NovaNota

DE_PARA_PRIORIDADE = {i: input_config.PRIORIDADES[i - 1] for i in range(1, 7)}
PRIORIDADE_PADRAO = "Programável"
STATUS_NOTA_INICIAL = "01 Sem providência"
CAMPOS_MANUAIS = ("Mes_Execucao_Planejado", "Status_Obra", "Observacao", "Check")


def _prioridade(valor) -> str:
    try:
        return DE_PARA_PRIORIDADE.get(int(valor), PRIORIDADE_PADRAO)
    except (TypeError, ValueError):
        return PRIORIDADE_PADRAO


def _numero(nota: dict) -> int:
    return int(nota["id_sap"])


def proposta(nota: dict) -> dict:
    return {
        "Numero_Nota": _numero(nota),
        "Conjunto": nota.get("conjunto") or "-",
        "Local_Instalacao": nota.get("local_instalacao") or "-",
        "Circuito": nota.get("alimentador") or "-",
        "Prioridade_Nota": _prioridade(nota.get("prioridade")),
        "Planejado_DDPM": float(nota.get("quantidade") or 0),
        "Status_Nota": STATUS_NOTA_INICIAL,
        "Data_Envio_Projeto": datetime.date.today().strftime("%d/%m/%Y"),
    }


def avisos(nota: dict) -> list[str]:
    saida = []
    try:
        tem_de_para = int(nota.get("prioridade")) in DE_PARA_PRIORIDADE
    except (TypeError, ValueError):
        tem_de_para = False
    if not tem_de_para:
        saida.append(f"Prioridade {nota.get('prioridade')!r} fora do de-para (1-6); "
                     f"usando '{PRIORIDADE_PADRAO}'.")
    if not (nota.get("local_instalacao") or "").strip():
        saida.append("Local de instalação vazio na carteira.")
    if not nota.get("quantidade_valida"):
        saida.append("Quantidade sem valor válido (Planejado_DDPM pode sair 0/sentinela).")
    return saida


def mapear_nova_nota(nota: dict, campos_usuario: dict) -> NovaNota:
    base = proposta(nota)
    manuais = {c: campos_usuario[c] for c in CAMPOS_MANUAIS if c in campos_usuario}
    return NovaNota(**{**base, **manuais})


def _motivo_bloqueio(nota: dict) -> str | None:
    if not nota.get("sap_real"):
        return "Nota sem SAP real (pendente/sem SAP) — não movível."
    if nota.get("ausente_na_origem_em"):
        return "Nota ausente na origem (tombstone) — não movível."
    if input_db.obter_nota_plano(_numero(nota)) is not None:
        return "Nota já está no plano."
    return None


def preview(id_onrs: list[int]) -> list[dict]:
    conn = db.conectar()
    try:
        achadas = repository.obter_muitas(conn, id_onrs)
    finally:
        conn.close()
    resultado = []
    for id_onr in id_onrs:
        nota = achadas.get(id_onr)
        if nota is None:
            resultado.append({"id_onr": id_onr, "numero_nota": None,
                              "movivel": False,
                              "motivo_bloqueio": "Nota não está na projeção da carteira.",
                              "proposta": None, "avisos": []})
            continue
        motivo = _motivo_bloqueio(nota)
        resultado.append({
            "id_onr": id_onr, "numero_nota": nota.get("id_sap"),
            "movivel": motivo is None, "motivo_bloqueio": motivo,
            "proposta": proposta(nota) if motivo is None else None,
            "avisos": avisos(nota),
        })
    return resultado
```

Nota: confirme que `input_module.config.PRIORIDADES` existe (é usado por
`integracao_module.mapping`); se o nome diferir, ajuste o import.

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k preview -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/movimentacao.py backend/test_carteira_module.py
git commit -m "feat(carteira): movimentacao (mapa carteira->NovaNota + preview)"
```

---

### Task 5: `movimentacao.py` — mover (all-or-nothing) + divergências

**Files:**
- Modify: `backend/carteira_module/movimentacao.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `input_service.criar_notas`, `db.registrar_movimentacao`, `input_db.listar_numeros_nota`, `repository.listar_divergencias`.
- Produces:
  - `movimentacao.mover_para_plano(id_onrs: list[int], campos_usuario: dict, usuario: str) -> dict` — `{inseridas, lote_id}`; all-or-nothing.
  - `movimentacao.MovimentacaoBloqueadaErro` (Exception).
  - `movimentacao.listar_divergencias() -> list[dict]`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "mover" -v`
Expected: FAIL — `mover_para_plano`/`MovimentacaoBloqueadaErro` inexistentes.

- [ ] **Step 3: Write minimal implementation**

Adicione a `backend/carteira_module/movimentacao.py`:
```python
class MovimentacaoBloqueadaErro(Exception):
    """Alguma nota do lote não é movível — lote abortado (all-or-nothing)."""


def mover_para_plano(id_onrs: list[int], campos_usuario: dict,
                     usuario: str) -> dict:
    from input_module import service as input_service
    prev = preview(id_onrs)
    bloqueadas = [p for p in prev if not p["movivel"]]
    if bloqueadas:
        detalhe = "; ".join(f"{p['id_onr']}: {p['motivo_bloqueio']}" for p in bloqueadas)
        raise MovimentacaoBloqueadaErro(detalhe)

    conn = db.conectar()
    try:
        achadas = repository.obter_muitas(conn, id_onrs)
    finally:
        conn.close()
    notas = [achadas[i] for i in id_onrs]
    novas = [mapear_nova_nota(n, campos_usuario) for n in notas]
    inseridas = input_service.criar_notas(novas, usuario=usuario, origem="carteira")

    lote_id = uuid.uuid4().hex[:12]
    agora = datetime.datetime.now().isoformat(timespec="seconds")
    movimentos = [{
        "id_onr": n["id_onr"], "numero_nota": n["id_sap"], "acao": "entrada",
        "usuario": usuario, "lote_id": lote_id,
        "mes_execucao": campos_usuario.get("Mes_Execucao_Planejado"),
        "status_obra": campos_usuario.get("Status_Obra"),
        "snapshot": json.dumps(campos_usuario, ensure_ascii=False),
        "movido_em": agora,
    } for n in notas]
    conn = db.conectar()
    try:
        db.registrar_movimentacao(conn, movimentos)
        conn.commit()
    finally:
        conn.close()
    return {"inseridas": inseridas, "lote_id": lote_id}


def listar_divergencias() -> list[dict]:
    numeros = input_db.listar_numeros_nota()
    conn = db.conectar()
    try:
        return repository.listar_divergencias(conn, numeros)
    finally:
        conn.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "mover or divergencias" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/movimentacao.py backend/test_carteira_module.py
git commit -m "feat(carteira): mover-para-plano em lote (all-or-nothing) + divergencias"
```

---

### Task 6: Rotas de movimentação

**Files:**
- Modify: `backend/carteira_module/routes.py`
- Test: `backend/test_carteira_module.py` (append)

**Interfaces:**
- Consumes: `movimentacao`, `input_service.pos_escrita`, `input_module.routes.usuario_atual`, `NotasDuplicadasErro`.
- Produces: `POST /api/carteira/mover/preview`, `POST /api/carteira/mover-para-plano`, `GET /api/carteira/movimentacoes`, `GET /api/carteira/divergencias`.

- [ ] **Step 1: Write the failing test**

Append em `backend/test_carteira_module.py`:
```python
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

    mov = cli.post("/api/carteira/mover-para-plano",
                   json={"id_onrs": [1], "mes_execucao": "jul-2026",
                         "status_obra": "Planejada"})
    assert mov.status_code == 200 and mov.json()["inseridas"] == 1

    # mover de novo -> 409 (ja no plano)
    again = cli.post("/api/carteira/mover-para-plano",
                     json={"id_onrs": [1], "mes_execucao": "jul-2026"})
    assert again.status_code == 409

    assert cli.get("/api/carteira/movimentacoes").status_code == 200
    assert cli.get("/api/carteira/divergencias").status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -k "rotas_mover" -v`
Expected: FAIL — rotas inexistentes (404).

- [ ] **Step 3: Write minimal implementation**

Adicione a `backend/carteira_module/routes.py` (imports no topo + rotas no fim):
```python
from fastapi import BackgroundTasks, Depends
from pydantic import BaseModel, Field

from carteira_module import db, movimentacao
from input_module.routes import usuario_atual
from input_module.service import NotasDuplicadasErro, pos_escrita


class PreviewPedido(BaseModel):
    id_onrs: list[int] = Field(min_length=1)


class MoverPedido(BaseModel):
    id_onrs: list[int] = Field(min_length=1)
    mes_execucao: str
    status_obra: str = "-"
    observacao: str | None = None
    check: str | None = None


@router.post("/mover/preview")
def mover_preview(pedido: PreviewPedido):
    return movimentacao.preview(pedido.id_onrs)


@router.post("/mover-para-plano")
def mover(pedido: MoverPedido, tasks: BackgroundTasks,
          usuario: str = Depends(usuario_atual)):
    campos = {"Mes_Execucao_Planejado": pedido.mes_execucao,
              "Status_Obra": pedido.status_obra}
    if pedido.observacao is not None:
        campos["Observacao"] = pedido.observacao
    if pedido.check is not None:
        campos["Check"] = pedido.check
    try:
        resultado = movimentacao.mover_para_plano(pedido.id_onrs, campos, usuario)
    except movimentacao.MovimentacaoBloqueadaErro as e:
        raise HTTPException(422, str(e))
    except NotasDuplicadasErro as e:
        raise HTTPException(409, str(e))
    pos_escrita(tasks)
    return resultado


@router.get("/movimentacoes")
def movimentacoes(id_onr: int | None = None):
    conn = db.conectar()
    try:
        if id_onr is not None:
            linhas = conn.execute(
                "SELECT * FROM plano_movimentacoes WHERE id_onr = ? "
                "ORDER BY id DESC", (id_onr,)).fetchall()
        else:
            linhas = conn.execute(
                "SELECT * FROM plano_movimentacoes ORDER BY id DESC LIMIT 200"
            ).fetchall()
    finally:
        conn.close()
    return [dict(l) for l in linhas]


@router.get("/divergencias")
def divergencias():
    return movimentacao.listar_divergencias()
```

Nota: `HTTPException` já está importado no topo de `routes.py` (Fase 1a). Se
o import de `Depends`/`BackgroundTasks` colidir com algo, unifique com o
import existente do `fastapi`.

- [ ] **Step 4: Run test to verify it passes**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py -v`
Expected: PASS (módulo inteiro).

- [ ] **Step 5: Commit**

```bash
git add backend/carteira_module/routes.py backend/test_carteira_module.py
git commit -m "feat(carteira): rotas mover/preview, mover-para-plano, movimentacoes, divergencias"
```

---

### Task 7: Documentação

**Files:**
- Modify: `docs/dev/10-backend-carteira-module.md`, `docs/dev/06-backend-input-module.md`

- [ ] **Step 1: Atualizar o manual da carteira**

Em `docs/dev/10-backend-carteira-module.md`, adicione uma seção
"Movimentação (Fase 2)" documentando: `movimentacao.py` (mapa
carteira→NovaNota, `preview`, `mover_para_plano` all-or-nothing,
`listar_divergencias`), `plano_movimentacoes`, as 4 rotas, a regra de
movível (sap_real + não-no-plano + não-tombstone + sem duplicata), e que
funila por `input_service.criar_notas(origem="carteira")` sem acoplar o
`integracao_module`.

- [ ] **Step 2: Documentar a coluna `origem` no Input**

Em `docs/dev/06-backend-input-module.md`, registre a coluna `origem`
(`manual`/`coffee`/`carteira`, `NULL` para legado) e o novo parâmetro
`criar_notas(..., origem="manual")`, citando os call-sites.

- [ ] **Step 3: Verificar suíte verde**

Run (de `backend/`): `venv/Scripts/python -m pytest test_carteira_module.py test_input_module.py -q`
Expected: PASS (carteira + input, sem regressão).

- [ ] **Step 4: Commit**

```bash
git add docs/dev/10-backend-carteira-module.md docs/dev/06-backend-input-module.md
git commit -m "docs(carteira): movimentacao (Fase 2) e coluna origem no Input"
```

---

## Self-Review

**Spec coverage (Fase 2 backend, §4–§10):**
- Coluna `origem` + `criar_notas(origem)` + call-sites → Task 1. ✓
- `plano_movimentacoes` → Task 2. ✓
- Mapa carteira→NovaNota + avisos + preview (movível/bloqueada) → Task 4. ✓
- Mover all-or-nothing + `plano_movimentacoes` + `criar_notas(origem="carteira")` → Task 5. ✓
- Divergências (cancelada + ausente, casando no plano) → Tasks 3/5. ✓
- Endpoints (preview/mover/movimentacoes/divergencias) + pos_escrita + HTTP → Task 6. ✓
- Docs → Task 7. ✓
- Fora de escopo (saída do plano, dashboard) → não implementado. ✓

**Placeholder scan:** sem TBD/TODO; código completo. As notas "confirme o
nome real da fixture/config" são instruções de robustez (nomes podem
variar), não placeholders de código.

**Type consistency:** `criar_notas(notas, usuario, origem="manual")` idêntico
entre Task 1 (def) e Task 5 (uso). `NovaNota` (input_service) usada em
`mapear_nova_nota`. `preview(id_onrs)->list[dict]` consumido por
`mover_para_plano` (Task 5) e rota (Task 6). `registrar_movimentacao(conn,
movimentos)` def em Task 2, uso em Task 5. `listar_divergencias` def em Task 3
(repository) e Task 5 (service wrapper) e Task 6 (rota). `obter_muitas` def
Task 3, uso Task 4/5.

**Escopo:** subsistema backend coeso (movimentação), sem UI — plano único.
Frontend é o plano 2b.
