from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import pandas as pd
import io
import json
import pathlib
import re

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


# Carrega ao iniciar o servidor
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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    global RECORDS, COMPLETED

    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Use .xlsx, .xls ou .csv"
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
    ]

    records = []

    for _, row in df.iterrows():
        errors = []

        for col in chk_cols:
            val = str(row[col]).strip().lower()
            if val and val not in ["ok", "nan", "none", ""]:
                errors.append({
                    "rule": col,
                    "rule_name": (
                        col.replace("chk_", "").replace("_", " ").title()
                    ),
                    "value": str(row[col])
                })

        prioridade_raw = row.get("prioridade")
        try:
            prioridade = int(prioridade_raw) if pd.notna(prioridade_raw) else 99
        except Exception:
            prioridade = 99

        referencia = (
            row.get("referencia_fisica")
            or row.get("referencia_eletrica")
            or "-"
        )

        precisao_raw = row.get("precisao")
        precisao = (
            str(precisao_raw).strip()
            if pd.notna(precisao_raw) and str(precisao_raw).strip()
            else None
        )

        records.append({
            "id": str(row.get("id", "")).strip(),
            "prioridade": prioridade,
            "tipo_nota": str(row.get("tipo_nota", "-")),
            "referencia": str(referencia).strip(),
            "uf": extract_str(row, "uf"),
            "setor": extract_str(row, "setor"),
            "latitude": parse_coord(row.get("latitude")),
            "longitude": parse_coord(row.get("longitude")),
            "precisao": precisao,
            "errors": errors,
            "status": "erro" if errors else "ok",
            "raw": {
                str(k): str(v) if pd.notna(v) else "-"
                for k, v in row.items()
            }
        })

    # Nova planilha: zera concluídas anteriores
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
