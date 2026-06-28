# Modal Gerar/Consultar + correção do fluxo COFFEE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os três bugs do fluxo gerar/pendentes/corrigidas e substituir o input único por um modal de gerar/consultar com consulta ao vivo e edição de local de instalação.

**Architecture:** Backend FastAPI + SQLite (módulo `coffee_module`): corrigir resolução de pk em `marcar-gerar`, a regra do placeholder em `_rodar_geracao`, o rastreio de `origem`, e adicionar um endpoint síncrono de consulta. Frontend React: novo componente de modal que orquestra consulta/geração/local, e refator de `coffee-geradas.tsx` para usá-lo.

**Tech Stack:** Python 3 / FastAPI / pytest / httpx (backend); React 18 / TypeScript / Vite / sonner (frontend).

## Global Constraints

- Backend: testes rodam com `cd backend && python -m pytest test_coffee_module.py -q`. Fixtures existentes: `coffee_tmp`, `coffee_cliente`, helper `_aguardar_job`.
- `SAP_PENDENTE = 10000000` (em `coffee_module/config.py`). SAP "real" = inteiro truthy diferente de `SAP_PENDENTE`.
- Frontend: sem test runner. Check = `cd frontend && npm run build` (`tsc -b && vite build`) sem erros + verificação manual.
- Frontend usa `toast` direto do `sonner` (não existe mais `lib/notify`).
- `BASE` da API exportado de `frontend/src/api.ts`.
- Classes CSS de botão existentes: `edp-btn`, `edp-btn sm`, `edp-mono`. Tokens: `--surface`, `--surface-2`, `--line`, `--text`, `--text-mute`, `--accent`, `--red`, `--green`, `--amber`.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `backend/coffee_module/db.py` — adicionar `origem_atual(pk)`.
- `backend/coffee_module/routes.py` — `marcar-gerar` (resolve pk + origem='verificar'); `regerar` (guarda SAP real); novo `GET /consultar/{id}`.
- `backend/coffee_module/jobs.py` — `_rodar_geracao` (regra do placeholder; origem só se vazia).
- `backend/test_coffee_module.py` — novos testes dos três bugs + consultar.
- `frontend/src/coffee/types.ts` — `CoffeeConsulta`.
- `frontend/src/api.ts` — `consultarNota(id)`.
- `frontend/src/coffee/coffee-gerar-modal.tsx` — **novo** modal.
- `frontend/src/coffee/coffee-geradas.tsx` — refator para usar o modal.

---

### Task 1: Backend — `marcar-gerar` resolve o pk certo + grava origem='verificar'

**Files:**
- Modify: `backend/coffee_module/routes.py:127-147` (função `marcar_gerar`)
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `client.buscar_nota(id) -> {pk, id_sap, arquivado, fields}`; `db.upsert_nota(pk, id_sap, arquivado, dados_json)`; `db.marcar_gerar(pk, a_gerar)`; `db.definir_origem(pk, origem)`; `db.listar_notas(status)`.
- Produces: rota `POST /api/coffee/marcar-gerar` que, quando `a_gerar=True`, liga a flag no `pk` retornado por `buscar_nota` (não no `id` de entrada) e grava `origem='verificar'`.

- [ ] **Step 1: Escrever o teste que falha (id != pk)**

Adicionar ao fim de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# 2026-06-27 — bug 1: marcar-gerar liga a_gerar no pk resolvido (não no id)
# ---------------------------------------------------------------------------


def test_marcar_gerar_usa_pk_resolvido_nao_o_id(coffee_cliente, monkeypatch):
    """id de entrada (999) != pk real (355617): a flag a_gerar deve ir pro pk."""
    from coffee_module import client, db
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": 355617, "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854}},
    )
    r = coffee_cliente.post("/api/coffee/marcar-gerar", json={"id": 999, "a_gerar": True})
    assert r.status_code == 200
    aged = db.listar_notas("a_gerar")
    assert len(aged) == 1 and aged[0]["pk"] == 355617


def test_marcar_gerar_grava_origem_verificar(coffee_cliente, monkeypatch):
    from coffee_module import client, db
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854}},
    )
    coffee_cliente.post("/api/coffee/marcar-gerar", json={"id": 355617, "a_gerar": True})
    assert db.origem_atual(355617) == "verificar"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py::test_marcar_gerar_usa_pk_resolvido_nao_o_id test_coffee_module.py::test_marcar_gerar_grava_origem_verificar -v`
Expected: FAIL — o primeiro porque `a_gerar` é ligado no id `999` (lista vem vazia); o segundo porque `db.origem_atual` não existe / origem não é gravada.

- [ ] **Step 3: Adicionar `origem_atual` em `db.py`**

Adicionar em `backend/coffee_module/db.py` logo após `definir_origem` (após a linha 180):

```python
def origem_atual(pk: int) -> str | None:
    """Retorna a origem registrada da nota, ou None."""
    conn = get_db_connection()
    row = conn.execute("SELECT origem FROM notas_coffee WHERE pk = ?", (pk,)).fetchone()
    conn.close()
    return row[0] if row is not None else None
```

- [ ] **Step 4: Corrigir a rota `marcar_gerar`**

Substituir o corpo de `marcar_gerar` em `backend/coffee_module/routes.py` (linhas 127-147) por:

```python
@router.post("/marcar-gerar")
def marcar_gerar(pedido: MarcarGerarPedido):
    _garantir_banco()
    if not pedido.a_gerar and not (pedido.justificativa and pedido.justificativa.strip()):
        raise HTTPException(status_code=400,
                            detail="Justificativa obrigatoria para remover da fila.")
    pk = pedido.id
    if pedido.a_gerar:
        # Resolve o pk real via API (o id de entrada pode != pk do COFFEE).
        try:
            nota = client.buscar_nota(pedido.id)
            pk = nota["pk"]
            db.upsert_nota(pk, nota["id_sap"], nota["arquivado"], nota["fields"])
        except Exception:
            db.registrar_log("acao_usuario", "marcar_gerar", pedido.id,
                             {"id": pedido.id, "a_gerar": pedido.a_gerar,
                              "justificativa": pedido.justificativa}, False)
            raise HTTPException(status_code=502,
                                detail="Nao foi possivel buscar a nota na API COFFEE.")
        db.definir_origem(pk, "verificar")
    db.marcar_gerar(pk, pedido.a_gerar)
    db.registrar_log("acao_usuario", "marcar_gerar", pk,
                     {"id": pedido.id, "a_gerar": pedido.a_gerar,
                      "justificativa": pedido.justificativa}, True)
    return {"ok": True}
```

- [ ] **Step 5: Rodar a suíte inteira e ver passar**

Run: `cd backend && python -m pytest test_coffee_module.py -q`
Expected: PASS (incl. os dois novos; `test_rota_marcar_gerar_*` existentes continuam verdes — a fixture `coffee_cliente` provê `buscar_nota`).

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/routes.py backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "fix(coffee): marcar-gerar resolve pk real + grava origem=verificar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Backend — regra do placeholder em `_rodar_geracao` (e `regerar`)

**Files:**
- Modify: `backend/coffee_module/jobs.py:68-98` (`_rodar_geracao`)
- Modify: `backend/coffee_module/routes.py:150-166` (`regerar`)
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `client.buscar_nota`, `client.definir_sap`, `db.upsert_nota`, `db.marcar_gerar`, `db.definir_origem`, `db.origem_atual`, `config.SAP_PENDENTE`.
- Produces: geração que só força `SAP_PENDENTE` em notas `nao_gerada`/`pendente`; pula SAP real (log `geracao_ignorada_sap_real`); pula arquivada (comportamento atual); não sobrescreve `origem` existente.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# 2026-06-27 — bug 2: gerar nao toca SAP real; bug 3: origem preservada
# ---------------------------------------------------------------------------


def _SAP_REAL():
    return 17247854


def test_geracao_pula_nota_com_sap_real(coffee_tmp, monkeypatch):
    """Nota nao-arquivada com SAP real nao recebe placeholder; sai da fila."""
    from coffee_module import client, db, jobs
    saps = []
    monkeypatch.setattr(client, "definir_sap",
                        lambda i, sap: saps.append((int(i), sap)) or True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": _SAP_REAL(), "arquivado": False,
                   "fields": {"id_sap": _SAP_REAL()}},
    )
    db.upsert_nota(355617, _SAP_REAL(), False, {"id_sap": _SAP_REAL()})
    db.marcar_gerar(355617, True)
    job_id = jobs.iniciar_geracao([355617])
    _aguardar_job(jobs, job_id)
    assert saps == []                              # nao definiu SAP
    assert db.listar_notas("a_gerar") == []        # saiu da fila
    ignorada = [l for l in db.listar_logs(tipo="acao_usuario")
                if l["acao"] == "geracao_ignorada_sap_real"]
    assert ignorada and ignorada[0]["nota_pk"] == 355617


def test_geracao_nao_sobrescreve_origem_verificar(coffee_tmp, monkeypatch):
    """Nota da Verificar gerada via lote mantem origem='verificar' (-> corrigida)."""
    from coffee_module import client, db, jobs
    monkeypatch.setattr(client, "definir_sap", lambda i, sap: True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": config.SAP_PENDENTE, "arquivado": False,
                   "fields": {"id_sap": config.SAP_PENDENTE}},
    )
    db.upsert_nota(355617, config.SAP_PENDENTE, False, {"id_sap": config.SAP_PENDENTE})
    db.definir_origem(355617, "verificar")
    job_id = jobs.iniciar_geracao([355617])
    _aguardar_job(jobs, job_id)
    assert db.origem_atual(355617) == "verificar"
    # re-busca com SAP real -> corrigida (origem != avulsa)
    classe = db.upsert_nota(355617, _SAP_REAL(), False, {"id_sap": _SAP_REAL()})
    assert classe == "corrigida"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py::test_geracao_pula_nota_com_sap_real test_coffee_module.py::test_geracao_nao_sobrescreve_origem_verificar -v`
Expected: FAIL — hoje a geração define SAP em qualquer nota não-arquivada e sobrescreve origem com 'avulsa'.

- [ ] **Step 3: Reescrever `_rodar_geracao`**

Substituir o corpo de `_rodar_geracao` em `backend/coffee_module/jobs.py` (linhas 68-98) por:

```python
def _rodar_geracao(job_id: str, ids: list) -> None:
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
            pk = nota["pk"]
            sap = nota["id_sap"]
            if nota["arquivado"]:
                local = nota["fields"].get("local_instalacao")
                with _LOCK:
                    _JOBS[job_id].setdefault("arquivadas", []).append(
                        {"pk": pk, "id_sap": sap, "local_instalacao": local})
                db.registrar_log("acao_usuario", "geracao_ignorada_arquivada", pk,
                                 {"id_sap": sap, "local_instalacao": local}, True)
                db.marcar_gerar(pk, False)
            elif sap and sap != config.SAP_PENDENTE:
                # Ja tem SAP real: nao re-gera, so tira da fila.
                db.registrar_log("acao_usuario", "geracao_ignorada_sap_real", pk,
                                 {"id_sap": sap}, True)
                db.marcar_gerar(pk, False)
            else:
                # nao_gerada ou pendente: forca o placeholder (re-)gerando.
                client.definir_sap(ident, config.SAP_PENDENTE)
                nota = client.buscar_nota(ident)
                db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
                db.marcar_gerar(nota["pk"], False)
                if db.origem_atual(nota["pk"]) is None:
                    db.definir_origem(nota["pk"], "avulsa")
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

- [ ] **Step 4: Guardar SAP real no `regerar` (rota)**

Substituir o corpo de `regerar` em `backend/coffee_module/routes.py` (linhas 150-166) por:

```python
@router.post("/regerar")
def regerar(pedido: RegerarPedido):
    _garantir_banco()
    try:
        nota = client.buscar_nota(pedido.id)
        if nota["id_sap"] and nota["id_sap"] != config.SAP_PENDENTE and not nota["arquivado"]:
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
            db.marcar_gerar(nota["pk"], False)
            db.registrar_log("acao_usuario", "geracao_ignorada_sap_real", nota["pk"],
                             {"id_sap": nota["id_sap"]}, True)
            return {"ok": True, "nota": nota}
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

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd backend && python -m pytest test_coffee_module.py -q`
Expected: PASS. Confirmar especialmente que continuam verdes: `test_job_geracao_define_sap_e_isola_erro` (notas pendentes → ainda define SAP), `test_geracao_nota_arquivada_nao_define_sap`, `test_geracao_nota_arquivada_remove_da_fila`, `test_geracao_busca_antes_de_definir_sap`, `test_geracao_marca_origem_avulsa`, `test_rota_regerar`, `test_rota_regerar_limpa_a_gerar`.

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/jobs.py backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "fix(coffee): gerar so forca placeholder em nao_gerada/pendente; preserva origem

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Backend — endpoint síncrono `GET /coffee/consultar/{id}`

**Files:**
- Modify: `backend/coffee_module/routes.py` (adicionar rota após `/notas`)
- Test: `backend/test_coffee_module.py`

**Interfaces:**
- Consumes: `client.buscar_nota`, `db.upsert_nota` (retorna a `classificacao`).
- Produces: `GET /api/coffee/consultar/{id}` → JSON `{pk, id_sap, local_instalacao, classificacao, arquivado}`. Erro de API → 502.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# 2026-06-27 — consulta sincrona para o modal
# ---------------------------------------------------------------------------


def test_rota_consultar_retorna_campos(coffee_cliente, monkeypatch):
    from coffee_module import client
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": False,
                   "fields": {"id_sap": 17247854, "local_instalacao": "701CF999"}},
    )
    r = coffee_cliente.get("/api/coffee/consultar/355617")
    assert r.status_code == 200
    body = r.json()
    assert body["pk"] == 355617
    assert body["id_sap"] == 17247854
    assert body["local_instalacao"] == "701CF999"
    assert body["classificacao"] == "gerada"
    assert body["arquivado"] is False


def test_rota_consultar_falha_502(coffee_cliente, monkeypatch):
    from coffee_module import client

    def boom(i):
        raise RuntimeError("falha API")

    monkeypatch.setattr(client, "buscar_nota", boom)
    assert coffee_cliente.get("/api/coffee/consultar/999").status_code == 502
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py::test_rota_consultar_retorna_campos test_coffee_module.py::test_rota_consultar_falha_502 -v`
Expected: FAIL com 404 (rota inexistente).

- [ ] **Step 3: Adicionar a rota**

Inserir em `backend/coffee_module/routes.py` logo após a função `notas` (após a linha 80):

```python
@router.get("/consultar/{id}")
def consultar(id: int):
    _garantir_banco()
    try:
        nota = client.buscar_nota(id)
        classe = db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
    except Exception:
        db.registrar_log("acao_usuario", "consultar", id, {"id": id}, False)
        raise HTTPException(status_code=502,
                            detail="Nao foi possivel consultar a nota na API COFFEE.")
    return {
        "pk": nota["pk"],
        "id_sap": nota["id_sap"],
        "local_instalacao": nota["fields"].get("local_instalacao"),
        "classificacao": classe,
        "arquivado": nota["arquivado"],
    }
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `cd backend && python -m pytest test_coffee_module.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "feat(coffee): GET /consultar/{id} sincrono para o modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — tipo `CoffeeConsulta` + helper `consultarNota`

**Files:**
- Modify: `frontend/src/coffee/types.ts`
- Modify: `frontend/src/api.ts:136-145`

**Interfaces:**
- Produces: `CoffeeConsulta` (tipo); `consultarNota(id: number): Promise<CoffeeConsulta>` exportada e incluída em `EDPApi`.

- [ ] **Step 1: Adicionar o tipo**

Adicionar ao fim de `frontend/src/coffee/types.ts`:

```ts
export interface CoffeeConsulta {
  pk: number;
  id_sap: number | null;
  local_instalacao: string | null;
  classificacao: string;
  arquivado: boolean | null;
}
```

- [ ] **Step 2: Adicionar o helper na api**

Em `frontend/src/api.ts`, adicionar após `marcarGerar` (após a linha 143):

```ts
export async function consultarNota(id: number): Promise<import('./coffee/types').CoffeeConsulta> {
  const res = await fetch(BASE + "/coffee/consultar/" + id, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("GET /consultar -> " + res.status);
  return res.json();
}
```

E incluir no objeto `EDPApi` (linha 145):

```ts
export const EDPApi = { BASE, fetchData, upload, toggleComplete, markDuplicate, marcarGerar, consultarNota, coffeeUrl, mapsUrl, openCoffee };
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd frontend && npm run build`
Expected: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/types.ts frontend/src/api.ts
git commit -m "feat(ui): tipo CoffeeConsulta + EDPApi.consultarNota

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — componente `coffee-gerar-modal.tsx`

**Files:**
- Create: `frontend/src/coffee/coffee-gerar-modal.tsx`
- Test: `cd frontend && npm run build` + manual

**Interfaces:**
- Consumes: `EDPApi.consultarNota`, `BASE` (para `gerar-lote`/`job`/`local-instalacao`), `CoffeeJob` (de `./types`), `toast` (sonner).
- Produces: `CoffeeGerarModal({ open, idsIniciais, onClose, onChanged })`.
  - `open: boolean`
  - `idsIniciais?: number[]` — consultados ao abrir
  - `onClose: () => void`
  - `onChanged: () => void` — chamado após gerar (parent refaz fetch das listas)

- [ ] **Step 1: Criar o componente**

Criar `frontend/src/coffee/coffee-gerar-modal.tsx`:

```tsx
import React from 'react';
import type { CoffeeJob } from './types';
import { EDPApi, BASE } from '../api';
import { toast } from 'sonner';

// ponytail: máscara 3-2-resto; aperta a regra se o formato do local for fixo
function maskLocal(v: string): string {
  const c = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const a = c.slice(0, 3), b = c.slice(3, 5), rest = c.slice(5);
  return [a, b, rest].filter(Boolean).join("-");
}
function unmaskLocal(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

interface Row {
  id: number;
  estado: "consultando" | "ok" | "erro";
  pk?: number;
  idSap?: number | null;
  classificacao?: string;
  arquivado?: boolean | null;
  localAtual?: string;          // sem máscara (como veio do backend)
  localEditado?: string;        // mascarado, no input
  salvandoLocal?: boolean;
  erro?: string;
}

function parseIds(texto: string): number[] {
  return [...new Set(
    texto.split(/[\s,;]+/).map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  )];
}

const STATUS_COR: Record<string, string> = {
  gerada: "var(--green)", corrigida: "#1f9fd6",
  pendente: "var(--amber)", nao_gerada: "#94a3b8",
};

export function CoffeeGerarModal({ open, idsIniciais, onClose, onChanged }: {
  open: boolean;
  idsIniciais?: number[];
  onClose: () => void;
  onChanged: () => void;
}): React.JSX.Element | null {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [input, setInput] = React.useState("");
  const [gerando, setGerando] = React.useState<{ rodando: boolean; feitas: number; total: number }>(
    { rodando: false, feitas: 0, total: 0 });

  const consultar = React.useCallback((id: number): void => {
    setRows((rs) => rs.some((r) => r.id === id) ? rs : [...rs, { id, estado: "consultando" }]);
    EDPApi.consultarNota(id)
      .then((c) => setRows((rs) => rs.map((r) => r.id === id ? {
        ...r, estado: "ok", pk: c.pk, idSap: c.id_sap, classificacao: c.classificacao,
        arquivado: c.arquivado,
        localAtual: c.local_instalacao ?? "",
        localEditado: c.local_instalacao ? maskLocal(c.local_instalacao) : "",
      } : r)))
      .catch((e: unknown) => setRows((rs) => rs.map((r) => r.id === id ? {
        ...r, estado: "erro", erro: e instanceof Error ? e.message : String(e),
      } : r)));
  }, []);

  // Ao abrir: zera e consulta os ids iniciais.
  React.useEffect(() => {
    if (!open) return;
    setRows([]); setInput(""); setGerando({ rodando: false, feitas: 0, total: 0 });
    (idsIniciais ?? []).forEach(consultar);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function adicionar(): void {
    parseIds(input).forEach(consultar);
    setInput("");
  }

  function reconsultarTodas(): void {
    rows.forEach((r) => consultar(r.id));
    toast.info("Reconsultando notas…");
  }

  function salvarLocal(row: Row): void {
    const local = unmaskLocal(row.localEditado ?? "");
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, salvandoLocal: true } : r));
    fetch(`${BASE}/coffee/local-instalacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, local }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /local-instalacao -> ${res.status}`); })
      .then(() => {
        setRows((rs) => rs.map((r) => r.id === row.id
          ? { ...r, salvandoLocal: false, localAtual: local } : r));
        toast.success("Local de instalação atualizado");
      })
      .catch((e: unknown) => {
        setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, salvandoLocal: false } : r));
        toast.error("Falha ao salvar local", { description: e instanceof Error ? e.message : String(e) });
      });
  }

  function pollJob(jobId: string): Promise<void> {
    return new Promise((resolve) => {
      const tick = (): void => {
        fetch(`${BASE}/coffee/job/${jobId}`, { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((j: CoffeeJob) => {
            setGerando({ rodando: true, feitas: j.feitas, total: j.total });
            if (j.estado === "concluido") resolve();
            else window.setTimeout(tick, 600);
          })
          .catch(() => window.setTimeout(tick, 600));
      };
      tick();
    });
  }

  function gerar(): void {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return;
    setGerando({ rodando: true, feitas: 0, total: ids.length });
    fetch(`${BASE}/coffee/gerar-lote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, justificativa: null }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /gerar-lote -> ${res.status}`); return res.json(); })
      .then((data: { job_id: string }) => pollJob(data.job_id))
      .then(() => {
        setGerando({ rodando: false, feitas: 0, total: 0 });
        rows.forEach((r) => consultar(r.id)); // atualiza status pós-geração
        onChanged();
        toast.success(`${ids.length} nota(s) processada(s)`);
      })
      .catch((e: unknown) => {
        setGerando({ rodando: false, feitas: 0, total: 0 });
        toast.error("Falha ao gerar", { description: e instanceof Error ? e.message : String(e) });
      });
  }

  return (
    <>
      <div onClick={gerando.rodando ? undefined : onClose}
           style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300 }} />
      <div role="dialog" aria-modal="true"
           style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                    width: 760, maxWidth: "94vw", maxHeight: "88vh", background: "var(--surface)",
                    border: "1px solid var(--line)", borderRadius: 12, zIndex: 301,
                    display: "flex", flexDirection: "column", gap: 12, padding: 20,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Gerar / Consultar notas</span>

        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
                 placeholder="Cole ids (espaço, vírgula ou linha)"
                 style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--text)", fontSize: 13,
                          fontFamily: "var(--font-mono)" }} />
          <button className="edp-btn sm" onClick={adicionar} disabled={!input.trim()}
                  style={{ fontWeight: 600 }}>Adicionar</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid var(--line)",
                      borderRadius: 8 }}>
          <table className="cnt-tbl" style={{ width: "100%", borderCollapse: "separate",
                                              borderSpacing: 0, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>ID COFFEE</th>
                <th style={th}>ID SAP</th>
                <th style={th}>Local de instalação</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, color: "var(--text-mute)", textAlign: "center", padding: 24 }}>
                  Adicione ids para consultar.
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}><span className="edp-mono" style={{ fontWeight: 600 }}>{r.pk ?? r.id}</span></td>
                  <td style={td}>
                    {r.estado === "consultando" ? "…"
                     : r.estado === "erro" ? <span style={{ color: "var(--red)" }}>erro</span>
                     : <span className="edp-mono">{r.idSap ?? "—"}</span>}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input value={r.localEditado ?? ""} disabled={r.estado !== "ok"}
                             onChange={(e) => {
                               const m = maskLocal(e.target.value);
                               setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, localEditado: m } : x));
                             }}
                             style={{ width: 150, padding: "4px 8px", borderRadius: 6,
                                      border: "1px solid var(--line)", background: "var(--surface-2)",
                                      color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12 }} />
                      {r.estado === "ok" && unmaskLocal(r.localEditado ?? "") !== (r.localAtual ?? "") && (
                        <button className="edp-btn sm" disabled={r.salvandoLocal}
                                onClick={() => salvarLocal(r)} style={{ fontSize: 11, padding: "3px 6px" }}>
                          {r.salvandoLocal ? "…" : "Salvar"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={td}>
                    {r.classificacao && (
                      <span style={{ color: STATUS_COR[r.classificacao] ?? "var(--text-mute)", fontWeight: 600 }}>
                        {r.arquivado ? "arquivada" : r.classificacao}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {r.estado === "erro" && <span style={{ color: "var(--red)", fontSize: 11 }}>{r.erro}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {gerando.rodando && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            Gerando {gerando.feitas}/{gerando.total}…
          </span>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="edp-btn sm" onClick={onClose} disabled={gerando.rodando}>Fechar</button>
          <button className="edp-btn sm" onClick={reconsultarTodas}
                  disabled={rows.length === 0 || gerando.rodando}>Consultar</button>
          <button className="edp-btn sm" onClick={gerar}
                  disabled={rows.length === 0 || gerando.rodando}
                  style={{ fontWeight: 600, color: "var(--accent)", borderColor: "var(--accent)" }}>
            Gerar ({rows.length})
          </button>
        </div>
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  position: "sticky", top: 0, background: "var(--surface)", textAlign: "left",
  padding: "8px 10px", fontSize: 11, fontWeight: 600, letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-mute)", borderBottom: "2px solid var(--line)",
};
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--line)", color: "var(--text)" };
```

- [ ] **Step 2: Verificar typecheck/build**

Run: `cd frontend && npm run build`
Expected: build sem erros. (O componente ainda não é usado — Task 6 o conecta.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/coffee/coffee-gerar-modal.tsx
git commit -m "feat(ui): modal gerar/consultar notas (consulta ao vivo + local)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — refator de `coffee-geradas.tsx` para usar o modal

**Files:**
- Modify: `frontend/src/coffee/coffee-geradas.tsx` (reescrita)
- Test: `cd frontend && npm run build` + manual

**Interfaces:**
- Consumes: `CoffeeGerarModal` (Task 5); `useCoffeeNotas`, `CoffeeNotasTable`, `LogDrawer`, `ConfirmModal`, `BASE`, `toast` (existentes).
- Produces: página Geradas sem input único nem botões Gerar/Regerar por-linha; com botões "Gerar / Consultar notas" e "Gerar fila (N)".

- [ ] **Step 1: Reescrever o arquivo**

Substituir todo o conteúdo de `frontend/src/coffee/coffee-geradas.tsx` por:

```tsx
import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { ConfirmModal } from './confirm-modal';
import { CoffeeGerarModal } from './coffee-gerar-modal';
import { coffeeUrl, BASE as API_BASE } from '../api';
import { toast } from 'sonner';

type PendingAction =
  | { kind: "remover"; pk: number }
  | { kind: "arquivar"; pk: number };

function AbrirCoffeeBtn({ pk }: { pk: number }): React.JSX.Element {
  return (
    <a className="edp-btn coffee sm" target="_blank" rel="noopener"
       href={coffeeUrl(String(pk))} title="Abrir no COFFEE"
       style={{ fontSize: 12, padding: "4px 6px" }}>
      ☕
    </a>
  );
}

export function CoffeeGeradas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("gerada");
  const aGerar = useCoffeeNotas("a_gerar");

  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalIds, setModalIds] = React.useState<number[] | undefined>(undefined);
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [modalBusy, setModalBusy] = React.useState(false);
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);

  function abrirModal(ids?: number[]): void { setModalIds(ids); setModalOpen(true); }

  function arquivar(pk: number, justificativa: string): Promise<void> {
    return fetch(`${API_BASE}/coffee/arquivar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pk, justificativa }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /arquivar -> ${res.status}`); })
      .then(() => { refetch(); toast.success("Nota arquivada"); })
      .catch((e: unknown) => void toast.error("Falha ao arquivar", { description: e instanceof Error ? e.message : String(e) }));
  }

  function remover(pk: number, justificativa: string): Promise<void> {
    return fetch(`${API_BASE}/coffee/marcar-gerar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pk, a_gerar: false, justificativa }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /marcar-gerar -> ${res.status}`); })
      .then(() => { aGerar.refetch(); toast.success("Nota desmarcada para geração"); })
      .catch((e: unknown) => void toast.error("Falha ao desmarcar", { description: e instanceof Error ? e.message : String(e) }));
  }

  function handleConfirm(justificativa: string): void {
    if (!pending) return;
    setModalBusy(true);
    const done = (): void => { setModalBusy(false); setPending(null); };
    if (pending.kind === "remover") remover(pending.pk, justificativa).finally(done);
    else arquivar(pending.pk, justificativa).finally(done);
  }

  const modalConfig: Record<PendingAction["kind"], { title: string; confirmLabel: string; message: string }> = {
    "remover": { title: "Remover da fila", confirmLabel: "Remover", message: "A nota sai da fila de geracao. Justifique o motivo." },
    "arquivar": { title: "Arquivar nota", confirmLabel: "Arquivar", message: "A nota sera arquivada e nao aparecera mais nas listagens." },
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
      {/* Cabeçalho: ação principal */}
      <div style={{ flexShrink: 0, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12,
                    borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Gerar Notas</span>
        <button className="edp-btn sm" style={{ fontWeight: 600 }} onClick={() => abrirModal(undefined)}>
          Gerar / Consultar notas
        </button>
      </div>

      {/* Zona: A gerar */}
      <div style={{ flexShrink: 0, padding: "14px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>A gerar</span>
        {!aGerar.isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {aGerar.notas.length} nota{aGerar.notas.length !== 1 ? "s" : ""}
          </span>
        )}
        {aGerar.notas.length > 0 && (
          <button className="edp-btn sm" style={{ fontWeight: 600 }}
                  onClick={() => abrirModal(aGerar.notas.map((n) => n.pk))}>
            Gerar fila ({aGerar.notas.length})
          </button>
        )}
      </div>
      {aGerar.notas.length > 0 && (
        <CoffeeNotasTable
          notas={aGerar.notas}
          isLoading={aGerar.isLoading}
          emptyMessage="Nenhuma nota marcada para gerar."
          actionColumn={(nota) => (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AbrirCoffeeBtn pk={nota.pk} />
              <button className="edp-btn sm"
                      onClick={() => setPending({ kind: "remover", pk: nota.pk })}
                      title="Remover da fila" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
                Remover
              </button>
              <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                      title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
                Logs
              </button>
            </div>
          )}
        />
      )}

      {/* Zona: Geradas */}
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
          : "Nenhuma nota gerada encontrada. Use o botao acima ou marque notas na Verificar."}
        actionColumn={(nota) => (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AbrirCoffeeBtn pk={nota.pk} />
            <button className="edp-btn sm"
                    onClick={() => setPending({ kind: "arquivar", pk: nota.pk })}
                    title="Arquivar nota" style={{ fontSize: 12, padding: "4px 6px", color: "var(--red)" }}>
              Arquivar
            </button>
            <button className="edp-btn sm" onClick={() => setDrawerPk(nota.pk)}
                    title="Ver logs" style={{ fontSize: 12, padding: "4px 6px" }}>
              Logs
            </button>
          </div>
        )}
      />

      <CoffeeGerarModal
        open={modalOpen}
        idsIniciais={modalIds}
        onClose={() => setModalOpen(false)}
        onChanged={() => { aGerar.refetch(); refetch(); }}
      />

      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}

      <ConfirmModal
        open={pending !== null && cfg !== null}
        title={cfg?.title ?? ""}
        message={cfg?.message}
        confirmLabel={cfg?.confirmLabel}
        tone="danger"
        requireJustification
        busy={modalBusy}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: build sem erros. Confirmar que não sobraram imports de `CoffeeLog`/`CoffeeJob`/`useCoffeeNotas("a_gerar")` não usados.

- [ ] **Step 3: Verificação manual (dev server)**

Run: `cd frontend && npm run dev` (backend rodando em paralelo).
Conferir:
- "Gerar / Consultar notas" abre o modal vazio; colar ids → consulta ao vivo preenche ID COFFEE / ID SAP / local / status.
- Editar local (máscara `DDD-DD-resto`) → botão Salvar aparece → salva.
- "Gerar fila (N)" abre o modal pré-carregado com a fila.
- "Gerar" mostra progresso e atualiza status; nota de SAP real fica como gerada/corrigida (não vira pendente).
- Tabelas sem botões Gerar/Regerar por-linha; Remover/Arquivar/Logs funcionando.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/coffee-geradas.tsx
git commit -m "feat(ui): Geradas usa modal de gerar/consultar; remove input e botoes por-linha

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Bug 1 (fila) → Task 1. ✓
- Bug 2 (placeholder) → Task 2. ✓
- Bug 3 (origem corrigida/gerada) → Task 1 (verificar) + Task 2 (não sobrescreve / avulsa). ✓
- Endpoint consultar → Task 3. ✓
- Tipo/helper front → Task 4. ✓
- Modal (consulta ao vivo, local mascarado, Gerar/Consultar/Salvar) → Task 5. ✓
- Refator Geradas (remove input + botões por-linha; entrada por modal; "Gerar fila") → Task 6. ✓
- Arquivada continua pulada → Task 2 (branch mantido) + testes existentes. ✓
- `coffee-pendentes`/`coffee-corrigidas` sem mudança → nenhum task (correto, herdam classificação). ✓

**Placeholder scan:** sem TBD/TODO; todo passo com código/comando concreto.

**Type consistency:** `CoffeeConsulta` (Task 4) ↔ retorno de `/consultar` (Task 3: `pk, id_sap, local_instalacao, classificacao, arquivado`) ↔ uso no modal (Task 5: `c.pk`, `c.id_sap`, `c.classificacao`, `c.arquivado`, `c.local_instalacao`). ✓ `consultarNota(id: number)` (Task 4) ↔ `EDPApi.consultarNota` no modal (Task 5). ✓ `CoffeeGerarModal` props (Task 5) ↔ uso (Task 6: `open/idsIniciais/onClose/onChanged`). ✓ `origem_atual` (Task 1) consumido em Task 2. ✓
