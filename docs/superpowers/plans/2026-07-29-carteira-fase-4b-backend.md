# Carteira de Notas — Fase 4b (Backend de Enriquecimento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um endpoint read-only que localiza uma nota da projeção da Carteira pelo número SAP e devolve os nove campos aprovados, com estados explícitos para encontrada, tombstone, sem correspondência e base nunca sincronizada.

**Architecture:** `repository.py` faz um único lookup determinístico em `nota_carteira`; `service.py` transforma o registro interno no contrato público sem PII; `routes.py` expõe a rota estática antes da rota dinâmica existente e aplica ETag/304 pela versão da projeção. Input e COFFEE não ganham dependência de backend: ambos consumirão a fronteira HTTP da Carteira no plano frontend.

**Tech Stack:** Python 3, FastAPI, SQLite, pytest.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-29-carteira-fase-4b-enriquecimento-design.md`.
- **Chave:** `Numero_Nota`/`coffee.id_sap` consulta `nota_carteira.id_sap`; somente linhas com `sap_real=1` podem casar.
- **Desempate obrigatório:** `ORDER BY sincronizado_em DESC, id_onr ASC LIMIT 1`.
- **Campos públicos e somente eles:** `descricao_conjunto`, `conjunto`, `sintoma`, `componente_novo`, `kit`, `n_trafo`, `dispositivo_protecao`, `status_sap`, `prioridade_sap`.
- **PII proibida:** nunca expor `matriculaSAP`, `nomeColaborador`, `colaborador` ou `Solicitante`.
- **Estados públicos:** `encontrada`, `ausente_na_origem`, `sem_correspondencia`, `base_nao_sincronizada`.
- **Semântica:** ausência esperada retorna HTTP 200; `dados=null` apenas para `sem_correspondencia` e `base_nao_sincronizada`; tombstone mantém os últimos dados e `ausente_na_origem_em`.
- **Cache:** responder com `ETag: W/"{versao}"`, `Cache-Control: no-cache` e HTTP 304 quando `If-None-Match` casar.
- **Boundary:** não modificar `input_module` nem `coffee_module`.
- **Fora de escopo:** não consultar `notas_sp`, não criar novo pull do
  Databricks e não materializar ponte por `id_onr`.
- **Erros:** falhas reais de SQLite devem continuar propagando como erro; não convertê-las em estado neutro.
- **Documentação:** atualizar `docs/dev/10-backend-carteira-module.md` na mesma entrega.
- **Comandos backend:** executar a partir de `backend/` usando `.venv\Scripts\python.exe`.

---

## File Structure

- `backend/carteira_module/repository.py` — lookup SQL por número SAP, com filtro e desempate.
- `backend/carteira_module/service.py` — máquina de estados e projeção do contrato público.
- `backend/carteira_module/routes.py` — rota, ETag/304 e ordem estática antes de `/{id_onr}`.
- `backend/test_carteira_module.py` — testes de repositório, service, contrato HTTP e erro real.
- `docs/dev/10-backend-carteira-module.md` — contrato e regras operacionais do endpoint.

---

### Task 1: Lookup determinístico por número SAP

**Files:**
- Modify: `backend/carteira_module/repository.py:198`
- Test: `backend/test_carteira_module.py:185`

**Interfaces:**
- Consumes: conexão `sqlite3.Connection` já inicializada e `numero: int`.
- Produces: `repository.obter_por_id_sap(conn, numero) -> dict | None`.
- O dicionário interno inclui `id_onr`, os nove campos públicos, `sincronizado_em` e `ausente_na_origem_em`; `id_onr` e `sincronizado_em` servem ao lookup/teste e não atravessam o contrato HTTP.

- [ ] **Step 1: Escrever o teste que falha**

Adicione após `test_reconciliar_detecta_alteracao` em `backend/test_carteira_module.py`:

```python
def test_obter_por_id_sap_filtra_sap_real_e_desempata(carteira_tmp):
    from carteira_module import db, mapping, repository

    conn = db.conectar()
    _inserir(conn, [
        mapping.normalizar_linha(_origem_exemplo(
            id_onr=30, id_sap="700500", conjunto="ANTIGO",
        )),
        mapping.normalizar_linha(_origem_exemplo(
            id_onr=20, id_sap="700500", conjunto="DESEMPATE",
        )),
        mapping.normalizar_linha(_origem_exemplo(
            id_onr=25, id_sap="700500", conjunto="MESMA_DATA",
        )),
        mapping.normalizar_linha(_origem_exemplo(
            id_onr=10, id_sap="700500", conjunto="SAP_NAO_REAL",
        )),
    ])
    conn.execute(
        "UPDATE nota_carteira SET sincronizado_em=? WHERE id_onr=?",
        ("2026-07-28T08:00:00", 30),
    )
    conn.execute(
        "UPDATE nota_carteira SET sincronizado_em=? WHERE id_onr IN (?,?)",
        ("2026-07-29T08:00:00", 20, 25),
    )
    conn.execute(
        "UPDATE nota_carteira SET sap_real=0, sincronizado_em=? WHERE id_onr=?",
        ("2026-07-30T08:00:00", 10),
    )
    conn.commit()

    encontrada = repository.obter_por_id_sap(conn, 700500)
    ausente = repository.obter_por_id_sap(conn, 999999)
    conn.close()

    assert encontrada is not None
    assert encontrada["id_onr"] == 20
    assert encontrada["conjunto"] == "DESEMPATE"
    assert encontrada["sincronizado_em"] == "2026-07-29T08:00:00"
    assert ausente is None
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run, a partir de `backend/`:

```powershell
.venv\Scripts\python.exe -m pytest test_carteira_module.py -k obter_por_id_sap -v
```

Expected: FAIL com `AttributeError` porque `repository.obter_por_id_sap` ainda não existe.

- [ ] **Step 3: Implementar o lookup mínimo**

Adicione imediatamente depois de `obter` em `backend/carteira_module/repository.py`:

```python
def obter_por_id_sap(conn: sqlite3.Connection, numero: int) -> dict | None:
    row = conn.execute(
        "SELECT id_onr, descricao_conjunto, conjunto, sintoma, "
        "componente_novo, kit, n_trafo, dispositivo_protecao, "
        "status_sap, prioridade_sap, sincronizado_em, ausente_na_origem_em "
        "FROM nota_carteira "
        "WHERE id_sap = ? AND sap_real = 1 "
        "ORDER BY sincronizado_em DESC, id_onr ASC LIMIT 1",
        (str(numero),),
    ).fetchone()
    return dict(row) if row else None
```

- [ ] **Step 4: Rodar o teste para confirmar o passe**

Run:

```powershell
.venv\Scripts\python.exe -m pytest test_carteira_module.py -k obter_por_id_sap -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/carteira_module/repository.py backend/test_carteira_module.py
git commit -m "feat(carteira): add SAP enrichment lookup"
```

---

### Task 2: Máquina de estados e contrato público no service

**Files:**
- Modify: `backend/carteira_module/service.py:71`
- Test: `backend/test_carteira_module.py`

**Interfaces:**
- Consumes: `repository.obter_por_id_sap(conn, numero) -> dict | None` da Task 1 e `db.obter_versao() -> str`.
- Produces: `service.enriquecimento_por_sap(numero: int) -> dict`.
- Shape produzido:

```python
{
    "numero_sap": int,
    "estado": (
        "encontrada"
        | "ausente_na_origem"
        | "sem_correspondencia"
        | "base_nao_sincronizada"
    ),
    "dados": dict | None,
    "ausente_na_origem_em": str | None,
    "versao": str,
}
```

- [ ] **Step 1: Escrever os testes dos quatro estados**

Adicione em `backend/test_carteira_module.py`:

```python
def test_enriquecimento_por_sap_base_nao_sincronizada(carteira_tmp):
    from carteira_module import service

    resultado = service.enriquecimento_por_sap(700500)

    assert resultado == {
        "numero_sap": 700500,
        "estado": "base_nao_sincronizada",
        "dados": None,
        "ausente_na_origem_em": None,
        "versao": "0",
    }


def test_enriquecimento_por_sap_sem_correspondencia(carteira_tmp):
    from carteira_module import service, sync

    sync.sincronizar(
        ler_origem=lambda: [_origem_exemplo(id_onr=1, id_sap="700500")],
        ler_marker=lambda: "M1",
        agora="2026-07-29T08:00:00",
    )

    resultado = service.enriquecimento_por_sap(999999)

    assert resultado["estado"] == "sem_correspondencia"
    assert resultado["dados"] is None
    assert resultado["ausente_na_origem_em"] is None
    assert resultado["versao"] != "0"


def test_enriquecimento_por_sap_encontrada_e_tombstone(carteira_tmp):
    from carteira_module import service, sync

    sync.sincronizar(
        ler_origem=lambda: [_origem_exemplo(
            id_onr=1,
            id_sap="700500",
            conjunto="POSTE",
            **{"descrição_conjunto": "POSTES - CAPEX"},
        )],
        ler_marker=lambda: "M1",
        agora="2026-07-29T08:00:00",
    )

    encontrada = service.enriquecimento_por_sap(700500)
    assert encontrada["estado"] == "encontrada"
    assert encontrada["ausente_na_origem_em"] is None
    assert encontrada["dados"] == {
        "descricao_conjunto": "POSTES - CAPEX",
        "conjunto": "POSTE",
        "sintoma": "queda",
        "componente_novo": "N",
        "kit": None,
        "n_trafo": None,
        "dispositivo_protecao": None,
        "status_sap": "Pendente",
        "prioridade_sap": 3,
    }
    assert set(encontrada["dados"]) == {
        "descricao_conjunto",
        "conjunto",
        "sintoma",
        "componente_novo",
        "kit",
        "n_trafo",
        "dispositivo_protecao",
        "status_sap",
        "prioridade_sap",
    }

    sync.sincronizar(
        ler_origem=lambda: [],
        ler_marker=lambda: "M2",
        agora="2026-07-29T09:00:00",
    )
    tombstone = service.enriquecimento_por_sap(700500)

    assert tombstone["estado"] == "ausente_na_origem"
    assert tombstone["dados"] == encontrada["dados"]
    assert tombstone["ausente_na_origem_em"] == "2026-07-29T09:00:00"
```

Campos vazios seguem a normalização existente e permanecem `null` no contrato.

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run:

```powershell
.venv\Scripts\python.exe -m pytest test_carteira_module.py -k enriquecimento_por_sap -v
```

Expected: FAIL com `AttributeError` porque `service.enriquecimento_por_sap` ainda não existe.

- [ ] **Step 3: Implementar o contrato e os estados**

Adicione em `backend/carteira_module/service.py`, depois de `detalhe`:

```python
_CAMPOS_ENRIQUECIMENTO = (
    "descricao_conjunto",
    "conjunto",
    "sintoma",
    "componente_novo",
    "kit",
    "n_trafo",
    "dispositivo_protecao",
    "status_sap",
    "prioridade_sap",
)


def enriquecimento_por_sap(numero: int) -> dict:
    versao = db.obter_versao()
    resposta = {
        "numero_sap": numero,
        "estado": "base_nao_sincronizada",
        "dados": None,
        "ausente_na_origem_em": None,
        "versao": versao,
    }
    if versao == "0":
        return resposta

    conn = db.conectar()
    try:
        nota = repository.obter_por_id_sap(conn, numero)
    finally:
        conn.close()

    if nota is None:
        resposta["estado"] = "sem_correspondencia"
        return resposta

    resposta["estado"] = (
        "ausente_na_origem"
        if nota["ausente_na_origem_em"] is not None
        else "encontrada"
    )
    resposta["dados"] = {
        campo: nota.get(campo)
        for campo in _CAMPOS_ENRIQUECIMENTO
    }
    resposta["ausente_na_origem_em"] = nota["ausente_na_origem_em"]
    return resposta
```

Não envolva a leitura em `except`: `sqlite3.Error` deve atravessar o service e produzir erro HTTP real.

- [ ] **Step 4: Rodar os testes para confirmar o passe**

Run:

```powershell
.venv\Scripts\python.exe -m pytest test_carteira_module.py -k enriquecimento_por_sap -v
```

Expected: 3 testes PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/carteira_module/service.py backend/test_carteira_module.py
git commit -m "feat(carteira): expose enrichment states"
```

---

### Task 3: Endpoint estático, ETag/304 e propagação de erro

**Files:**
- Modify: `backend/carteira_module/routes.py:35`
- Test: `backend/test_carteira_module.py:282`

**Interfaces:**
- Consumes: `service.enriquecimento_por_sap(numero) -> dict`.
- Produces: `GET /api/carteira/notas/por-sap/{numero}`.
- A rota deve ser declarada antes de `@router.get("/notas/{id_onr}")`; caso contrário, FastAPI tenta validar a string `por-sap` como `id_onr`.

- [ ] **Step 1: Escrever o teste do contrato e do ETag**

Adicione em `backend/test_carteira_module.py`:

```python
def test_rota_enriquecimento_por_sap_e_etag(carteira_tmp):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from carteira_module import routes, sync

    sync.sincronizar(
        ler_origem=lambda: [_origem_exemplo(
            id_onr=1,
            id_sap="700500",
            conjunto="POSTE",
            **{"descrição_conjunto": "POSTES - CAPEX"},
        )],
        ler_marker=lambda: "M1",
        agora="2026-07-29T08:00:00",
    )
    app = FastAPI()
    app.include_router(routes.router)
    cliente = TestClient(app)

    primeira = cliente.get("/api/carteira/notas/por-sap/700500")
    assert primeira.status_code == 200
    assert primeira.json()["estado"] == "encontrada"
    assert primeira.json()["numero_sap"] == 700500
    assert primeira.headers["cache-control"] == "no-cache"
    etag = primeira.headers["etag"]
    assert etag.startswith('W/"')

    segunda = cliente.get(
        "/api/carteira/notas/por-sap/700500",
        headers={"If-None-Match": etag},
    )
    assert segunda.status_code == 304
    assert segunda.headers["etag"] == etag
    assert segunda.headers["cache-control"] == "no-cache"
```

Adicione também o teste que diferencia falha real de ausência esperada:

```python
def test_rota_enriquecimento_propaga_erro_real(
    carteira_tmp,
    monkeypatch,
):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from carteira_module import routes, service

    def falhar(_numero: int) -> dict:
        raise RuntimeError("carteira.db indisponivel")

    monkeypatch.setattr(service, "enriquecimento_por_sap", falhar)
    app = FastAPI()
    app.include_router(routes.router)
    cliente = TestClient(app, raise_server_exceptions=False)

    resposta = cliente.get("/api/carteira/notas/por-sap/700500")

    assert resposta.status_code == 500
```

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run:

```powershell
.venv\Scripts\python.exe -m pytest test_carteira_module.py -k rota_enriquecimento -v
```

Expected: FAIL; a URL ainda é capturada pela rota dinâmica `/notas/{id_onr}` ou retorna 404.

- [ ] **Step 3: Adicionar a rota antes de `/{id_onr}`**

Em `backend/carteira_module/routes.py`, insira este bloco imediatamente antes de `@router.get("/notas/{id_onr}")`:

```python
@router.get("/notas/por-sap/{numero}")
def obter_enriquecimento_por_sap(
    numero: int,
    request: Request,
    response: Response,
):
    corpo = service.enriquecimento_por_sap(numero)
    etag = f'W/"{corpo["versao"]}"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    return corpo
```

- [ ] **Step 4: Rodar os testes da rota**

Run:

```powershell
.venv\Scripts\python.exe -m pytest test_carteira_module.py -k rota_enriquecimento -v
```

Expected: 2 testes PASS.

- [ ] **Step 5: Rodar todos os testes de enriquecimento**

Run:

```powershell
.venv\Scripts\python.exe -m pytest test_carteira_module.py -k "obter_por_id_sap or enriquecimento_por_sap or rota_enriquecimento" -v
```

Expected: todos PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/carteira_module/routes.py backend/test_carteira_module.py
git commit -m "feat(carteira): add enrichment endpoint with ETag"
```

---

### Task 4: Documentação e verificação backend completa

**Files:**
- Modify: `docs/dev/10-backend-carteira-module.md:104`

**Interfaces:**
- Registra o contrato público que o plano frontend consumirá.
- Não altera código de produção.

- [ ] **Step 1: Documentar o endpoint**

Na seção `## APIs` de `docs/dev/10-backend-carteira-module.md`, adicione:

```markdown
### Enriquecimento por número SAP

`GET /api/carteira/notas/por-sap/{numero}` consulta somente
`nota_carteira.sap_real=1` e desempata duplicatas por
`sincronizado_em DESC, id_onr ASC`. O payload contém `numero_sap`, `estado`,
`dados`, `ausente_na_origem_em` e `versao`.

`estado` pode ser `encontrada`, `ausente_na_origem`,
`sem_correspondencia` ou `base_nao_sincronizada`. Tombstones preservam os
últimos dados e a data de ausência; os dois estados sem dados retornam
`dados=null`. Ausência é resposta HTTP 200. Erro real de leitura permanece
erro HTTP.

`dados` expõe exclusivamente `descricao_conjunto`, `conjunto`, `sintoma`,
`componente_novo`, `kit`, `n_trafo`, `dispositivo_protecao`, `status_sap`
e `prioridade_sap`; nenhuma PII atravessa o endpoint. A rota suporta
ETag/304 pela versão da projeção e é somente leitura.
```

- [ ] **Step 2: Rodar o arquivo de testes da Carteira**

Run, a partir de `backend/`:

```powershell
.venv\Scripts\python.exe -m pytest test_carteira_module.py -v
```

Expected: PASS.

- [ ] **Step 3: Rodar a suíte backend**

Run:

```powershell
.venv\Scripts\python.exe -m pytest -q
```

Expected: PASS sem erro ou teste pulado novo.

- [ ] **Step 4: Validar o diff**

Run, a partir da raiz do repositório:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` sem saída; somente arquivos da Task 4 permanecem sem commit.

- [ ] **Step 5: Commit**

```powershell
git add docs/dev/10-backend-carteira-module.md
git commit -m "docs(carteira): document SAP enrichment endpoint"
```

---

## Self-Review

**Spec coverage:**

- Join por número SAP limitado a `sap_real=1` → Task 1.
- Desempate por sincronização mais recente e menor `id_onr` → Task 1.
- Nove campos sem PII → Tasks 1 e 2.
- Nenhum acesso a `notas_sp` ou ponte por `id_onr` → nenhum arquivo de sync,
  mapping ou Databricks é modificado.
- Estados encontrada, tombstone, sem correspondência e nunca sincronizada → Task 2.
- Ausência em HTTP 200 e erro real em HTTP 500 → Tasks 2 e 3.
- ETag/304 por versão → Task 3.
- `input_module` e `coffee_module` intactos → nenhum arquivo desses módulos no plano.
- Manual backend atualizado → Task 4.
- Suíte específica e suíte completa → Tasks 3 e 4.

**Varredura de lacunas:** todas as ações, interfaces, testes e comandos estão
definidos; não há decisão aberta.

**Type/signature consistency:** `repository.obter_por_id_sap(conn, numero)` produz o registro interno consumido por `service.enriquecimento_por_sap(numero)`; o service sempre produz `versao`, consumida pela rota para ETag. Os quatro valores de `estado` são idênticos aos definidos na spec e no plano frontend.

**Sequenciamento:** concluir e validar este plano antes de iniciar `2026-07-29-carteira-fase-4b-frontend.md`.
