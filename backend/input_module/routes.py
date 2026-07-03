"""Rotas /api/input/* — módulo de Gestão de Notas (Input)."""
import datetime
import io
import json
import os
import re as _re
import threading
from typing import Optional

import pandas as pd
from fastapi import (APIRouter, BackgroundTasks, Depends, File, Header,
                     HTTPException, Response, UploadFile)
from fastapi.responses import FileResponse
from pydantic import BaseModel

from input_module import config, db, engine

router = APIRouter(prefix="/api/input")

# Estado da migração inicial (resolvido no primeiro acesso)
_migracao = {"resultado": None}
_banco_lock = threading.Lock()


def _garantir_banco() -> str:
    with _banco_lock:
        if _migracao["resultado"] is None:
            _migracao["resultado"] = db.migrar_da_rede_se_preciso()
            db.inicializar_banco()
    return _migracao["resultado"]


def _df_para_registros(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records", force_ascii=False))


@router.get("/notas")
def listar_notas():
    migracao = _garantir_banco()
    df = engine.get_dataset()
    return {
        "registros": _df_para_registros(df),
        "meta": {
            "status_opcoes": list(config.STATUS_MAP.values()),
            "prioridade_opcoes": config.PRIORIDADES,
            "bases": engine.status_bases(),
            "ultima_alteracao": db.obter_data_ultima_alteracao(),
            "migracao": migracao,
            "colunas": config.COLUNAS_PAINEL,
        },
    }


@router.get("/sync")
def sync():
    _garantir_banco()
    return {"ultima_alteracao": db.obter_data_ultima_alteracao()}


@router.get("/logs")
def listar_logs():
    _garantir_banco()
    return {"registros": _df_para_registros(db.carregar_logs())}


@router.get("/logs/arquivos")
def listar_logs_arquivos():
    _garantir_banco()
    return {"registros": _df_para_registros(db.carregar_log_arquivos())}


@router.get("/logs/nota/{numero}")
def timeline_nota(numero: int):
    _garantir_banco()
    df = db.carregar_logs()
    if not df.empty:
        df = df[df["Numero_Nota"] == numero]
    return {"registros": _df_para_registros(df)}


# ── Escrita ──────────────────────────────────────────────────────────────
def usuario_atual(x_user: Optional[str] = Header(default=None, alias="X-User")) -> str:
    if not x_user or not x_user.strip():
        raise HTTPException(status_code=400, detail="Header X-User obrigatório para escrita.")
    return x_user.strip()


def _pos_escrita(tasks: BackgroundTasks) -> None:
    engine.invalidar_cache()
    tasks.add_task(engine.gerar_copia_excel_rede)


class EdicaoPedido(BaseModel):
    linhas: list[dict]


class NovaNota(BaseModel):
    Numero_Nota: int
    Status_Nota: str
    Prioridade_Nota: str
    Planejado_DDPM: float = 0.0
    Status_Obra: str = "-"
    Conjunto: str = "-"
    Circuito: str = "-"
    Local_Instalacao: str = "-"
    Mes_Execucao_Planejado: str = "-"
    Data_Envio_Projeto: str = "-"
    Observacao: str = ""
    Check: str = "-"


class LotePedido(BaseModel):
    notas: list[NovaNota]


class ExclusaoPedido(BaseModel):
    numeros: list[int]


class ExportPedido(BaseModel):
    numeros: list[int]
    colunas: list[str]


def _preparar_novas(notas: list, df_banco: pd.DataFrame) -> pd.DataFrame:
    """Valida duplicatas e completa Regional/ID_Cronologia (Input/app.py:640-728)."""
    numeros = [n.Numero_Nota for n in notas]
    repetidas_lote = {str(n) for n in numeros if numeros.count(n) > 1}
    if repetidas_lote:
        raise HTTPException(409, "Notas duplicadas no próprio lote: " + ", ".join(sorted(repetidas_lote)))
    existentes = set(df_banco["Numero_Nota"].tolist()) if not df_banco.empty else set()
    repetidas_banco = sorted(str(n) for n in numeros if n in existentes)
    if repetidas_banco:
        raise HTTPException(409, "Notas já existentes no banco: " + ", ".join(repetidas_banco))
    base_id = db.proximo_id_cronologia(df_banco)
    linhas = []
    for i, nota in enumerate(notas):
        registro = nota.model_dump()
        registro["ID_Cronologia"] = base_id + i
        registro["Regional"] = config.DE_PARA_REGIONAL.get(str(nota.Local_Instalacao)[:3], "-")
        registro["Centro_Responsavel"] = "-"
        registro["Status_Anterior"] = "-"
        linhas.append(registro)
    return pd.DataFrame(linhas)


@router.patch("/notas")
def editar_notas(pedido: EdicaoPedido, tasks: BackgroundTasks,
                 usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    try:
        resultado = db.aplicar_edicoes(pedido.linhas, usuario=usuario)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if resultado["alteradas"]:
        _pos_escrita(tasks)
    return {**resultado, "ultima_alteracao": db.obter_data_ultima_alteracao()}


@router.post("/notas")
def criar_nota(nota: NovaNota, tasks: BackgroundTasks,
               usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    df_novas = _preparar_novas([nota], db.carregar_dados())
    db.salvar_em_massa(df_novas)
    _pos_escrita(tasks)
    return {"inseridas": 1}


@router.post("/notas/bulk")
def criar_lote(pedido: LotePedido, tasks: BackgroundTasks,
               usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    if not pedido.notas:
        raise HTTPException(400, "Lote vazio.")
    df_novas = _preparar_novas(pedido.notas, db.carregar_dados())
    db.salvar_em_massa(df_novas)
    _pos_escrita(tasks)
    return {"inseridas": len(df_novas)}


@router.delete("/notas")
def excluir_notas(pedido: ExclusaoPedido, tasks: BackgroundTasks,
                  usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    excluidas = db.deletar_notas(pedido.numeros, usuario=usuario)
    if excluidas:
        _pos_escrita(tasks)
    return {"excluidas": excluidas}


@router.post("/desfazer")
def desfazer(tasks: BackgroundTasks, usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    ok, mensagem = db.reverter_ultima_alteracao()
    if ok:
        _pos_escrita(tasks)
    return {"ok": ok, "mensagem": mensagem}


@router.post("/export")
def exportar(pedido: ExportPedido):
    _garantir_banco()
    df = engine.get_dataset()
    df = df[df["Numero_Nota"].isin(pedido.numeros)]
    colunas = [c for c in pedido.colunas if c in df.columns]
    df = df[colunas].rename(columns=config.NOMES_AMIGAVEIS)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Selecao_Filtrada")
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="export_notas.xlsx"'},
    )


# ── Tarefa 7: configuração (responsáveis, bases, backups, migração) ───────────
def _achar_base(nome_arquivo: str) -> str:
    for caminho in config.BASES_APOIO.values():
        if os.path.basename(caminho) == nome_arquivo:
            return caminho
    raise HTTPException(404, f"Base '{nome_arquivo}' não é gerenciada pelo sistema.")


@router.get("/responsaveis")
def obter_responsaveis():
    _garantir_banco()
    return db.carregar_responsaveis()


@router.put("/responsaveis")
def gravar_responsaveis(novo: dict[str, str], usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    db.salvar_responsaveis(novo)
    return {"ok": True}


@router.get("/bases")
def listar_bases():
    bases = []
    for nome, caminho in config.BASES_APOIO.items():
        existe = os.path.exists(caminho)
        bases.append({
            "nome": nome, "arquivo": os.path.basename(caminho),
            "encontrada": existe,
            "modificada": datetime.datetime.fromtimestamp(
                os.path.getmtime(caminho)).isoformat() if existe else None,
        })
    return {"bases": bases}


@router.get("/bases/{nome_arquivo}/download")
def baixar_base(nome_arquivo: str):
    caminho = _achar_base(nome_arquivo)
    if not os.path.exists(caminho):
        raise HTTPException(404, "Arquivo não encontrado na rede.")
    return FileResponse(caminho, filename=nome_arquivo)


def _processar_upload_base(nome_arquivo: str, caminho: str):
    map_simples = {
        "Indicador base conjunto - Limite Aneel.xlsx": "base_indicador_continuidade",
        "Gerada_base_IW28.XLSX": "base_iw28",
        "Gerada_custo_ord_IW38.XLSX": "base_iw38",
        "Gerada_medidas_IW66.XLSX": "base_iw66",
        "Clientes_Conjunto.xlsx": "base_clientes",
        "Table1.xlsx": "base_table1"
    }
    try:
        if nome_arquivo in map_simples:
            df = pd.read_excel(caminho)
            db.salvar_base_dataframe(map_simples[nome_arquivo], df)
        elif nome_arquivo == "Ganhos.xlsx":
            df = pd.read_excel(caminho, sheet_name='Ganhos')
            db.salvar_base_dataframe("base_ganhos", df)
        elif nome_arquivo == "Custo_Modular.xlsx":
            df_mod = pd.read_excel(caminho, sheet_name='Modulares')
            db.salvar_base_dataframe("base_custo_modular", df_mod)
            df_saz = pd.read_excel(caminho, sheet_name='Modulares', skiprows=1, nrows=4)
            db.salvar_base_dataframe("base_sazonal", df_saz)
    except Exception as e:
        print(f"Aviso: Não foi possível importar {nome_arquivo} para o SQLite nativo: {e}")


def _rotina_sap_background():
    import subprocess
    import os
    try:
        # Chama o robô SAP forçando UTF-8 para evitar crash com emojis no print
        script_path = str(config.data_dir().parent.parent.parent / "INPUT SQL" / "Sap_Robot.py")
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["INPUT_DB_PATH"] = db.obter_caminho_banco()
        subprocess.run(["python", script_path], check=True, env=env)
        
        # Assim que termina, atualiza o SQLite com os arquivos gerados!
        _processar_upload_base("Gerada_base_IW28.XLSX", config.CAMINHO_BASE_IW28)
        _processar_upload_base("Gerada_custo_ord_IW38.XLSX", config.CAMINHO_CUSTO_ORD_IW38)
        _processar_upload_base("Gerada_medidas_IW66.XLSX", config.CAMINHO_BASE_IW66)
        
        engine.invalidar_cache()
    except Exception as e:
        print(f"Erro na execução em background do SAP: {e}")


from fastapi import Body

@router.post("/bases/sync-sap")
def sync_sap(tasks: BackgroundTasks, x_user: Optional[str] = Header(default="Sistema", alias="X-User"), payload: dict = Body(None)):
    """Inicia a extração SAP em background."""
    _garantir_banco()
    tasks.add_task(_rotina_sap_background)
    return {"mensagem": "Sincronização SAP iniciada em background."}


@router.post("/bases/{nome_arquivo}")
def substituir_base(nome_arquivo: str, arquivo: UploadFile = File(...),
                    usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    caminho = _achar_base(nome_arquivo)
    try:
        with open(caminho, "wb") as f:
            f.write(arquivo.file.read())
    except OSError as e:
        raise HTTPException(502, f"Erro ao gravar na rede: {e}")
    
    _processar_upload_base(nome_arquivo, caminho)
    
    db.salvar_log_arquivo(nome_arquivo, usuario, datetime.datetime.now(), "Substituição")
    engine.invalidar_cache()
    return {"ok": True}


@router.get("/backups")
def listar_backups():
    pasta = config.data_dir() / "backups"
    backups = []
    if pasta.exists():
        for arq in sorted(pasta.glob("notas_departamento_*.db"),
                          key=os.path.getmtime, reverse=True):
            backups.append({
                "arquivo": arq.name,
                "tamanho_mb": round(arq.stat().st_size / (1024 * 1024), 2),
                "modificado": datetime.datetime.fromtimestamp(arq.stat().st_mtime).isoformat(),
            })
    return {"backups": backups}


@router.get("/backups/{nome}/download")
def baixar_backup(nome: str):
    if not _re.fullmatch(r"notas_departamento_\d{8}_\d{6}\.db", nome):
        raise HTTPException(400, "Nome de backup inválido.")
    caminho = config.data_dir() / "backups" / nome
    if not caminho.exists():
        raise HTTPException(404, "Backup não encontrado.")
    return FileResponse(str(caminho), filename=nome)


# ── Fase 4: Ramal + Hierarquia ────────────────────────────────────────────────
class RamalNota(BaseModel):
    Numero_Nota: int
    Status_Obra: str = "-"
    Conjunto: str = "-"
    Circuito: str = "-"
    Local_Instalacao: str = "-"
    Planejado_DDPM: float = 0.0
    Mes_Execucao_Planejado: str = "-"
    CenTrab_Respon: str = "-"
    Prioridade_Nota: str = "-"
    Observacao: str = ""
    Extracao_Antiga: str = "-"
    Status_Nota: str = "-"
    Status_Anterior: str = "-"
    Check_Btzero: str = "-"
    Plano: str = "-"


class RamalLotePedido(BaseModel):
    notas: list[RamalNota]


class ExclusaoRamalPedido(BaseModel):
    numeros: list[int]


class HierarquiaPedido(BaseModel):
    dados: dict[str, list[int]]


@router.get("/ramal")
def listar_ramal():
    _garantir_banco()
    return {"registros": _df_para_registros(db.carregar_dados_ramal())}


@router.post("/ramal/bulk")
def importar_ramal(pedido: RamalLotePedido, tasks: BackgroundTasks,
                   usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    if not pedido.notas:
        raise HTTPException(400, "Lote vazio.")
    import pandas as pd
    df = pd.DataFrame([n.model_dump() for n in pedido.notas])
    df["ID_Cronologia"] = list(range(1, len(df) + 1))
    db.salvar_ramal_em_massa(df)
    _pos_escrita(tasks)
    return {"inseridas": len(df)}


@router.delete("/ramal")
def excluir_ramal(pedido: ExclusaoRamalPedido, tasks: BackgroundTasks,
                  usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    excluidas = db.deletar_notas_ramal(pedido.numeros, usuario=usuario)
    if excluidas:
        _pos_escrita(tasks)
    return {"excluidas": excluidas}


@router.post("/hierarquia")
def vincular_hierarquia(pedido: HierarquiaPedido, tasks: BackgroundTasks,
                        usuario: str = Depends(usuario_atual)):
    _garantir_banco()
    atualizadas = db.vincular_nota_mae_lote(
        {k: v for k, v in pedido.dados.items()}, usuario=usuario
    )
    if atualizadas:
        engine.invalidar_cache()
    return {"atualizadas": atualizadas}


@router.get("/hierarquia/{numero_nota}")
def obter_hierarquia(numero_nota: int):
    _garantir_banco()
    df = db.carregar_dados()
    if df.empty or numero_nota not in df["Numero_Nota"].values:
        raise HTTPException(404, f"Nota {numero_nota} não encontrada.")
    nota_row = df[df["Numero_Nota"] == numero_nota].iloc[0]
    nota_mae = str(nota_row.get("Nota_Mae", "-"))
    filhas_df = df[df["Nota_Mae"].astype(str) == str(numero_nota)]
    return {
        "nota_mae": nota_mae,
        "filhas": _df_para_registros(filhas_df[["Numero_Nota", "Status_Nota", "Conjunto"]]),
    }


@router.post("/migrar")
def migrar_novamente(usuario: str = Depends(usuario_atual)):
    _migracao["resultado"] = None
    resultado = _garantir_banco()
    engine.invalidar_cache()
    return {"resultado": resultado}
