import io
import json
import os
import pathlib
import re
import time
import uuid

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv(pathlib.Path(__file__).resolve().parent / ".env")

from coffee_module import db as _coffee_db

app = FastAPI(title="De olho no Problema")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


# Instrumentação opcional: ligue com EDP_PERF=1 para medir a abertura da seção
# COFFEE em produção sem recompilar nada. Loga só rota, duração e tamanho —
# nunca corpo, header ou identificador de usuário.
_PERF_ATIVO = os.environ.get("EDP_PERF", "").strip() not in ("", "0", "false")
_PERF_ROTAS = ("/api/data", "/api/coffee/")


@app.middleware("http")
async def _trace_middleware(request, call_next):
    _coffee_db.definir_trace(uuid.uuid4().hex[:12])
    if not _PERF_ATIVO or not request.url.path.startswith(_PERF_ROTAS):
        return await call_next(request)
    inicio = time.perf_counter()
    resposta = await call_next(request)
    duracao_ms = (time.perf_counter() - inicio) * 1000
    tamanho = resposta.headers.get("content-length", "?")
    print(f"[COFFEE-PERF] {request.method} {request.url.path} "
          f"status={resposta.status_code} {duracao_ms:.0f}ms bytes={tamanho}")
    return resposta


# ── Scheduler (Extração Noturna do SAP) ──────────────────────────────────────
import asyncio
import datetime
from input_module.routes import _rotina_sap_background

async def _agendador_sap_noturno():
    """Roda infinitamente verificando se é a hora da madrugada (ex: 03:00) para acionar o SAP."""
    while True:
        agora = datetime.datetime.now()
        # Se for 3 da manhã e estivermos no minuto 0 (com margem de erro do sleep)
        if agora.hour == 3 and agora.minute == 0:
            print("🕒 [Scheduler] Iniciando extração noturna do SAP...")
            # Roda em thread para não bloquear o event loop do FastAPI
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _rotina_sap_background)
            print("✅ [Scheduler] Extração noturna finalizada!")
            
            # Dorme por 61 minutos para garantir que não vai rodar de novo hoje às 3h
            await asyncio.sleep(61 * 60)
        else:
            # Verifica a cada 30 segundos
            await asyncio.sleep(30)

@app.on_event("startup")
async def start_scheduler():
    asyncio.create_task(_agendador_sap_noturno())



RECORDS = []
COMPLETED = set()

STATE_FILE = pathlib.Path(__file__).parent / "app_state.json"
DE_PARA_MEMBROS_PADRAO = pathlib.Path(__file__).parent.parent / "De-Para Membros.xlsx"

# Colunas que o frontend realmente lê de `raw` (interface NoteRaw em
# frontend/src/types.ts). A planilha de verificação traz dezenas de colunas
# extras: mandar todas era ~76% do corpo de GET /api/data (medido: 4.5 MB para
# 2000 notas, 3.4 MB só de `raw`) sem nenhum consumidor no frontend.
_RAW_UTEIS = frozenset({
    "id", "tipo_nota", "referencia_fisica", "prioridade", "setor", "uf",
    "local_instalacao", "alimentador", "colaborador", "executor",
    "imagens_totais", "imagens_recebidas", "latitude", "longitude",
    "id_sap", "descricao", "poste", "postes", "problema",
})


def slim_raw(raw: dict) -> dict:
    """Projeta um dict `raw` nas colunas que o frontend consome."""
    return {k: v for k, v in raw.items() if k in _RAW_UTEIS}


def normalizar_matricula(valor: object) -> str:
    """Normaliza matrículas vindas do Excel sem perder a chave de cruzamento."""
    if valor is None or pd.isna(valor):
        return ""
    texto = str(valor).strip()
    return texto[:-2] if texto.endswith(".0") else texto


def caminho_de_para_membros() -> pathlib.Path:
    caminho = os.environ.get("DE_PARA_MEMBROS_PATH")
    return pathlib.Path(caminho) if caminho else DE_PARA_MEMBROS_PADRAO


def carregar_membros() -> dict[str, dict[str, object]]:
    """Lê os campos públicos do De-Para necessários à identificação do gerador."""
    caminho = caminho_de_para_membros()
    if not caminho.is_file():
        raise FileNotFoundError(f"Arquivo De-Para de membros não encontrado: {caminho}")

    membros = pd.read_excel(caminho, sheet_name="Colaboradores")
    colunas_necessarias = {"Matrícula", "Nome", "Sobrenome", "Uf", "Permissoes"}
    ausentes = colunas_necessarias - set(membros.columns)
    if ausentes:
        nomes = ", ".join(sorted(ausentes))
        raise ValueError(f"De-Para de membros sem as colunas obrigatórias: {nomes}")

    resultado: dict[str, dict[str, object]] = {}
    for _, membro in membros.iterrows():
        matricula = normalizar_matricula(membro["Matrícula"])
        if not matricula:
            continue
        nome = " ".join(
            parte for parte in (str(membro["Nome"]).strip(), str(membro["Sobrenome"]).strip())
            if parte and parte.lower() != "nan"
        )
        uf = "" if pd.isna(membro["Uf"]) else str(membro["Uf"]).strip()
        permissoes = "" if pd.isna(membro["Permissoes"]) else str(membro["Permissoes"]).lower()
        resultado[matricula] = {
            "matricula": matricula,
            "nome": nome or matricula,
            "uf": uf,
            "inspetor": uf in {"ES", "SP"} and "inspetor_planejamento" in permissoes,
        }
    return resultado


def enriquecer_gerador(registro: dict, membros: dict[str, dict[str, object]]) -> None:
    """Acrescenta o gerador identificado pelo campo colaborador da nota."""
    matricula = normalizar_matricula(registro.get("raw", {}).get("colaborador"))
    registro["gerador"] = membros.get(matricula, {
        "matricula": matricula,
        "nome": matricula or "Não informado",
        "uf": "",
        "inspetor": False,
    })


# ── Persistência ─────────────────────────────────────────────────────────────


def save_state():
    # Escrita atômica: sem o temporário, uma falha no meio da gravação
    # (acentos + codec locale do Windows) trunca o arquivo bom para 0 byte
    # e a triagem carregada se perde no próximo start do backend.
    tmp = STATE_FILE.with_name(STATE_FILE.name + ".tmp")
    try:
        tmp.write_text(
            json.dumps(
                {"records": RECORDS, "completed": list(COMPLETED)},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        tmp.replace(STATE_FILE)
    except Exception as e:
        tmp.unlink(missing_ok=True)
        print(
            f"Falha ao salvar {STATE_FILE.name}: {e}. "
            "A triagem continua em memória, mas será perdida ao reiniciar "
            "o backend — reimporte a planilha em COFFEE > Verificar."
        )


def load_state():
    global RECORDS, COMPLETED
    if not STATE_FILE.exists() or STATE_FILE.stat().st_size == 0:
        return
    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        RECORDS = state.get("records", [])
        COMPLETED = set(state.get("completed", []))
        # Estado gravado antes do enxugamento do `raw` continua no disco com
        # todas as colunas da planilha. Projeta uma vez na carga em vez de a
        # cada GET /api/data.
        membros = carregar_membros()
        for registro in RECORDS:
            if isinstance(registro.get("raw"), dict):
                registro["raw"] = slim_raw(registro["raw"])
                enriquecer_gerador(registro, membros)
    except Exception as e:
        print(
            f"Falha ao ler {STATE_FILE.name}: {e}. "
            "Iniciando com a triagem vazia — reimporte a planilha em "
            "COFFEE > Verificar."
        )


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

    try:
        membros = carregar_membros()
    except (FileNotFoundError, ValueError, OSError) as erro:
        raise HTTPException(status_code=500, detail=f"Não foi possível identificar quem gerou as notas: {erro}")

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
                "raw":        {str(k): str(v) if pd.notna(v) else "-"
                               for k, v in row.items() if str(k) in _RAW_UTEIS},
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

    for registro in records:
        enriquecer_gerador(registro, membros)

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

from coffee_module.routes import router as coffee_router

app.include_router(coffee_router)

from integracao_module.routes import router as integracao_router

app.include_router(integracao_router)

from carteira_module.routes import router as carteira_router
from carteira_module import db as _carteira_db

_carteira_db.inicializar_banco()
app.include_router(carteira_router)


DIST = pathlib.Path(__file__).parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="static")
