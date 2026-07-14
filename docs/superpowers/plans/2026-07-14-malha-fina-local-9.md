# Malha Fina — Local com 9 Extra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar na planilha do Verificar locais de instalação com um "9" extra (14 chars, prefixo de 13 existente em outra nota) e corrigi-los em massa via API COFFEE, com geração opcional encadeada.

**Architecture:** Detecção é função pura no frontend (estado derivado dos `records` já carregados). Correção é job em lote no backend (padrão `jobs.py` existente: thread + polling), que confirma o local atual no COFFEE antes de alterar. Painel novo no dashboard Verificar orquestra seleção por grupo e dispara o job.

**Tech Stack:** FastAPI + httpx + pytest (backend); React 18 + TypeScript + Tailwind v4 (frontend, sem framework de teste — verificação via `npm run build`).

**Spec:** `docs/superpowers/specs/2026-07-14-malha-fina-local-9-design.md`

## Global Constraints

- Local de instalação válido tem exatamente **13 caracteres** (cidade 3 + tipo 2 + número 8). Errado = **14 chars terminando em "9"**. Correção sempre **remove** o 9 (proposto = prefixo de 13).
- Job nunca altera nota cujo local atual no COFFEE difere de `local + "9"` (categoria `divergentes`) nem re-corrige (`ja_corrigidas`).
- Falha individual não derruba o lote (padrão dos jobs existentes).
- `gerar_apos` só age sobre itens corrigidos com sucesso no mesmo item.
- Frontend: sem `any`; mono (`edp-mono`) para valores de máquina; tokens do DESIGN.md apenas (nada de cores arbitrárias).
- Docs (`docs/dev/`) atualizados no mesmo commit da mudança que documentam.
- Mensagens de commit terminam com:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Y62fk1yzQcHehfnkGZ5v1L`
- Comandos backend rodam em `backend/` (`cd backend`). Comandos frontend em `frontend/`.

---

### Task 1: Job de correção em lote (`jobs.iniciar_correcao_local`)

**Files:**
- Modify: `backend/coffee_module/jobs.py` (append ao final)
- Test: `backend/test_coffee_module.py` (append ao final)

**Interfaces:**
- Consumes: `client.buscar_nota(id) -> dict` (chaves `pk`, `id_sap`, `arquivado`, `local_instalacao`, `fields`), `client.alterar_local(id, local)`, `client.definir_sap(id, sap)`, `client.desarquivar(id)`, `db.upsert_nota/marcar_gerar/origem_atual/definir_origem/registrar_log/definir_trace`, `config.SAP_PENDENTE`, `config.DELAY_GERACAO`.
- Produces: `jobs.iniciar_correcao_local(itens: list[dict], gerar_apos: bool = False, trace: str | None = None) -> str` (job_id). Cada item: `{"id": int, "local": str}`. Job dict ganha listas `corrigidas: list[int]`, `ja_corrigidas: list[int]`, `divergentes: list[{"pk": int, "local_atual": str | None}]`, `geradas: list[int]` além dos campos padrão (`estado/total/feitas/erros/iniciado_em`).

- [ ] **Step 1: Write the failing tests**

Append ao final de `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Malha fina — job de correção de local com 9 extra
# ---------------------------------------------------------------------------

def _nota_fake(pk, local, id_sap=None, arquivado=False):
    return {"pk": int(pk), "id_sap": id_sap, "arquivado": arquivado,
            "local_instalacao": local, "fields": {"id_sap": id_sap}}


def test_job_correcao_local_corrige_e_pula(coffee_tmp, monkeypatch):
    """Corrige quem tem 9 extra; pula ja_corrigidas e divergentes."""
    from coffee_module import client, jobs

    locais = {1: "718ET000267739",   # errado -> corrige
              2: "718ET00026773",    # já é o proposto -> ja_corrigidas
              3: "718XX99999999"}    # nem errado nem proposto -> divergente
    alterados = []
    monkeypatch.setattr(client, "buscar_nota", lambda i: _nota_fake(i, locais[int(i)]))
    monkeypatch.setattr(client, "alterar_local",
                        lambda i, l: alterados.append((int(i), l)) or True)

    itens = [{"id": 1, "local": "718ET00026773"},
             {"id": 2, "local": "718ET00026773"},
             {"id": 3, "local": "718ET00026773"}]
    j = _aguardar_job(jobs, jobs.iniciar_correcao_local(itens))

    assert j["total"] == 3 and j["feitas"] == 3
    assert alterados == [(1, "718ET00026773")]
    assert j["corrigidas"] == [1]
    assert j["ja_corrigidas"] == [2]
    assert j["divergentes"] == [{"pk": 3, "local_atual": "718XX99999999"}]
    assert j["geradas"] == [] and j["erros"] == []


def test_job_correcao_local_erro_isolado_nao_derruba_lote(coffee_tmp, monkeypatch):
    from coffee_module import client, jobs

    def fake_buscar(i):
        if int(i) == 99:
            raise RuntimeError("timeout")
        return _nota_fake(i, "718ET000267739")

    alterados = []
    monkeypatch.setattr(client, "buscar_nota", fake_buscar)
    monkeypatch.setattr(client, "alterar_local",
                        lambda i, l: alterados.append(int(i)) or True)

    itens = [{"id": 1, "local": "718ET00026773"},
             {"id": 99, "local": "718ET00026773"},
             {"id": 2, "local": "718ET00026773"}]
    j = _aguardar_job(jobs, jobs.iniciar_correcao_local(itens))

    assert j["feitas"] == 3
    assert j["corrigidas"] == [1, 2]
    assert len(j["erros"]) == 1 and j["erros"][0]["pk"] == 99


def test_job_correcao_local_gerar_apos_encadeia_so_corrigidas(coffee_tmp, monkeypatch):
    """gerar_apos: SAP placeholder + desarquivar só para quem foi corrigido."""
    from coffee_module import client, config, jobs

    locais = {1: "718ET000267739", 2: "718ET00026773"}
    chamadas = []

    def fake_buscar(i):
        # Após alterar_local, a re-busca devolve o local corrigido.
        corrigido = ("alterar", int(i)) in [c[:2] for c in chamadas]
        local = "718ET00026773" if corrigido else locais[int(i)]
        return _nota_fake(i, local)

    monkeypatch.setattr(client, "buscar_nota", fake_buscar)
    monkeypatch.setattr(client, "alterar_local",
                        lambda i, l: chamadas.append(("alterar", int(i), l)) or True)
    monkeypatch.setattr(client, "definir_sap",
                        lambda i, s: chamadas.append(("sap", int(i), s)) or True)
    monkeypatch.setattr(client, "desarquivar",
                        lambda i: chamadas.append(("desarq", int(i))) or True)

    itens = [{"id": 1, "local": "718ET00026773"},
             {"id": 2, "local": "718ET00026773"}]
    j = _aguardar_job(jobs, jobs.iniciar_correcao_local(itens, gerar_apos=True))

    assert j["corrigidas"] == [1] and j["ja_corrigidas"] == [2]
    assert j["geradas"] == [1]
    assert ("sap", 1, config.SAP_PENDENTE) in chamadas
    assert ("desarq", 1) in chamadas
    # nota 2 não entrou na geração
    assert ("sap", 2, config.SAP_PENDENTE) not in chamadas


def test_job_correcao_local_gerar_apos_ignora_sap_real(coffee_tmp, monkeypatch):
    """Corrigida mas com SAP real: não re-gera (loga geracao_ignorada_sap_real)."""
    from coffee_module import client, config, jobs

    chamadas = []
    monkeypatch.setattr(client, "buscar_nota",
                        lambda i: _nota_fake(i, "718ET000267739", id_sap=17247854))
    monkeypatch.setattr(client, "alterar_local", lambda i, l: True)
    monkeypatch.setattr(client, "definir_sap",
                        lambda i, s: chamadas.append(("sap", int(i))) or True)
    monkeypatch.setattr(client, "desarquivar",
                        lambda i: chamadas.append(("desarq", int(i))) or True)

    itens = [{"id": 1, "local": "718ET00026773"}]
    j = _aguardar_job(jobs, jobs.iniciar_correcao_local(itens, gerar_apos=True))

    assert j["corrigidas"] == [1]
    assert j["geradas"] == []
    assert chamadas == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest test_coffee_module.py -k correcao_local -v`
Expected: 4 FAILED com `AttributeError: module 'coffee_module.jobs' has no attribute 'iniciar_correcao_local'`

- [ ] **Step 3: Write the implementation**

Append ao final de `backend/coffee_module/jobs.py`:

```python
def iniciar_correcao_local(itens: list, gerar_apos: bool = False,
                           trace: str | None = None) -> str:
    """Corrige em lote locais de instalacao com '9' extra (malha fina)."""
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(itens),
            "feitas": 0,
            "erros": [],
            "corrigidas": [],
            "ja_corrigidas": [],
            "divergentes": [],
            "geradas": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar_correcao_local,
                     args=(job_id, [dict(i) for i in itens], gerar_apos, trace),
                     daemon=True).start()
    return job_id


def _rodar_correcao_local(job_id: str, itens: list, gerar_apos: bool,
                          trace: str | None = None) -> None:
    db.definir_trace(trace)
    for item in itens:
        ident, local = item["id"], item["local"]
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["fields"])
            atual = nota["local_instalacao"]
            if atual == local:
                # Alguem ja corrigiu antes: idempotente, nao e erro.
                with _LOCK:
                    _JOBS[job_id]["ja_corrigidas"].append(ident)
                db.registrar_log("acao_usuario", "correcao_local_ja_corrigida",
                                 nota["pk"], {"id": ident, "local": local}, True)
            elif atual != local + "9":
                # Planilha defasada: nunca altera o que nao reconhecemos.
                with _LOCK:
                    _JOBS[job_id]["divergentes"].append(
                        {"pk": ident, "local_atual": atual})
                db.registrar_log("acao_usuario", "correcao_local_divergente",
                                 nota["pk"],
                                 {"id": ident, "esperado": local + "9",
                                  "atual": atual}, False)
            else:
                client.alterar_local(ident, local)
                with _LOCK:
                    _JOBS[job_id]["corrigidas"].append(ident)
                db.registrar_log("acao_usuario", "correcao_local", nota["pk"],
                                 {"id": ident, "de": atual, "para": local}, True)
                if gerar_apos:
                    _gerar_apos_correcao(job_id, ident, nota)
        except Exception as exc:  # noqa: BLE001 — uma falha não derruba o lote
            with _LOCK:
                _JOBS[job_id]["erros"].append({"pk": ident, "msg": str(exc)})
        finally:
            with _LOCK:
                _JOBS[job_id]["feitas"] += 1
        time.sleep(config.DELAY_GERACAO)
    with _LOCK:
        _JOBS[job_id]["estado"] = "concluido"


def _gerar_apos_correcao(job_id: str, ident, nota: dict) -> None:
    """Encadeia a geracao de uma nota recem-corrigida (mesma logica do gerar-lote)."""
    sap = nota["id_sap"]
    if sap and sap != config.SAP_PENDENTE:
        # SAP real: ja foi gerada — nao re-gera.
        db.registrar_log("acao_usuario", "geracao_ignorada_sap_real", nota["pk"],
                         {"id_sap": sap}, True)
        db.marcar_gerar(nota["pk"], False)
        return
    # O COFFEE so gera notas DESARQUIVADAS — placeholder + desarquivar,
    # mesma sequencia do _rodar_geracao.
    client.definir_sap(ident, config.SAP_PENDENTE)
    client.desarquivar(ident)
    atualizada = client.buscar_nota(ident)
    db.upsert_nota(atualizada["pk"], atualizada["id_sap"], atualizada["fields"])
    db.marcar_gerar(atualizada["pk"], False)
    if db.origem_atual(atualizada["pk"]) is None:
        db.definir_origem(atualizada["pk"], "avulsa")
    with _LOCK:
        _JOBS[job_id]["geradas"].append(ident)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest test_coffee_module.py -v`
Expected: todos PASS (novos 4 + suíte existente intacta)

- [ ] **Step 5: Commit**

```bash
git add backend/coffee_module/jobs.py backend/test_coffee_module.py
git commit -m "feat(coffee): job de correção em lote de local com 9 extra

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Y62fk1yzQcHehfnkGZ5v1L"
```

---

### Task 2: Endpoint `POST /api/coffee/corrigir-local-lote`

**Files:**
- Modify: `backend/coffee_module/routes.py` (models junto aos outros `BaseModel`; rota após `gerar_lote`)
- Modify: `docs/dev/05-backend-coffee-module.md` (documentar endpoint + job)
- Test: `backend/test_coffee_module.py` (append)

**Interfaces:**
- Consumes: `jobs.iniciar_correcao_local(itens, gerar_apos, trace)` (Task 1), `db.registrar_log`, `db.trace_atual`, fixture `coffee_cliente` existente (TestClient).
- Produces: `POST /api/coffee/corrigir-local-lote` com body `{"itens": [{"id": int, "local": str}], "gerar_apos": bool}` → `{"job_id": str}`. 400 se lista vazia ou `local` ≠ 13 chars. Progresso via `GET /api/coffee/job/{job_id}` existente.

- [ ] **Step 1: Write the failing tests**

Append ao final de `backend/test_coffee_module.py`:

```python
def test_rota_corrigir_local_lote_validacoes(coffee_cliente):
    r = coffee_cliente.post("/api/coffee/corrigir-local-lote",
                            json={"itens": []})
    assert r.status_code == 400

    r = coffee_cliente.post("/api/coffee/corrigir-local-lote",
                            json={"itens": [{"id": 1, "local": "curto"}]})
    assert r.status_code == 400
    assert "13" in r.json()["detail"]


def test_rota_corrigir_local_lote_dispara_job(coffee_cliente, monkeypatch):
    from coffee_module import client, db, jobs

    monkeypatch.setattr(client, "buscar_nota",
                        lambda i: _nota_fake(i, "718ET000267739"))
    monkeypatch.setattr(client, "alterar_local", lambda i, l: True)

    r = coffee_cliente.post("/api/coffee/corrigir-local-lote",
                            json={"itens": [{"id": 1, "local": "718ET00026773"}],
                                  "gerar_apos": False})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    j = _aguardar_job(jobs, job_id)
    assert j["corrigidas"] == [1]

    logs = db.listar_logs(tipo="acao_usuario")
    assert any(l["acao"] == "correcao_local_lote" for l in logs)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest test_coffee_module.py -k corrigir_local_lote -v`
Expected: 2 FAILED com 404 (rota inexistente)

- [ ] **Step 3: Write the implementation**

Em `backend/coffee_module/routes.py`, adicionar junto aos outros models (após `GerarLotePedido`):

```python
class CorrigirLocalItem(BaseModel):
    id: int
    local: str


class CorrigirLocalPedido(BaseModel):
    itens: list[CorrigirLocalItem]
    gerar_apos: bool = False
```

E a rota após `gerar_lote`:

```python
@router.post("/corrigir-local-lote")
def corrigir_local_lote(pedido: CorrigirLocalPedido):
    _garantir_banco()
    if not pedido.itens:
        raise HTTPException(status_code=400, detail="Lista de itens vazia.")
    invalidos = [item.id for item in pedido.itens if len(item.local) != 13]
    if invalidos:
        raise HTTPException(
            status_code=400,
            detail=f"Local proposto deve ter 13 caracteres (ids: {invalidos}).")
    db.registrar_log("acao_usuario", "correcao_local_lote", None,
                     {"total": len(pedido.itens),
                      "gerar_apos": pedido.gerar_apos}, True)
    return {"job_id": jobs.iniciar_correcao_local(
        [item.model_dump() for item in pedido.itens],
        pedido.gerar_apos, trace=db.trace_atual())}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest test_coffee_module.py -v`
Expected: todos PASS

- [ ] **Step 5: Update docs**

Em `docs/dev/05-backend-coffee-module.md`, na seção de rotas, adicionar (ajuste o formato ao padrão do arquivo):

```markdown
- `POST /api/coffee/corrigir-local-lote` — malha fina: corrige em lote
  locais de instalação com "9" extra. Body
  `{itens: [{id, local}], gerar_apos}`; `local` é o proposto (13 chars).
  Devolve `{job_id}` (polling via `GET /job/{job_id}`). O job confirma o
  local atual via `buscar_nota` antes de alterar: igual ao proposto →
  `ja_corrigidas`; diferente de `local+"9"` → `divergentes` (nunca
  altera); senão `alterar_local` → `corrigidas`. Com `gerar_apos=true`,
  encadeia a geração (placeholder SAP + desarquivar, mesma sequência do
  gerar-lote) apenas para os corrigidos — relatório em `geradas`.
```

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/routes.py backend/test_coffee_module.py docs/dev/05-backend-coffee-module.md
git commit -m "feat(coffee): endpoint corrigir-local-lote (malha fina)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Y62fk1yzQcHehfnkGZ5v1L"
```

---

### Task 3: Detecção no frontend + API client

**Files:**
- Create: `frontend/src/features/verificar/malha-fina.ts`
- Modify: `frontend/src/features/coffee/types.ts` (estender `CoffeeJob`)
- Modify: `frontend/src/api.ts` (nova função `corrigirLocalLote`, após `consultarNota`)

**Interfaces:**
- Consumes: `Note` de `frontend/src/types.ts` (usa `note.id: string` e `note.raw.local_instalacao: string`), `BASE` e `erroComDetail` de `api.ts`, `CoffeeJob` de `features/coffee/types.ts`.
- Produces:
  - `detectarNoveExtra(notes: Note[]): GrupoNoveExtra[]` e o type `GrupoNoveExtra` (export separado da implementação).
  - `corrigirLocalLote(itens: CorrigirLocalItemApi[], gerarApos: boolean): Promise<{ job_id: string }>` em `api.ts`, com `CorrigirLocalItemApi = { id: number; local: string }`.
  - `CoffeeJob` ganha `corrigidas?`, `ja_corrigidas?`, `geradas?`, `divergentes?`.

- [ ] **Step 1: Create the detection module**

Create `frontend/src/features/verificar/malha-fina.ts`:

```ts
import type { Note } from "../../types";

export interface GrupoNoveExtra {
  localErrado: string;
  localProposto: string;
  notasAfetadas: Note[];
  notasReferencia: Note[];
  ignoradasSemId: number;
}

const TAMANHO_LOCAL_VALIDO = 13;

/** Detecta locais de instalação com um "9" extra no final.
 *
 * Um local válido tem 13 chars (cidade 3 + tipo 2 + número 8). Candidato
 * a correção: 14 chars terminando em "9" cujo prefixo de 13 chars existe
 * em outra nota da planilha (a prova de que o local sem o 9 é real).
 */
export function detectarNoveExtra(notes: Note[]): GrupoNoveExtra[] {
  const porLocal = new Map<string, Note[]>();
  for (const nota of notes) {
    const local = (nota.raw.local_instalacao || "").trim().toUpperCase();
    if (!local || local === "-") continue;
    const lista = porLocal.get(local) ?? [];
    lista.push(nota);
    porLocal.set(local, lista);
  }

  const grupos: GrupoNoveExtra[] = [];
  for (const [local, notas] of porLocal) {
    if (local.length !== TAMANHO_LOCAL_VALIDO + 1 || !local.endsWith("9")) continue;
    const proposto = local.slice(0, TAMANHO_LOCAL_VALIDO);
    const referencia = porLocal.get(proposto);
    if (!referencia?.length) continue;
    // COFFEE é chaveado por id numérico; notas sem id numérico ficam de fora.
    const comId = notas.filter((n) => /^\d+$/.test(n.id.trim()));
    grupos.push({
      localErrado: local,
      localProposto: proposto,
      notasAfetadas: comId,
      notasReferencia: referencia,
      ignoradasSemId: notas.length - comId.length,
    });
  }
  return grupos.sort((a, b) => b.notasAfetadas.length - a.notasAfetadas.length);
}
```

- [ ] **Step 2: Extend CoffeeJob**

Em `frontend/src/features/coffee/types.ts`, dentro de `interface CoffeeJob`, adicionar após `arquivadas?`:

```ts
  corrigidas?: number[];
  ja_corrigidas?: number[];
  geradas?: number[];
  divergentes?: Array<{ pk: number; local_atual: string | null }>;
```

- [ ] **Step 3: Add API client function**

Em `frontend/src/api.ts`, após `consultarNota`:

```ts
export interface CorrigirLocalItemApi {
  id: number;
  local: string;
}

export async function corrigirLocalLote(
  itens: CorrigirLocalItemApi[],
  gerarApos: boolean,
): Promise<{ job_id: string }> {
  const res = await fetch(BASE + "/coffee/corrigir-local-lote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itens, gerar_apos: gerarApos }),
  });
  if (!res.ok) throw await erroComDetail(res, "POST /corrigir-local-lote");
  return res.json() as Promise<{ job_id: string }>;
}
```

- [ ] **Step 4: Verify build passes**

Run: `cd frontend && npm run build`
Expected: sucesso (tsc + vite, sem erros)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/verificar/malha-fina.ts frontend/src/features/coffee/types.ts frontend/src/api.ts
git commit -m "feat(verificar): detecção de local com 9 extra + client da correção em lote

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Y62fk1yzQcHehfnkGZ5v1L"
```

---

### Task 4: Painel "Malha fina" no dashboard Verificar

**Files:**
- Create: `frontend/src/features/verificar/malha-fina-panel.tsx`
- Modify: `frontend/src/features/verificar/dashboard.tsx` (montar o painel)
- Modify: `docs/dev/01-frontend-verificar.md` (documentar detecção + painel)

**Interfaces:**
- Consumes: `detectarNoveExtra` / `GrupoNoveExtra` (Task 3), `corrigirLocalLote` + `BASE` de `api.ts`, `CoffeeJob` de `features/coffee/types.ts`, primitivos `components/ui` (`AlertDialog*`, `Button`, `Progress`, `Switch`, `Label`), `Note` de `types.ts`.
- Produces: `<MalhaFinaPanel grupos={GrupoNoveExtra[]} />`, montado no `Dashboard` logo após o bloco de filtros (o `<div className="shrink-0 bg-surface border-b-[1px] border-b-line">`), renderizado apenas quando `grupos.length > 0`.

**Nota de execução:** mudança visual — implementar sob a skill `frontend-design` (regra do projeto). O código abaixo é a referência funcional completa; a skill guia o polimento visual (tokens DESIGN.md, mono para locais, hairline borders).

- [ ] **Step 1: Create the panel component**

Create `frontend/src/features/verificar/malha-fina-panel.tsx`:

```tsx
import * as React from "react";

import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { toast } from "sonner";

import { BASE, corrigirLocalLote } from "../../api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import { Switch } from "../../components/ui/switch";
import type { CoffeeJob } from "../coffee/types";
import type { GrupoNoveExtra } from "./malha-fina";

interface MalhaFinaPanelProps {
  grupos: GrupoNoveExtra[];
}

type FaseJob =
  | { fase: "ocioso" }
  | { fase: "rodando"; job: CoffeeJob | null }
  | { fase: "concluido"; job: CoffeeJob };

function pollJob(jobId: string): Promise<CoffeeJob> {
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      fetch(`${BASE}/coffee/job/${jobId}`, { headers: { Accept: "application/json" } })
        .then((r) => { if (!r.ok) throw new Error(`GET /job -> ${r.status}`); return r.json() as Promise<CoffeeJob>; })
        .then((job) => { if (job.estado === "concluido") resolve(job); else setTimeout(tick, 900); })
        .catch(reject);
    };
    tick();
  });
}

export function MalhaFinaPanel({ grupos }: MalhaFinaPanelProps): React.JSX.Element {
  const [aberto, setAberto] = React.useState(false);
  const [selecionados, setSelecionados] = React.useState<Set<string>>(() => new Set());
  const [gerarApos, setGerarApos] = React.useState(false);
  const [expandido, setExpandido] = React.useState<string | null>(null);
  const [fase, setFase] = React.useState<FaseJob>({ fase: "ocioso" });
  const [tratados, setTratados] = React.useState<Set<string>>(() => new Set());

  const visiveis = grupos.filter((g) => !tratados.has(g.localErrado));
  const gruposSel = visiveis.filter((g) => selecionados.has(g.localErrado));
  const totalNotas = gruposSel.reduce((acc, g) => acc + g.notasAfetadas.length, 0);
  const rodando = fase.fase === "rodando";

  if (visiveis.length === 0) return <React.Fragment />;

  function toggleGrupo(local: string): void {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(local)) novo.delete(local); else novo.add(local);
      return novo;
    });
  }

  function toggleTodos(): void {
    setSelecionados((s) =>
      s.size === visiveis.length ? new Set() : new Set(visiveis.map((g) => g.localErrado)));
  }

  function corrigir(): void {
    const itens = gruposSel.flatMap((g) =>
      g.notasAfetadas.map((n) => ({ id: Number(n.id), local: g.localProposto })));
    setFase({ fase: "rodando", job: null });
    corrigirLocalLote(itens, gerarApos)
      .then(({ job_id }) => {
        const acompanhar = (): void => {
          fetch(`${BASE}/coffee/job/${job_id}`, { headers: { Accept: "application/json" } })
            .then((r) => r.json() as Promise<CoffeeJob>)
            .then((job) => setFase((f) => (f.fase === "rodando" ? { fase: "rodando", job } : f)))
            .catch(() => undefined);
        };
        const intervalo = setInterval(acompanhar, 900);
        return pollJob(job_id).finally(() => clearInterval(intervalo));
      })
      .then((job) => {
        setFase({ fase: "concluido", job });
        setTratados((t) => new Set([...t, ...gruposSel.map((g) => g.localErrado)]));
        setSelecionados(() => new Set());
        const nErros = job.erros?.length ?? 0;
        if (nErros > 0) toast.warning(`Correção concluída com ${nErros} erro${nErros > 1 ? "s" : ""}.`);
        else toast.success("Correção concluída.");
      })
      .catch((e: Error) => {
        setFase({ fase: "ocioso" });
        toast.error(e.message);
      });
  }

  const totalAfetadas = visiveis.reduce((acc, g) => acc + g.notasAfetadas.length, 0);

  return (
    <div className="shrink-0 bg-surface border-b-[1px] border-b-line px-[22px] py-[10px]">
      <button type="button" onClick={() => setAberto((a) => !a)}
              aria-expanded={aberto}
              className="flex items-center gap-[9px] w-full text-left bg-transparent border-0 cursor-pointer p-0">
        {aberto ? <ChevronDown className="size-[14px] text-text-mute" />
                : <ChevronRight className="size-[14px] text-text-mute" />}
        <Wrench className="size-[13px] text-accent" />
        <span className="edp-eyebrow">
          Malha fina · {visiveis.length} grupo{visiveis.length !== 1 ? "s" : ""} / {totalAfetadas} nota{totalAfetadas !== 1 ? "s" : ""} com 9 extra
        </span>
      </button>

      {aberto && (
        <div className="mt-[10px] flex flex-col gap-[8px]">
          <div className="flex items-center gap-[14px] flex-wrap">
            <Button variant="outline" size="sm" onClick={toggleTodos} disabled={rodando}>
              {selecionados.size === visiveis.length ? "Limpar seleção" : "Selecionar tudo"}
            </Button>
            <div className="flex items-center gap-[7px]">
              <Switch id="malha-gerar-apos" checked={gerarApos}
                      onCheckedChange={setGerarApos} disabled={rodando} />
              <Label htmlFor="malha-gerar-apos" className="text-[12px] text-text-dim">
                Gerar após corrigir
              </Label>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={totalNotas === 0 || rodando}>
                  Corrigir selecionadas ({totalNotas})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Corrigir locais em massa?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {totalNotas} nota{totalNotas !== 1 ? "s" : ""} em {gruposSel.length} grupo{gruposSel.length !== 1 ? "s" : ""} terão
                    o "9" final removido do local de instalação no COFFEE.
                    {gerarApos ? " As corrigidas com sucesso serão geradas em seguida." : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={corrigir}>Corrigir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {fase.fase === "rodando" && (
            <div className="flex items-center gap-[10px]">
              <Progress className="max-w-[260px]"
                        value={fase.job ? (fase.job.feitas / Math.max(fase.job.total, 1)) * 100 : 0} />
              <span className="edp-mono text-[11px] text-text-mute">
                {fase.job ? `${fase.job.feitas}/${fase.job.total}` : "iniciando…"}
              </span>
            </div>
          )}

          {fase.fase === "concluido" && (
            <div className="flex items-center gap-[8px] flex-wrap edp-mono text-[11px]">
              <span className="text-accent">corrigidas {fase.job.corrigidas?.length ?? 0}</span>
              <span className="text-text-mute">já corrigidas {fase.job.ja_corrigidas?.length ?? 0}</span>
              <span className="text-text-mute">divergentes {fase.job.divergentes?.length ?? 0}</span>
              {gerarApos && <span className="text-accent">geradas {fase.job.geradas?.length ?? 0}</span>}
              <span className={(fase.job.erros?.length ?? 0) > 0 ? "text-red" : "text-text-mute"}>
                erros {fase.job.erros?.length ?? 0}
              </span>
            </div>
          )}

          <div className="flex flex-col">
            {visiveis.map((g) => {
              const sel = selecionados.has(g.localErrado);
              const exp = expandido === g.localErrado;
              return (
                <div key={g.localErrado} className="border-b-[1px] border-b-line py-[6px]">
                  <div className="flex items-center gap-[10px]">
                    <input type="checkbox" checked={sel} disabled={rodando}
                           onChange={() => toggleGrupo(g.localErrado)}
                           aria-label={`Selecionar grupo ${g.localErrado}`} />
                    <span className="edp-mono text-[12px] text-red line-through">{g.localErrado}</span>
                    <span className="text-text-mute text-[12px]">→</span>
                    <span className="edp-mono text-[12px] text-accent">{g.localProposto}</span>
                    <span className="text-[11.5px] text-text-dim">
                      {g.notasAfetadas.length} nota{g.notasAfetadas.length !== 1 ? "s" : ""} ·
                      {" "}{g.notasReferencia.length} referência{g.notasReferencia.length !== 1 ? "s" : ""}
                      {g.ignoradasSemId > 0 ? ` · ${g.ignoradasSemId} sem id (ignorada${g.ignoradasSemId !== 1 ? "s" : ""})` : ""}
                    </span>
                    <button type="button"
                            className="bg-transparent border-0 cursor-pointer text-[11px] text-text-mute p-0 ml-auto"
                            onClick={() => setExpandido(exp ? null : g.localErrado)}
                            aria-expanded={exp}>
                      {exp ? "ocultar ids" : "ver ids"}
                    </button>
                  </div>
                  {exp && (
                    <div className="edp-mono text-[11px] text-text-dim pl-[26px] pt-[4px]">
                      <div>afetadas: {g.notasAfetadas.map((n) => n.id).join(", ")}</div>
                      <div>referência: {g.notasReferencia.map((n) => n.id).join(", ")}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount the panel in Dashboard**

Em `frontend/src/features/verificar/dashboard.tsx`:

Imports (topo, ordem: relativo junto aos outros relativos):

```ts
import { detectarNoveExtra } from "./malha-fina";
import { MalhaFinaPanel } from "./malha-fina-panel";
```

Dentro de `Dashboard`, junto às outras derivações (após `const ruleStats...`):

```ts
const gruposNoveExtra = React.useMemo(() => detectarNoveExtra(notes), [notes]);
```

No JSX, logo **após** o fechamento do bloco de filtros (o `</div>` que fecha `<div className="shrink-0 bg-surface border-b-[1px] border-b-line">`):

```tsx
<MalhaFinaPanel grupos={gruposNoveExtra} />
```

(`MalhaFinaPanel` já retorna fragment vazio quando não há grupos — sem condicional no Dashboard.)

- [ ] **Step 3: Verify build passes**

Run: `cd frontend && npm run build`
Expected: sucesso, sem erros de tipo

- [ ] **Step 4: Manual smoke check**

Com dev server (`npm run dev`) e backend rodando: carregar planilha com pelo menos um local de 14 chars terminando em 9 e outro com o prefixo de 13. Painel deve aparecer com o grupo; sem planilha ou sem candidatos, painel invisível.

- [ ] **Step 5: Update docs**

Em `docs/dev/01-frontend-verificar.md`, adicionar seção (ajustar ao formato do arquivo):

```markdown
## Malha fina (local com 9 extra)

- `malha-fina.ts` — `detectarNoveExtra(notes)`: função pura; agrupa
  locais de 14 chars terminados em "9" cujo prefixo de 13 chars existe
  em outra nota da planilha. Estado derivado (useMemo no Dashboard),
  nada persiste.
- `malha-fina-panel.tsx` — painel colapsável logo abaixo dos filtros,
  visível só com grupos detectados. Seleção por grupo, switch "Gerar
  após corrigir", confirmação via AlertDialog, progresso por polling de
  `GET /api/coffee/job/{id}` e chips de resultado
  (corrigidas / já corrigidas / divergentes / geradas / erros).
  Dispara `POST /api/coffee/corrigir-local-lote`.
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/verificar/malha-fina-panel.tsx frontend/src/features/verificar/dashboard.tsx docs/dev/01-frontend-verificar.md
git commit -m "feat(verificar): painel malha fina — correção em massa de local com 9 extra

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Y62fk1yzQcHehfnkGZ5v1L"
```

---

### Task 5: Verificação final

- [ ] **Step 1: Full backend test suite**

Run: `cd backend && python -m pytest -q`
Expected: tudo PASS

- [ ] **Step 2: Frontend build**

Run: `cd frontend && npm run build`
Expected: sucesso

- [ ] **Step 3: Build + serve (regra do projeto)**

Subir backend (`cd backend && uvicorn main:app`) servindo o dist buildado e confirmar `GET /api/coffee/notas` responde 200.
