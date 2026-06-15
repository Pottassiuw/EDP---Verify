import io
import json
import pathlib
import re

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="De olho no Problema")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RECORDS = []
COMPLETED = set()

STATE_FILE = pathlib.Path(__file__).parent / "app_state.json"


# ── Persistência ─────────────────────────────────────────────────────────────


def save_state():
    try:
        STATE_FILE.write_text(
            json.dumps(
                {"records": RECORDS, "completed": list(COMPLETED)},
                ensure_ascii=False,
            )
        )
    except Exception:
        pass


def load_state():
    global RECORDS, COMPLETED
    if not STATE_FILE.exists():
        return
    try:
        state = json.loads(STATE_FILE.read_text())
        RECORDS = state.get("records", [])
        COMPLETED = set(state.get("completed", []))
    except Exception:
        pass


load_state()


# ── Helpers ──────────────────────────────────────────────────────────────────


def parse_coord(v):
    if v is None or pd.isna(v):
        return None
    s = str(v).strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def extract_str(row, *keys):
    for key in keys:
        v = row.get(key)
        if v is not None and pd.notna(v):
            s = str(v).strip()
            if s:
                return s
    return None


# Columns excluded from the generic chk_* error loop
_IGNORED_CHK = {"chk_duplicada", "chk_trafo"}


def parse_duplicate_ids(value, own_id: str, id_set: set) -> list:
    """Parse a chk_duplicada cell → deduplicated list of {id, in_sheet} dicts."""
    if not value or str(value).strip().lower() in ("", "ok", "nan", "none"):
        return []
    raw = str(value).strip()
    if not re.search(r"\d", raw):          # non-numeric sentinels: coordenada_invalida etc.
        return []
    seen, result = set(), []
    for token in raw.split("/"):
        t = token.strip()
        if not t or not re.search(r"\d", t):
            continue
        if t == own_id or t in seen:       # discard self-reference and duplicates
            continue
        seen.add(t)
        result.append({"id": t, "in_sheet": t in id_set})
    return result


def enrich_candidate(cand: dict, source: dict) -> dict:
    return {
        **cand,
        "local_instalacao": source.get("local_instalacao") or "",
        "poste":            source.get("poste") or "",
        "referencia":       source.get("referencia") or "",
        "problema":         source.get("problema") or "",
        "latitude":         source.get("latitude"),
        "longitude":        source.get("longitude"),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    global RECORDS, COMPLETED

    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(
            status_code=400, detail="Formato inválido. Use .xlsx, .xls ou .csv"
        )

    try:
        content = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.StringIO(content.decode("utf-8-sig")))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo: {e}")

    chk_cols = [
        c for c in df.columns
        if re.match(r"^chk_", str(c).strip(), re.IGNORECASE)
        and str(c).strip().lower() not in _IGNORED_CHK
    ]

    # ── Pass 1: build records ─────────────────────────────────────────────
    records = []

    for _, row in df.iterrows():
        errors = []

        for col in chk_cols:
            val = str(row[col]).strip().lower()
            if val and val not in ["ok", "nan", "none", ""]:
                errors.append(
                    {
                        "rule": col,
                        "rule_name": (
                            col.replace("chk_", "").replace("_", " ").title()
                        ),
                        "value": str(row[col]),
                    }
                )

        prioridade_raw = row.get("prioridade")
        try:
            prioridade = int(prioridade_raw) if pd.notna(prioridade_raw) else 99
        except Exception:
            prioridade = 99

        referencia = str(
            row.get("referencia_fisica") or row.get("referencia_eletrica") or "-"
        ).strip()

        precisao_raw = row.get("precisao")
        precisao = (
            str(precisao_raw).strip()
            if pd.notna(precisao_raw) and str(precisao_raw).strip()
            else None
        )

        problema_parts = [
            extract_str(row, "componente"),
            extract_str(row, "sintoma"),
            extract_str(row, "causa"),
        ]
        problema = " · ".join(p for p in problema_parts if p) or None

        records.append(
            {
                "id":         str(row.get("id", "")).strip(),
                "prioridade": prioridade,
                "tipo_nota":  str(row.get("tipo_nota", "-")),
                "referencia": referencia,
                "uf":         extract_str(row, "uf"),
                "setor":      extract_str(row, "setor"),
                "latitude":   parse_coord(row.get("latitude")),
                "longitude":  parse_coord(row.get("longitude")),
                "precisao":   precisao,
                "poste":      extract_str(row, "postes", "poste"),
                "problema":   problema,
                "errors":     errors,
                "status":     "erro" if errors else "ok",
                "_dup_raw":   str(row.get("chk_duplicada", "") or "").strip(),
                "raw":        {str(k): str(v) if pd.notna(v) else "-" for k, v in row.items()},
            }
        )

    # ── Pass 2: resolve duplicates ────────────────────────────────────────
    id_set = {r["id"] for r in records}
    id_map = {r["id"]: r for r in records}

    for rec in records:
        dup_raw = rec.pop("_dup_raw", "")
        cands = parse_duplicate_ids(dup_raw, rec["id"], id_set)

        if not cands:
            rec["duplicates"] = []
            continue

        enriched = []
        for c in cands:
            if c["in_sheet"]:
                enriched.append(enrich_candidate(c, id_map[c["id"]]))
            else:
                enriched.append(c)

        rec["duplicates"] = enriched
        rec["errors"].append(
            {
                "rule":      "chk_duplicata",
                "rule_name": "Duplicata",
                "value":     f"{len(cands)} candidata{'s' if len(cands) != 1 else ''}",
            }
        )
        rec["status"] = "erro"

    RECORDS = records
    COMPLETED = set()
    save_state()

    return {"status": "ok", "total": len(records)}


@app.get("/api/data")
def get_data():
    rule_stats = {}
    uf_set = set()
    setor_set = set()

    for r in RECORDS:
        for e in r["errors"]:
            rule_stats[e["rule"]] = rule_stats.get(e["rule"], 0) + 1
        if r["uf"]:
            uf_set.add(r["uf"])
        if r["setor"]:
            setor_set.add(r["setor"])

    return {
        "records": RECORDS,
        "completed": list(COMPLETED),
        "rule_stats": rule_stats,
        "uf_options": sorted(uf_set),
        "setor_options": sorted(setor_set),
    }


@app.post("/api/complete/{note_id}")
def toggle_complete(note_id: str):
    if note_id in COMPLETED:
        COMPLETED.remove(note_id)
    else:
        COMPLETED.add(note_id)
    save_state()
    return {"status": "ok", "completed": note_id in COMPLETED}


@app.post("/api/duplicata/{note_id}")
def mark_duplicata(note_id: str):
    COMPLETED.add(note_id)
    save_state()
    return {"status": "ok"}


from input_module.routes import router as input_router

app.include_router(input_router)


DIST = pathlib.Path(__file__).parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="static")
