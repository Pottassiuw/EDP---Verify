# COFFEE Operação Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir Gerar, Pendentes e Corrigidas por uma operação Kanban persistente, um inspector lateral completo e uma página Concluídas que separa corretamente geradas de corrigidas.

**Architecture:** O SQLite continua sendo a fonte local da nota e passa a persistir fila e snapshots dos jobs. Um serviço de operação concentra a máquina de estados; rotas e threads apenas validam, executam efeitos e registram transições. No frontend, React Query consome contratos tipados, enquanto seleção, filtros e inspector permanecem como estado local.

**Tech Stack:** FastAPI, Python, SQLite, pytest, React 18, TypeScript, Vite, Tailwind v4, Radix UI, React Query, Lucide e Sonner.

## Global Constraints

- Branch de trabalho: `codex/coffee-operacao-kanban`, baseada em `origin/develop`.
- Seguir `DESIGN.md` por meio dos tokens semânticos existentes; não usar cores arbitrárias nem gradientes.
- Preservar `Sistema`, `Claro`, `Escuro`, acentos verde/azul/índigo e densidades `compact`/`cozy`.
- Não editar `frontend/src/components/ui/`.
- Não adicionar dependências.
- Não usar `any`; preferir tipos explícitos ou `unknown`.
- Não permitir drag-and-drop: etapa do Kanban é estado de negócio.
- Manter as regras atuais de SAP temporário, classificação, origem e desarquivamento.
- Rotas FastAPI permanecem finas; SQL fica em `db.py`; máquina de estados fica no serviço.
- Componentes novos devem permanecer focados; alvo: até 200 linhas por arquivo.
- O repositório não possui test runner frontend; usar `npm run build` e QA manual sem introduzir dependência.
- Cada tarefa deve terminar com diff revisado, testes/build do seu escopo e commit próprio.

---

## File Map

### Backend

- Modify: `backend/coffee_module/db.py` — migrações e repositório da fila/operações.
- Create: `backend/coffee_module/operation_service.py` — máquina de estados e composição do quadro.
- Modify: `backend/coffee_module/jobs.py` — snapshots persistidos e integração com a fila.
- Modify: `backend/coffee_module/routes.py` — contratos `/operacao`.
- Modify: `backend/test_coffee_module.py` — regressão dos filtros já existentes.
- Create: `backend/test_coffee_operations.py` — testes focados em persistência, estados, jobs e rotas.

### Frontend

- Modify: `frontend/src/types.ts` — nova navegação COFFEE e filtro de conclusão.
- Modify: `frontend/src/App.tsx` — migração da subseção persistida e handoff de Relatórios.
- Modify: `frontend/src/features/coffee/coffee-hub.tsx` — nova arquitetura de informação.
- Modify: `frontend/src/features/coffee/types.ts` — contratos do quadro e dos jobs.
- Create: `frontend/src/features/coffee/format.ts` — formatação compartilhada de datas relativas.
- Create: `frontend/src/features/coffee/operacao/operacao-api.ts` — HTTP tipado.
- Create: `frontend/src/features/coffee/operacao/use-coffee-operacao.ts` — queries e mutations.
- Create: `frontend/src/features/coffee/operacao/coffee-operacao.tsx` — container da página.
- Create: `frontend/src/features/coffee/operacao/components/operacao-composer.tsx`.
- Create: `frontend/src/features/coffee/operacao/components/operacao-kanban.tsx`.
- Create: `frontend/src/features/coffee/operacao/components/operacao-column.tsx`.
- Create: `frontend/src/features/coffee/operacao/components/nota-operacao-card.tsx`.
- Create: `frontend/src/features/coffee/operacao/components/operacao-batch-bar.tsx`.
- Create: `frontend/src/features/coffee/components/coffee-nota-inspector.tsx`.
- Create: `frontend/src/features/coffee/components/nota-summary.tsx`.
- Create: `frontend/src/features/coffee/components/nota-activity.tsx`.
- Create: `frontend/src/features/coffee/use-coffee-portal-theme.ts`.
- Modify: `frontend/src/features/coffee/confirm-modal.tsx` — tokens no portal.
- Modify: `frontend/src/features/coffee/mover-plano-modal.tsx` — tokens no portal.
- Modify: `frontend/src/components/branded/mes-execucao-picker.tsx` — repassar tokens opcionais ao Select portalizado.
- Create: `frontend/src/features/coffee/concluidas/concluidas-api.ts`.
- Create: `frontend/src/features/coffee/concluidas/use-coffee-concluidas.ts`.
- Create: `frontend/src/features/coffee/concluidas/coffee-concluidas.tsx`.
- Create: `frontend/src/features/coffee/concluidas/concluidas-utils.ts`.
- Create: `frontend/src/features/coffee/concluidas/components/concluidas-toolbar.tsx`.
- Create: `frontend/src/features/coffee/concluidas/components/concluidas-list.tsx`.
- Modify: `frontend/src/features/coffee/use-coffee-logs.ts` — migrar consulta por nota para React Query.
- Delete after migration: `coffee-geradas.tsx`, `coffee-corrigidas.tsx`,
  `coffee-pendentes.tsx`, `coffee-gerar-modal.tsx`, `revisar-nota-sheet.tsx`,
  `coffee-log-drawer.tsx` e `coffee-notas-table.tsx`.

---

### Task 1: Corrigir a semântica de Geradas e Concluídas

**Files:**
- Modify: `backend/coffee_module/db.py:169-183`
- Modify: `backend/test_coffee_module.py`

**Interfaces:**
- Produces: `db.listar_notas(status)` com `gerada`, `corrigida` e `concluida` literais.
- Consumes: tabela `notas_coffee` existente.

- [ ] **Step 1: Escrever o teste de separação**

Adicionar ao fim de `backend/test_coffee_module.py`:

```python
def test_listar_notas_separa_geradas_corrigidas_e_concluidas(coffee_tmp):
    from coffee_module import db

    db.upsert_nota(101, 17100101, {"id_sap": 17100101})
    db.upsert_nota(202, 10000000, {"id_sap": 10000000})
    db.definir_origem(202, "verificar")
    db.upsert_nota(202, 17100202, {"id_sap": 17100202})

    assert [n["pk"] for n in db.listar_notas("gerada")] == [101]
    assert [n["pk"] for n in db.listar_notas("corrigida")] == [202]
    assert {n["pk"] for n in db.listar_notas("concluida")} == {101, 202}
```

- [ ] **Step 2: Confirmar que o teste falha**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_module.py::test_listar_notas_separa_geradas_corrigidas_e_concluidas -v
```

Expected: FAIL porque `status="gerada"` ainda inclui a nota 202 e
`status="concluida"` ainda não é reconhecido.

- [ ] **Step 3: Implementar os filtros literais**

Substituir o bloco de status em `db.listar_notas` por:

```python
    if status == "a_gerar":
        clausulas.append("a_gerar = 1")
    elif status == "concluida":
        clausulas.append("classificacao IN ('gerada', 'corrigida')")
    elif status in {"gerada", "corrigida", "pendente", "nao_gerada"}:
        clausulas.append("classificacao = ?")
        params.append(status)
    elif status:
        clausulas.append("1 = 0")
```

- [ ] **Step 4: Rodar teste focal e regressão do módulo**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_module.py::test_listar_notas_separa_geradas_corrigidas_e_concluidas -v
python -m pytest test_coffee_module.py -q
```

Expected: teste focal PASS; suíte COFFEE PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "fix(coffee): separate completed classifications"
```

---

### Task 2: Persistir fila operacional e snapshots de jobs

**Files:**
- Modify: `backend/coffee_module/db.py:44-107`
- Create: `backend/test_coffee_operations.py`

**Interfaces:**
- Produces:
  - `criar_operacao(operacao_id: str, tipo: str, total: int) -> dict`
  - `salvar_operacao(operacao_id: str, snapshot: dict) -> None`
  - `obter_operacao(operacao_id: str) -> dict | None`
  - `listar_operacoes_ativas() -> list[dict]`
  - `upsert_item_operacao(...) -> dict`
  - `listar_itens_operacao() -> list[dict]`
  - `remover_item_operacao(nota_pk: int) -> None`
  - `interromper_operacoes_em_andamento() -> None`
- Consumes: `get_db_connection()` e `notas_coffee`.

- [ ] **Step 1: Criar fixture e testes do repositório**

Criar `backend/test_coffee_operations.py`:

```python
import pytest

from coffee_module import config, db


@pytest.fixture
def coffee_operation_tmp(monkeypatch, tmp_path):
    monkeypatch.setenv("COFFEE_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(config, "COFFEE_API_KEY", "fake-key")
    monkeypatch.setattr(config, "DELAY_BUSCA", 0)
    monkeypatch.setattr(config, "DELAY_GERACAO", 0)
    db.inicializar_banco()
    return tmp_path


def test_operacao_snapshot_roundtrip(coffee_operation_tmp):
    criado = db.criar_operacao("job-1", "consulta", 2)
    assert criado["estado"] == "rodando"
    db.salvar_operacao("job-1", {
        **criado,
        "feitas": 1,
        "erros": [{"pk": 99, "msg": "timeout"}],
    })
    salvo = db.obter_operacao("job-1")
    assert salvo is not None
    assert salvo["feitas"] == 1
    assert salvo["erros"][0]["pk"] == 99


def test_fila_operacao_canonicaliza_por_pk(coffee_operation_tmp):
    db.upsert_item_operacao(entrada_id=777, etapa="fila", origem="avulsa")
    db.upsert_item_operacao(
        entrada_id=888,
        nota_pk=777,
        etapa="pronta",
        origem="verificar",
    )
    itens = db.listar_itens_operacao()
    assert len(itens) == 1
    assert itens[0]["nota_pk"] == 777
    assert itens[0]["etapa"] == "pronta"
    assert itens[0]["origem"] == "avulsa"


def test_recovery_interrompe_job_e_retorna_processando_para_pronta(
    coffee_operation_tmp,
):
    db.criar_operacao("job-2", "geracao", 1)
    db.upsert_item_operacao(
        entrada_id=777,
        nota_pk=777,
        etapa="processando",
        origem="avulsa",
        operacao_id="job-2",
    )
    db.interromper_operacoes_em_andamento()
    assert db.obter_operacao("job-2")["estado"] == "interrompida"
    item = db.listar_itens_operacao()[0]
    assert item["etapa"] == "pronta"
    assert item["erro"] == "Operação interrompida; reconsulte antes de tentar novamente."
```

- [ ] **Step 2: Confirmar falha por interfaces ausentes**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_operations.py -v
```

Expected: FAIL com `AttributeError` para `criar_operacao`.

- [ ] **Step 3: Adicionar as duas tabelas e índices**

Em `db.inicializar_banco`, antes do `commit`, executar:

```python
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS coffee_operacoes (
            id              TEXT PRIMARY KEY,
            tipo            TEXT NOT NULL,
            estado          TEXT NOT NULL,
            total           INTEGER NOT NULL,
            feitas          INTEGER NOT NULL DEFAULT 0,
            resultado_json  TEXT NOT NULL DEFAULT '{"erros":[]}',
            iniciado_em     TEXT NOT NULL,
            atualizado_em   TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS coffee_fila_operacao (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            entrada_id     INTEGER NOT NULL UNIQUE,
            nota_pk        INTEGER UNIQUE,
            etapa          TEXT NOT NULL,
            origem         TEXT,
            operacao_id    TEXT,
            erro           TEXT,
            criado_em      TEXT NOT NULL,
            atualizado_em  TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_fila_etapa "
        "ON coffee_fila_operacao(etapa)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_fila_operacao "
        "ON coffee_fila_operacao(operacao_id)"
    )
```

- [ ] **Step 4: Implementar serialização das operações**

Adicionar a `db.py`:

```python
_ETAPAS_OPERACAO = {"fila", "pronta", "processando", "aguardando_sap"}


def criar_operacao(operacao_id: str, tipo: str, total: int) -> dict:
    agora = datetime.datetime.now().isoformat()
    snapshot = {
        "id": operacao_id,
        "tipo": tipo,
        "estado": "rodando",
        "total": total,
        "feitas": 0,
        "erros": [],
        "iniciado_em": agora,
        "atualizado_em": agora,
    }
    conn = get_db_connection()
    conn.execute(
        """
        INSERT INTO coffee_operacoes
            (id, tipo, estado, total, feitas, resultado_json,
             iniciado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            operacao_id, tipo, "rodando", total, 0,
            json.dumps({"erros": []}, ensure_ascii=False),
            agora, agora,
        ),
    )
    conn.commit()
    conn.close()
    return snapshot


def salvar_operacao(operacao_id: str, snapshot: dict) -> None:
    agora = datetime.datetime.now().isoformat()
    extras = {
        chave: valor
        for chave, valor in snapshot.items()
        if chave not in {
            "id", "tipo", "estado", "total", "feitas",
            "iniciado_em", "atualizado_em",
        }
    }
    conn = get_db_connection()
    conn.execute(
        """
        UPDATE coffee_operacoes
        SET estado = ?, feitas = ?, resultado_json = ?, atualizado_em = ?
        WHERE id = ?
        """,
        (
            snapshot["estado"],
            snapshot["feitas"],
            json.dumps(extras, ensure_ascii=False, default=str),
            agora,
            operacao_id,
        ),
    )
    conn.commit()
    conn.close()


def obter_operacao(operacao_id: str) -> dict | None:
    conn = get_db_connection()
    row = conn.execute(
        """
        SELECT id, tipo, estado, total, feitas, resultado_json,
               iniciado_em, atualizado_em
        FROM coffee_operacoes WHERE id = ?
        """,
        (operacao_id,),
    ).fetchone()
    conn.close()
    if row is None:
        return None
    extras = json.loads(row[5]) if row[5] else {}
    return {
        "id": row[0],
        "tipo": row[1],
        "estado": row[2],
        "total": row[3],
        "feitas": row[4],
        **extras,
        "iniciado_em": row[6],
        "atualizado_em": row[7],
    }


def listar_operacoes_ativas() -> list[dict]:
    conn = get_db_connection()
    ids = conn.execute(
        "SELECT id FROM coffee_operacoes WHERE estado = 'rodando' "
        "ORDER BY iniciado_em"
    ).fetchall()
    conn.close()
    return [
        operacao
        for (operacao_id,) in ids
        if (operacao := obter_operacao(operacao_id)) is not None
    ]
```

- [ ] **Step 5: Implementar fila canônica e recuperação**

Adicionar a `db.py`:

```python
def upsert_item_operacao(
    entrada_id: int,
    etapa: str,
    origem: str | None,
    nota_pk: int | None = None,
    operacao_id: str | None = None,
    erro: str | None = None,
) -> dict:
    if etapa not in _ETAPAS_OPERACAO:
        raise ValueError(f"Etapa inválida: {etapa}")
    agora = datetime.datetime.now().isoformat()
    conn = get_db_connection()
    existentes = conn.execute(
        """
        SELECT id, entrada_id, nota_pk, origem, criado_em
        FROM coffee_fila_operacao
        WHERE entrada_id = ?
           OR (? IS NOT NULL AND entrada_id = ?)
           OR (? IS NOT NULL AND nota_pk = ?)
        ORDER BY CASE WHEN nota_pk IS NOT NULL THEN 0 ELSE 1 END, id
        """,
        (entrada_id, nota_pk, nota_pk, nota_pk, nota_pk),
    ).fetchall()
    if existentes:
        alvo = existentes[0]
        ids_duplicados = [row[0] for row in existentes[1:]]
        if ids_duplicados:
            marcadores = ",".join("?" for _ in ids_duplicados)
            conn.execute(
                f"DELETE FROM coffee_fila_operacao WHERE id IN ({marcadores})",
                tuple(ids_duplicados),
            )
        entrada_final = alvo[1]
        origem_final = alvo[3] or origem
        conn.execute(
            """
            UPDATE coffee_fila_operacao
            SET entrada_id = ?, nota_pk = COALESCE(?, nota_pk),
                etapa = ?, origem = ?, operacao_id = ?,
                erro = ?, atualizado_em = ?
            WHERE id = ?
            """,
            (
                entrada_final, nota_pk, etapa, origem_final, operacao_id,
                erro, agora, alvo[0],
            ),
        )
    else:
        conn.execute(
            """
            INSERT INTO coffee_fila_operacao
                (entrada_id, nota_pk, etapa, origem, operacao_id, erro,
                 criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entrada_id, nota_pk, etapa, origem, operacao_id, erro,
                agora, agora,
            ),
        )
    conn.commit()
    conn.close()
    return next(
        item for item in listar_itens_operacao()
        if item["entrada_id"] == entrada_id or item["nota_pk"] == nota_pk
    )


def listar_itens_operacao() -> list[dict]:
    conn = get_db_connection()
    rows = conn.execute(
        """
        SELECT entrada_id, nota_pk, etapa, origem, operacao_id, erro,
               criado_em, atualizado_em
        FROM coffee_fila_operacao
        ORDER BY atualizado_em DESC
        """
    ).fetchall()
    conn.close()
    chaves = [
        "entrada_id", "nota_pk", "etapa", "origem",
        "operacao_id", "erro", "criado_em", "atualizado_em",
    ]
    return [dict(zip(chaves, row)) for row in rows]


def remover_item_operacao(nota_pk: int) -> None:
    conn = get_db_connection()
    conn.execute(
        "DELETE FROM coffee_fila_operacao "
        "WHERE nota_pk = ? OR entrada_id = ?",
        (nota_pk, nota_pk),
    )
    conn.commit()
    conn.close()


def interromper_operacoes_em_andamento() -> None:
    agora = datetime.datetime.now().isoformat()
    mensagem = (
        "Operação interrompida; reconsulte antes de tentar novamente."
    )
    conn = get_db_connection()
    conn.execute(
        """
        UPDATE coffee_operacoes
        SET estado = 'interrompida', atualizado_em = ?
        WHERE estado = 'rodando'
        """,
        (agora,),
    )
    conn.execute(
        """
        UPDATE coffee_fila_operacao
        SET etapa = 'pronta', erro = ?, operacao_id = NULL,
            atualizado_em = ?
        WHERE etapa = 'processando'
        """,
        (mensagem, agora),
    )
    conn.commit()
    conn.close()
```

Chamar `interromper_operacoes_em_andamento()` no final de
`inicializar_banco()`, depois de criar as tabelas e antes de fechar a conexão.
Para evitar abrir uma segunda conexão durante a migração, mover a chamada para
logo após `conn.close()`.

- [ ] **Step 6: Rodar testes e revisar idempotência**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_operations.py -v
python -m pytest test_coffee_module.py -q
```

Expected: ambos PASS; chamar `db.inicializar_banco()` duas vezes não cria erro.

- [ ] **Step 7: Commit**

```powershell
git add backend/coffee_module/db.py backend/test_coffee_operations.py
git commit -m "feat(coffee): persist operation queue"
```

---

### Task 3: Implementar a máquina de estados da operação

**Files:**
- Create: `backend/coffee_module/operation_service.py`
- Modify: `backend/test_coffee_operations.py`

**Interfaces:**
- Consumes: funções de fila de Task 2, `db.upsert_nota`, `db.obter_nota`.
- Produces:
  - `adicionar_entradas(ids, origem, operacao_id) -> None`
  - `aplicar_consulta(entrada_id, nota, origem, operacao_id) -> str | None`
  - `marcar_processando(pks, operacao_id) -> None`
  - `aplicar_geracao_sucesso(pk, operacao_id) -> None`
  - `aplicar_falha(pk, etapa_retorno, mensagem) -> None`
  - `listar_quadro() -> dict`

- [ ] **Step 1: Escrever testes das transições**

Acrescentar a `backend/test_coffee_operations.py`:

```python
from coffee_module import operation_service


def _nota(pk, sap, **fields):
    return {
        "pk": pk,
        "id_sap": sap,
        "arquivado": False,
        "local_instalacao": fields.get("local_instalacao"),
        "fields": {"id_sap": sap, **fields},
    }


def test_consulta_move_sem_sap_para_pronta(coffee_operation_tmp):
    operation_service.adicionar_entradas([101], "avulsa", "job-a")
    etapa = operation_service.aplicar_consulta(
        101, _nota(101, None, alimentador="ABC01"), "avulsa", "job-a"
    )
    assert etapa == "pronta"
    assert db.listar_itens_operacao()[0]["etapa"] == "pronta"


def test_consulta_move_placeholder_para_aguardando(coffee_operation_tmp):
    operation_service.adicionar_entradas([202], "verificar", "job-b")
    etapa = operation_service.aplicar_consulta(
        202, _nota(202, config.SAP_PENDENTE), "verificar", "job-b"
    )
    assert etapa == "aguardando_sap"


def test_consulta_remove_sap_real_do_quadro(coffee_operation_tmp):
    operation_service.adicionar_entradas([303], "avulsa", "job-c")
    etapa = operation_service.aplicar_consulta(
        303, _nota(303, 17300303), "avulsa", "job-c"
    )
    assert etapa is None
    assert db.listar_itens_operacao() == []


def test_falha_de_geracao_retorna_para_pronta(coffee_operation_tmp):
    operation_service.adicionar_entradas([404], "avulsa", "job-d")
    operation_service.aplicar_consulta(
        404, _nota(404, None), "avulsa", "job-d"
    )
    operation_service.marcar_processando([404], "job-e")
    operation_service.aplicar_falha(404, "pronta", "timeout")
    item = db.listar_itens_operacao()[0]
    assert item["etapa"] == "pronta"
    assert item["erro"] == "timeout"
```

- [ ] **Step 2: Confirmar falha por módulo ausente**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_operations.py -v
```

Expected: FAIL ao importar `operation_service`.

- [ ] **Step 3: Criar serviço com transições explícitas**

Criar `backend/coffee_module/operation_service.py`:

```python
"""Máquina de estados da página Operação do módulo COFFEE."""
from coffee_module import config, db


def etapa_da_classificacao(classificacao: str) -> str | None:
    if classificacao == "nao_gerada":
        return "pronta"
    if classificacao == "pendente":
        return "aguardando_sap"
    return None


def adicionar_entradas(
    ids: list[int],
    origem: str,
    operacao_id: str,
) -> None:
    for entrada_id in dict.fromkeys(ids):
        db.upsert_item_operacao(
            entrada_id=int(entrada_id),
            etapa="fila",
            origem=origem,
            operacao_id=operacao_id,
        )


def aplicar_consulta(
    entrada_id: int,
    nota: dict,
    origem: str,
    operacao_id: str | None,
) -> str | None:
    pk = int(nota["pk"])
    classificacao = db.upsert_nota(
        pk,
        nota["id_sap"],
        nota["fields"],
    )
    if db.origem_atual(pk) is None:
        db.definir_origem(pk, origem)
    etapa = etapa_da_classificacao(classificacao)
    if etapa is None:
        db.remover_item_operacao(pk)
        db.remover_item_operacao(int(entrada_id))
        return None
    db.upsert_item_operacao(
        entrada_id=int(entrada_id),
        nota_pk=pk,
        etapa=etapa,
        origem=origem,
        operacao_id=operacao_id,
    )
    db.marcar_gerar(pk, etapa == "pronta")
    return etapa


def marcar_processando(pks: list[int], operacao_id: str) -> None:
    itens = {item["nota_pk"]: item for item in db.listar_itens_operacao()}
    for pk in pks:
        item = itens.get(int(pk))
        if item is None or item["etapa"] != "pronta":
            raise ValueError(f"Nota {pk} não está pronta para gerar.")
        db.upsert_item_operacao(
            entrada_id=item["entrada_id"],
            nota_pk=int(pk),
            etapa="processando",
            origem=item["origem"],
            operacao_id=operacao_id,
        )


def aplicar_geracao_sucesso(pk: int, operacao_id: str) -> None:
    itens = {item["nota_pk"]: item for item in db.listar_itens_operacao()}
    item = itens.get(int(pk))
    if item is None:
        return
    db.upsert_item_operacao(
        entrada_id=item["entrada_id"],
        nota_pk=int(pk),
        etapa="aguardando_sap",
        origem=item["origem"],
        operacao_id=operacao_id,
    )
    db.marcar_gerar(int(pk), False)


def aplicar_falha(pk: int, etapa_retorno: str, mensagem: str) -> None:
    itens = {
        item["nota_pk"] or item["entrada_id"]: item
        for item in db.listar_itens_operacao()
    }
    item = itens.get(int(pk))
    if item is None:
        db.upsert_item_operacao(
            entrada_id=int(pk),
            etapa=etapa_retorno,
            origem="avulsa",
            erro=mensagem,
        )
        return
    db.upsert_item_operacao(
        entrada_id=item["entrada_id"],
        nota_pk=item["nota_pk"],
        etapa=etapa_retorno,
        origem=item["origem"],
        erro=mensagem,
    )


def listar_quadro() -> dict:
    notas = {nota["pk"]: nota for nota in db.listar_notas()}
    itens = []
    for item in db.listar_itens_operacao():
        itens.append({
            **item,
            "nota": notas.get(item["nota_pk"]),
        })
    contagens = {
        etapa: sum(1 for item in itens if item["etapa"] == etapa)
        for etapa in ("fila", "pronta", "processando", "aguardando_sap")
    }
    return {
        "itens": itens,
        "operacoes_ativas": db.listar_operacoes_ativas(),
        "contagens": contagens,
    }
```

- [ ] **Step 4: Adicionar normalização de `a_gerar` legado**

Adicionar ao serviço:

```python
def normalizar_fila_legada() -> None:
    ativos = {
        item["nota_pk"] or item["entrada_id"]
        for item in db.listar_itens_operacao()
    }
    for nota in db.listar_notas("a_gerar"):
        if nota["pk"] in ativos:
            continue
        etapa = etapa_da_classificacao(nota["classificacao"])
        if etapa is None:
            continue
        db.upsert_item_operacao(
            entrada_id=nota["pk"],
            nota_pk=nota["pk"],
            etapa=etapa,
            origem=nota.get("origem") or "verificar",
        )
```

Chamar `normalizar_fila_legada()` no início de `listar_quadro()`.

- [ ] **Step 5: Rodar testes**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_operations.py -v
python -m pytest test_coffee_module.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/coffee_module/operation_service.py backend/test_coffee_operations.py
git commit -m "feat(coffee): add operation state machine"
```

---

### Task 4: Tornar jobs persistentes e recuperáveis

**Files:**
- Modify: `backend/coffee_module/jobs.py`
- Modify: `backend/test_coffee_operations.py`

**Interfaces:**
- Consumes: repositório da Task 2 e serviço da Task 3.
- Produces:
  - `iniciar_consulta_operacao(ids, origem, trace) -> str`
  - `iniciar_geracao_operacao(pks, trace) -> str`
  - `iniciar_atualizacao_sap(pks, trace) -> str`
  - `obter_job(job_id)` compatível com o frontend atual.

- [ ] **Step 1: Escrever testes de persistência e recuperação**

Acrescentar:

```python
import time

from coffee_module import client, jobs


def _aguardar(job_id: str, limite: float = 2.0) -> dict:
    fim = time.time() + limite
    while time.time() < fim:
        job = jobs.obter_job(job_id)
        if job and job["estado"] != "rodando":
            return job
        time.sleep(0.01)
    raise TimeoutError(job_id)


def test_job_consulta_persiste_e_atualiza_quadro(
    coffee_operation_tmp,
    monkeypatch,
):
    monkeypatch.setattr(
        client,
        "buscar_nota",
        lambda ident: _nota(int(ident), None, alimentador="ABC01"),
    )
    job_id = jobs.iniciar_consulta_operacao([101], "avulsa")
    job = _aguardar(job_id)
    assert job["estado"] == "concluido"
    assert db.obter_operacao(job_id) is not None
    assert db.listar_itens_operacao()[0]["etapa"] == "pronta"


def test_job_atualizacao_remove_nota_quando_sap_fica_real(
    coffee_operation_tmp,
    monkeypatch,
):
    operation_service.adicionar_entradas([202], "verificar", "seed")
    operation_service.aplicar_consulta(
        202, _nota(202, config.SAP_PENDENTE), "verificar", "seed"
    )
    monkeypatch.setattr(
        client,
        "buscar_nota",
        lambda ident: _nota(int(ident), 17200202),
    )
    job_id = jobs.iniciar_atualizacao_sap([202])
    assert _aguardar(job_id)["estado"] == "concluido"
    assert db.listar_itens_operacao() == []
    assert db.listar_notas("corrigida")[0]["pk"] == 202
```

- [ ] **Step 2: Confirmar falha por funções ausentes**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_operations.py -v
```

Expected: FAIL em `iniciar_consulta_operacao`.

- [ ] **Step 3: Substituir `_JOBS` pelo snapshot persistido**

Em `jobs.py`, manter `_LOCK` e criar helpers:

```python
def _novo_job(tipo: str, total: int) -> tuple[str, dict]:
    job_id = uuid.uuid4().hex
    with _LOCK:
        snapshot = db.criar_operacao(job_id, tipo, total)
    return job_id, snapshot


def _salvar(job_id: str, snapshot: dict) -> None:
    with _LOCK:
        db.salvar_operacao(job_id, snapshot)


def _concluir(job_id: str, snapshot: dict) -> None:
    snapshot["estado"] = "parcial" if snapshot["erros"] else "concluida"
    _salvar(job_id, snapshot)


def obter_job(job_id: str):
    operacao = db.obter_operacao(job_id)
    if operacao is None:
        return None
    estado_api = {
        "concluida": "concluido",
        "parcial": "concluido",
        "interrompida": "interrompido",
    }.get(operacao["estado"], operacao["estado"])
    return {**operacao, "estado": estado_api}
```

Remover `_JOBS`. Em cada loop existente, alterar o snapshot local e chamar
`_salvar` depois de incrementar `feitas`; no final, chamar `_concluir`.
Preservar campos extras (`arquivadas`, `corrigidas`, `divergentes`, `geradas`)
no mesmo dicionário.

- [ ] **Step 4: Implementar consulta operacional**

Adicionar:

```python
def iniciar_consulta_operacao(
    ids: list[int],
    origem: str = "avulsa",
    trace: str | None = None,
) -> str:
    job_id, snapshot = _novo_job("consulta", len(ids))
    operation_service.adicionar_entradas(ids, origem, job_id)
    threading.Thread(
        target=_rodar_consulta_operacao,
        args=(job_id, snapshot, list(ids), origem, trace),
        daemon=True,
    ).start()
    return job_id


def _rodar_consulta_operacao(
    job_id: str,
    snapshot: dict,
    ids: list[int],
    origem: str,
    trace: str | None,
) -> None:
    db.definir_trace(trace)
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            operation_service.aplicar_consulta(
                int(ident), nota, origem, job_id
            )
        except Exception as exc:  # noqa: BLE001
            mensagem = str(exc)
            operation_service.aplicar_falha(int(ident), "fila", mensagem)
            snapshot["erros"].append({"pk": ident, "msg": mensagem})
        finally:
            snapshot["feitas"] += 1
            _salvar(job_id, snapshot)
        time.sleep(config.DELAY_BUSCA)
    _concluir(job_id, snapshot)
```

- [ ] **Step 5: Integrar geração e atualização ao quadro**

Antes de iniciar a thread de geração operacional:

```python
def iniciar_geracao_operacao(
    pks: list[int],
    trace: str | None = None,
) -> str:
    job_id, snapshot = _novo_job("geracao", len(pks))
    operation_service.marcar_processando(pks, job_id)
    threading.Thread(
        target=_rodar_geracao_operacao,
        args=(job_id, snapshot, list(pks), trace),
        daemon=True,
    ).start()
    return job_id
```

Extrair a chamada externa compartilhada:

```python
def _executar_geracao(ident: int) -> dict:
    nota = client.buscar_nota(ident)
    db.upsert_nota(nota["pk"], nota["id_sap"], nota["fields"])
    pk = nota["pk"]
    sap = nota["id_sap"]
    if nota["arquivado"] and sap and sap != config.SAP_PENDENTE:
        local = nota["local_instalacao"]
        db.registrar_log(
            "acao_usuario",
            "geracao_ignorada_arquivada",
            pk,
            {"id_sap": sap, "local_instalacao": local},
            True,
        )
        db.marcar_gerar(pk, False)
        return {
            "pk": pk,
            "aguardando_sap": False,
            "arquivada": {
                "pk": pk,
                "id_sap": sap,
                "local_instalacao": local,
            },
        }
    if sap and sap != config.SAP_PENDENTE:
        db.registrar_log(
            "acao_usuario",
            "geracao_ignorada_sap_real",
            pk,
            {"id_sap": sap},
            True,
        )
        db.marcar_gerar(pk, False)
        return {
            "pk": pk,
            "aguardando_sap": False,
            "arquivada": None,
        }
    client.definir_sap(ident, config.SAP_PENDENTE)
    client.desarquivar(ident)
    atualizada = client.buscar_nota(ident)
    db.upsert_nota(
        atualizada["pk"],
        atualizada["id_sap"],
        atualizada["fields"],
    )
    db.marcar_gerar(atualizada["pk"], False)
    if db.origem_atual(atualizada["pk"]) is None:
        db.definir_origem(atualizada["pk"], "avulsa")
    return {
        "pk": atualizada["pk"],
        "aguardando_sap": True,
        "arquivada": None,
    }


def _rodar_geracao_operacao(
    job_id: str,
    snapshot: dict,
    pks: list[int],
    trace: str | None,
) -> None:
    db.definir_trace(trace)
    for ident in pks:
        try:
            resultado = _executar_geracao(ident)
            if resultado["aguardando_sap"]:
                operation_service.aplicar_geracao_sucesso(
                    resultado["pk"], job_id
                )
            else:
                db.remover_item_operacao(resultado["pk"])
            if resultado["arquivada"] is not None:
                snapshot.setdefault("arquivadas", []).append(
                    resultado["arquivada"]
                )
        except Exception as exc:  # noqa: BLE001
            mensagem = str(exc)
            operation_service.aplicar_falha(
                int(ident), "pronta", mensagem
            )
            snapshot["erros"].append({"pk": ident, "msg": mensagem})
        finally:
            snapshot["feitas"] += 1
            _salvar(job_id, snapshot)
        time.sleep(config.DELAY_GERACAO)
    _concluir(job_id, snapshot)
```

Implementar atualização:

```python
def iniciar_atualizacao_sap(
    pks: list[int],
    trace: str | None = None,
) -> str:
    job_id, snapshot = _novo_job("atualizacao_sap", len(pks))
    threading.Thread(
        target=_rodar_atualizacao_sap,
        args=(job_id, snapshot, list(pks), trace),
        daemon=True,
    ).start()
    return job_id


def _rodar_atualizacao_sap(
    job_id: str,
    snapshot: dict,
    pks: list[int],
    trace: str | None,
) -> None:
    db.definir_trace(trace)
    for pk in pks:
        try:
            nota = client.buscar_nota(pk)
            origem = db.origem_atual(nota["pk"]) or "verificar"
            operation_service.aplicar_consulta(
                pk, nota, origem, job_id
            )
        except Exception as exc:  # noqa: BLE001
            mensagem = str(exc)
            operation_service.aplicar_falha(
                pk, "aguardando_sap", mensagem
            )
            snapshot["erros"].append({"pk": pk, "msg": mensagem})
        finally:
            snapshot["feitas"] += 1
            _salvar(job_id, snapshot)
        time.sleep(config.DELAY_BUSCA)
    _concluir(job_id, snapshot)
```

- [ ] **Step 6: Manter compatibilidade dos jobs existentes**

Substituir os starters existentes por:

```python
def iniciar_busca(ids: list, trace: str | None = None) -> str:
    job_id, snapshot = _novo_job("busca", len(ids))
    threading.Thread(
        target=_rodar,
        args=(job_id, snapshot, list(ids), trace),
        daemon=True,
    ).start()
    return job_id


def iniciar_geracao(
    ids: list,
    justificativa: str | None = None,
    trace: str | None = None,
) -> str:
    job_id, snapshot = _novo_job("geracao_legada", len(ids))
    threading.Thread(
        target=_rodar_geracao,
        args=(job_id, snapshot, list(ids), trace),
        daemon=True,
    ).start()
    return job_id


def iniciar_correcao_local(
    itens: list,
    gerar_apos: bool = False,
    trace: str | None = None,
) -> str:
    job_id, snapshot = _novo_job("correcao_local", len(itens))
    snapshot.update({
        "corrigidas": [],
        "ja_corrigidas": [],
        "divergentes": [],
        "geradas": [],
    })
    _salvar(job_id, snapshot)
    threading.Thread(
        target=_rodar_correcao_local,
        args=(
            job_id,
            snapshot,
            [dict(item) for item in itens],
            gerar_apos,
            trace,
        ),
        daemon=True,
    ).start()
    return job_id
```

Alterar as assinaturas dos workers para receber `snapshot` imediatamente após
`job_id`. Em `_rodar`, substituir o corpo por:

```python
def _rodar(
    job_id: str,
    snapshot: dict,
    ids: list,
    trace: str | None = None,
) -> None:
    db.definir_trace(trace)
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["fields"])
        except Exception as exc:  # noqa: BLE001
            try:
                db.registrar_erro(int(ident), str(exc))
            except (ValueError, TypeError):
                pass
            snapshot["erros"].append({"pk": ident, "msg": str(exc)})
        finally:
            snapshot["feitas"] += 1
            _salvar(job_id, snapshot)
        time.sleep(config.DELAY_BUSCA)
    _concluir(job_id, snapshot)
```

Substituir `_rodar_geracao` por:

```python
def _rodar_geracao(
    job_id: str,
    snapshot: dict,
    ids: list,
    trace: str | None = None,
) -> None:
    db.definir_trace(trace)
    for ident in ids:
        try:
            resultado = _executar_geracao(ident)
            if resultado["arquivada"] is not None:
                snapshot.setdefault("arquivadas", []).append(
                    resultado["arquivada"]
                )
        except Exception as exc:  # noqa: BLE001
            snapshot["erros"].append({"pk": ident, "msg": str(exc)})
        finally:
            snapshot["feitas"] += 1
            _salvar(job_id, snapshot)
        time.sleep(config.DELAY_GERACAO)
    _concluir(job_id, snapshot)
```

Em `_rodar_correcao_local` e `_gerar_apos_correcao`, substituir cada acesso
`_JOBS[job_id]["campo"]` por `snapshot["campo"]`; salvar no `finally` de cada
item e chamar `_concluir` no fim. O estado devolvido por `obter_job` permanece
`rodando` ou `concluido` para sucesso/parcial.

Alterar a assinatura para:

```python
def _gerar_apos_correcao(
    snapshot: dict,
    ident: int,
    nota: dict,
) -> None:
```

e a chamada para:

```python
_gerar_apos_correcao(snapshot, ident, nota)
```

- [ ] **Step 7: Rodar testes focais e regressão**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_operations.py -v
python -m pytest test_coffee_module.py -q
```

Expected: PASS, incluindo jobs de busca, geração e correção local existentes.

- [ ] **Step 8: Commit**

```powershell
git add backend/coffee_module/jobs.py backend/test_coffee_operations.py
git commit -m "feat(coffee): persist job progress"
```

---

### Task 5: Expor a API de Operação

**Files:**
- Modify: `backend/coffee_module/routes.py:20-84`
- Modify: `backend/test_coffee_operations.py`

**Interfaces:**
- Consumes: `operation_service.listar_quadro` e starters da Task 4.
- Produces:
  - `GET /api/coffee/operacao`
  - `POST /api/coffee/operacao/consultar`
  - `POST /api/coffee/operacao/gerar`
  - `POST /api/coffee/operacao/atualizar-sap`
  - `POST /api/coffee/operacao/remover`

- [ ] **Step 1: Escrever testes das rotas**

Adicionar fixture e testes:

```python
from fastapi.testclient import TestClient


@pytest.fixture
def operation_client(coffee_operation_tmp, monkeypatch):
    from coffee_module import routes
    from main import app

    routes._estado["inicializado"] = False
    monkeypatch.setattr(
        client,
        "buscar_nota",
        lambda ident: _nota(int(ident), None, alimentador="ABC01"),
    )
    return TestClient(app)


def test_rotas_operacao_consultar_e_listar(operation_client):
    resposta = operation_client.post(
        "/api/coffee/operacao/consultar",
        json={"ids": [101]},
    )
    assert resposta.status_code == 200
    _aguardar(resposta.json()["job_id"])
    quadro = operation_client.get("/api/coffee/operacao").json()
    assert quadro["contagens"]["pronta"] == 1
    assert quadro["itens"][0]["nota"]["pk"] == 101


def test_rota_operacao_rejeita_lista_vazia(operation_client):
    resposta = operation_client.post(
        "/api/coffee/operacao/gerar",
        json={"ids": []},
    )
    assert resposta.status_code == 400


def test_rota_operacao_remover_exige_justificativa(operation_client):
    resposta = operation_client.post(
        "/api/coffee/operacao/remover",
        json={"ids": [101], "justificativa": ""},
    )
    assert resposta.status_code == 400


def test_rota_local_reconsulta_e_atualiza_o_quadro(
    operation_client,
    monkeypatch,
):
    local = {"value": "ABC01001"}
    monkeypatch.setattr(
        client,
        "alterar_local",
        lambda ident, value: local.update(value=value),
    )
    monkeypatch.setattr(
        client,
        "buscar_nota",
        lambda ident: _nota(
            int(ident),
            None,
            local_instalacao=local["value"],
            alimentador="ABC01",
        ),
    )
    operation_service.adicionar_entradas([101], "avulsa", "setup")
    operation_service.aplicar_consulta(
        101,
        _nota(101, None, local_instalacao="ANTIGO"),
        "avulsa",
        "setup",
    )

    resposta = operation_client.post(
        "/api/coffee/local-instalacao",
        json={"id": 101, "local": "XYZ02002"},
    )

    assert resposta.status_code == 200
    quadro = operation_client.get("/api/coffee/operacao").json()
    assert (
        quadro["itens"][0]["nota"]["dados_json"]["local_instalacao"]
        == "XYZ02002"
    )
```

- [ ] **Step 2: Confirmar 404/422 antes da implementação**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_operations.py::test_rotas_operacao_consultar_e_listar -v
```

Expected: FAIL porque `/api/coffee/operacao/consultar` não existe.

- [ ] **Step 3: Adicionar modelos de request**

Em `routes.py`:

```python
class OperacaoIdsPedido(BaseModel):
    ids: list[int]


class OperacaoRemoverPedido(BaseModel):
    ids: list[int]
    justificativa: str


def _validar_ids(ids: list[int]) -> list[int]:
    unicos = list(dict.fromkeys(ids))
    if not unicos:
        raise HTTPException(status_code=400, detail="Lista de IDs vazia.")
    if any(ident <= 0 for ident in unicos):
        raise HTTPException(status_code=400, detail="IDs devem ser positivos.")
    return unicos
```

- [ ] **Step 4: Implementar rotas finas**

Importar `operation_service` e adicionar:

```python
@router.get("/operacao")
def obter_operacao():
    _garantir_banco()
    return operation_service.listar_quadro()


@router.post("/operacao/consultar")
def consultar_operacao(pedido: OperacaoIdsPedido):
    _garantir_banco()
    ids = _validar_ids(pedido.ids)
    job_id = jobs.iniciar_consulta_operacao(
        ids, origem="avulsa", trace=db.trace_atual()
    )
    return {"job_id": job_id}


@router.post("/operacao/gerar")
def gerar_operacao(pedido: OperacaoIdsPedido):
    _garantir_banco()
    ids = _validar_ids(pedido.ids)
    try:
        job_id = jobs.iniciar_geracao_operacao(
            ids, trace=db.trace_atual()
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"job_id": job_id}


@router.post("/operacao/atualizar-sap")
def atualizar_sap_operacao(pedido: OperacaoIdsPedido):
    _garantir_banco()
    ids = _validar_ids(pedido.ids)
    return {
        "job_id": jobs.iniciar_atualizacao_sap(
            ids, trace=db.trace_atual()
        )
    }


@router.post("/operacao/remover")
def remover_operacao(pedido: OperacaoRemoverPedido):
    _garantir_banco()
    ids = _validar_ids(pedido.ids)
    justificativa = pedido.justificativa.strip()
    if not justificativa:
        raise HTTPException(
            status_code=400,
            detail="Justificativa obrigatória.",
        )
    for pk in ids:
        db.remover_item_operacao(pk)
        db.marcar_gerar(pk, False)
        db.registrar_log(
            "acao_usuario",
            "remover_fila_operacao",
            pk,
            {"justificativa": justificativa},
            True,
        )
    return {"ok": True, "removidas": len(ids)}
```

Substituir a rota existente `/local-instalacao` para que a edição não deixe o
SQLite e o card com o local anterior:

```python
@router.post("/local-instalacao")
def local_instalacao(pedido: LocalPedido):
    _garantir_banco()
    try:
        client.alterar_local(pedido.id, pedido.local)
    except Exception as exc:  # noqa: BLE001
        db.registrar_log(
            "acao_usuario",
            "alterar_local",
            pedido.id,
            {"id": pedido.id, "local": pedido.local},
            False,
        )
        raise HTTPException(
            status_code=502,
            detail="Não foi possível alterar o local na API COFFEE.",
        ) from exc
    try:
        nota = client.buscar_nota(pedido.id)
    except Exception as exc:  # noqa: BLE001
        db.registrar_log(
            "acao_usuario",
            "alterar_local",
            pedido.id,
            {"id": pedido.id, "local": pedido.local},
            False,
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "O local foi alterado na API COFFEE, mas a nota não pôde "
                "ser reconsultada. Tente consultar novamente."
            ),
        ) from exc

    item = next(
        (
            atual
            for atual in db.listar_itens_operacao()
            if atual["nota_pk"] == nota["pk"]
            or atual["entrada_id"] == pedido.id
        ),
        None,
    )
    origem = (item or {}).get("origem") or db.origem_atual(nota["pk"]) or "avulsa"
    operation_service.aplicar_consulta(
        pedido.id,
        nota,
        origem,
        None,
    )
    db.registrar_log(
        "acao_usuario",
        "alterar_local",
        nota["pk"],
        {"id": pedido.id, "local": pedido.local},
        True,
    )
    return {"ok": True}
```

- [ ] **Step 5: Integrar entrada da Verificar**

No caminho `pedido.a_gerar` de `/marcar-gerar`, guardar o retorno de
`db.upsert_nota` em `classificacao`, definir a origem e substituir a gravação
incondicional de `a_gerar` por:

```python
        etapa = operation_service.etapa_da_classificacao(classificacao)
        if etapa is None:
            db.remover_item_operacao(pk)
            db.marcar_gerar(pk, False)
        else:
            db.upsert_item_operacao(
                entrada_id=pk,
                nota_pk=pk,
                etapa=etapa,
                origem="verificar",
            )
            db.marcar_gerar(pk, etapa == "pronta")
```

No caminho `a_gerar=False`, chamar `db.remover_item_operacao(pk)` e
`db.marcar_gerar(pk, False)`. Remover a chamada comum
`db.marcar_gerar(pk, pedido.a_gerar)` do fim da rota para que SAP real nunca
seja recolocado na fila.

- [ ] **Step 6: Rodar testes**

Run:

```powershell
Set-Location backend
python -m pytest test_coffee_operations.py -v
python -m pytest test_coffee_module.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/coffee_module/routes.py backend/test_coffee_operations.py
git commit -m "feat(coffee): expose operation API"
```

---

### Task 6: Criar contratos, API e hooks React Query

**Files:**
- Modify: `frontend/src/features/coffee/types.ts`
- Create: `frontend/src/features/coffee/operacao/operacao-api.ts`
- Create: `frontend/src/features/coffee/operacao/use-coffee-operacao.ts`
- Create: `frontend/src/features/coffee/concluidas/concluidas-api.ts`
- Create: `frontend/src/features/coffee/concluidas/use-coffee-concluidas.ts`
- Modify: `frontend/src/features/coffee/use-coffee-logs.ts`

**Interfaces:**
- Consumes: API da Task 5 e `QueryClientProvider` existente.
- Produces:
  - `CoffeeOperacaoItem`, `CoffeeOperacaoQuadro`, `OperacaoEtapa`
  - `useCoffeeOperacao()`
  - `useCoffeeConcluidas()`
  - `useCoffeeNotaLogs(pk)`

- [ ] **Step 1: Adicionar tipos de domínio frontend**

Em `features/coffee/types.ts`:

```typescript
export type OperacaoEtapa =
  | "fila"
  | "pronta"
  | "processando"
  | "aguardando_sap";

export type OperacaoOrigem = "avulsa" | "verificar";

export interface CoffeeOperacaoItem {
  entrada_id: number;
  nota_pk: number | null;
  etapa: OperacaoEtapa;
  origem: OperacaoOrigem | null;
  operacao_id: string | null;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
  nota: CoffeeNota | null;
}

export interface CoffeeOperacaoQuadro {
  itens: CoffeeOperacaoItem[];
  operacoes_ativas: CoffeeJob[];
  contagens: Record<OperacaoEtapa, number>;
}
```

Expandir `CoffeeJob.estado`:

```typescript
estado: "rodando" | "concluido" | "interrompido";
```

Adicionar `id`, `tipo` e `atualizado_em` opcionais ao tipo para compatibilidade:

```typescript
id?: string;
tipo?: "consulta" | "geracao" | "atualizacao_sap" | string;
atualizado_em?: string;
```

- [ ] **Step 2: Criar API tipada de Operação**

Criar `operacao/operacao-api.ts`:

```typescript
import { BASE } from '../../../api';
import type {
  CoffeeJob,
  CoffeeOperacaoQuadro,
} from '../types';

interface JobResponse {
  job_id: string;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      detail?: string;
    };
    throw new Error(body.detail ?? `${init?.method ?? "GET"} ${url} -> ${response.status}`);
  }
  return response.json() as Promise<T>;
}

const postIds = (path: string, ids: number[]): Promise<JobResponse> =>
  json<JobResponse>(`${BASE}/coffee/operacao/${path}`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });

export const OperacaoApi = {
  quadro: (): Promise<CoffeeOperacaoQuadro> =>
    json(`${BASE}/coffee/operacao`),
  consultar: (ids: number[]): Promise<JobResponse> =>
    postIds("consultar", ids),
  gerar: (ids: number[]): Promise<JobResponse> =>
    postIds("gerar", ids),
  atualizarSap: (ids: number[]): Promise<JobResponse> =>
    postIds("atualizar-sap", ids),
  job: (id: string): Promise<CoffeeJob> =>
    json(`${BASE}/coffee/job/${id}`),
  remover: (ids: number[], justificativa: string): Promise<{ removidas: number }> =>
    json(`${BASE}/coffee/operacao/remover`, {
      method: "POST",
      body: JSON.stringify({ ids, justificativa }),
    }),
  alterarLocal: (id: number, local: string): Promise<{ ok: true }> =>
    json(`${BASE}/coffee/local-instalacao`, {
      method: "POST",
      body: JSON.stringify({ id, local }),
    }),
  arquivar: (id: number, justificativa: string): Promise<{ ok: true }> =>
    json(`${BASE}/coffee/arquivar`, {
      method: "POST",
      body: JSON.stringify({ id, justificativa }),
    }),
};
```

- [ ] **Step 3: Criar hook de quadro e mutations**

Criar `use-coffee-operacao.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OperacaoApi } from './operacao-api';

export const OPERACAO_KEY = ['coffee', 'operacao'] as const;

export function useCoffeeOperacao() {
  const queryClient = useQueryClient();
  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: OPERACAO_KEY });
  };
  const quadro = useQuery({
    queryKey: OPERACAO_KEY,
    queryFn: OperacaoApi.quadro,
    refetchInterval: (query) =>
      query.state.data?.operacoes_ativas.some(
        (operacao) => operacao.estado === "rodando",
      )
        ? 800
        : false,
  });

  const consultar = useMutation({
    mutationFn: (ids: number[]) => OperacaoApi.consultar(ids),
    onSuccess: invalidate,
  });
  const gerar = useMutation({
    mutationFn: (ids: number[]) => OperacaoApi.gerar(ids),
    onSuccess: invalidate,
  });
  const atualizarSap = useMutation({
    mutationFn: (ids: number[]) => OperacaoApi.atualizarSap(ids),
    onSuccess: invalidate,
  });
  const remover = useMutation({
    mutationFn: (input: { ids: number[]; justificativa: string }) =>
      OperacaoApi.remover(input.ids, input.justificativa),
    onSuccess: invalidate,
  });
  return {
    quadro,
    consultar,
    gerar,
    atualizarSap,
    remover,
  };
}
```

- [ ] **Step 4: Criar API/hook de Concluídas**

Criar `concluidas/concluidas-api.ts`:

```typescript
import { BASE } from '../../../api';
import type { CoffeeNota } from '../types';

export async function fetchCoffeeConcluidas(): Promise<CoffeeNota[]> {
  const response = await fetch(
    `${BASE}/coffee/notas?status=concluida`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`GET /coffee/notas?status=concluida -> ${response.status}`);
  }
  const body = await response.json() as { registros: CoffeeNota[] };
  return body.registros;
}
```

Criar `use-coffee-concluidas.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchCoffeeConcluidas } from './concluidas-api';

export const CONCLUIDAS_KEY = ['coffee', 'concluidas'] as const;

export function useCoffeeConcluidas() {
  return useQuery({
    queryKey: CONCLUIDAS_KEY,
    queryFn: fetchCoffeeConcluidas,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 5: Migrar logs por nota para React Query**

Preservar `useCoffeeLogs` para a página geral e adicionar:

```typescript
import { useQuery } from '@tanstack/react-query';

export const NOTA_LOGS_KEY = (pk: number | null) =>
  ['coffee', 'nota', pk, 'logs'] as const;

export function useCoffeeNotaLogs(pk: number | null) {
  return useQuery({
    queryKey: NOTA_LOGS_KEY(pk),
    queryFn: async (): Promise<CoffeeLog[]> => {
      const response = await fetch(
        `${API_BASE}/coffee/logs?nota_pk=${pk}&limit=50`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error(`GET /coffee/logs -> ${response.status}`);
      }
      const body = await response.json() as { logs: CoffeeLog[] };
      return body.logs;
    },
    enabled: pk !== null,
  });
}
```

- [ ] **Step 6: Rodar build**

Run:

```powershell
Set-Location frontend
npm run build
```

Expected: `tsc -b && vite build` termina com exit code 0.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/coffee/types.ts frontend/src/features/coffee/operacao frontend/src/features/coffee/concluidas frontend/src/features/coffee/use-coffee-logs.ts
git commit -m "feat(coffee): add operation data hooks"
```

---

### Task 7: Migrar navegação e handoff de Relatórios

**Files:**
- Modify: `frontend/src/types.ts:9`
- Modify: `frontend/src/App.tsx:79-80, 228-235`
- Modify: `frontend/src/features/coffee/coffee-hub.tsx`

**Interfaces:**
- Consumes: páginas ainda provisórias das Tasks 8 e 10.
- Produces:
  - `CoffeeSubPage = verificar | abrir | operacao | concluidas | logs`
  - `normalizeCoffeeSubPage(value: string)`.

- [ ] **Step 1: Definir tipo e normalizador**

Em `frontend/src/types.ts`:

```typescript
export type CoffeeSubPage =
  | "abrir"
  | "operacao"
  | "concluidas"
  | "verificar"
  | "logs";

export type CoffeeConclusaoFiltro = "todas" | "gerada" | "corrigida";

export function normalizeCoffeeSubPage(value: string): CoffeeSubPage {
  if (value === "geradas" || value === "pendentes") return "operacao";
  if (value === "corrigidas") return "concluidas";
  if (
    value === "abrir"
    || value === "operacao"
    || value === "concluidas"
    || value === "verificar"
    || value === "logs"
  ) {
    return value;
  }
  return "verificar";
}
```

- [ ] **Step 2: Migrar estado persistido no App**

Trocar a declaração de `coffeeSub` por:

```typescript
const [storedCoffeeSub, setStoredCoffeeSub] =
  usePersistedState<string>("edp_coffee_sub", "verificar");
const coffeeSub = normalizeCoffeeSubPage(storedCoffeeSub);
const setCoffeeSub = React.useCallback(
  (sub: CoffeeSubPage): void => setStoredCoffeeSub(sub),
  [setStoredCoffeeSub],
);
const [coffeeConcluidasHandoff, setCoffeeConcluidasHandoff] =
  React.useState<{ filtro: CoffeeConclusaoFiltro; id: number } | null>(null);

React.useEffect(() => {
  if (storedCoffeeSub !== coffeeSub) setStoredCoffeeSub(coffeeSub);
}, [coffeeSub, setStoredCoffeeSub, storedCoffeeSub]);
```

Importar `normalizeCoffeeSubPage` e `CoffeeConclusaoFiltro`.

- [ ] **Step 3: Atualizar handoff de Relatórios**

No `onIrParaCoffee`:

```typescript
onIrParaCoffee={() => {
  setCoffeeConcluidasHandoff((prev) => ({
    filtro: "corrigida",
    id: (prev?.id ?? 0) + 1,
  }));
  setCoffeeSub("concluidas");
  changeSection("coffee");
}}
```

Passar `concluidasHandoff={coffeeConcluidasHandoff}` para `CoffeeHub`.

- [ ] **Step 4: Atualizar a navegação do hub**

Em `coffee-hub.tsx`, definir:

```typescript
export const COFFEE_SUBS: { id: CoffeeSubPage; label: string }[] = [
  { id: "verificar", label: "Verificar" },
  { id: "abrir", label: "Abrir" },
  { id: "operacao", label: "Operação" },
  { id: "concluidas", label: "Concluídas" },
  { id: "logs", label: "Logs" },
];
```

Adicionar à prop:

```typescript
concluidasHandoff: { filtro: CoffeeConclusaoFiltro; id: number } | null;
```

Renderizar `CoffeeOperacao` e `CoffeeConcluidas` nos novos IDs. Enquanto as
páginas ainda não existem, criar exports mínimos nos caminhos finais:

```typescript
export function CoffeeOperacao(): React.JSX.Element {
  return <div className="p-6 text-text-dim">Operação em preparação.</div>;
}
```

```typescript
export function CoffeeConcluidas(): React.JSX.Element {
  return <div className="p-6 text-text-dim">Concluídas em preparação.</div>;
}
```

- [ ] **Step 5: Rodar build e validar migração manual**

Run:

```powershell
Set-Location frontend
npm run build
```

Expected: exit code 0.

Manual:

1. Definir `sessionStorage.edp_coffee_sub` como `"geradas"` e recarregar.
2. Confirmar `Operação` ativa e storage atualizado para `"operacao"`.
3. Repetir com `"corrigidas"` e confirmar `Concluídas`.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/types.ts frontend/src/App.tsx frontend/src/features/coffee/coffee-hub.tsx frontend/src/features/coffee/operacao/coffee-operacao.tsx frontend/src/features/coffee/concluidas/coffee-concluidas.tsx
git commit -m "feat(coffee): consolidate module navigation"
```

---

### Task 8: Construir compositor, cards, Kanban e barra de lote

**Files:**
- Modify: `frontend/src/features/coffee/operacao/coffee-operacao.tsx`
- Create: `frontend/src/features/coffee/format.ts`
- Create: `frontend/src/features/coffee/operacao/components/operacao-composer.tsx`
- Create: `frontend/src/features/coffee/operacao/components/operacao-kanban.tsx`
- Create: `frontend/src/features/coffee/operacao/components/operacao-column.tsx`
- Create: `frontend/src/features/coffee/operacao/components/nota-operacao-card.tsx`
- Create: `frontend/src/features/coffee/operacao/components/operacao-batch-bar.tsx`

**Interfaces:**
- Consumes: `useCoffeeOperacao`, `CoffeeOperacaoItem`, `OperacaoEtapa`.
- Produces: página Operação funcional sem inspector.

- [ ] **Step 1: Criar parser e compositor**

Em `operacao-composer.tsx`:

```typescript
import React from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface ParsedIds {
  ids: number[];
  invalidos: string[];
  repetidos: number;
}

export function parseCoffeeIds(value: string): ParsedIds {
  const tokens = value.split(/[\s,;]+/).filter(Boolean);
  const validos = tokens
    .filter((token) => /^\d+$/.test(token) && Number(token) > 0)
    .map(Number);
  const ids = [...new Set(validos)];
  return {
    ids,
    invalidos: tokens.filter(
      (token) => !/^\d+$/.test(token) || Number(token) <= 0,
    ),
    repetidos: validos.length - ids.length,
  };
}

interface OperacaoComposerProps {
  pending: boolean;
  onConsultar: (ids: number[]) => void;
}

export function OperacaoComposer({
  pending,
  onConsultar,
}: OperacaoComposerProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const parsed = React.useMemo(() => parseCoffeeIds(value), [value]);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Adicionar notas
      </Button>
    );
  }

  return (
    <section className="rounded-[11px] border border-line bg-surface p-4">
      <label htmlFor="coffee-operation-ids" className="edp-eyebrow">
        IDs COFFEE
      </label>
      <Textarea
        id="coffee-operation-ids"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Cole IDs separados por espaço, vírgula ou linha"
        className="mt-2 min-h-24 font-mono"
        disabled={pending}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-mute">
        <span>{parsed.ids.length} válidos</span>
        <span>{parsed.repetidos} repetidos</span>
        <span>{parsed.invalidos.length} inválidos</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={parsed.ids.length === 0 || pending}
          onClick={() => {
            onConsultar(parsed.ids);
            setValue("");
            setOpen(false);
          }}
        >
          <Search /> Consultar
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Criar formatter compartilhado e card acessível**

Criar `features/coffee/format.ts`:

```typescript
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days}d`;
  return date.toLocaleDateString("pt-BR");
}
```

Em `nota-operacao-card.tsx`:

```typescript
import React from 'react';
import { AlertCircle, Clock3 } from 'lucide-react';
import type { CoffeeJob, CoffeeOperacaoItem } from '../../types';
import { formatRelativeTime } from '../../format';

interface NotaOperacaoCardProps {
  item: CoffeeOperacaoItem;
  selected: boolean;
  progress?: Pick<CoffeeJob, "feitas" | "total">;
  onSelect: (selected: boolean) => void;
  onOpen: (trigger: HTMLButtonElement) => void;
}

function field(
  item: CoffeeOperacaoItem,
  key: string,
): string | null {
  const value = item.nota?.dados_json?.[key];
  return value == null || value === "" ? null : String(value);
}

export function NotaOperacaoCard({
  item,
  selected,
  progress,
  onSelect,
  onOpen,
}: NotaOperacaoCardProps): React.JSX.Element {
  const id = item.nota_pk ?? item.entrada_id;
  const local = [
    field(item, "cidade"),
    field(item, "tipo_local_instalacao"),
    field(item, "local_instalacao_numero"),
  ].filter(Boolean).join("-");

  return (
    <article
      className={[
        "rounded-[11px] border bg-surface p-3 shadow-sm",
        "transition-[border-color,box-shadow] motion-reduce:transition-none",
        selected ? "border-primary shadow" : "border-line",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`Selecionar nota ${id}`}
          className="mt-1"
        />
        <button
          type="button"
          onClick={(event) => onOpen(event.currentTarget)}
          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Abrir detalhes da nota ${id}`}
        >
          <span className="edp-mono text-sm font-semibold">#{id}</span>
          <span className="ml-2 text-xs text-text-mute">
            {item.origem === "verificar" ? "Verificar" : "Avulsa"}
          </span>
          <span className="ml-2 text-xs font-medium text-text-dim">
            {item.etapa === "fila" && "Na fila"}
            {item.etapa === "pronta" && "Pronta"}
            {item.etapa === "processando" && "Processando"}
            {item.etapa === "aguardando_sap" && "Aguardando SAP"}
          </span>
          <div className="mt-2 truncate text-xs text-text-dim">
            {local || "Local ainda não consultado"}
          </div>
          <div className="mt-1 truncate text-xs text-text-mute">
            {field(item, "alimentador") ?? "Alimentador —"}
            {" · "}
            prioridade {field(item, "prioridade") ?? "—"}
          </div>
          <span className="mt-2 block text-xs font-medium text-primary">
            Abrir detalhes
          </span>
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {item.erro ? (
          <span className="inline-flex items-center gap-1 text-red">
            <AlertCircle className="size-3" /> {item.erro}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-text-mute">
            <Clock3 className="size-3" />
            {formatRelativeTime(item.atualizado_em)}
          </span>
        )}
      </div>
      {progress && (
        <div className="mt-3" aria-label={`${progress.feitas} de ${progress.total}`}>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${
                  progress.total === 0
                    ? 0
                    : Math.round((progress.feitas / progress.total) * 100)
                }%`,
              }}
            />
          </div>
          <span className="edp-mono mt-1 block text-xs text-text-mute">
            {progress.feitas}/{progress.total}
          </span>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Criar coluna e quadro**

`operacao-column.tsx`:

```typescript
import React from 'react';
import type {
  CoffeeJob,
  CoffeeOperacaoItem,
  OperacaoEtapa,
} from '../../types';
import { NotaOperacaoCard } from './nota-operacao-card';

interface OperacaoColumnProps {
  etapa: OperacaoEtapa;
  titulo: string;
  descricao: string;
  itens: CoffeeOperacaoItem[];
  jobs: CoffeeJob[];
  selected: Set<number>;
  onToggle: (pk: number) => void;
  onOpen: (pk: number, trigger: HTMLButtonElement) => void;
}

export function OperacaoColumn(props: OperacaoColumnProps): React.JSX.Element {
  return (
    <section
      aria-labelledby={`coffee-column-${props.etapa}`}
      className="flex min-h-0 w-[min(82vw,340px)] shrink-0 snap-start flex-col rounded-[12px] border border-line bg-bg-2 lg:w-auto lg:min-w-0"
    >
      <header className="border-b border-line p-3">
        <div className="flex items-center gap-2">
          <h2 id={`coffee-column-${props.etapa}`} className="text-sm font-semibold">
            {props.titulo}
          </h2>
          <span className="edp-mono rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-mute">
            {props.itens.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-text-mute">{props.descricao}</p>
      </header>
      <div className="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {props.itens.length === 0 ? (
          <div className="grid min-h-28 place-items-center rounded-[9px] border border-dashed border-line text-center text-xs text-text-mute">
            Nenhuma nota nesta etapa.
          </div>
        ) : props.itens.map((item) => {
          const pk = item.nota_pk ?? item.entrada_id;
          const progress = props.jobs.find(
            (job) => job.id === item.operacao_id,
          );
          return (
            <NotaOperacaoCard
              key={`${item.entrada_id}-${item.nota_pk ?? "pending"}`}
              item={item}
              selected={props.selected.has(pk)}
              progress={progress}
              onSelect={() => props.onToggle(pk)}
              onOpen={(trigger) => props.onOpen(pk, trigger)}
            />
          );
        })}
      </div>
    </section>
  );
}
```

`operacao-kanban.tsx`:

```typescript
import React from 'react';
import type {
  CoffeeJob,
  CoffeeOperacaoItem,
  OperacaoEtapa,
} from '../../types';
import { OperacaoColumn } from './operacao-column';

const COLUMNS: Array<{
  etapa: OperacaoEtapa;
  titulo: string;
  descricao: string;
}> = [
  { etapa: "fila", titulo: "Fila", descricao: "Consultando ou aguardando nova tentativa." },
  { etapa: "pronta", titulo: "Prontas para gerar", descricao: "Elegíveis e sem SAP real." },
  { etapa: "processando", titulo: "Processando", descricao: "Geração em andamento." },
  { etapa: "aguardando_sap", titulo: "Aguardando SAP", descricao: "SAP temporário 10000000." },
];

interface OperacaoKanbanProps {
  itens: CoffeeOperacaoItem[];
  jobs: CoffeeJob[];
  selected: Set<number>;
  onToggle: (pk: number) => void;
  onOpen: (pk: number, trigger: HTMLButtonElement) => void;
}

export function OperacaoKanban(props: OperacaoKanbanProps): React.JSX.Element {
  return (
    <div className="grid min-h-0 flex-1 snap-x snap-mandatory auto-cols-[min(82vw,340px)] grid-flow-col gap-3 overflow-x-auto scroll-smooth p-4 lg:grid-flow-row lg:grid-cols-4 lg:auto-cols-auto lg:snap-none">
      {COLUMNS.map((column) => (
        <OperacaoColumn
          key={column.etapa}
          {...column}
          itens={props.itens.filter((item) => item.etapa === column.etapa)}
          jobs={props.jobs}
          selected={props.selected}
          onToggle={props.onToggle}
          onOpen={props.onOpen}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Criar barra de lote**

Em `operacao-batch-bar.tsx`:

```typescript
import React from 'react';
import {
  ListChecks,
  RefreshCw,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import type { CoffeeOperacaoItem, OperacaoEtapa } from '../../types';
import { Button } from '@/components/ui/button';

interface OperacaoBatchBarProps {
  itens: CoffeeOperacaoItem[];
  allItems: CoffeeOperacaoItem[];
  onClear: () => void;
  onSelectColumn: (ids: number[]) => void;
  onGerar: (ids: number[]) => void;
  onAtualizar: (ids: number[]) => void;
  onReconsultar: (ids: number[]) => void;
  onRemover: (ids: number[]) => void;
}

export function OperacaoBatchBar({
  itens,
  allItems,
  onClear,
  onSelectColumn,
  onGerar,
  onAtualizar,
  onReconsultar,
  onRemover,
}: OperacaoBatchBarProps): React.JSX.Element | null {
  if (itens.length === 0) return null;
  const etapas = new Set<OperacaoEtapa>(itens.map((item) => item.etapa));
  const ids = itens.map((item) => item.nota_pk ?? item.entrada_id);
  const etapa = etapas.size === 1 ? itens[0].etapa : null;
  const columnIds = etapa === null
    ? []
    : allItems
      .filter((item) => item.etapa === etapa)
      .map((item) => item.nota_pk ?? item.entrada_id);

  return (
    <div className="absolute inset-x-4 bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-[11px] border border-line-2 bg-surface p-2 shadow-lg">
      <strong className="px-2 text-sm">{itens.length} selecionadas</strong>
      {etapa !== null && columnIds.length > itens.length && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSelectColumn(columnIds)}
        >
          <ListChecks /> Selecionar coluna
        </Button>
      )}
      {etapa === "fila" && (
        <Button size="sm" onClick={() => onReconsultar(ids)}>
          <RefreshCw /> Consultar novamente
        </Button>
      )}
      {etapa === "pronta" && (
        <Button size="sm" onClick={() => onGerar(ids)}>
          <WandSparkles /> Gerar
        </Button>
      )}
      {etapa === "aguardando_sap" && (
        <Button size="sm" onClick={() => onAtualizar(ids)}>
          <RefreshCw /> Atualizar SAP
        </Button>
      )}
      {etapa === null && (
        <span className="text-xs text-text-mute">
          Selecione notas da mesma etapa para executar ações.
        </span>
      )}
      <div className="flex-1" />
      {!etapas.has("processando") && (
        <Button variant="ghost" size="sm" onClick={() => onRemover(ids)}>
          <Trash2 /> Remover
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Limpar seleção">
        <X />
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Integrar container da página**

Em `coffee-operacao.tsx`, usar `useCoffeeOperacao`, `toast`, `ConfirmModal`,
estado `Set<number>`, `selectedPk` e `lastTriggerRef`. A integração mínima deve:
importar também `RefreshCw`, `Button` e `formatRelativeTime`.

```typescript
const lastTriggerRef = React.useRef<HTMLButtonElement | null>(null);
const selectedItems = itens.filter(
  (item) => selected.has(item.nota_pk ?? item.entrada_id),
);
const waitingSapIds = itens
  .filter((item) => item.etapa === "aguardando_sap")
  .map((item) => item.nota_pk ?? item.entrada_id);
const latestUpdate = itens.reduce<string | null>(
  (latest, item) => (
    latest === null || item.atualizado_em > latest
      ? item.atualizado_em
      : latest
  ),
  null,
);

function toggle(pk: number): void {
  setSelected((current) => {
    const next = new Set(current);
    if (next.has(pk)) next.delete(pk);
    else next.add(pk);
    return next;
  });
}

function openInspector(pk: number, trigger: HTMLButtonElement): void {
  lastTriggerRef.current = trigger;
  setSelectedPk(pk);
}
```

No sucesso das mutations, limpar seleção e mostrar toast com a quantidade.
`Atualizar pendentes` usa todos os IDs da etapa `aguardando_sap`.
`Remover` abre `ConfirmModal` com justificativa e somente depois chama a
mutation.

Renderizar:

```tsx
<div className="relative flex flex-1 flex-col overflow-hidden">
  <header className="flex flex-wrap items-center gap-3 border-b border-line px-[22px] py-4">
    <div className="min-w-0 flex-1">
      <span className="edp-eyebrow">Fluxo ativo</span>
      <h1 className="edp-title text-lg">Geração de notas</h1>
    </div>
    <span className="edp-mono text-xs text-text-mute">
      {itens.length} em andamento
    </span>
    <span className="edp-mono text-xs text-text-mute">
      {latestUpdate
        ? `Atualizado ${formatRelativeTime(latestUpdate)}`
        : "Sem atualizações"}
    </span>
    <Button
      variant="outline"
      size="sm"
      disabled={waitingSapIds.length === 0 || atualizarSap.isPending}
      onClick={() => atualizarSap.mutate(waitingSapIds)}
    >
      <RefreshCw /> Atualizar pendentes
    </Button>
    <OperacaoComposer
      pending={consultar.isPending}
      onConsultar={(ids) => consultar.mutate(ids)}
    />
  </header>
  <OperacaoKanban
    itens={itens}
    jobs={quadro.data?.operacoes_ativas ?? []}
    selected={selected}
    onToggle={toggle}
    onOpen={openInspector}
  />
  <OperacaoBatchBar
    itens={selectedItems}
    allItems={itens}
    onClear={() => setSelected(new Set())}
    onSelectColumn={(ids) => setSelected(new Set(ids))}
    onGerar={(ids) => gerar.mutate(ids)}
    onAtualizar={(ids) => atualizarSap.mutate(ids)}
    onReconsultar={(ids) => consultar.mutate(ids)}
    onRemover={setPendingRemoval}
  />
</div>
```

- [ ] **Step 6: Rodar build e QA de interação**

Run:

```powershell
Set-Location frontend
npm run build
```

Expected: exit code 0.

Manual:

- colar IDs mostra contagens e cria cards;
- checkbox não abre detalhes;
- clique no corpo não muda seleção;
- seleção mista explica incompatibilidade;
- quatro colunas permanecem legíveis em 1024 px e 390 px.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/coffee/format.ts frontend/src/features/coffee/operacao
git commit -m "feat(coffee): build operation kanban"
```

---

### Task 9: Construir inspector lateral temático

**Files:**
- Create: `frontend/src/features/coffee/components/nota-summary.tsx`
- Create: `frontend/src/features/coffee/components/nota-activity.tsx`
- Create: `frontend/src/features/coffee/components/coffee-nota-inspector.tsx`
- Create: `frontend/src/features/coffee/use-coffee-portal-theme.ts`
- Modify: `frontend/src/features/coffee/confirm-modal.tsx`
- Modify: `frontend/src/features/coffee/mover-plano-modal.tsx`
- Modify: `frontend/src/components/branded/mes-execucao-picker.tsx`
- Modify: `frontend/src/features/coffee/operacao/coffee-operacao.tsx`

**Interfaces:**
- Consumes: `useNotaRevisao`, `useCoffeeNotaLogs`, `MoverPlanoModal`,
  `OperacaoApi` e settings.
- Produces: `CoffeeNotaInspector`.

- [ ] **Step 1: Extrair resumo da nota**

Criar `nota-summary.tsx`:

```typescript
import React from 'react';
import { Separator } from '@/components/ui/separator';
import { formatRelativeTime } from '../format';
import type { NotaRevisao } from '../types';

function display(value: unknown): string {
  return (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  )
    ? String(value)
    : "—";
}

const CURATED_FIELDS = new Set([
  "observacoes",
  "sintoma",
  "prioridade",
  "alimentador",
  "cidade",
  "tipo_local_instalacao",
  "local_instalacao_numero",
  "id_sap",
  "arquivado",
]);

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="edp-eyebrow">{title}</h2>
      <dl className="flex flex-col gap-2">{children}</dl>
    </section>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: unknown;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(112px,0.42fr)_1fr] gap-3 text-sm">
      <dt className="text-text-mute">{label}</dt>
      <dd className="edp-mono min-w-0 break-words">{display(value)}</dd>
    </div>
  );
}

interface NotaSummaryProps {
  revisao: NotaRevisao;
}

export function NotaSummary({
  revisao,
}: NotaSummaryProps): React.JSX.Element {
  const fields = revisao.coffee.dados_json ?? {};
  const remainingFields = Object.entries(fields).filter(
    ([key]) => !CURATED_FIELDS.has(key),
  );
  return (
    <div className="flex flex-col gap-5">
      <SummarySection title="Identificação">
        <SummaryRow label="ID COFFEE" value={revisao.coffee.pk} />
        <SummaryRow label="ID SAP" value={revisao.coffee.id_sap} />
        <SummaryRow label="Classificação" value={revisao.coffee.classificacao} />
        <SummaryRow label="Origem" value={revisao.coffee.origem} />
        <SummaryRow label="Arquivada" value={revisao.coffee.arquivado} />
        <SummaryRow
          label="Última busca"
          value={formatRelativeTime(revisao.coffee.buscado_em)}
        />
      </SummarySection>
      <Separator />
      <SummarySection title="Local e rede">
        <SummaryRow label="Local" value={revisao.proposta.Local_Instalacao} />
        <SummaryRow label="Cidade" value={fields.cidade} />
        <SummaryRow label="Tipo de local" value={fields.tipo_local_instalacao} />
        <SummaryRow label="Nº do local" value={fields.local_instalacao_numero} />
        <SummaryRow label="Alimentador" value={fields.alimentador} />
        <SummaryRow label="Circuito" value={revisao.proposta.Circuito} />
      </SummarySection>
      <Separator />
      <SummarySection title="Atendimento">
        <SummaryRow label="Prioridade" value={fields.prioridade} />
        <SummaryRow label="Sintoma" value={fields.sintoma} />
        <SummaryRow label="Observações" value={fields.observacoes} />
        <SummaryRow
          label="Observação do plano"
          value={revisao.proposta.Observacao}
        />
        <SummaryRow label="Status inicial" value={revisao.proposta.Status_Nota} />
        <SummaryRow
          label="Planejado"
          value={`${revisao.proposta.Planejado_DDPM}${
            revisao.proposta.Planejado_Unidade
              ? ` ${revisao.proposta.Planejado_Unidade}`
              : ""
          }`}
        />
      </SummarySection>
      <Separator />
      <SummarySection title="Dados SAP (IW28)">
        <SummaryRow
          label="Extração"
          value={
            revisao.iw28_extraida_em
              ? formatRelativeTime(revisao.iw28_extraida_em)
              : null
          }
        />
        {revisao.iw28 ? (
          Object.entries(revisao.iw28).map(([key, value]) => (
            <SummaryRow key={key} label={key} value={value} />
          ))
        ) : (
          <SummaryRow label="Situação" value="Nota ausente da extração." />
        )}
      </SummarySection>
      {revisao.plano && (
        <>
          <Separator />
          <SummarySection title="Dados atuais do plano">
            {Object.entries(revisao.plano).map(([key, value]) => (
              <SummaryRow key={key} label={key} value={value} />
            ))}
          </SummarySection>
        </>
      )}
      {remainingFields.length > 0 && (
        <>
          <Separator />
          <SummarySection title="Demais dados do COFFEE">
            {remainingFields.map(([key, value]) => (
              <SummaryRow key={key} label={key} value={value} />
            ))}
          </SummarySection>
        </>
      )}
      {revisao.avisos.length > 0 && (
        <>
          <Separator />
          <section aria-labelledby="coffee-inspector-warnings">
            <h2 id="coffee-inspector-warnings" className="edp-eyebrow mb-2">
              Avisos
            </h2>
            <ul className="flex flex-col gap-1 text-sm text-amber">
              {revisao.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar atividade compacta**

Em `nota-activity.tsx`:

```typescript
import React from 'react';
import type { CoffeeLog } from '../types';
import { formatRelativeTime } from '../format';

export function NotaActivity({
  logs,
  loading,
}: {
  logs: CoffeeLog[];
  loading: boolean;
}): React.JSX.Element {
  if (loading) {
    return <p className="text-sm text-text-mute">Carregando atividade…</p>;
  }
  if (logs.length === 0) {
    return <p className="text-sm text-text-mute">Sem atividade registrada.</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {logs.slice(0, 8).map((log) => (
        <li key={log.id} className="border-l border-line-2 pl-3">
          <div className="text-sm font-medium">{log.acao.replaceAll("_", " ")}</div>
          <div className="mt-0.5 text-xs text-text-mute">
            {formatRelativeTime(log.timestamp)}
            {log.usuario ? ` · ${log.usuario}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 3: Centralizar tokens dos portais e criar o Sheet**

Criar `use-coffee-portal-theme.ts` para os quatro portais do fluxo:

```typescript
import React from 'react';
import { useSettings } from '../../context/settings-context';

type PortalCssVars =
  React.CSSProperties & Record<`--${string}`, string>;

export interface CoffeePortalTheme {
  "data-theme": "light" | "dark";
  "data-density": "compact" | "cozy";
  style: PortalCssVars;
}

export function useCoffeePortalTheme(): CoffeePortalTheme {
  const { settings, resolvedTheme } = useSettings();
  return {
    "data-theme": resolvedTheme,
    "data-density": settings.density,
    style: {
      "--accent": settings.accent[0],
      "--accent-2": settings.accent[1],
      "--accent-tint": settings.accent[2],
    },
  };
}
```

Em `coffee-nota-inspector.tsx`:

```typescript
import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Check,
  Coffee,
  Pencil,
  RefreshCw,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { coffeeUrl } from '../../../api';
import { useNotaRevisao, REVISAO_KEY } from '../use-nota-revisao';
import { useCoffeeNotaLogs } from '../use-coffee-logs';
import type { NotaRevisao, OperacaoEtapa } from '../types';
import { OPERACAO_KEY } from '../operacao/use-coffee-operacao';
import { OperacaoApi } from '../operacao/operacao-api';
import { useCoffeePortalTheme } from '../use-coffee-portal-theme';
import { NotaSummary } from './nota-summary';
import { NotaActivity } from './nota-activity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

export type InspectorAction =
  | "gerar"
  | "atualizar"
  | "remover"
  | "mover"
  | "arquivar";

interface CoffeeNotaInspectorProps {
  pk: number | null;
  etapa?: OperacaoEtapa;
  open: boolean;
  onClose: () => void;
  onAction: (action: InspectorAction, revisao: NotaRevisao) => void;
}

function maskLocal(value: string): string {
  const clean = value.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return [
    clean.slice(0, 3),
    clean.slice(3, 5),
    clean.slice(5),
  ].filter(Boolean).join("-");
}

function unmaskLocal(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function nextStep(
  etapa: OperacaoEtapa | undefined,
  classificacao: string,
): string {
  if (etapa === "fila") return "Aguarde a consulta ou tente novamente.";
  if (etapa === "pronta") return "Revise o local e gere a nota.";
  if (etapa === "processando") return "A geração está em andamento.";
  if (etapa === "aguardando_sap") return "Atualize para buscar o SAP real.";
  if (classificacao === "corrigida") {
    return "Revise os dados e mova a nota para o plano.";
  }
  return "A nota está concluída e disponível para consulta.";
}

export function CoffeeNotaInspector({
  pk,
  etapa,
  open,
  onClose,
  onAction,
}: CoffeeNotaInspectorProps): React.JSX.Element {
  const portalTheme = useCoffeePortalTheme();
  const queryClient = useQueryClient();
  const revisao = useNotaRevisao(pk);
  const logs = useCoffeeNotaLogs(pk);
  const [editingLocal, setEditingLocal] = React.useState(false);
  const [localValue, setLocalValue] = React.useState("");
  const persistedLocal = revisao.data?.proposta.Local_Instalacao ?? "";
  const localMutation = useMutation({
    mutationFn: async (local: string) => {
      if (pk === null) throw new Error("Nota não selecionada.");
      return OperacaoApi.alterarLocal(pk, local);
    },
    onSuccess: async () => {
      setEditingLocal(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: REVISAO_KEY(pk) }),
        queryClient.invalidateQueries({ queryKey: OPERACAO_KEY }),
      ]);
      toast.success("Local de instalação atualizado");
    },
    onError: (error: unknown) => {
      toast.error("Falha ao atualizar local", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });
  const resetLocalMutation = localMutation.reset;

  React.useEffect(() => {
    setEditingLocal(false);
    setLocalValue(maskLocal(persistedLocal));
    resetLocalMutation();
  }, [pk, persistedLocal, resetLocalMutation]);

  const canSaveLocal = (
    unmaskLocal(localValue).length > 0
    && unmaskLocal(localValue) !== unmaskLocal(persistedLocal)
  );
  const canEditLocal = etapa === "fila" || etapa === "pronta";

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        {...portalTheme}
        className="edp flex w-full max-w-none flex-col gap-0 p-0 motion-reduce:duration-0 sm:max-w-none lg:max-w-[clamp(420px,38vw,620px)]"
      >
        <SheetHeader className="border-b border-line p-4">
          <SheetTitle>
            Ficha da nota <span className="edp-mono">#{pk}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {revisao.isLoading && <p className="text-text-mute">Carregando ficha…</p>}
          {revisao.error && (
            <div role="alert" className="text-red">
              {revisao.error instanceof Error
                ? revisao.error.message
                : String(revisao.error)}
            </div>
          )}
          {revisao.data && (
            <div className="flex flex-col gap-6">
              <section aria-labelledby="coffee-local-editor">
                <div className="mb-2 flex items-center gap-2">
                  <h2 id="coffee-local-editor" className="edp-eyebrow">
                    Local de instalação
                  </h2>
                  <div className="flex-1" />
                  {canEditLocal && !editingLocal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingLocal(true)}
                    >
                      <Pencil /> Editar local
                    </Button>
                  )}
                </div>
                {editingLocal ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={localValue}
                      onChange={(event) =>
                        setLocalValue(maskLocal(event.target.value))
                      }
                      aria-label="Local de instalação"
                      className="edp-mono"
                      disabled={localMutation.isPending}
                    />
                    <Button
                      size="icon-sm"
                      aria-label="Salvar local"
                      disabled={!canSaveLocal || localMutation.isPending}
                      onClick={() =>
                        localMutation.mutate(unmaskLocal(localValue))
                      }
                    >
                      <Check />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Cancelar edição do local"
                      disabled={localMutation.isPending}
                      onClick={() => {
                        setLocalValue(maskLocal(persistedLocal));
                        setEditingLocal(false);
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <p className="edp-mono text-sm">
                    {maskLocal(persistedLocal) || "—"}
                  </p>
                )}
                {localMutation.error && (
                  <p role="alert" className="mt-2 text-sm text-red">
                    {localMutation.error instanceof Error
                      ? localMutation.error.message
                      : String(localMutation.error)}
                  </p>
                )}
              </section>
              <NotaSummary revisao={revisao.data} />
              <section className="rounded-[11px] border border-line bg-surface-2 p-3">
                <h2 className="edp-eyebrow">Próximo passo</h2>
                <p className="mt-1 text-sm text-text-dim">
                  {nextStep(etapa, revisao.data.coffee.classificacao)}
                </p>
              </section>
              <section>
                <h2 className="edp-eyebrow mb-3">Atividade</h2>
                <NotaActivity
                  logs={logs.data ?? []}
                  loading={logs.isLoading}
                />
              </section>
            </div>
          )}
        </div>
        {pk !== null && revisao.data && (
          <footer className="flex flex-wrap gap-2 border-t border-line p-3">
            <Button asChild variant="outline" size="sm">
              <a href={coffeeUrl(String(pk))} target="_blank" rel="noopener">
                <Coffee /> Abrir COFFEE
              </a>
            </Button>
            {etapa === "pronta" && (
              <Button
                size="sm"
                onClick={() => onAction("gerar", revisao.data)}
              >
                <WandSparkles /> Gerar
              </Button>
            )}
            {etapa === "aguardando_sap" && (
              <Button
                size="sm"
                onClick={() => onAction("atualizar", revisao.data)}
              >
                <RefreshCw /> Atualizar SAP
              </Button>
            )}
            {etapa !== undefined && etapa !== "processando" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAction("remover", revisao.data)}
              >
                <Trash2 /> Remover
              </Button>
            )}
            {etapa === undefined
              && revisao.data.coffee.classificacao === "gerada" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAction("arquivar", revisao.data)}
              >
                <Archive /> Arquivar
              </Button>
            )}
            <Button
              size="sm"
              disabled={!revisao.data.pode_mover}
              onClick={() => onAction("mover", revisao.data)}
            >
              {revisao.data.ja_no_plano ? "Atualizar plano" : "Mover para plano"}
            </Button>
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Aplicar os tokens aos demais portais do fluxo**

Em `confirm-modal.tsx`, importar `useCoffeePortalTheme`, declarar
`const portalTheme = useCoffeePortalTheme();` no componente e alterar o
conteúdo para:

```tsx
<AlertDialogContent
  {...portalTheme}
  className="edp w-[420px] max-w-[92vw] gap-[12px] p-[20px]"
>
```

Em `mes-execucao-picker.tsx`, importar `cn`, adicionar à interface:

```typescript
contentProps?: Omit<
  React.ComponentProps<typeof SelectContent>,
  "children"
>;
```

Desestruturar `contentProps` e substituir a abertura do conteúdo por:

```tsx
<SelectContent
  {...contentProps}
  className={cn(CLASSE_SELECT_MONO, contentProps?.className)}
>
```

Em `mover-plano-modal.tsx`, importar `useCoffeePortalTheme`, declarar
`const portalTheme = useCoffeePortalTheme();` e aplicar:

```tsx
<DialogContent {...portalTheme} className="edp w-[480px]">
```

No `MesExecucaoPicker` desse modal, passar:

```tsx
contentProps={{ ...portalTheme, className: "edp" }}
```

Assim Sheet, AlertDialog, Dialog e Select resolvem os mesmos tokens sem tocar
nos componentes vendorizados de `src/components/ui/`.

- [ ] **Step 5: Integrar ações e retorno de foco**

No container de Operação:

- manter `selectedPk`;
- guardar `lastTriggerRef` no botão do card;
- derivar `selectedItem` do quadro e passar `etapa={selectedItem?.etapa}`;
- mapear `gerar` e `atualizar` para mutations usando
  `revisao.coffee.pk`;
- mapear `remover` para confirmação usando `revisao.coffee.pk`;
- mapear `mover` para `MoverPlanoModal` com a própria `revisao`.
- tratar `arquivar` como inalcançável em Operação, pois essa ação só é
  oferecida quando `etapa` não é informada pela página Concluídas.

Implementar o roteamento sem duplicar as mutations:

```typescript
const selectedItem = itens.find(
  (item) => (item.nota_pk ?? item.entrada_id) === selectedPk,
);

function handleInspectorAction(
  action: InspectorAction,
  revisao: NotaRevisao,
): void {
  const pk = revisao.coffee.pk;
  if (action === "gerar") {
    gerar.mutate([pk]);
    return;
  }
  if (action === "atualizar") {
    atualizarSap.mutate([pk]);
    return;
  }
  if (action === "remover") {
    setPendingRemoval([pk]);
    return;
  }
  if (action === "mover") {
    setMoverAlvo({ pks: [pk], revisao });
    return;
  }
  toast.error("Ação indisponível na Operação.");
}
```

Renderizar:

```tsx
<CoffeeNotaInspector
  pk={selectedPk}
  etapa={selectedItem?.etapa}
  open={selectedPk !== null}
  onClose={closeInspector}
  onAction={handleInspectorAction}
/>
```

Fechar com:

```typescript
function closeInspector(): void {
  setSelectedPk(null);
  window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
}
```

Passar `onClose={closeInspector}` ao inspector.

Ao salvar o local, manter o texto digitado quando houver erro; o endpoint
existente reconsulta a nota e atualiza SQLite/quadro antes de retornar. Não
abrir `RevisarNotaSheet` nem `LogDrawer` a partir do inspector.

- [ ] **Step 6: Rodar build e QA temática**

Run:

```powershell
Set-Location frontend
npm run build
```

Expected: exit code 0.

Manual:

- claro e escuro;
- Sistema muda ao alterar tema do SO;
- acentos verde, azul e índigo;
- inspector ocupa toda a viewport em 390 px;
- `Esc` fecha e devolve foco;
- navegação por Tab alcança todas as ações;
- editar local salva, reconsulta e atualiza card/ficha;
- erro ao editar local preserva o texto digitado;
- Select de período, confirmação e Mover para Plano seguem o tema/acento;
- `prefers-reduced-motion` remove transição longa.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/components/branded/mes-execucao-picker.tsx frontend/src/features/coffee/components frontend/src/features/coffee/use-coffee-portal-theme.ts frontend/src/features/coffee/confirm-modal.tsx frontend/src/features/coffee/mover-plano-modal.tsx frontend/src/features/coffee/operacao/coffee-operacao.tsx
git commit -m "feat(coffee): add themed note inspector"
```

---

### Task 10: Construir a página Concluídas

**Files:**
- Modify: `frontend/src/features/coffee/concluidas/coffee-concluidas.tsx`
- Create: `frontend/src/features/coffee/concluidas/concluidas-utils.ts`
- Create: `frontend/src/features/coffee/concluidas/components/concluidas-toolbar.tsx`
- Create: `frontend/src/features/coffee/concluidas/components/concluidas-list.tsx`
- Modify: `frontend/src/features/coffee/coffee-hub.tsx`

**Interfaces:**
- Consumes: `useCoffeeConcluidas`, `CoffeeNotaInspector`, `MoverPlanoModal`.
- Produces: página Concluídas com filtro/handoff.

- [ ] **Step 1: Criar helpers de filtro**

Criar `concluidas-utils.ts`:

```typescript
import type { CoffeeNota } from '../types';

export function completionDate(nota: CoffeeNota): string {
  return nota.classificacao_em ?? nota.buscado_em;
}

export function notaMatches(nota: CoffeeNota, query: string): boolean {
  const q = query.trim().toLocaleLowerCase("pt-BR");
  if (!q) return true;
  const fields = nota.dados_json ?? {};
  const local = [
    fields.cidade,
    fields.tipo_local_instalacao,
    fields.local_instalacao_numero,
  ].filter((value) => value != null).join("");
  return [
    nota.pk,
    nota.id_sap,
    local,
  ].some((value) => String(value).toLocaleLowerCase("pt-BR").includes(q));
}
```

Filtrar por `classificacao`, busca e período; ordenar por
`completionDate` descendente.

- [ ] **Step 2: Criar toolbar**

Criar `concluidas-toolbar.tsx`:

```typescript
import React from 'react';
import { Copy, Search } from 'lucide-react';
import type { CoffeeConclusaoFiltro } from '../../../../types';
import { useCoffeePortalTheme } from '../../use-coffee-portal-theme';
import { SegTabs } from '@/components/branded/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type ConcluidasPeriodo = "7d" | "30d" | "tudo";

interface ConcluidasToolbarProps {
  filtro: CoffeeConclusaoFiltro;
  onFiltroChange: (filtro: CoffeeConclusaoFiltro) => void;
  query: string;
  onQueryChange: (value: string) => void;
  periodo: ConcluidasPeriodo;
  onPeriodoChange: (value: ConcluidasPeriodo) => void;
  contagens: { todas: number; gerada: number; corrigida: number };
  copyDisabled: boolean;
  onCopy: () => void;
}

export function ConcluidasToolbar({
  filtro,
  onFiltroChange,
  query,
  onQueryChange,
  periodo,
  onPeriodoChange,
  contagens,
  copyDisabled,
  onCopy,
}: ConcluidasToolbarProps): React.JSX.Element {
  const portalTheme = useCoffeePortalTheme();
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-line px-[22px] py-4">
      <SegTabs
        ariaLabel="Resultado das notas concluídas"
        value={filtro}
        onChange={onFiltroChange}
        tabs={[
          { id: "todas", rotulo: `Todas ${contagens.todas}` },
          { id: "gerada", rotulo: `Geradas ${contagens.gerada}` },
          { id: "corrigida", rotulo: `Corrigidas ${contagens.corrigida}` },
        ]}
      />
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-text-mute">
        Buscar ID, SAP ou local
        <span className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="pl-8"
          />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-mute">
        Período
        <Select
          value={periodo}
          onValueChange={(value) =>
            onPeriodoChange(value as ConcluidasPeriodo)
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            {...portalTheme}
            className="edp"
          >
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="tudo">Todo período</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Button
        variant="outline"
        size="sm"
        disabled={copyDisabled}
        onClick={onCopy}
      >
        <Copy /> Copiar IDs
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Criar lista responsiva**

Criar `concluidas-list.tsx`:

```typescript
import React from 'react';
import type { CoffeeNota } from '../../types';
import { formatRelativeTime } from '../../format';
import { completionDate } from '../concluidas-utils';

interface ConcluidasListProps {
  notas: CoffeeNota[];
  selected: Set<number>;
  onToggle: (pk: number) => void;
  onOpen: (pk: number, trigger: HTMLButtonElement) => void;
}

function field(nota: CoffeeNota, key: string): string {
  const value = nota.dados_json?.[key];
  return value == null || value === "" ? "—" : String(value);
}

function local(nota: CoffeeNota): string {
  const parts = [
    field(nota, "cidade"),
    field(nota, "tipo_local_instalacao"),
    field(nota, "local_instalacao_numero"),
  ].filter((value) => value !== "—");
  return parts.length > 0 ? parts.join("-") : "—";
}

function Resultado({ nota }: { nota: CoffeeNota }): React.JSX.Element {
  const gerada = nota.classificacao === "gerada";
  return (
    <span
      className={[
        "w-fit rounded-full px-2 py-1 text-xs font-medium",
        gerada
          ? "bg-tint-green text-green"
          : "bg-tint-blue text-blue",
      ].join(" ")}
    >
      {gerada ? "Gerada" : "Corrigida"}
    </span>
  );
}

function SelectNota({
  nota,
  selected,
  onToggle,
}: {
  nota: CoffeeNota;
  selected: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  if (nota.classificacao !== "corrigida") {
    return <span className="size-4" aria-hidden="true" />;
  }
  return (
    <input
      type="checkbox"
      checked={selected}
      onChange={onToggle}
      aria-label={`Selecionar nota corrigida ${nota.pk}`}
    />
  );
}

function LegacyDate({ nota }: { nota: CoffeeNota }): React.JSX.Element {
  const fallback = nota.classificacao_em == null;
  return (
    <span title={fallback ? "Data da última consulta" : undefined}>
      {formatRelativeTime(completionDate(nota))}
    </span>
  );
}

export function ConcluidasList({
  notas,
  selected,
  onToggle,
  onOpen,
}: ConcluidasListProps): React.JSX.Element {
  if (notas.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-sm text-text-mute">
        Nenhuma nota concluída encontrada.
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        className="sticky top-0 z-10 hidden grid-cols-[28px_0.7fr_0.8fr_1.8fr_0.9fr_0.8fr_0.8fr] gap-3 border-b border-line bg-bg-2 px-[22px] py-2 text-xs text-text-mute md:grid"
        aria-hidden="true"
      >
        <span />
        <span>ID</span>
        <span>SAP</span>
        <span>Local</span>
        <span>Resultado</span>
        <span>Origem</span>
        <span>Quando</span>
      </div>
      {notas.map((nota) => (
        <article key={nota.pk} className="border-b border-line px-[22px] py-3">
          <div className="hidden grid-cols-[28px_1fr] items-center gap-3 md:grid">
            <SelectNota
              nota={nota}
              selected={selected.has(nota.pk)}
              onToggle={() => onToggle(nota.pk)}
            />
            <button
              type="button"
              onClick={(event) => onOpen(nota.pk, event.currentTarget)}
              className="grid grid-cols-[0.7fr_0.8fr_1.8fr_0.9fr_0.8fr_0.8fr] items-center gap-3 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Abrir detalhes da nota ${nota.pk}`}
            >
              <span className="edp-mono">#{nota.pk}</span>
              <span className="edp-mono">{nota.id_sap ?? "—"}</span>
              <span className="truncate">{local(nota)}</span>
              <span><Resultado nota={nota} /></span>
              <span>{nota.origem ?? "—"}</span>
              <span className="text-text-mute">
                <LegacyDate nota={nota} />
              </span>
            </button>
          </div>
          <div className="flex items-start gap-3 md:hidden">
            <SelectNota
              nota={nota}
              selected={selected.has(nota.pk)}
              onToggle={() => onToggle(nota.pk)}
            />
            <button
              type="button"
              onClick={(event) => onOpen(nota.pk, event.currentTarget)}
              className="min-w-0 flex-1 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Abrir detalhes da nota ${nota.pk}`}
            >
              <div className="flex items-center gap-2">
                <strong className="edp-mono">#{nota.pk}</strong>
                <Resultado nota={nota} />
              </div>
              <p className="mt-2 truncate text-sm">{local(nota)}</p>
              <p className="mt-1 text-xs text-text-mute">
                SAP {nota.id_sap ?? "—"} · {nota.origem ?? "—"} ·{" "}
                <LegacyDate nota={nota} />
              </p>
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Integrar página, handoff e mover para plano**

Implementar `coffee-concluidas.tsx`:

```typescript
import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CoffeeConclusaoFiltro } from '../../../types';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '../confirm-modal';
import {
  CoffeeNotaInspector,
  type InspectorAction,
} from '../components/coffee-nota-inspector';
import {
  MoverPlanoModal,
  type MoverAlvo,
} from '../mover-plano-modal';
import type { NotaRevisao } from '../types';
import { REVISAO_KEY } from '../use-nota-revisao';
import { OperacaoApi } from '../operacao/operacao-api';
import {
  CONCLUIDAS_KEY,
  useCoffeeConcluidas,
} from './use-coffee-concluidas';
import { completionDate, notaMatches } from './concluidas-utils';
import {
  ConcluidasToolbar,
  type ConcluidasPeriodo,
} from './components/concluidas-toolbar';
import { ConcluidasList } from './components/concluidas-list';

interface CoffeeConcluidasProps {
  handoff: { filtro: CoffeeConclusaoFiltro; id: number } | null;
  onIrParaInput?: () => void;
}

function inPeriod(date: string, periodo: ConcluidasPeriodo): boolean {
  if (periodo === "tudo") return true;
  const parsed = new Date(date).getTime();
  if (Number.isNaN(parsed)) return false;
  const days = periodo === "7d" ? 7 : 30;
  return parsed >= Date.now() - days * 86_400_000;
}

export function CoffeeConcluidas({
  handoff,
  onIrParaInput,
}: CoffeeConcluidasProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const concluidas = useCoffeeConcluidas();
  const notas = concluidas.data ?? [];
  const [filtro, setFiltro] =
    React.useState<CoffeeConclusaoFiltro>("todas");
  const [query, setQuery] = React.useState("");
  const [periodo, setPeriodo] =
    React.useState<ConcluidasPeriodo>("30d");
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [selectedPk, setSelectedPk] = React.useState<number | null>(null);
  const [moverAlvo, setMoverAlvo] = React.useState<MoverAlvo | null>(null);
  const [archivePk, setArchivePk] = React.useState<number | null>(null);
  const lastHandoffId = React.useRef<number | null>(null);
  const lastTriggerRef = React.useRef<HTMLButtonElement | null>(null);

  const contagens = React.useMemo(() => ({
    todas: notas.length,
    gerada: notas.filter((nota) => nota.classificacao === "gerada").length,
    corrigida: notas.filter(
      (nota) => nota.classificacao === "corrigida",
    ).length,
  }), [notas]);

  const filtered = React.useMemo(() => (
    notas
      .filter(
        (nota) =>
          (filtro === "todas" || nota.classificacao === filtro)
          && notaMatches(nota, query)
          && inPeriod(completionDate(nota), periodo),
      )
      .sort(
        (left, right) =>
          new Date(completionDate(right)).getTime()
          - new Date(completionDate(left)).getTime(),
      )
  ), [filtro, notas, periodo, query]);

  const visibleCorrected = React.useMemo(
    () => new Set(
      filtered
        .filter((nota) => nota.classificacao === "corrigida")
        .map((nota) => nota.pk),
    ),
    [filtered],
  );

  React.useEffect(() => {
    if (handoff === null || handoff.id === lastHandoffId.current) return;
    lastHandoffId.current = handoff.id;
    setFiltro(handoff.filtro);
  }, [handoff]);

  React.useEffect(() => {
    setSelected((current) => {
      const next = new Set(
        [...current].filter((pk) => visibleCorrected.has(pk)),
      );
      return next.size === current.size ? current : next;
    });
  }, [visibleCorrected]);

  const archiveMutation = useMutation({
    mutationFn: ({
      pk,
      justificativa,
    }: {
      pk: number;
      justificativa: string;
    }) => OperacaoApi.arquivar(pk, justificativa),
    onSuccess: async (_, variables) => {
      setArchivePk(null);
      setSelectedPk(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CONCLUIDAS_KEY }),
        queryClient.invalidateQueries({
          queryKey: REVISAO_KEY(variables.pk),
        }),
      ]);
      toast.success("Nota arquivada");
    },
    onError: (error: unknown) => {
      toast.error("Falha ao arquivar", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  function toggle(pk: number): void {
    if (!visibleCorrected.has(pk)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  }

  function openInspector(pk: number, trigger: HTMLButtonElement): void {
    lastTriggerRef.current = trigger;
    setSelectedPk(pk);
  }

  function closeInspector(): void {
    setSelectedPk(null);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }

  function handleInspectorAction(
    action: InspectorAction,
    revisao: NotaRevisao,
  ): void {
    if (action === "mover") {
      setMoverAlvo({ pks: [revisao.coffee.pk], revisao });
      return;
    }
    if (action === "arquivar") {
      setArchivePk(revisao.coffee.pk);
      return;
    }
    toast.error("Ação indisponível em notas concluídas.");
  }

  async function copyIds(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        filtered.map((nota) => nota.pk).join("\n"),
      );
      toast.success(`${filtered.length} ID(s) copiado(s)`);
    } catch (error: unknown) {
      toast.error("Não foi possível copiar automaticamente", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (concluidas.error) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-sm text-red">
        <div className="text-center">
          <p>Falha ao carregar notas concluídas.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void concluidas.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-[22px] pt-4">
        <span className="edp-eyebrow">Histórico operacional</span>
        <div className="flex items-baseline gap-3">
          <h1 className="edp-title text-lg">Notas concluídas</h1>
          <span className="edp-mono text-xs text-text-mute">
            {contagens.todas} no total
          </span>
        </div>
      </header>
      <ConcluidasToolbar
        filtro={filtro}
        onFiltroChange={setFiltro}
        query={query}
        onQueryChange={setQuery}
        periodo={periodo}
        onPeriodoChange={setPeriodo}
        contagens={contagens}
        copyDisabled={filtered.length === 0}
        onCopy={() => void copyIds()}
      />
      <div className="flex items-center gap-3 border-b border-line px-[22px] py-2">
        <span className="edp-mono text-xs text-text-mute">
          {concluidas.isLoading ? "Carregando…" : `${filtered.length} resultados`}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          disabled={selected.size === 0}
          onClick={() =>
            setMoverAlvo({ pks: [...selected], revisao: null })
          }
        >
          Mover para Plano ({selected.size})
        </Button>
      </div>
      <ConcluidasList
        notas={filtered}
        selected={selected}
        onToggle={toggle}
        onOpen={openInspector}
      />
      <CoffeeNotaInspector
        pk={selectedPk}
        open={selectedPk !== null}
        onClose={closeInspector}
        onAction={handleInspectorAction}
      />
      <ConfirmModal
        open={archivePk !== null}
        title="Arquivar nota"
        message="A nota deixará de aparecer nas listagens."
        confirmLabel="Arquivar"
        tone="danger"
        requireJustification
        busy={archiveMutation.isPending}
        onCancel={() => setArchivePk(null)}
        onConfirm={(justificativa) => {
          if (archivePk !== null) {
            archiveMutation.mutate({ pk: archivePk, justificativa });
          }
        }}
      />
      <MoverPlanoModal
        alvo={moverAlvo}
        onClose={() => setMoverAlvo(null)}
        onSucesso={() => setSelected(new Set())}
        onIrParaInput={onIrParaInput}
      />
    </div>
  );
}
```

O inspector não recebe `etapa` nesta página; por isso oferece `Arquivar`
somente para `gerada`. A confirmação permanece fora do portal do inspector.

- [ ] **Step 5: Rodar build e QA**

Run:

```powershell
Set-Location frontend
npm run build
```

Expected: exit code 0.

Manual:

- Todas mostra as duas classificações;
- Geradas não contém corrigidas;
- Corrigidas habilita seleção e Mover para Plano;
- Gerada oferece Arquivar com justificativa; Corrigida não oferece;
- busca encontra ID, SAP e local;
- período usa `classificacao_em` e fallback explícito;
- handoff de Relatórios abre Corrigidas;
- desktop usa lista, mobile usa cards.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/coffee/concluidas frontend/src/features/coffee/coffee-hub.tsx
git commit -m "feat(coffee): add completed notes page"
```

---

### Task 11: Migrar sessão legada, remover UI antiga e verificar ponta a ponta

**Files:**
- Modify: `frontend/src/features/coffee/operacao/coffee-operacao.tsx`
- Modify: `frontend/src/features/coffee/coffee-hub.tsx`
- Delete:
  - `frontend/src/features/coffee/coffee-geradas.tsx`
  - `frontend/src/features/coffee/coffee-corrigidas.tsx`
  - `frontend/src/features/coffee/coffee-pendentes.tsx`
  - `frontend/src/features/coffee/coffee-gerar-modal.tsx`
  - `frontend/src/features/coffee/revisar-nota-sheet.tsx`
  - `frontend/src/features/coffee/coffee-log-drawer.tsx`
  - `frontend/src/features/coffee/coffee-notas-table.tsx`
- Modify: `docs/dev/04-frontend-shared.md`
- Modify: `docs/superpowers/specs/2026-07-24-coffee-operacao-kanban-design.md` only if implementation revealed an approved-contract correction.

**Interfaces:**
- Consumes: todas as tarefas anteriores.
- Produces: fluxo sem legado morto, documentação atualizada e verificação final.

- [ ] **Step 1: Implementar migração única do modal antigo**

No container Operação:

```typescript
const LEGACY_ROWS_KEY = "edp_coffee_gerar_rows";
const LEGACY_MIGRATED_KEY = "edp_coffee_gerar_rows_migrated";
const legacyMigrationStarted = React.useRef(false);

React.useEffect(() => {
  if (legacyMigrationStarted.current) return;
  legacyMigrationStarted.current = true;
  if (sessionStorage.getItem(LEGACY_MIGRATED_KEY) === "1") return;
  try {
    const raw = sessionStorage.getItem(LEGACY_ROWS_KEY);
    const rows = raw
      ? (JSON.parse(raw) as Array<{ id?: unknown }>)
      : [];
    const ids = rows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length === 0) {
      sessionStorage.setItem(LEGACY_MIGRATED_KEY, "1");
      return;
    }
    consultar.mutate([...new Set(ids)], {
      onSuccess: () => {
        sessionStorage.removeItem(LEGACY_ROWS_KEY);
        sessionStorage.setItem(LEGACY_MIGRATED_KEY, "1");
      },
    });
  } catch {
    sessionStorage.setItem(LEGACY_MIGRATED_KEY, "1");
  }
}, [consultar]);
```

Não remover a chave se a mutation falhar.

- [ ] **Step 2: Encontrar consumidores antes de excluir**

Run:

```powershell
rg -n "CoffeeGeradas|CoffeeCorrigidas|CoffeePendentes|CoffeeGerarModal|RevisarNotaSheet|LogDrawer|CoffeeNotasTable" frontend/src
rg -n "coffee-notas-table" frontend/src/features/coffee/operacao frontend/src/features/coffee/components frontend/src/features/coffee/concluidas
```

Expected: o primeiro comando encontra somente definições/imports dentro dos
arquivos legados; o segundo não encontra consumidores novos.

- [ ] **Step 3: Excluir legados sem consumidores**

Excluir os sete arquivos listados no escopo da tarefa. O formatter compartilhado
já foi criado na Task 8; nenhum código novo deve importar
`coffee-notas-table.tsx`. Não editar `src/components/ui/`.

- [ ] **Step 4: Atualizar documentação de arquitetura**

Em `docs/dev/04-frontend-shared.md`, documentar:

- subseções `Verificar`, `Abrir`, `Operação`, `Concluídas`, `Logs`;
- React Query keys;
- fila/jobs persistidos no SQLite;
- `useCoffeePortalTheme` entrega tema/densidade/acento a Sheet, Dialog,
  AlertDialog e Select portalizados;
- páginas antigas removidas.

- [ ] **Step 5: Rodar verificação backend completa**

Run:

```powershell
Set-Location backend
python -m pytest -q
```

Expected: todos os testes PASS, sem acesso ao banco real.

- [ ] **Step 6: Rodar verificação frontend**

Run:

```powershell
Set-Location frontend
npm run build
rg -n "CoffeeGeradas|CoffeeCorrigidas|CoffeePendentes|CoffeeGerarModal|RevisarNotaSheet|LogDrawer" src
rg -n "console\\.log|\\bany\\b" src/features/coffee
```

Expected:

- build exit code 0;
- primeiro `rg` sem resultados;
- segundo `rg` sem `console.log` nem novo `any`.

- [ ] **Step 7: QA funcional ponta a ponta**

Executar manualmente:

1. Verificar → marcar nota → card aparece em Operação.
2. Colar lote com válido, duplicado e inválido → resumo correto.
3. Consulta move cards entre Fila, Prontas e Aguardando SAP.
4. Geração parcial preserva sucessos e erro por card.
5. Atualizar browser durante job → progresso continua.
6. Reiniciar backend durante job → estado Interrompido e card retorna a
   Prontas com instrução.
7. Atualizar SAP real → card sai e aparece em Concluídas.
8. Geradas e Corrigidas não se misturam nos filtros.
9. Inspector preserva scroll, seleção e devolve foco.
10. Editar local atualiza a ficha e o card; falha mantém o valor digitado.
11. Arquivar Gerada remove de Concluídas após confirmação.
12. Mover corrigidas para Plano continua funcional.
13. Sistema/Claro/Escuro × verde/azul/índigo × compact/cozy.
14. Teclado, 390 px, 1024 px, desktop e reduced motion.

- [ ] **Step 8: Revisar diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat origin/develop...HEAD
```

Expected: sem whitespace errors; somente arquivos do escopo e arquivos
preexistentes não rastreados/modificados permanecem fora dos commits.

- [ ] **Step 9: Commit final de integração**

```powershell
git add frontend/src/features/coffee docs/dev/04-frontend-shared.md
git commit -m "refactor(coffee): retire legacy generation views"
```

---

## Final Review Gate

Antes de considerar a implementação concluída:

```powershell
Set-Location backend
python -m pytest -q
Set-Location ..\frontend
npm run build
Set-Location ..
git diff --check origin/develop...HEAD
git status --short --branch
```

Expected:

- pytest completo PASS;
- TypeScript/Vite build PASS;
- nenhum whitespace error;
- branch contém apenas commits do redesign;
- `CLAUDE.md`, `README.md`, `.agents/` e `skills-lock.json` não entram nos
  commits se continuarem como alterações preexistentes.

Revisar também:

- nenhuma lógica duplicada entre Operação e Concluídas;
- nenhum estado de servidor copiado para Context;
- nenhuma cor arbitrária;
- nenhum componente vendorizado alterado;
- nenhuma ação sem label acessível;
- nenhum job interrompido apresentado como sucesso;
- nenhum card duplicado para o mesmo PK canônico.
