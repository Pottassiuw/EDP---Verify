from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import pandas as pd
import io
import re

app = FastAPI(title="Verificador IDs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RECORDS = []
COMPLETED = set()


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    global RECORDS

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
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao ler arquivo: {e}"
        )

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
                        col.replace("chk_", "")
                        .replace("_", " ")
                        .title()
                    ),
                    "value": str(row[col])
                })

        prioridade_raw = row.get("prioridade")

        try:
            prioridade = (
                int(prioridade_raw)
                if pd.notna(prioridade_raw)
                else 99
            )
        except:
            prioridade = 99

        referencia = (
            row.get("referencia_fisica")
            or row.get("referencia_eletrica")
            or "-"
        )

        records.append({
            "id": str(row.get("id", "")).strip(),
            "prioridade": prioridade,
            "tipo_nota": str(row.get("tipo_nota", "-")),
            "referencia": str(referencia).strip(),
            "errors": errors,
            "status": "erro" if errors else "ok",
            "raw": {
                str(k): str(v) if pd.notna(v) else "-"
                for k, v in row.items()
            }
        })

    RECORDS = records

    return {
        "status": "ok",
        "total": len(records)
    }


@app.get("/api/data")
def get_data():
    rule_stats = {}

    for r in RECORDS:
        for e in r["errors"]:
            rule_stats[e["rule"]] = (
                rule_stats.get(e["rule"], 0) + 1
            )

    return {
        "records": RECORDS,
        "completed": list(COMPLETED),
        "rule_stats": rule_stats
    }


@app.post("/api/complete/{note_id}")
def toggle_complete(note_id: str):
    if note_id in COMPLETED:
        COMPLETED.remove(note_id)
    else:
        COMPLETED.add(note_id)

    return {
        "status": "ok",
        "completed": note_id in COMPLETED
    }