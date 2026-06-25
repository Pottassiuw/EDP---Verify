# COFFEE — Status `nao_gerada` + correção do fluxo de geração Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir dois bugs acoplados do fluxo de geração COFFEE — notas sem SAP passam a classificar como `nao_gerada` (em vez de `gerada`), e a ação `/regerar` passa a escrever o SAP placeholder (`desarquivar` + `arquivar(id, 10000000)`), tornando a nota efetivamente pendente.

**Architecture:** Mudança cirúrgica em três pontos: `classify.py` ganha o caso `nao_gerada` no topo; a rota `/regerar` insere `arquivar(id, config.SAP_PENDENTE)` entre o `desarquivar` e o `buscar`; o frontend ganha a cor da tag `nao_gerada`. `classificacao` é derivada, então não há migração de banco.

**Tech Stack:** Backend — Python, FastAPI, sqlite3, pytest (TestClient + monkeypatch). Frontend — React 18 + TypeScript, Vite (sem framework de teste; verificação via `npm run build`).

## Global Constraints

- O placeholder de "não gerada na API" é a constante `config.SAP_PENDENTE` (`10000000`) — usar a constante, nunca hardcode.
- `classificar(id_sap_atual, id_sap_anterior) -> str` permanece pura, assinatura inalterada.
- "Não gerada" = `id_sap` falsy (`None`, `0`, `""`). Esse caso vem **primeiro** em `classify`.
- Gerar = regerar = `desarquivar(id)` + `arquivar(id, config.SAP_PENDENTE)` + `buscar_nota(id)` + `upsert`.
- Sem migração de banco: `classificacao` é recalculada a cada `upsert`/busca.
- Testes backend rodam com cwd em `backend/`: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py`. Fixtures: `coffee_tmp` (db) e `coffee_cliente` (rotas).
- Frontend verifica com `cd frontend && npm run build`. Sem ciclo TDD no frontend.

---

### Task 1: `classify.py` — status `nao_gerada`

**Files:**
- Modify: `backend/coffee_module/classify.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `config.SAP_PENDENTE` (existente).
- Produces: `classificar` retorna `"nao_gerada"` quando `id_sap_atual` é falsy; pendente/corrigida/gerada inalterados. `upsert_nota` (que chama `classify`) passa a gravar `nao_gerada` para notas sem SAP — verificável via `listar_notas("nao_gerada")`.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Sub-projeto 4 — status nao_gerada
# ---------------------------------------------------------------------------


def test_classificacao_nao_gerada():
    from coffee_module import classify
    assert classify.classificar(None, None) == "nao_gerada"
    assert classify.classificar(0, None) == "nao_gerada"
    assert classify.classificar("", None) == "nao_gerada"
    # sem SAP atual = nao_gerada mesmo com anterior conhecido
    assert classify.classificar(None, config.SAP_PENDENTE) == "nao_gerada"


def test_upsert_nota_sem_sap_classifica_nao_gerada(coffee_tmp):
    from coffee_module import db
    classe = db.upsert_nota(355617, None, False, {"id_sap": None})
    assert classe == "nao_gerada"
    assert db.listar_notas("nao_gerada")[0]["pk"] == 355617
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "nao_gerada" -v`
Expected: FAIL — `classificar(None, None)` retorna `"gerada"` (catch-all atual), não `"nao_gerada"`.

- [ ] **Step 3: Adicionar o caso `nao_gerada` em `classify.py`**

Substitua o corpo de `classificar` em `backend/coffee_module/classify.py` por:

```python
def classificar(id_sap_atual, id_sap_anterior) -> str:
    """nao_gerada | pendente | corrigida | gerada — ver spec. arquivado NÃO entra aqui."""
    if not id_sap_atual:
        return "nao_gerada"
    if id_sap_atual == config.SAP_PENDENTE:
        return "pendente"
    if id_sap_anterior == config.SAP_PENDENTE and id_sap_atual != config.SAP_PENDENTE:
        return "corrigida"
    return "gerada"
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "nao_gerada or classificacao" -v`
Expected: PASS — os novos testes e os de classificação existentes (pendente/corrigida/gerada) passam.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS, sem falhas.

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/classify.py backend/test_coffee_module.py
git commit -m "feat(coffee): status nao_gerada para notas sem SAP"
```

---

### Task 2: `/regerar` escreve o SAP placeholder

**Files:**
- Modify: `backend/coffee_module/routes.py`
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `client.desarquivar`, `client.arquivar`, `client.buscar_nota`, `db.upsert_nota`, `db.marcar_gerar`, `config.SAP_PENDENTE`.
- Produces: `POST /api/coffee/regerar` executa `desarquivar(id)` → `arquivar(id, config.SAP_PENDENTE)` → `buscar_nota(id)` → `upsert`. A nota resultante (re-buscada já com `10000000`) fica `pendente`; a flag `a_gerar` é limpa no sucesso.

- [ ] **Step 1: Atualizar os testes de `/regerar` (falham com o código atual)**

Em `backend/test_coffee_module.py`, substitua a função `test_rota_regerar` inteira por (passa a rastrear `arquivar` e a checar a ordem desarquivar→arquivar; `buscar_nota` devolve o estado pós-geração `10000000`):

```python
def test_rota_regerar(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    chamadas = []
    monkeypatch.setattr(client, "desarquivar", lambda i: chamadas.append(("des", i)) or True)
    monkeypatch.setattr(client, "arquivar", lambda i, sap: chamadas.append(("arq", i, sap)) or True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 10000000, "arquivado": False,
                   "fields": {"id_sap": 10000000}},
    )
    r = coffee_cliente.post("/api/coffee/regerar", json={"id": 355617})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["nota"]["pk"] == 355617
    # desarquivar e arquivar(10000000) foram chamados, nessa ordem
    assert ("des", 355617) in chamadas
    assert ("arq", 355617, 10000000) in chamadas
    assert chamadas.index(("des", 355617)) < chamadas.index(("arq", 355617, 10000000))
    # nota re-buscada com 10000000 fica pendente
    assert db.listar_notas("pendente")[0]["pk"] == 355617
    assert any(l["acao"] == "regerar" for l in db.listar_logs(tipo="acao_usuario"))
```

E substitua a função `test_rota_regerar_limpa_a_gerar` inteira por (acrescenta o mock de `arquivar`, que agora é chamado; `buscar_nota` devolve `10000000`):

```python
def test_rota_regerar_limpa_a_gerar(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    db.marcar_gerar(355617, True)
    monkeypatch.setattr(client, "desarquivar", lambda i: True)
    monkeypatch.setattr(client, "arquivar", lambda i, sap: True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 10000000, "arquivado": False,
                   "fields": {"id_sap": 10000000}},
    )
    r = coffee_cliente.post("/api/coffee/regerar", json={"id": 355617})
    assert r.status_code == 200
    assert db.listar_notas("a_gerar") == []
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "regerar" -v`
Expected: FAIL — `("arq", 355617, 10000000)` não está em `chamadas` (a rota ainda não chama `arquivar`).

- [ ] **Step 3: Importar `config` e inserir o `arquivar` na rota**

Em `backend/coffee_module/routes.py`, troque a linha de import:

```python
from coffee_module import client, db, jobs
```

por:

```python
from coffee_module import client, config, db, jobs
```

E substitua o corpo da rota `regerar` por (insere `arquivar(id, config.SAP_PENDENTE)` entre o `desarquivar` e o `buscar_nota`):

```python
@router.post("/regerar")
def regerar(pedido: IdPedido):
    _garantir_banco()
    try:
        client.desarquivar(pedido.id)
        client.arquivar(pedido.id, config.SAP_PENDENTE)
        nota = client.buscar_nota(pedido.id)
        db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
    except Exception:
        db.registrar_log("acao_usuario", "regerar", pedido.id,
                         {"id": pedido.id, "origem": "ui"}, False)
        raise
    db.marcar_gerar(nota["pk"], False)
    db.registrar_log("acao_usuario", "regerar", pedido.id,
                     {"id": pedido.id, "origem": "ui"}, True)
    return {"ok": True, "nota": nota}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "regerar" -v`
Expected: PASS (ambos os testes de regerar).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: PASS, sem falhas.

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "fix(coffee): /regerar escreve SAP placeholder (desarquivar + arquivar 10000000)"
```

---

### Task 3: Tag `nao_gerada` na tabela de notas (frontend)

**Files:**
- Modify: `frontend/src/coffee/coffee-notas-table.tsx`
- Verify: `frontend/` (`npm run build`)

**Interfaces:**
- Consumes: `CoffeeNota.classificacao` (já renderizado dinamicamente na coluna de status).
- Produces: cor própria para a tag `nao_gerada` (tom neutro/slate, distinto de pendente/corrigida/gerada). A coluna de status renderiza `n.classificacao` via `className={`cnt-tag ${n.classificacao}`}`, então a tag passa a ter estilo assim que a classe CSS existir.

Sem ciclo TDD (frontend). A correção é só a adição de uma regra CSS.

- [ ] **Step 1: Confirmar baseline de build verde**

Run: `cd frontend && npm run build`
Expected: build conclui sem erros.

- [ ] **Step 2: Adicionar a regra CSS da tag `nao_gerada`**

Em `frontend/src/coffee/coffee-notas-table.tsx`, dentro da constante `TABLE_STYLE`, após a linha:

```
  .cnt-tag.pendente{background:var(--tint-amber);color:var(--amber)}
```

adicione:

```
  .cnt-tag.nao_gerada{background:rgba(148,163,184,0.16);color:#94a3b8}
```

- [ ] **Step 3: Rodar o build**

Run: `cd frontend && npm run build`
Expected: PASS, sem erros.

- [ ] **Step 4: Verificação manual**

Run: `cd frontend && npm run dev` (com backend ativo). Confirme:
- Uma nota sem SAP aparece com a tag `nao_gerada` em tom slate (distinta de pendente/corrigida/gerada).
- Após Regerar, a nota passa a `pendente` (tag âmbar) e sai da seção "A gerar".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/coffee/coffee-notas-table.tsx
git commit -m "feat(coffee): cor da tag nao_gerada na tabela de notas"
```

---

## Verificação final (critérios de aceite do spec)

- [ ] `classify.classificar(None, ...)` / `(0, ...)` / `("", ...)` → `"nao_gerada"`. (Task 1)
- [ ] `pendente`/`corrigida`/`gerada` continuam classificando como antes. (Task 1)
- [ ] `POST /regerar` executa `desarquivar` + `arquivar(id, 10000000)` + `buscar` + `upsert`, nessa ordem. (Task 2)
- [ ] Uma nota sem SAP, após `/regerar`, fica `pendente` e perde a flag `a_gerar`. (Task 2)
- [ ] A tabela mostra a tag `nao_gerada` com cor própria. (Task 3)
- [ ] `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q` verde.
- [ ] `cd frontend && npm run build` sem erros.

## Fora de escopo

- Reclassify em massa de notas já no banco (re-classificam ao serem buscadas).
- Renomear rótulos de botões (Regerar/Gerar) no frontend.
- Endpoint dedicado de geração (reaproveitamos `desarquivar` + `arquivar`).
- Aba/filtro dedicado para `nao_gerada`.
