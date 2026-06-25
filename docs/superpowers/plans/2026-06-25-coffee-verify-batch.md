# COFFEE Verify Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five EDP/Verify-section tasks (two backend, three frontend) for the COFFEE module.

**Architecture:** Backend = FastAPI + SQLite (`coffee_module`), TDD with pytest against `test_coffee_module.py`. Frontend = React + Vite + TypeScript, no unit-test runner installed, so frontend tasks are gated on `npm run build` (tsc typecheck + vite build) plus explicit manual-verification steps. Build order: backend p1 work first (5, 3), then frontend (1, 4, 2).

**Tech Stack:** Python 3, FastAPI, pytest, httpx; React 18, TypeScript 5.8, Vite 6.

## Global Constraints

- Backend tests run from `backend/`: `python -m pytest test_coffee_module.py -v` (use the project venv at `backend/.venv`).
- Frontend builds run from `frontend/`: `npm run build`.
- `config.SAP_PENDENTE == 10000000` (the placeholder SAP). Copy verbatim; never hardcode the literal.
- Existing `classificar(atual, anterior)` behavior MUST stay unchanged when no origin is supplied (backwards compatibility for current tests).
- `api.openCoffee` already staggers tab opens at `i * 250ms` — do not re-implement staggering.
- `App.tsx` already defaults `coffeeSub` to `"verificar"` — do not duplicate that change.
- Commit after each task. Conventional commit prefixes (`feat`/`fix`/`docs`), Portuguese summaries to match repo history.
- Model/reasoning per task (from Todoist tags) is listed in each task header for the execution phase.

---

## File Structure

- `backend/coffee_module/jobs.py` — `_rodar_geracao` rewrite (Task 5) + origem wiring (Task 3b).
- `backend/coffee_module/classify.py` — `classificar` gains optional `origem` (Task 3b).
- `backend/coffee_module/db.py` — `origem` column + `definir_origem` + `upsert_nota` passes origem (Task 3b); `diagnosticar_nota` helper (Task 3a).
- `backend/test_coffee_module.py` — new tests appended (Tasks 5, 3a, 3b).
- `docs/coffee/fluxo-transicao-notas.md` — new doc (Task 3c).
- `frontend/src/coffee/coffee-abrir.tsx` — descending order + editable block + UI note (Task 1).
- `frontend/src/coffee/coffee-hub.tsx` — reorder `SUBS` (Task 2).
- `frontend/src/components/dashboard.tsx` — fullscreen toggle in `Detail` + pass selected notes to drawer (Task 4).
- `frontend/src/components/kpi-drawer.tsx` — "Notas Selecionadas" section (Task 4).
- `frontend/src/types.ts` — extend `KpiDrawerProps` (Task 4).

---

## Task 5: Generation flow checks `arquivado` first (backend)

**Tags:** `model:sonnet`, `reasoning:medium`.

**Files:**
- Modify: `backend/coffee_module/jobs.py` (`_rodar_geracao`, lines 68-83)
- Test: `backend/test_coffee_module.py` (append)

**Interfaces:**
- Consumes: `client.buscar_nota(id) -> {pk, id_sap, arquivado, fields}`, `client.definir_sap(id, sap)`, `db.upsert_nota`, `db.marcar_gerar`, `config.SAP_PENDENTE`, `config.DELAY_GERACAO`.
- Produces: job dict gains optional `"arquivadas"` list of `{pk, id_sap, local_instalacao}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Verify batch — Task 5: geração checa arquivado antes de gerar
# ---------------------------------------------------------------------------


def test_geracao_nota_arquivada_nao_define_sap(coffee_tmp, monkeypatch):
    from coffee_module import client, db, jobs
    saps = []
    monkeypatch.setattr(client, "definir_sap",
                        lambda i, sap: saps.append((int(i), sap)) or True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 17247854, "arquivado": True,
                   "fields": {"id_sap": 17247854, "local_instalacao": "701CF999"}},
    )
    job_id = jobs.iniciar_geracao([355617])
    j = _aguardar_job(jobs, job_id)
    assert saps == []  # arquivada: nunca define SAP
    assert j["arquivadas"] == [
        {"pk": 355617, "id_sap": 17247854, "local_instalacao": "701CF999"}
    ]
    assert db.listar_notas("pendente") == []


def test_geracao_busca_antes_de_definir_sap(coffee_tmp, monkeypatch):
    from coffee_module import client, db, jobs
    ordem = []
    monkeypatch.setattr(client, "definir_sap",
                        lambda i, sap: ordem.append("sap") or True)

    def fake_buscar(i):
        ordem.append("buscar")
        return {"pk": int(i), "id_sap": 10000000, "arquivado": False,
                "fields": {"id_sap": 10000000}}

    monkeypatch.setattr(client, "buscar_nota", fake_buscar)
    job_id = jobs.iniciar_geracao([355617])
    _aguardar_job(jobs, job_id)
    assert ordem[0] == "buscar"  # GET antes de definir_sap
    assert "sap" in ordem
    assert db.listar_notas("pendente")[0]["pk"] == 355617
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest test_coffee_module.py::test_geracao_nota_arquivada_nao_define_sap test_coffee_module.py::test_geracao_busca_antes_de_definir_sap -v`
Expected: FAIL (`KeyError: 'arquivadas'` / order assertion fails — current code defines SAP first).

- [ ] **Step 3: Rewrite `_rodar_geracao`**

Replace `backend/coffee_module/jobs.py` lines 68-83 with:

```python
def _rodar_geracao(job_id: str, ids: list) -> None:
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
            if nota["arquivado"]:
                local = nota["fields"].get("local_instalacao")
                with _LOCK:
                    _JOBS[job_id].setdefault("arquivadas", []).append(
                        {"pk": nota["pk"], "id_sap": nota["id_sap"],
                         "local_instalacao": local})
                db.registrar_log("acao_usuario", "geracao_ignorada_arquivada",
                                 nota["pk"],
                                 {"id_sap": nota["id_sap"], "local_instalacao": local},
                                 True)
            else:
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

- [ ] **Step 4: Run the full backend suite to verify pass + no regression**

Run: `cd backend && python -m pytest test_coffee_module.py -v`
Expected: PASS, including the pre-existing `test_job_geracao_define_sap_e_isola_erro` and `test_rota_gerar_lote` (their `arquivado=False` fixtures still flow through the non-arquivada branch).

- [ ] **Step 5: Commit**

```bash
git add backend/coffee_module/jobs.py backend/test_coffee_module.py
git commit -m "feat(coffee): geracao checa arquivado antes de definir SAP"
```

---

## Task 3a: Diagnose nota 356322 (backend) — investigation gate

**Tags:** `model:opus`, `reasoning:medium`.

**Files:**
- Modify: `backend/coffee_module/db.py` (add `diagnosticar_nota`)
- Test: `backend/test_coffee_module.py` (append characterization test)

**Interfaces:**
- Produces: `db.diagnosticar_nota(pk: int) -> dict | None` returning `{pk, id_sap, id_sap_anterior, classificacao, arquivado, buscado_em, logs}` where `logs` is `listar_logs(nota_pk=pk)`.

This task's deliverable is **findings**, not a behavior change. The characterization test pins current classifier behavior so Task 3b's change is intentional. After implementing the helper, run it against the real `coffee.db` (set `COFFEE_DATA_DIR` to the production data dir) to record 356322's actual `id_sap` vs `id_sap_anterior`, and write the conclusion into the Task 3c doc. **The findings determine whether Task 3b proceeds as written or is revised.**

- [ ] **Step 1: Write the characterization + helper test**

Append to `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Verify batch — Task 3a: diagnóstico de transição (caracterização)
# ---------------------------------------------------------------------------


def test_diagnosticar_nota_retorna_estado_e_logs(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(356322, 10000000, False, {"id_sap": 10000000})  # pendente
    diag = db.diagnosticar_nota(356322)
    assert diag["pk"] == 356322
    assert diag["id_sap"] == 10000000
    assert diag["classificacao"] == "pendente"
    assert isinstance(diag["logs"], list)
    assert db.diagnosticar_nota(999999) is None


def test_caracteriza_avulsa_atualmente_vira_corrigida(coffee_tmp):
    """Caracterização: HOJE uma nota avulsa (pendente -> SAP real) é rotulada
    'corrigida' — comportamento que a Task 3b corrige para 'gerada'."""
    from coffee_module import db
    db.upsert_nota(355617, 10000000, False, {"id_sap": 10000000})
    classe = db.upsert_nota(355617, 17247854, False, {"id_sap": 17247854})
    assert classe == "corrigida"  # estado atual (pré-fix)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest test_coffee_module.py::test_diagnosticar_nota_retorna_estado_e_logs -v`
Expected: FAIL (`AttributeError: module ... has no attribute 'diagnosticar_nota'`).

- [ ] **Step 3: Add `diagnosticar_nota` to `db.py`**

Append to `backend/coffee_module/db.py`:

```python
def diagnosticar_nota(pk: int) -> dict | None:
    """Estado bruto de uma nota + seus logs, para diagnóstico de transição."""
    conn = get_db_connection()
    row = conn.execute(
        "SELECT pk, id_sap, id_sap_anterior, classificacao, arquivado, buscado_em "
        "FROM notas_coffee WHERE pk = ?", (pk,)
    ).fetchone()
    conn.close()
    if row is None:
        return None
    return {
        "pk": row[0], "id_sap": row[1], "id_sap_anterior": row[2],
        "classificacao": row[3],
        "arquivado": bool(row[4]) if row[4] is not None else None,
        "buscado_em": row[5], "logs": listar_logs(nota_pk=pk, limit=200),
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest test_coffee_module.py::test_diagnosticar_nota_retorna_estado_e_logs test_coffee_module.py::test_caracteriza_avulsa_atualmente_vira_corrigida -v`
Expected: PASS.

- [ ] **Step 5: Diagnose the real note + record findings**

Run (PowerShell, against the real data dir — confirm the path with the user; default is `backend/data`):

```bash
cd backend && COFFEE_DATA_DIR=./data python -c "from coffee_module import db; import json; print(json.dumps(db.diagnosticar_nota(356322), ensure_ascii=False, indent=2, default=str))"
```

Record in scratch notes: is `id_sap` still `10000000` (stuck = never re-fetched with real SAP), or a real SAP that mislabeled? This conclusion is written into the Task 3c doc and gates Task 3b.

- [ ] **Step 6: Commit**

```bash
git add backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): diagnosticar_nota + caracterizacao da transicao avulsa"
```

---

## Task 3b: Distinguish avulsa vs corrigida (backend) — gated on 3a

**Tags:** `model:opus`, `reasoning:high`.

**GATE:** Implement as written **only if** Task 3a confirms the avulsa→"corrigida" mislabel is the substantive defect. If 3a finds 356322 is stuck purely because it was never re-fetched (stored `id_sap` still `10000000`), the fix instead is to ensure a refresh path re-runs `buscar_nota`+`upsert_nota` (the existing `iniciar_busca` job already does this) and Task 3c documents that; in that case skip the classifier change below and note it. The steps below cover the mislabel fix, which is a real backwards-compatible correctness improvement regardless.

**Files:**
- Modify: `backend/coffee_module/classify.py`, `backend/coffee_module/db.py`, `backend/coffee_module/jobs.py`
- Test: `backend/test_coffee_module.py` (append)

**Interfaces:**
- Consumes: `db.definir_origem` (new), `config.SAP_PENDENTE`.
- Produces: `classificar(id_sap_atual, id_sap_anterior, origem=None) -> str`; `db.definir_origem(pk: int, origem: str) -> None`; `notas_coffee.origem TEXT` column; `_rodar_geracao` sets origem `"avulsa"` on the non-arquivada branch.

- [ ] **Step 1: Write the failing classifier tests**

Append to `backend/test_coffee_module.py`:

```python
# ---------------------------------------------------------------------------
# Verify batch — Task 3b: origem distingue avulsa (gerada) de corrigida
# ---------------------------------------------------------------------------


def test_classificacao_avulsa_vira_gerada():
    from coffee_module import classify, config
    assert classify.classificar(17247854, config.SAP_PENDENTE, "avulsa") == "gerada"


def test_classificacao_sem_origem_mantem_corrigida():
    from coffee_module import classify, config
    # backwards-compat: origem desconhecida continua corrigida
    assert classify.classificar(17247854, config.SAP_PENDENTE) == "corrigida"
    assert classify.classificar(17247854, config.SAP_PENDENTE, None) == "corrigida"


def test_upsert_avulsa_vira_gerada_apos_pendente(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(1, 10000000, False, {"id_sap": 10000000})  # pendente
    db.definir_origem(1, "avulsa")
    classe = db.upsert_nota(1, 17247854, False, {"id_sap": 17247854})
    assert classe == "gerada"
    assert db.listar_notas("corrigida") == []


def test_geracao_marca_origem_avulsa(coffee_tmp, monkeypatch):
    from coffee_module import client, db, jobs
    monkeypatch.setattr(client, "definir_sap", lambda i, sap: True)
    monkeypatch.setattr(
        client, "buscar_nota",
        lambda i: {"pk": int(i), "id_sap": 10000000, "arquivado": False,
                   "fields": {"id_sap": 10000000}},
    )
    job_id = jobs.iniciar_geracao([355617])
    _aguardar_job(jobs, job_id)
    diag = db.diagnosticar_nota(355617)
    assert diag is not None
    # origem persistida; re-busca com SAP real classifica como gerada
    classe = db.upsert_nota(355617, 17247854, False, {"id_sap": 17247854})
    assert classe == "gerada"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest test_coffee_module.py -k "avulsa or sem_origem" -v`
Expected: FAIL (`classificar` takes 2 args / `definir_origem` missing).

- [ ] **Step 3: Update `classify.py`**

Replace `backend/coffee_module/classify.py` body of `classificar`:

```python
def classificar(id_sap_atual, id_sap_anterior, origem=None) -> str:
    """nao_gerada | pendente | corrigida | gerada. arquivado NÃO entra aqui.

    origem='avulsa' faz a transição pendente->SAP real classificar como
    'gerada' (não 'corrigida'). origem desconhecida mantém 'corrigida'
    (compat. retroativa)."""
    if not id_sap_atual:
        return "nao_gerada"
    if id_sap_atual == config.SAP_PENDENTE:
        return "pendente"
    if id_sap_anterior == config.SAP_PENDENTE and id_sap_atual != config.SAP_PENDENTE:
        return "gerada" if origem == "avulsa" else "corrigida"
    return "gerada"
```

- [ ] **Step 4: Add `origem` column + `definir_origem` + pass origem in `upsert_nota`**

In `backend/coffee_module/db.py`:

1. Add `"origem"` to `_COLUNAS` (after `"a_gerar"`):

```python
_COLUNAS = ["pk", "id_sap", "id_sap_anterior", "arquivado",
            "classificacao", "dados_json", "buscado_em", "erro", "a_gerar", "origem"]
```

2. In `inicializar_banco`, after the `a_gerar` migration block, add:

```python
    if "origem" not in cols_notas:
        conn.execute("ALTER TABLE notas_coffee ADD COLUMN origem TEXT")
```

3. In `upsert_nota`, read existing origem and pass it to `classificar`. Change the SELECT and the `classe` line:

```python
    row = conn.execute(
        "SELECT id_sap, classificacao, arquivado, origem FROM notas_coffee WHERE pk = ?",
        (pk,)
    ).fetchone()
    id_sap_anterior = row[0] if row is not None else None
    classe_anterior = row[1] if row is not None else None
    arquivado_anterior = bool(row[2]) if row is not None and row[2] is not None else None
    origem = row[3] if row is not None else None
    classe = classificar(id_sap, id_sap_anterior, origem)
```

(The `INSERT ... ON CONFLICT` clause does not list `origem`, so existing origem is preserved across upserts and new rows default to NULL — no change needed there.)

4. Add the setter near `marcar_gerar`:

```python
def definir_origem(pk: int, origem: str) -> None:
    """Marca a origem da nota ('avulsa' | 'verificar')."""
    conn = get_db_connection()
    conn.execute("UPDATE notas_coffee SET origem = ? WHERE pk = ?", (origem, pk))
    conn.commit()
    conn.close()
```

- [ ] **Step 5: Mark origem in the generation flow**

In `backend/coffee_module/jobs.py` `_rodar_geracao`, non-arquivada branch, after `db.marcar_gerar(nota["pk"], False)` add:

```python
                db.definir_origem(nota["pk"], "avulsa")
```

- [ ] **Step 6: Run the full suite to verify pass + no regression**

Run: `cd backend && python -m pytest test_coffee_module.py -v`
Expected: PASS (existing `test_classificacao_corrigida_na_transicao` and `test_upsert_transicao_corrigida_depois_gerada` still pass — they pass no origem, so stay "corrigida").

- [ ] **Step 7: Commit**

```bash
git add backend/coffee_module/classify.py backend/coffee_module/db.py backend/coffee_module/jobs.py backend/test_coffee_module.py
git commit -m "fix(coffee): distinguir avulsa (gerada) de corrigida via origem"
```

---

## Task 3c: Document the transition flow

**Tags:** `model:sonnet`, `reasoning:low`.

**Files:**
- Create: `docs/coffee/fluxo-transicao-notas.md`

- [ ] **Step 1: Write the doc**

Create `docs/coffee/fluxo-transicao-notas.md` with the definitive flow, incorporating the Task 3a findings:

```markdown
# COFFEE — Fluxo de transição de status das notas

## Status
`nao_gerada` → `pendente` → `gerada` (avulsa) **ou** `pendente` → `corrigida` → `gerada` (erro/Verificar).

## Regra de classificação (`classify.classificar`)
- `id_sap` vazio/0 → `nao_gerada`.
- `id_sap == SAP_PENDENTE (10000000)` → `pendente`.
- `id_sap_anterior == SAP_PENDENTE` e `id_sap` real:
  - origem `avulsa` → `gerada`;
  - origem desconhecida (veio da Verificar com erro) → `corrigida`.
- caso contrário → `gerada`.

## Como os dois caminhos são distinguidos
A geração avulsa (`jobs._rodar_geracao`) marca `origem='avulsa'`. Notas que
entram pendentes por outro caminho (correção de erro na Verificar) ficam sem
origem e, ao receberem SAP real, classificam como `corrigida`.

## Nota 356322 (diagnóstico)
<colar aqui a conclusão da Task 3a: id_sap atual × anterior e a causa — preso em
pendente por falta de re-busca, ou mislabel corrigido pela origem>.
```

Replace the `<...>` line with the actual Task 3a finding before committing.

- [ ] **Step 2: Commit**

```bash
git add docs/coffee/fluxo-transicao-notas.md
git commit -m "docs(coffee): fluxo de transicao de status das notas"
```

---

## Task 1: Abrir — ordem decrescente + bloco editável + nota de UI

**Tags:** `model:sonnet`, `reasoning:low`.

**Files:**
- Modify: `frontend/src/coffee/coffee-abrir.tsx`

**Interfaces:**
- Consumes: `api.openCoffee(list)` (already staggers at 250ms).
- Produces: local helper `sortIdsDesc`; editable `block` input.

- [ ] **Step 1: Add the descending-sort helper**

In `frontend/src/coffee/coffee-abrir.tsx`, after `coffeeTokens` (line ~48), add:

```tsx
function sortIdsDesc(list: string[]): string[] {
  return [...list].sort((a, b) => Number(b) - Number(a));
}
```

- [ ] **Step 2: Open in descending order (mode "Todas")**

In `actionBody`, mode `"all"`, change the open button handler (line ~192):

```tsx
                  disabled={!remaining.length} onClick={() => openList(sortIdsDesc(remaining))}>
```

- [ ] **Step 3: Open in descending order (mode "Em blocos")**

In mode `"block"` (line ~199), replace `const next = remaining.slice(0, block);` with:

```tsx
      const ordered = sortIdsDesc(remaining);
      const next = ordered.slice(0, block);
```

- [ ] **Step 4: Make the block size editable**

Add a clamp helper just inside the component (near `setBlock`, after line 71):

```tsx
  function setBlockClamped(v: number): void {
    setBlock(Math.min(50, Math.max(1, Math.floor(v) || 1)));
  }
```

Replace the stepper block (lines ~206-210) with:

```tsx
            <div className="coffee-stepper">
              <button aria-label="Diminuir" onClick={() => setBlockClamped(block - 1)}>−</button>
              <input type="number" min={1} max={50} value={block}
                     onChange={(e) => setBlockClamped(Number(e.target.value))}
                     aria-label="Tamanho do bloco"
                     style={{ width: 46, textAlign: "center", border: 0, background: "var(--surface-2)",
                              color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 14,
                              fontWeight: 600, outline: "none", MozAppearance: "textfield" }} />
              <button aria-label="Aumentar" onClick={() => setBlockClamped(block + 1)}>＋</button>
            </div>
```

- [ ] **Step 5: Add the sequential/grouping UI note**

In mode `"all"`, replace the existing `<p>` hint (lines ~189-190) text and in mode `"block"` add a note line. For mode `"all"`, set the paragraph to:

```tsx
            Abre uma aba por nota ainda não aberta, em ordem decrescente de ID. As abas
            abrem em sequência; agrupar abas em janelas exige uma extensão de navegador.
```

For mode `"block"`, append after the progress bar block (before the closing `</div>` at line ~217):

```tsx
          <span style={{ fontSize: 11, color: "var(--text-mute)" }}>
            Abre em ordem decrescente, em sequência. Agrupar abas exige extensão de navegador.</span>
```

- [ ] **Step 6: Typecheck + build**

Run: `cd frontend && npm run build`
Expected: PASS (no TS errors).

- [ ] **Step 7: Manual verification**

Run `npm run dev`, go to COFFEE → Abrir. Add IDs out of order (e.g. 100, 300, 200). Confirm: "Todas" opens 300→200→100; "Em blocos" with a typed block size of 2 opens 300,200 then 100; typing 99 clamps to 50, typing 0 clamps to 1.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/coffee/coffee-abrir.tsx
git commit -m "feat(coffee): abrir notas em ordem decrescente e bloco editavel"
```

---

## Task 4: Verificar — fullscreen na nota + Notas Selecionadas no KPI

**Tags:** `model:sonnet`, `reasoning:low`.

**Files:**
- Modify: `frontend/src/types.ts` (`KpiDrawerProps`)
- Modify: `frontend/src/components/kpi-drawer.tsx`
- Modify: `frontend/src/components/dashboard.tsx`

**Interfaces:**
- Produces: `KpiDrawerProps` gains `selectedNotes?: Note[]` and `onRemoveSelected?: (id: string) => void`; `Detail` gains a `fs` fullscreen toggle.

- [ ] **Step 1: Extend `KpiDrawerProps`**

In `frontend/src/types.ts`, add the import of `Note` if not present at top, then extend (lines 148-156):

```tsx
export interface KpiDrawerProps {
  pct: number;
  cTotal: number;
  cOk: number;
  cErr: number;
  cDup: number;
  cDone: number;
  cVisible: number;
  selectedNotes?: Note[];
  onRemoveSelected?: (id: string) => void;
}
```

(`Note` is already declared in this file, so no import needed.)

- [ ] **Step 2: Render "Notas Selecionadas" in the drawer**

In `frontend/src/components/kpi-drawer.tsx`, destructure the new props (line 5):

```tsx
  const { pct, cTotal, cOk, cErr, cDup, cDone, cVisible, selectedNotes = [], onRemoveSelected } = props;
```

After the `rows.map(...)` block (after line 75, before `</aside>`), add:

```tsx
            {selectedNotes.length > 0 && (
              <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "10px 14px" }}>
                <div className="edp-eyebrow" style={{ marginBottom: 8 }}>
                  Notas Selecionadas · {selectedNotes.length}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto" }}>
                  {selectedNotes.map((n) => (
                    <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="edp-mono" style={{ fontSize: 12, fontWeight: 600 }}>{n.id}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--text-mute)",
                                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.tipo_nota} · {n.uf}/{n.setor}</span>
                      {onRemoveSelected && (
                        <span role="button" aria-label={"Remover " + n.id} onClick={() => onRemoveSelected(n.id)}
                              style={{ cursor: "pointer", color: "var(--text-mute)", fontSize: 14, lineHeight: 1, padding: "0 4px" }}>×</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
```

- [ ] **Step 3: Pass selected notes from `Dashboard`**

In `frontend/src/components/dashboard.tsx`, update the `KpiDrawer` render (lines 280-283):

```tsx
      {t.showKpis && (
        <KpiDrawer pct={pct} cTotal={cTotal} cOk={cOk} cErr={cErr} cDup={cDup}
                   cDone={cDone} cVisible={filtered.length}
                   selectedNotes={notes.filter((n) => selBatch.has(n.id))}
                   onRemoveSelected={(id) => toggleBatch(id)} />
      )}
```

- [ ] **Step 4: Add fullscreen toggle to `Detail`**

In `frontend/src/components/dashboard.tsx`, inside `Detail` (after line 298 `const [gerarMsg...`), add:

```tsx
  const [fs, setFs] = React.useState(false);
  React.useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setFs(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fs]);
```

Change the `Detail` outer container (line 322) to switch to a fixed overlay when `fs`:

```tsx
    <div style={fs
      ? { position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column",
          overflow: "hidden", background: "var(--bg-2)" }
      : { display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-2)" }}>
```

In the header action group (after line 339 `☕ COFFEE` button, before the Concluir button), add the toggle:

```tsx
          <button className="edp-btn sm" title={fs ? "Sair da tela cheia" : "Expandir"}
                  aria-label={fs ? "Sair da tela cheia" : "Expandir"} onClick={() => setFs((v) => !v)}>
            {fs ? "⤡ Fechar" : "⤢ Expandir"}</button>
```

- [ ] **Step 5: Typecheck + build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, COFFEE → Verificar. Select several notes (checkboxes) → open the KPI drawer (⊞ FAB) → confirm "Notas Selecionadas" lists them and × removes one. Open a note → click "⤢ Expandir" → confirm fullscreen overlay; press Esc and the "⤡ Fechar" button → returns to split view.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/kpi-drawer.tsx frontend/src/components/dashboard.tsx
git commit -m "feat(coffee): fullscreen na nota e Notas Selecionadas no KPI"
```

---

## Task 2: Move "Verificar" to the first nav tab

**Tags:** `model:sonnet`, `reasoning:low`.

**Files:**
- Modify: `frontend/src/coffee/coffee-hub.tsx` (`SUBS`, lines 11-18)

**Interfaces:**
- Consumes: `App.tsx` already defaults `coffeeSub` to `"verificar"` — no change there.

- [ ] **Step 1: Reorder `SUBS`**

Replace `frontend/src/coffee/coffee-hub.tsx` lines 11-18 with:

```tsx
const SUBS: { id: CoffeeSubPage; rotulo: string }[] = [
  { id: "verificar", rotulo: "Verificar" },
  { id: "abrir", rotulo: "Abrir" },
  { id: "geradas", rotulo: "Gerar" },
  { id: "corrigidas", rotulo: "Corrigidas" },
  { id: "pendentes", rotulo: "Pendentes" },
  { id: "logs", rotulo: "Logs" },
];
```

- [ ] **Step 2: Typecheck + build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run `npm run dev` → COFFEE. Confirm "Verificar" is the first nav button and the hub lands on it by default (fresh `localStorage`, or clear `edp_coffee_sub`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/coffee-hub.tsx
git commit -m "feat(coffee): Verificar como primeira aba do hub"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 (ordem decrescente, bloco editável, sequential-open) → Task 1 ✔
- Spec §2 (Verificar primeiro + default) → Task 2 (+ default already in place, noted) ✔
- Spec §3 (diagnóstico, fix, doc) → Tasks 3a/3b/3c ✔
- Spec §4 (fullscreen, Notas Selecionadas) → Task 4 ✔
- Spec §5 (checar arquivado) → Task 5 ✔
- Model-mapping table → reflected in each task header ✔

**Placeholder scan:** Task 3c contains one deliberate `<...>` to be filled from Task 3a's real-DB finding (the finding cannot be known until execution). Task 3b carries an explicit GATE because the spec marked it investigation-gated. No vague "add error handling"/"write tests" placeholders elsewhere.

**Type consistency:** `sortIdsDesc(string[]) -> string[]`, `setBlockClamped(number)`, `classificar(atual, anterior, origem=None)`, `db.definir_origem(pk, origem)`, `db.diagnosticar_nota(pk)`, `KpiDrawerProps.selectedNotes/onRemoveSelected`, `Detail` `fs` — names used consistently across tasks. `_COLUNAS` gains `"origem"` matching the SELECT/migration. Task 3b builds on Task 5's `_rodar_geracao` (build order 5 → 3 respected).
