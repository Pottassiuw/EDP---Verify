# Correções de Fluxo de Geração COFFEE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o fluxo de geração COFFEE — "colocar para geração" só define SAP=10000000 (sem arquivar/desarquivar), remoção da fila com justificativa obrigatória, atalho "Abrir no COFFEE" na fila, e geração em lote por seleção processada como job no backend, tudo atrás de um modal de confirmação reutilizável.

**Architecture:** Backend (`coffee_module/`): renomear `client.arquivar`→`client.definir_sap`, simplificar `/regerar`, adicionar `jobs.iniciar_geracao` + rota `/gerar-lote`, e justificativa em `/marcar-gerar`. Frontend (`frontend/src/coffee/`): novo `ConfirmModal`, props de seleção opcionais em `CoffeeNotasTable`, e reescrita da página Gerar (`coffee-geradas.tsx`) ligando lote, ações por linha e abrir-no-COFFEE.

**Tech Stack:** Backend — Python, FastAPI, sqlite3, httpx, pytest (monkeypatch). Frontend — React 18 + TypeScript, Vite (sem framework de teste; verificação via `npm run build`).

## Global Constraints

- **`GET /sap/{id}/{sap}` NÃO arquiva** — só define `id_sap`. Placeholder "não gerada" = `10000000` (`config.SAP_PENDENTE`).
- **Colocar para geração** = apenas `client.definir_sap(id, 10000000)`. Sem `desarquivar`, sem arquivar.
- **Modal de confirmação SEMPRE** em toda ação de escrita do frontend. Justificativa **obrigatória apenas ao remover da fila** (`a_gerar=false`); opcional nas demais.
- **Logging best-effort:** `db.registrar_log` NUNCA levanta para o chamador; a operação primária jamais quebra por causa de log.
- **Testes backend** rodam com cwd em `backend/`: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -v`. Tudo que toca o banco usa a fixture `coffee_tmp`; rotas usam `coffee_cliente`; jobs usam o helper `_aguardar_job`.
- **Frontend:** sem framework de teste — toda task verifica com `cd frontend && npm run build`. Estilos inline com CSS custom properties (`var(--surface)`, `var(--accent)`, etc.) e classes utilitárias `edp-btn`/`edp-mono`/`cnt-tag`. `API_BASE = localStorage.getItem("edp_api") || "/api"`.
- Atalho "Abrir no COFFEE" usa `coffeeUrl` de `frontend/src/api.ts` (`coffeeUrl(id: string): string`), nova aba. Restrito à página Gerar.

---

### Task 1: Renomear `client.arquivar` → `client.definir_sap`

Renomeação pura (mesma URL `/sap/{id}/{sap}`, comportamento idêntico), com o log `api_call` passando a usar a ação `"definir_sap"` em vez de `"arquivar"`. Resolve a confusão de nome que originou o item 1.

**Files:**
- Modify: `backend/coffee_module/client.py:62-63` (função `arquivar`)
- Modify: `backend/coffee_module/routes.py:69` (rota `/sap`)
- Modify: `backend/coffee_module/routes.py:114` (rota `/regerar`)
- Test: `backend/test_coffee_module.py:219-236` (`test_escritas_montam_url`), `:320-329` (`test_rotas_de_escrita`)

**Interfaces:**
- Consumes: nada novo.
- Produces: `client.definir_sap(id, sap) -> bool` (substitui `client.arquivar`). Log `api_call` com `acao="definir_sap"`. `client.arquivar` deixa de existir.

- [ ] **Step 1: Atualizar os testes para o novo nome (devem falhar)**

Em `backend/test_coffee_module.py`, na função `test_escritas_montam_url`, troque a linha `assert client.arquivar(123321, 10000000) is True` por:

```python
    assert client.definir_sap(123321, 10000000) is True
```

e troque a asserção de ações de:

```python
    acoes = {l["acao"] for l in db.listar_logs(tipo="api_call")}
    assert {"arquivar", "desarquivar", "alterar_local"} <= acoes
```

para:

```python
    acoes = {l["acao"] for l in db.listar_logs(tipo="api_call")}
    assert {"definir_sap", "desarquivar", "alterar_local"} <= acoes
```

Na função `test_rotas_de_escrita`, troque:

```python
    monkeypatch.setattr(client, "arquivar", lambda i, s: chamadas.append(("sap", i, s)) or True)
```

por:

```python
    monkeypatch.setattr(client, "definir_sap", lambda i, s: chamadas.append(("sap", i, s)) or True)
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "escritas_montam_url or rotas_de_escrita" -v`
Expected: FAIL — `AttributeError: module 'coffee_module.client' has no attribute 'definir_sap'`.

- [ ] **Step 3: Renomear a função em `client.py`**

Em `backend/coffee_module/client.py`, substitua a função `arquivar` (linhas 62-63):

```python
def arquivar(id, sap) -> bool:
    return _get_logado("arquivar", f"{config.base_url()}/sap/{id}/{sap}", id, {"id": id, "sap": sap})
```

por:

```python
def definir_sap(id, sap) -> bool:
    return _get_logado("definir_sap", f"{config.base_url()}/sap/{id}/{sap}", id, {"id": id, "sap": sap})
```

- [ ] **Step 4: Atualizar as chamadas em `routes.py`**

Em `backend/coffee_module/routes.py`, na rota `/sap` (função `sap`), troque:

```python
    client.arquivar(pedido.id, pedido.sap)
```

por:

```python
    client.definir_sap(pedido.id, pedido.sap)
```

E na rota `/regerar` (função `regerar`), troque:

```python
        client.arquivar(pedido.id, config.SAP_PENDENTE)
```

por:

```python
        client.definir_sap(pedido.id, config.SAP_PENDENTE)
```

- [ ] **Step 5: Rodar a suíte inteira (garantir que nada quebrou)**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: o único teste agora vermelho é `test_rota_regerar` (ainda referencia `client.arquivar` no monkeypatch — será corrigido na Task 2). Confirme que `test_escritas_montam_url` e `test_rotas_de_escrita` passam.

Nota: se preferir manter tudo verde entre tasks, prossiga direto para a Task 2 (que conserta `test_rota_regerar`) antes de commitar. Caso contrário, atualize só a referência de monkeypatch agora.

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/client.py backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "refactor(coffee): renomeia client.arquivar -> definir_sap (so define SAP)"
```

---

### Task 2: `/regerar` só define SAP=10000000 (sem desarquivar) + justificativa

Remove a chamada `client.desarquivar` do fluxo de geração e aceita justificativa opcional gravada no log.

**Files:**
- Modify: `backend/coffee_module/routes.py:29-31` (modelo `IdPedido` — adicionar modelo novo), `:109-124` (rota `/regerar`)
- Test: `backend/test_coffee_module.py:358-379` (`test_rota_regerar` — reescrever)

**Interfaces:**
- Consumes: `client.definir_sap` (Task 1), `client.buscar_nota`, `db.upsert_nota`, `db.marcar_gerar`, `db.registrar_log`.
- Produces: `POST /api/coffee/regerar` body `{"id": int, "justificativa"?: str}` → `{"ok": true, "nota": {...}}`. Não chama mais `desarquivar`. Modelo `RegerarPedido`.

- [ ] **Step 1: Reescrever o teste (deve falhar)**

Em `backend/test_coffee_module.py`, substitua toda a função `test_rota_regerar` por:

```python
def test_rota_regerar(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    chamadas = []
    monkeypatch.setattr(client, "desarquivar", lambda i: chamadas.append(("des", i)) or True)
    monkeypatch.setattr(client, "definir_sap", lambda i, sap: chamadas.append(("sap", i, sap)) or True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 10000000, "arquivado": True,
                   "fields": {"id_sap": 10000000}},
    )
    r = coffee_cliente.post("/api/coffee/regerar",
                            json={"id": 355617, "justificativa": "reprocessar"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["nota"]["pk"] == 355617
    # NÃO desarquiva; apenas define SAP=10000000
    assert ("des", 355617) not in chamadas
    assert ("sap", 355617, 10000000) in chamadas
    # nota re-buscada com 10000000 fica pendente
    assert db.listar_notas("pendente")[0]["pk"] == 355617
    log = [l for l in db.listar_logs(tipo="acao_usuario") if l["acao"] == "regerar"]
    assert log and log[0]["detalhes"]["justificativa"] == "reprocessar"
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "rota_regerar" -v`
Expected: FAIL — `("des", 355617)` ainda está em `chamadas` (a rota ainda desarquiva) e/ou `justificativa` ausente no log.

- [ ] **Step 3: Adicionar o modelo `RegerarPedido`**

Em `backend/coffee_module/routes.py`, logo após a classe `MarcarGerarPedido` (linha ~41), adicione:

```python
class RegerarPedido(BaseModel):
    id: int
    justificativa: Optional[str] = None
```

- [ ] **Step 4: Reescrever a rota `/regerar`**

Em `backend/coffee_module/routes.py`, substitua a função `regerar` inteira (linhas 109-124) por:

```python
@router.post("/regerar")
def regerar(pedido: RegerarPedido):
    _garantir_banco()
    try:
        client.definir_sap(pedido.id, config.SAP_PENDENTE)
        nota = client.buscar_nota(pedido.id)
        db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
    except Exception:
        db.registrar_log("acao_usuario", "regerar", pedido.id,
                         {"id": pedido.id, "origem": "ui",
                          "justificativa": pedido.justificativa}, False)
        raise
    db.marcar_gerar(nota["pk"], False)
    db.registrar_log("acao_usuario", "regerar", pedido.id,
                     {"id": pedido.id, "origem": "ui",
                      "justificativa": pedido.justificativa}, True)
    return {"ok": True, "nota": nota}
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "rota_regerar" -v`
Expected: PASS.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: tudo PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "fix(coffee): /regerar so define SAP=10000000 (sem desarquivar) + justificativa"
```

---

### Task 3: `jobs.iniciar_geracao` + rota `POST /gerar-lote`

Geração em lote como job in-process (mesmo padrão de `iniciar_busca`), consultável pelo `/job/{job_id}` existente.

**Files:**
- Modify: `backend/coffee_module/jobs.py` (nova função + runner)
- Modify: `backend/coffee_module/routes.py` (novo modelo + rota)
- Test: `backend/test_coffee_module.py` (novos testes ao final)

**Interfaces:**
- Consumes: `client.definir_sap` (Task 1), `client.buscar_nota`, `db.upsert_nota`, `db.marcar_gerar`, `config.SAP_PENDENTE`, `config.DELAY_GERACAO`, `db.registrar_log`.
- Produces:
  - `jobs.iniciar_geracao(ids: list, justificativa: str | None = None) -> str` (job_id); progresso igual a `iniciar_busca` (`{estado, total, feitas, erros, iniciado_em}`).
  - `POST /api/coffee/gerar-lote` body `{"ids": list[int], "justificativa"?: str}` → `{"job_id": str}`; 400 se `ids` vazio. Modelo `GerarLotePedido`. Loga `acao_usuario`/`geracao_lote`.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Geração em lote (jobs.iniciar_geracao + /gerar-lote)
# ---------------------------------------------------------------------------


def test_job_geracao_define_sap_e_isola_erro(coffee_tmp, monkeypatch):
    from coffee_module import client, db, jobs
    saps = []
    monkeypatch.setattr(client, "definir_sap",
                        lambda i, sap: saps.append((int(i), sap)) or True)

    def fake_buscar(id):
        if str(id) == "999":
            raise RuntimeError("timeout")
        return {"pk": int(id), "id_sap": 10000000, "arquivado": False,
                "fields": {"id_sap": 10000000}}

    monkeypatch.setattr(client, "buscar_nota", fake_buscar)
    job_id = jobs.iniciar_geracao([355617, 999, 355618], justificativa="lote x")
    j = _aguardar_job(jobs, job_id)
    assert j["total"] == 3
    assert j["feitas"] == 3
    assert len(j["erros"]) == 1
    assert j["erros"][0]["pk"] == 999
    # SAP=10000000 definido para as duas válidas
    assert (355617, 10000000) in saps and (355618, 10000000) in saps
    # válidas persistidas como pendentes e fora da fila
    assert len(db.listar_notas("pendente")) == 2
    assert db.listar_notas("a_gerar") == []


def test_rota_gerar_lote(coffee_cliente, monkeypatch):
    from coffee_module import client, db, jobs
    monkeypatch.setattr(client, "definir_sap", lambda i, sap: True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 10000000, "arquivado": False,
                   "fields": {"id_sap": 10000000}},
    )
    r = coffee_cliente.post("/api/coffee/gerar-lote",
                            json={"ids": [355617, 355618], "justificativa": "j"})
    assert r.status_code == 200
    _aguardar_job(jobs, r.json()["job_id"])
    lote = [l for l in db.listar_logs(tipo="acao_usuario") if l["acao"] == "geracao_lote"]
    assert lote and lote[0]["detalhes"]["total"] == 2
    assert lote[0]["detalhes"]["justificativa"] == "j"


def test_rota_gerar_lote_vazio_400(coffee_cliente):
    assert coffee_cliente.post("/api/coffee/gerar-lote", json={"ids": []}).status_code == 400
```

- [ ] **Step 2: Rodar para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "geracao or gerar_lote" -v`
Expected: FAIL — `AttributeError: module 'coffee_module.jobs' has no attribute 'iniciar_geracao'` / rota 404.

- [ ] **Step 3: Adicionar `iniciar_geracao` e o runner em `jobs.py`**

Em `backend/coffee_module/jobs.py`, adicione ao final do arquivo:

```python
def iniciar_geracao(ids: list, justificativa: str | None = None) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(ids),
            "feitas": 0,
            "erros": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar_geracao, args=(job_id, list(ids), justificativa),
                     daemon=True).start()
    return job_id


def _rodar_geracao(job_id: str, ids: list, justificativa: str | None) -> None:
    for ident in ids:
        try:
            client.definir_sap(ident, config.SAP_PENDENTE)
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
            db.marcar_gerar(nota["pk"], False)
        except Exception as exc:  # noqa: BLE001 — uma falha não derruba o lote
            with _LOCK:
                _JOBS[job_id]["erros"].append({"pk": ident, "msg": str(exc)})
        finally:
            with _LOCK:
                _JOBS[job_id]["feitas"] += 1
        time.sleep(config.DELAY_GERACAO)
    with _LOCK:
        _JOBS[job_id]["estado"] = "concluido"
```

- [ ] **Step 4: Adicionar o modelo e a rota em `routes.py`**

Em `backend/coffee_module/routes.py`, após a classe `RegerarPedido` (criada na Task 2), adicione:

```python
class GerarLotePedido(BaseModel):
    ids: list[int]
    justificativa: Optional[str] = None
```

E ao final do arquivo, adicione a rota:

```python
@router.post("/gerar-lote")
def gerar_lote(pedido: GerarLotePedido):
    _garantir_banco()
    if not pedido.ids:
        raise HTTPException(status_code=400, detail="Lista de IDs vazia.")
    db.registrar_log("acao_usuario", "geracao_lote", None,
                     {"ids": pedido.ids, "total": len(pedido.ids),
                      "justificativa": pedido.justificativa}, True)
    return {"job_id": jobs.iniciar_geracao(pedido.ids, pedido.justificativa)}
```

- [ ] **Step 5: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "geracao or gerar_lote" -v`
Expected: PASS (3 testes).

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: tudo PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/coffee_module/jobs.py backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "feat(coffee): geracao em lote via job (/gerar-lote + jobs.iniciar_geracao)"
```

---

### Task 4: `/marcar-gerar` com justificativa (obrigatória ao remover da fila)

**Files:**
- Modify: `backend/coffee_module/routes.py:38-40` (modelo `MarcarGerarPedido`), `:91-106` (rota `/marcar-gerar`)
- Test: `backend/test_coffee_module.py` (novos testes ao final)

**Interfaces:**
- Consumes: `db.nota_existe`, `db.marcar_gerar`, `db.registrar_log`, `client.buscar_nota`, `db.upsert_nota`.
- Produces: `POST /api/coffee/marcar-gerar` body `{"id": int, "a_gerar"?: bool, "justificativa"?: str}`. Se `a_gerar=false` e `justificativa` vazia/ausente → **400**. Justificativa gravada em `detalhes` do log.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `backend/test_coffee_module.py`:

```python
def test_marcar_gerar_remover_exige_justificativa(coffee_cliente):
    from coffee_module import db
    db.upsert_nota(355617, 17247854, True, {"id_sap": 17247854})
    db.marcar_gerar(355617, True)
    # sem justificativa ao remover → 400
    r = coffee_cliente.post("/api/coffee/marcar-gerar",
                            json={"id": 355617, "a_gerar": False})
    assert r.status_code == 400
    assert db.listar_notas("a_gerar")[0]["pk"] == 355617  # continua na fila


def test_marcar_gerar_remover_com_justificativa(coffee_cliente):
    from coffee_module import db
    db.upsert_nota(355617, 17247854, True, {"id_sap": 17247854})
    db.marcar_gerar(355617, True)
    r = coffee_cliente.post("/api/coffee/marcar-gerar",
                            json={"id": 355617, "a_gerar": False,
                                  "justificativa": "posta por engano"})
    assert r.status_code == 200
    assert db.listar_notas("a_gerar") == []
    log = [l for l in db.listar_logs(tipo="acao_usuario") if l["acao"] == "marcar_gerar"]
    assert log and log[0]["detalhes"]["justificativa"] == "posta por engano"
```

- [ ] **Step 2: Rodar para confirmar que falham**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "marcar_gerar_remover" -v`
Expected: FAIL — a rota aceita a remoção sem justificativa (200) e não grava o campo.

- [ ] **Step 3: Adicionar `justificativa` ao modelo**

Em `backend/coffee_module/routes.py`, substitua a classe `MarcarGerarPedido` (linhas 38-40):

```python
class MarcarGerarPedido(BaseModel):
    id: int
    a_gerar: bool = True
```

por:

```python
class MarcarGerarPedido(BaseModel):
    id: int
    a_gerar: bool = True
    justificativa: Optional[str] = None
```

- [ ] **Step 4: Validar e logar a justificativa na rota**

Em `backend/coffee_module/routes.py`, substitua a função `marcar_gerar` inteira (linhas 91-106) por:

```python
@router.post("/marcar-gerar")
def marcar_gerar(pedido: MarcarGerarPedido):
    _garantir_banco()
    if not pedido.a_gerar and not (pedido.justificativa and pedido.justificativa.strip()):
        raise HTTPException(status_code=400,
                            detail="Justificativa obrigatoria para remover da fila.")
    if pedido.a_gerar and not db.nota_existe(pedido.id):
        try:
            nota = client.buscar_nota(pedido.id)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
        except Exception:
            db.registrar_log("acao_usuario", "marcar_gerar", pedido.id,
                             {"id": pedido.id, "a_gerar": pedido.a_gerar,
                              "justificativa": pedido.justificativa}, False)
            raise HTTPException(status_code=502,
                                detail="Nao foi possivel buscar a nota na API COFFEE.")
    db.marcar_gerar(pedido.id, pedido.a_gerar)
    db.registrar_log("acao_usuario", "marcar_gerar", pedido.id,
                     {"id": pedido.id, "a_gerar": pedido.a_gerar,
                      "justificativa": pedido.justificativa}, True)
    return {"ok": True}
```

- [ ] **Step 5: Rodar os testes para confirmar que passam**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -k "marcar_gerar_remover" -v`
Expected: PASS (2 testes).

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q`
Expected: tudo PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "feat(coffee): /marcar-gerar com justificativa obrigatoria ao remover da fila"
```

---

### Task 5: Componente `ConfirmModal` (frontend)

Modal reutilizável de confirmação com campo de justificativa (opcional ou obrigatório). Usado por todas as ações de escrita da página Gerar.

**Files:**
- Create: `frontend/src/coffee/confirm-modal.tsx`

**Interfaces:**
- Produces: `ConfirmModal(props)` onde
  `props = { open: boolean; title: string; message?: React.ReactNode; confirmLabel?: string; tone?: "default" | "danger"; requireJustification?: boolean; busy?: boolean; onConfirm: (justificativa: string) => void; onCancel: () => void }`.
  Renderiza `null` quando `open` é falso. Limpa a justificativa ao abrir.

- [ ] **Step 1: Criar `confirm-modal.tsx`**

Crie `frontend/src/coffee/confirm-modal.tsx`:

```tsx
import React from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireJustification?: boolean;
  busy?: boolean;
  onConfirm: (justificativa: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open, title, message, confirmLabel = "Confirmar", tone = "default",
  requireJustification = false, busy = false, onConfirm, onCancel,
}: ConfirmModalProps): React.JSX.Element | null {
  const [justificativa, setJustificativa] = React.useState("");

  React.useEffect(() => {
    if (open) setJustificativa("");
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const justOk = !requireJustification || justificativa.trim().length > 0;
  const confirmColor = tone === "danger" ? "var(--red)" : "var(--accent)";

  return (
    <>
      <div onClick={busy ? undefined : onCancel}
           style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300 }} />
      <div role="dialog" aria-modal="true"
           style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                    width: 420, maxWidth: "92vw", background: "var(--surface)",
                    border: "1px solid var(--line)", borderRadius: 12, zIndex: 301,
                    display: "flex", flexDirection: "column", gap: 12, padding: 20,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
        {message && <div style={{ fontSize: 13, color: "var(--text-mute)" }}>{message}</div>}

        <label style={{ fontSize: 12, color: "var(--text-mute)" }}>
          Justificativa{requireJustification ? " (obrigatoria)" : " (opcional)"}
        </label>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                  rows={3} autoFocus disabled={busy}
                  placeholder={requireJustification
                    ? "Explique o motivo desta acao..."
                    : "Opcional: registre um motivo..."}
                  style={{ resize: "vertical", padding: "8px 10px", borderRadius: 8,
                           border: "1px solid var(--line)", background: "var(--surface-2)",
                           color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button className="edp-btn sm" onClick={onCancel} disabled={busy}
                  style={{ fontSize: 13 }}>
            Cancelar
          </button>
          <button className="edp-btn sm" disabled={busy || !justOk}
                  onClick={() => onConfirm(justificativa.trim())}
                  style={{ fontSize: 13, fontWeight: 600, color: confirmColor,
                           borderColor: confirmColor }}>
            {busy ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar o build**

Run: `cd frontend && npm run build`
Expected: PASS. O componente compila mas ainda não é usado.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/confirm-modal.tsx
git commit -m "feat(coffee): ConfirmModal reutilizavel com justificativa"
```

---

### Task 6: Seleção opcional em `CoffeeNotasTable`

Adiciona coluna de checkbox **opt-in** sem alterar o comportamento das páginas que não usam seleção.

**Files:**
- Modify: `frontend/src/coffee/coffee-notas-table.tsx`

**Interfaces:**
- Consumes: `CoffeeNota`.
- Produces: `CoffeeNotasTable` ganha props opcionais `selectable?: boolean`, `selectedPks?: Set<number>`, `onToggleSelect?: (pk: number) => void`, `onToggleAll?: () => void`. Sem essas props, a tabela renderiza exatamente como antes.

- [ ] **Step 1: Atualizar a interface de props**

Em `frontend/src/coffee/coffee-notas-table.tsx`, substitua a interface `CoffeeNotasTableProps`:

```tsx
interface CoffeeNotasTableProps {
  notas: CoffeeNota[];
  isLoading: boolean;
  emptyMessage?: string;
  actionColumn?: (nota: CoffeeNota) => React.ReactNode;
}
```

por:

```tsx
interface CoffeeNotasTableProps {
  notas: CoffeeNota[];
  isLoading: boolean;
  emptyMessage?: string;
  actionColumn?: (nota: CoffeeNota) => React.ReactNode;
  selectable?: boolean;
  selectedPks?: Set<number>;
  onToggleSelect?: (pk: number) => void;
  onToggleAll?: () => void;
}
```

- [ ] **Step 2: Receber as novas props e renderizar a coluna de checkbox**

Em `frontend/src/coffee/coffee-notas-table.tsx`, troque a assinatura do componente:

```tsx
export function CoffeeNotasTable({ notas, isLoading, emptyMessage, actionColumn }: CoffeeNotasTableProps): React.JSX.Element {
```

por:

```tsx
export function CoffeeNotasTable({ notas, isLoading, emptyMessage, actionColumn,
  selectable, selectedPks, onToggleSelect, onToggleAll }: CoffeeNotasTableProps): React.JSX.Element {
```

No `<thead><tr>`, antes de `<th>ID</th>`, adicione a célula de cabeçalho de seleção:

```tsx
            {selectable && (
              <th style={{ width: 36, textAlign: "center" }}>
                <input type="checkbox" aria-label="Selecionar todas"
                       checked={notas.length > 0 && selectedPks?.size === notas.length}
                       onChange={() => onToggleAll?.()} />
              </th>
            )}
```

No `<tbody>`, dentro do `notas.map((n) => (<tr ...>`, antes de `<td><span className="edp-mono" ...>{n.pk}</span></td>`, adicione:

```tsx
              {selectable && (
                <td style={{ textAlign: "center" }}>
                  <input type="checkbox" aria-label={`Selecionar nota ${n.pk}`}
                         checked={selectedPks?.has(n.pk) ?? false}
                         onChange={() => onToggleSelect?.(n.pk)} />
                </td>
              )}
```

- [ ] **Step 3: Verificar o build**

Run: `cd frontend && npm run build`
Expected: PASS. As páginas existentes não passam as novas props, então nada muda visualmente nelas.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/coffee-notas-table.tsx
git commit -m "feat(coffee): selecao opt-in (checkbox) em CoffeeNotasTable"
```

---

### Task 7: Reescrever a página Gerar (`coffee-geradas.tsx`)

Liga tudo: geração em lote por seleção (job + progresso), ações por linha (Gerar / Abrir no COFFEE / Remover da fila / Logs) atrás do `ConfirmModal`, e botão "Abrir no COFFEE" na tabela de Geradas.

**Files:**
- Modify: `frontend/src/coffee/coffee-geradas.tsx` (reescrita completa)

**Interfaces:**
- Consumes: `useCoffeeNotas` (existente), `CoffeeNotasTable` com props de seleção (Task 6), `ConfirmModal` (Task 5), `LogDrawer` (existente), `coffeeUrl` de `../api`, `CoffeeLog`/`CoffeeJob` de `./types`. Endpoints `/regerar` (Task 2), `/gerar-lote` (Task 3), `/marcar-gerar` (Task 4), `/job/{job_id}` (existente), `/logs` (existente).
- Produces: componente `CoffeeGeradas` reescrito.

- [ ] **Step 1: Substituir todo o conteúdo de `coffee-geradas.tsx`**

Substitua todo o conteúdo de `frontend/src/coffee/coffee-geradas.tsx` por:

```tsx
import React from 'react';
import type { CoffeeLog, CoffeeJob } from './types';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { ConfirmModal } from './confirm-modal';
import { coffeeUrl } from '../api';

const API_BASE = localStorage.getItem("edp_api") || "/api";

type RegerarEstado = "idle" | "loading" | "ok" | "erro";

interface RegerarResult {
  nota: { pk: number; id_sap: number; arquivado: boolean; fields: Record<string, unknown> };
  transicoes: CoffeeLog[];
}

type PendingAction =
  | { kind: "gerar"; pk: number }
  | { kind: "gerar-form"; id: number }
  | { kind: "gerar-lote"; pks: number[] }
  | { kind: "remover"; pk: number };

function AbrirCoffeeBtn({ pk }: { pk: number }): React.JSX.Element {
  return (
    <a className="edp-btn coffee sm" target="_blank" rel="noopener"
       href={coffeeUrl(String(pk))} title="Abrir no COFFEE"
       style={{ fontSize: 12, padding: "4px 6px" }}>
      ☕
    </a>
  );
}

function TransicaoCard({ result, onVerLogs, onNova }: {
  result: RegerarResult;
  onVerLogs: () => void;
  onNova: () => void;
}): React.JSX.Element {
  const { nota, transicoes } = result;
  const classif = transicoes.find((t) => t.acao === "classificar");
  return (
    <div style={{ padding: 16, borderRadius: 10, background: "var(--surface-2)",
                  border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
        <div>
          <span style={{ color: "var(--text-mute)", fontSize: 11 }}>Classificacao</span>
          <div style={{ fontWeight: 600, marginTop: 2 }}>
            {classif
              ? <>{String(classif.detalhes?.anterior ?? "—")} <span style={{ color: "var(--text-mute)" }}>&rarr;</span> {String(classif.detalhes?.novo ?? "—")}</>
              : <span style={{ color: "var(--text-dim)" }}>{nota.fields?.classificacao as string ?? "sem transicao"}</span>}
          </div>
        </div>
        <div>
          <span style={{ color: "var(--text-mute)", fontSize: 11 }}>ID SAP</span>
          <div className="edp-mono" style={{ fontWeight: 600, marginTop: 2 }}>{nota.id_sap}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="edp-btn sm" onClick={onVerLogs} style={{ fontSize: 12 }}>Ver logs</button>
        <button className="edp-btn sm" onClick={onNova} style={{ fontSize: 12 }}>Gerar outra</button>
      </div>
    </div>
  );
}

export function CoffeeGeradas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const aGerar = useCoffeeNotas("a_gerar");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // single regerar (form) state
  const [regerarId, setRegerarId] = React.useState("");
  const [regerarEstado, setRegerarEstado] = React.useState<RegerarEstado>("idle");
  const [regerarResult, setRegerarResult] = React.useState<RegerarResult | null>(null);
  const [regerarErro, setRegerarErro] = React.useState<string | null>(null);

  // per-row + lote
  const [rowBusy, setRowBusy] = React.useState<Set<number>>(() => new Set());
  const [selected, setSelected] = React.useState<Set<number>>(() => new Set());
  const [lote, setLote] = React.useState<{ rodando: boolean; feitas: number; total: number }>(
    { rodando: false, feitas: 0, total: 0 });

  // modal + drawer
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [modalBusy, setModalBusy] = React.useState(false);
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);

  function toggleSelect(pk: number): void {
    setSelected((s) => { const n = new Set(s); n.has(pk) ? n.delete(pk) : n.add(pk); return n; });
  }
  function toggleAll(): void {
    setSelected((s) => s.size === aGerar.notas.length
      ? new Set()
      : new Set(aGerar.notas.map((n) => n.pk)));
  }

  function regerar(id: number, justificativa: string): Promise<RegerarResult> {
    return fetch(`${API_BASE}/coffee/regerar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, justificativa: justificativa || null }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /regerar -> ${res.status}`); return res.json(); })
      .then((data: { ok: boolean; nota: RegerarResult["nota"] }) =>
        fetch(`${API_BASE}/coffee/logs?nota_pk=${data.nota.pk}&tipo=transicao&limit=5`,
              { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((logData: { logs: CoffeeLog[] }) => ({ nota: data.nota, transicoes: logData.logs })));
  }

  function pollJob(jobId: string): Promise<void> {
    return new Promise((resolve) => {
      const tick = (): void => {
        fetch(`${API_BASE}/coffee/job/${jobId}`, { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((j: CoffeeJob) => {
            setLote({ rodando: true, feitas: j.feitas, total: j.total });
            if (j.estado === "concluido") resolve();
            else window.setTimeout(tick, 600);
          })
          .catch(() => window.setTimeout(tick, 600));
      };
      tick();
    });
  }

  function gerarLote(pks: number[], justificativa: string): Promise<void> {
    setLote({ rodando: true, feitas: 0, total: pks.length });
    return fetch(`${API_BASE}/coffee/gerar-lote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: pks, justificativa: justificativa || null }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /gerar-lote -> ${res.status}`); return res.json(); })
      .then((data: { job_id: string }) => pollJob(data.job_id))
      .then(() => {
        setLote({ rodando: false, feitas: 0, total: 0 });
        setSelected(new Set());
        aGerar.refetch();
        refetch();
      });
  }

  function remover(pk: number, justificativa: string): Promise<void> {
    return fetch(`${API_BASE}/coffee/marcar-gerar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pk, a_gerar: false, justificativa }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /marcar-gerar -> ${res.status}`); })
      .then(() => { aGerar.refetch(); });
  }

  function handleConfirm(justificativa: string): void {
    if (!pending) return;
    setModalBusy(true);
    const done = (): void => { setModalBusy(false); setPending(null); };

    if (pending.kind === "gerar" || pending.kind === "gerar-form") {
      const id = pending.kind === "gerar" ? pending.pk : pending.id;
      setRowBusy((s) => new Set(s).add(id));
      regerar(id, justificativa)
        .then((result) => {
          if (pending.kind === "gerar-form") {
            setRegerarResult(result); setRegerarEstado("ok");
          }
          refetch(); aGerar.refetch();
        })
        .catch((err: unknown) => {
          if (pending.kind === "gerar-form") {
            setRegerarErro(err instanceof Error ? err.message : String(err));
            setRegerarEstado("erro");
          }
        })
        .finally(() => { setRowBusy((s) => { const n = new Set(s); n.delete(id); return n; }); done(); });
    } else if (pending.kind === "gerar-lote") {
      gerarLote(pending.pks, justificativa).catch(() => {}).finally(done);
    } else if (pending.kind === "remover") {
      remover(pending.pk, justificativa).catch(() => {}).finally(done);
    }
  }

  function handleRegerarForm(): void {
    const id = Number(regerarId.trim());
    if (!Number.isFinite(id) || id <= 0) return;
    setRegerarEstado("loading"); setRegerarErro(null); setRegerarResult(null);
    setPending({ kind: "gerar-form", id });
  }

  function handleNova(): void {
    setRegerarEstado("idle"); setRegerarResult(null); setRegerarErro(null); setRegerarId("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const modalConfig: Record<PendingAction["kind"], { title: string; confirmLabel: string; tone: "default" | "danger"; required: boolean; message: string }> = {
    "gerar": { title: "Gerar nota", confirmLabel: "Gerar", tone: "default", required: false, message: "Define o SAP placeholder 10000000 para esta nota entrar em geracao." },
    "gerar-form": { title: "Gerar nota", confirmLabel: "Gerar", tone: "default", required: false, message: "Define o SAP placeholder 10000000 para esta nota entrar em geracao." },
    "gerar-lote": { title: "Gerar em lote", confirmLabel: "Gerar selecionadas", tone: "default", required: false, message: "Cada nota selecionada recebe o SAP placeholder 10000000." },
    "remover": { title: "Remover da fila", confirmLabel: "Remover", tone: "danger", required: true, message: "A nota sai da fila de geracao. Justifique o motivo." },
  };

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-mute)" }}>
        <span style={{ color: "var(--red)" }}>Erro ao carregar notas: {error}</span>
        <button className="edp-btn sm" onClick={refetch}>Tentar de novo</button>
      </div>
    );
  }

  const cfg = pending ? modalConfig[pending.kind] : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Zona 1: Gerar nota (form) */}
      <div style={{ flexShrink: 0, padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12,
                    borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Gerar Nota</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input ref={inputRef} type="number" placeholder="ID da nota" value={regerarId}
                 onChange={(e) => setRegerarId(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") handleRegerarForm(); }}
                 style={{ width: 160, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--text)", fontSize: 13,
                          fontFamily: "var(--font-mono)" }} />
          <button className="edp-btn sm" style={{ fontWeight: 600, minWidth: 100 }}
                  disabled={!regerarId.trim() || regerarEstado === "loading"}
                  onClick={handleRegerarForm}>
            {regerarEstado === "loading" ? "Gerando..." : "Gerar"}
          </button>
        </div>
        {regerarEstado === "erro" && regerarErro && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.12)",
                        color: "var(--red)", fontSize: 12 }}>
            {regerarErro}
          </div>
        )}
        {regerarEstado === "ok" && regerarResult && (
          <TransicaoCard result={regerarResult}
                         onVerLogs={() => setDrawerPk(regerarResult.nota.pk)}
                         onNova={handleNova} />
        )}
      </div>

      {/* Zona 1.5: A gerar */}
      <div style={{ flexShrink: 0, padding: "14px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>A gerar</span>
        {!aGerar.isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {aGerar.notas.length} nota{aGerar.notas.length !== 1 ? "s" : ""}
          </span>
        )}
        {selected.size > 0 && (
          <button className="edp-btn sm" style={{ fontWeight: 600 }} disabled={lote.rodando}
                  onClick={() => setPending({ kind: "gerar-lote", pks: [...selected] })}>
            {lote.rodando ? `Gerando ${lote.feitas}/${lote.total}…` : `Gerar selecionadas (${selected.size})`}
          </button>
        )}
      </div>
      {aGerar.notas.length > 0 && (
        <CoffeeNotasTable
          notas={aGerar.notas}
          isLoading={aGerar.isLoading}
          emptyMessage="Nenhuma nota marcada para gerar."
          selectable
          selectedPks={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          actionColumn={(nota) => {
            const busy = rowBusy.has(nota.pk);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="edp-btn sm" disabled={busy || lote.rodando}
                        onClick={() => setPending({ kind: "gerar", pk: nota.pk })}
                        style={{ fontWeight: 600, fontSize: 12 }}>
                  {busy ? "..." : "Gerar"}
                </button>
                <AbrirCoffeeBtn pk={nota.pk} />
                <button className="edp-btn sm" disabled={busy || lote.rodando}
                        onClick={() => setPending({ kind: "remover", pk: nota.pk })}
                        title="Remover da fila" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
                  Remover
                </button>
                <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                        title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
                  Logs
                </button>
              </div>
            );
          }}
        />
      )}

      {/* Zona 2: Tabela de Geradas */}
      <div style={{ flexShrink: 0, padding: "14px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Notas Geradas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {notas.length} nota{notas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <CoffeeNotasTable
        notas={notas}
        isLoading={isLoading}
        emptyMessage={aGerar.notas.length > 0
          ? "Nenhuma nota gerada ainda. As notas acima estao aguardando geracao."
          : "Nenhuma nota gerada encontrada. Use o formulario acima ou marque notas na Verificar."}
        actionColumn={(nota) => {
          const busy = rowBusy.has(nota.pk);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="edp-btn sm" disabled={busy}
                      onClick={() => setPending({ kind: "gerar", pk: nota.pk })}
                      style={{ fontWeight: 600, fontSize: 12 }}>
                {busy ? "..." : "Regerar"}
              </button>
              <AbrirCoffeeBtn pk={nota.pk} />
              <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                      title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
                Logs
              </button>
            </div>
          );
        }}
      />

      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}

      <ConfirmModal
        open={pending !== null && cfg !== null}
        title={cfg?.title ?? ""}
        message={cfg?.message}
        confirmLabel={cfg?.confirmLabel}
        tone={cfg?.tone}
        requireJustification={cfg?.required}
        busy={modalBusy}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (pending?.kind === "gerar-form") setRegerarEstado("idle");
          setPending(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar o build**

Run: `cd frontend && npm run build`
Expected: PASS, sem erros de TypeScript (sem variáveis órfãs; `coffeeUrl` importado de `../api`).

- [ ] **Step 3: Verificação manual (checklist)**

Run: `cd frontend && npm run dev` e confirme:
- Form "Gerar Nota": digitar ID → abre modal (justificativa opcional) → confirmar gera e mostra o card.
- Fila "A gerar": checkboxes selecionam; "Gerar selecionadas (N)" abre modal → confirma → barra `Gerando x/y` → fila esvazia, notas vão para Geradas.
- Linha da fila: **Gerar** (modal opcional), **☕** abre o COFFEE em nova aba, **Remover** abre modal com justificativa obrigatória (confirmar desabilitado até preencher), **Logs** abre o drawer.
- Remover sem justificativa não envia; com justificativa, a nota some da fila.
- Tabela "Notas Geradas": botão **☕** abre no COFFEE; **Regerar** passa pelo modal.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/coffee-geradas.tsx
git commit -m "feat(coffee): pagina Gerar com lote por selecao, remover-da-fila e abrir-no-COFFEE"
```

---

## Verificação final

- [ ] `client.arquivar` renomeado para `definir_sap`; nenhuma referência a `client.arquivar` restante. (Task 1)
- [ ] `/regerar` não chama `desarquivar`; só `definir_sap(id, 10000000)`; grava justificativa. (Task 2)
- [ ] `jobs.iniciar_geracao` + `POST /gerar-lote` geram em lote com progresso e isolam erros. (Task 3)
- [ ] `/marcar-gerar` exige justificativa ao remover (`a_gerar=false`) → 400 se vazia. (Task 4)
- [ ] `ConfirmModal` reutilizável com justificativa opcional/obrigatória. (Task 5)
- [ ] `CoffeeNotasTable` com seleção opt-in sem quebrar outras páginas. (Task 6)
- [ ] Página Gerar: lote por seleção, ações por linha (Gerar/☕/Remover/Logs) atrás do modal, ☕ na tabela de Geradas. (Task 7)
- [ ] `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q` → tudo PASS.
- [ ] `cd frontend && npm run build` sem erros.

## Fora de escopo

- Atalho "Abrir no COFFEE" nas páginas Pendentes/Corrigidas.
- Seleção em lote fora da fila "A gerar".
- Retentativa automática de notas com erro no lote.
- Persistência/auditoria de justificativas além de `coffee_logs`.
