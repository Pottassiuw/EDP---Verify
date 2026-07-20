"""Sync das metas do Plano de Recomposição a partir do Controle...xlsx.

O Excel (OneDrive sincronizado) segue sendo a fonte da verdade das metas —
o app apenas espelha. Import sempre copia para temp antes de ler (o arquivo
vive lockado pelo Excel/OneDrive). Falha nunca derruba nada: mantém a última
importação boa e registra o erro no estado.
"""
import datetime
import os
import shutil
import tempfile

import pandas as pd

from input_module import config, db

_USUARIO_SYNC = "metas-sync"


def _nome_curto(df_base: pd.DataFrame) -> dict:
    """Plano -> nome curto (par da aba base); colisão usa o longo sem ' - CAPEX'."""
    pares = (df_base.dropna(subset=["Plano", "Conjunto"])
             .groupby("Plano")["Conjunto"]
             .agg(lambda s: s.mode().iloc[0]).to_dict())
    # Determinístico: o plano de nome mais curto fica com o apelido; os
    # demais em colisão usam o nome longo sem " - CAPEX" (ex.: POSTE DEMANDA).
    usados: set = set()
    for plano in sorted(pares, key=lambda p: (len(p), p)):
        if pares[plano] in usados:
            pares[plano] = plano.replace(" - CAPEX", "").strip()
        usados.add(pares[plano])
    return pares


def _postergadas(df: pd.DataFrame) -> pd.DataFrame:
    """Aba Postergadas -> agregado (Ano, Mes-de-onde-saiu, Regional, Plano, Qtd).

    Grão: uma linha por nota postergada, atribuída ao mês DE onde saiu (from-month).
    Nomes de coluna ('Regionais', 'Mês De', 'Plano', 'Qtd') espelham o fixture
    sintético; conferir contra o arquivo real na verificação (Task 2, Step 6)."""
    df = df.dropna(subset=["Regionais", "Mês De", "Plano"])
    mes = pd.to_datetime(df["Mês De"], errors="coerce")
    out = pd.DataFrame({
        "Ano": mes.dt.year, "Mes": mes.dt.month,
        "Regional": df["Regionais"].astype(str).str.strip(),
        "Plano": df["Plano"].astype(str).str.strip(),
        "Qtd": pd.to_numeric(df["Qtd"], errors="coerce").fillna(0.0),
    }).dropna(subset=["Ano", "Mes"])
    return out.groupby(["Ano", "Mes", "Regional", "Plano"], as_index=False)["Qtd"].sum()


def _importar(caminho: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        copia = os.path.join(tmp, "controle.xlsx")
        shutil.copy2(caminho, copia)
        xl = pd.ExcelFile(copia)
        try:
            base = pd.read_excel(xl, sheet_name="base")
            dexpara = pd.read_excel(xl, sheet_name="dexpara")
            postergadas = pd.read_excel(xl, sheet_name="Postergadas")
        finally:
            xl.close()

    base = base.dropna(subset=["Regionais", "Mês", "Plano"])
    mes = pd.to_datetime(base["Mês"], errors="coerce")
    df_metas = pd.DataFrame({
        "Ano": mes.dt.year, "Mes": mes.dt.month,
        "Regional": base["Regionais"].astype(str).str.strip(),
        "Plano": base["Plano"].astype(str).str.strip(),
        "Meta": pd.to_numeric(base["Meta"], errors="coerce").fillna(0.0),
    }).dropna(subset=["Ano", "Mes"])
    df_metas = df_metas.groupby(["Ano", "Mes", "Regional", "Plano"], as_index=False)["Meta"].sum()

    curtos = _nome_curto(base)
    dexpara = dexpara.dropna(subset=["Projeto"])
    df_depara = pd.DataFrame({
        "Plano": dexpara["Projeto"].astype(str).str.strip(),
        "Nome_Curto": [curtos.get(str(p).strip(), str(p).strip())
                       for p in dexpara["Projeto"]],
        "Unidade": dexpara["Unidade"].astype(str).str.strip(),
        "Area": dexpara["Área"].astype(str).str.strip().map(
            {"Projeto": "Construção", "CSD": "CSD"}).fillna("Outros"),
        "Modular_RS": pd.to_numeric(dexpara["Modular R$"], errors="coerce").fillna(0.0),
        "Ordem_Exibicao": range(1, len(dexpara) + 1),
    }).drop_duplicates(subset=["Plano"])

    df_postergacoes = _postergadas(postergadas)

    db.substituir_metas(df_metas, df_depara, df_postergacoes)
    db.salvar_log_arquivo(os.path.basename(caminho), _USUARIO_SYNC,
                          datetime.datetime.now(), "Sync Metas")


def sincronizar_se_preciso(forcar: bool = False) -> dict:
    """Reimporta se o mtime do arquivo mudou desde a última importação."""
    caminho = str(config.caminho_controle_recomposicao())
    estado = db.obter_estado_metas()
    try:
        mtime = os.path.getmtime(caminho)
    except OSError as e:
        db.gravar_estado_metas(
            arquivo_mtime=(estado or {}).get("arquivo_mtime") or 0.0,
            erro=f"Arquivo inacessível: {e}")
        novo = db.obter_estado_metas()
        return {**novo, "sincronizou": False}

    if not forcar and estado and estado.get("arquivo_mtime") == mtime and not estado.get("erro"):
        return {**estado, "sincronizou": False}

    try:
        _importar(caminho)
        db.gravar_estado_metas(arquivo_mtime=mtime, erro=None)
        sincronizou = True
    except Exception as e:  # lock na cópia, aba renomeada, xlsx corrompido
        db.gravar_estado_metas(
            arquivo_mtime=(estado or {}).get("arquivo_mtime") or 0.0,
            erro=f"Falha ao importar: {e}")
        sincronizou = False
    novo = db.obter_estado_metas()
    return {**novo, "sincronizou": sincronizou}
