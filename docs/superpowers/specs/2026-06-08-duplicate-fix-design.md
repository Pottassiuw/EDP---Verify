# Design: Duplicate Detection Fix + Batch Reopen — EDP Verify

**Date:** 2026-06-08
**Scope:** Fase 1 — backend parsing, frontend honest states, batch UI fix.
**Out of scope:** Power BI / SQL enrichment for external candidates (Fase 2).

---

## Context

`Verificar.xlsx` has 891 rows and a `chk_duplicada` column (note: "duplicada", not "duplicata").
The value is:
- `ok` (673 rows) → no duplicate.
- A `/`-separated list of candidate IDs (187 rows) → e.g. `278801 / 278802`, sometimes with repeated IDs.
- `coordenada_invalida` or other non-numeric sentinels (31 rows) → treated as "no candidate IDs".

Of 239 unique candidate IDs across all flagged rows, **only 6 exist in the same sheet; 233 are external** (they live in the Power BI / maintenance database). In-sheet comparison is the exception, not the rule.

### Current bugs
1. **Backend:** `chk_duplicada` is processed by the generic `chk_*` loop, so it lands as a plain red error (`rule: "chk_duplicada"`) with no `duplicates[]` array. The key the frontend watches is `chk_duplicata` (with "t"), so the duplicate comparison panel never fires.
2. **Frontend filter:** filtering by "Duplicata" in rule chips shows 0 results when using a real spreadsheet (no `chk_duplicata` rule ever emitted, `duplicates[]` always empty).
3. **Comparison fields:** demo uses `id_sap` / `descricao` / `local_instalacao` / `poste`; the real sheet has `local_instalacao` ✓, `postes` (40% fill) ✓, `referencia_fisica` ✓, and `componente+sintoma+causa` as the problem description. `id_sap` is empty on 86% of flagged rows and `descricao` doesn't exist.
4. **Batch reopen:** selecting multiple notes and clicking "Concluir" marks them done, but the action bar never shows a reopen option — there's no way to undo a batch completion.

---

## 1. Backend — `backend/main.py`

### 1a. Isolate `chk_duplicada` from the generic loop

In the `upload` handler, before the `chk_cols` loop, remove `chk_duplicada` (case-insensitive) from `chk_cols` so it is not processed there.

```python
chk_cols = [c for c in df.columns
            if re.match(r'^chk_', str(c).strip(), re.IGNORECASE)
            and str(c).strip().lower() != 'chk_duplicada']
```

### 1b. `parse_duplicate_ids(value, own_id, id_set)` — pure function

```python
def parse_duplicate_ids(value, own_id: str, id_set: set[str]) -> list[dict]:
    """
    Returns a list of candidate dicts from a chk_duplicada cell.
    Each dict: { id, in_sheet: bool, [fields if in_sheet] }
    """
    if not value or str(value).strip().lower() in ('', 'ok', 'nan', 'none'):
        return []
    raw = str(value).strip()
    if not re.search(r'\d', raw):          # coordenada_invalida etc.
        return []
    tokens = [t.strip() for t in raw.split('/')]
    seen, result = set(), []
    for t in tokens:
        if not re.search(r'\d', t):
            continue
        if t == own_id or t in seen:       # self-ref & dedup
            continue
        seen.add(t)
        result.append({'id': t, 'in_sheet': t in id_set})
    return result
```

### 1c. Enrich in-sheet candidates

After parsing the full DataFrame into `records`, build an `id_map: dict[str, dict]` of all records keyed by `id`. For each candidate with `in_sheet=True`, copy the comparison fields from that record:

```python
def enrich_candidate(cand: dict, source: dict) -> dict:
    return {
        **cand,
        'local_instalacao': source.get('local_instalacao', ''),
        'poste':            source.get('poste', ''),
        'referencia':       source.get('referencia', ''),
        'problema':         source.get('problema', ''),
        'latitude':         source.get('latitude'),
        'longitude':        source.get('longitude'),
    }
```

### 1d. New fields on every record

Add to each record during `iterrows`:

```python
'poste':    extract_str(row, 'postes'),
'problema': ' · '.join(filter(None, [
    extract_str(row, 'componente'),
    extract_str(row, 'sintoma'),
    extract_str(row, 'causa'),
])),
```

(`referencia` is already built from `referencia_fisica`/`referencia_eletrica`.)

### 1e. Emit `chk_duplicata` (canonical key, with "t")

After building duplicates for a record, if the list is non-empty:

```python
if duplicates:
    errors.append({
        'rule': 'chk_duplicata',                  # "t" — matches frontend
        'rule_name': 'Duplicata',
        'value': f"{len(duplicates)} candidata{'s' if len(duplicates) != 1 else ''}",
    })
```

`status` becomes `'erro'`.

### 1f. Ordering: two-pass

The full `iterrows` first produces all records (pass 1), then duplicates are resolved using the complete `id_map` (pass 2). This handles forward-references (note A points to note B which appears later in the sheet).

---

## 2. Frontend

### 2a. Types (`src/types.ts`)

Replace `DuplicateField` and `ComparableFields`:

```typescript
export type DuplicateField = 'local_instalacao' | 'poste' | 'referencia' | 'problema';

export interface ComparableFields {
  local_instalacao: string;
  poste: string;
  referencia: string;
  problema: string;
  tipo_nota: string;
  setor: string;
  uf: string;
  prioridade: number;
}
```

Add `in_sheet: boolean` to `DuplicateCandidate`.

### 2b. `api.ts` — normalize

Map new fields in `normalize()`:

```typescript
poste:    r.poste    ?? str(raw.postes ?? raw.poste),
problema: r.problema ?? str(raw.problema, ''),
```

Pass `in_sheet` through (default `false`).

### 2c. `duplicate-compare.tsx` — two rendering states

**In-sheet candidate** (`c.in_sheet === true`): identical to current grid, but with the new 4 key fields (Local · Poste · Referência · Problema).

**External candidate** (`c.in_sheet === false`): no comparison grid. Shows:
```
ID  [☕ COFFEE]  [◎ Maps if coords]
┌─────────────────────────────────────┐
│ ⧉  Fora desta planilha              │
│ Confirme os campos direto no COFFEE │
│ ou aguarde a integração com o BI.   │
└─────────────────────────────────────┘
```
Badge: **"Externo"** (amber). No `n/4 campos-chave` badge (would be meaningless).

`DUPC_KEYS` updated:
```typescript
const DUPC_KEYS: KeyFieldDef[] = [
  { key: 'local_instalacao', label: 'Local instal.'  },
  { key: 'poste',            label: 'Poste(s)'       },
  { key: 'referencia',       label: 'Referência'     },
  { key: 'problema',         label: 'Problema'       },
];
```

### 2d. `data.ts` — update demo

Update demo clusters to use new fields and include one in-sheet pair and one external pair, so both rendering states appear in demo mode.

---

## 3. Batch Reopen (`src/App.tsx`)

The batch action bar currently only shows `✓ Concluir`. Logic change:

```
allDone  = every note in selBatch is in `completed`
allOpen  = no note in selBatch is in `completed`
mixed    = some done, some not
```

Render:
- **allDone:** `↺ Reabrir` (ghost style) + `Limpar`
- **allOpen:** `✓ Concluir` (accent style) + `☕ COFFEE` + `Limpar`
- **mixed:** `✓ Concluir pendentes` + `↺ Reabrir concluídas` (both sm ghost) + `☕ COFFEE` + `Limpar`

`markMany` is extended with a direction parameter:
```typescript
function markMany(ids: string[], action: 'done' | 'reopen'): void
```

---

## 4. Demo data

`data.ts` needs updating in two places:
1. `ComparableFields` on `Note` now has `poste`/`referencia`/`problema` replacing `id_sap`/`descricao`.
2. `DUPES` clusters use the same fields. One cluster has `in_sheet: true` (note within the 20-note demo), one has `in_sheet: false` (external IDs).

---

## 5. Tests

**Backend (`pytest`):** synthetic DataFrame covering:
- Row with `ok` → no duplicates.
- Row with single external ID → 1 candidate, `in_sheet=False`, `chk_duplicata` emitted.
- Row with `ID_A / ID_A / ID_B` (repeated) → 2 unique candidates.
- Row with `coordenada_invalida` → no candidates, no `chk_duplicata`.
- Row pointing to another row in the sheet → 1 candidate, `in_sheet=True`, fields populated.
- Row pointing to its own ID (auto-ref) → filtered out.

**Frontend:** `tsc -b` must pass (zero type errors). Visual check via `npm run dev` against demo data confirming both in-sheet and external states render correctly.

---

## File change summary

| File | Change |
|---|---|
| `backend/main.py` | Two-pass upload; `parse_duplicate_ids`; `enrich_candidate`; emit `chk_duplicata` |
| `src/types.ts` | `DuplicateField`, `ComparableFields`, `DuplicateCandidate.in_sheet` |
| `src/api.ts` | `normalize()` maps `poste`/`problema`/`in_sheet` |
| `src/components/duplicate-compare.tsx` | New `DUPC_KEYS`; external-candidate rendering state |
| `src/data.ts` | Demo clusters use new fields + mixed in/out-sheet |
| `src/App.tsx` | Batch action bar with reopen logic; `markMany` direction param |

Backend test file: `backend/test_upload.py` (new).
