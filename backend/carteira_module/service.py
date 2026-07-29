"""Casos de uso da Carteira: leitura paginada, resumo e sincronizacao."""
from carteira_module import db, repository, sync
from input_module import db as input_db


def _numeros_no_plano() -> set[int]:
    return input_db.listar_numeros_nota()


def pagina_notas(filtros: dict, page: int, size: int,
                 ordenar_por: str, ordem: str) -> dict:
    conn = db.conectar()
    try:
        registros, total = repository.listar(
            conn, numeros_no_plano=_numeros_no_plano(), filtros=filtros,
            page=page, size=size, ordenar_por=ordenar_por, ordem=ordem,
        )
    finally:
        conn.close()
    return {"registros": registros, "total": total, "page": page,
            "size": size, "versao": db.obter_versao()}


def detalhe(id_onr: int) -> dict | None:
    conn = db.conectar()
    try:
        return repository.obter(conn, id_onr, _numeros_no_plano())
    finally:
        conn.close()


def resumo() -> dict:
    conn = db.conectar()
    try:
        return repository.resumo(conn, _numeros_no_plano())
    finally:
        conn.close()


def estado_sincronizacao() -> dict:
    return sync.estado()


def disparar_sincronizacao() -> dict:
    return sync.sincronizar()


def versao_dashboard() -> str:
    """Versao composta (input+carteira) para o ETag do dashboard — barata,
    permite responder 304 antes de montar o corpo pesado (padrao da rota de
    Relatorios do Input). Sincroniza metas (idempotente por mtime) para que a
    versao reflita um eventual reimport, casando com o corpo."""
    from input_module import metas
    metas.sincronizar_se_preciso()
    return f"{input_db.obter_versao_dataset()}-{db.obter_versao()}"


def dashboard(ano: int | None, mes: int | None, regional: str | None) -> dict:
    """Dashboard: reusa a agregacao dos Relatorios (meta/planejado/executado)
    e adiciona a camada 'base disponivel' (fora do plano) da carteira."""
    import datetime

    from input_module import engine, metas, relatorios
    from carteira_module import dashboard as dash_mod

    agora = datetime.datetime.now()
    ano = ano or agora.year
    mes = mes or agora.month

    estado_metas = metas.sincronizar_se_preciso()
    df_depara = input_db.carregar_planos_depara()
    base_dash = relatorios.montar_dashboard(
        engine.get_dataset(), input_db.carregar_dados_ramal(),
        input_db.carregar_metas(ano), df_depara,
        input_db.carregar_postergacoes(ano),
        ano=ano, mes_referencia=mes, regional=regional)
    base_dash["regionais_disponiveis"] = relatorios.REGIONAIS_CSD

    unidade_por_plano, nome_area_por_plano = {}, {}
    if not df_depara.empty:
        for _, linha in df_depara.iterrows():
            unidade_por_plano[linha["Plano"]] = linha.get("Unidade")
            nome_area_por_plano[linha["Plano"]] = (
                linha.get("Nome_Curto"), linha.get("Area"))

    conn = db.conectar()
    try:
        base_bruta = repository.base_por_plano(conn, _numeros_no_plano())
    finally:
        conn.close()

    corpo = dash_mod.montar(base_dash, base_bruta, unidade_por_plano,
                            nome_area_por_plano)
    corpo["metas_info"] = {
        "atualizadas_em": estado_metas.get("atualizadas_em"),
        "arquivo_mtime": estado_metas.get("arquivo_mtime"),
        "erro": estado_metas.get("erro"),
    }
    corpo["versao"] = f"{input_db.obter_versao_dataset()}-{db.obter_versao()}"
    return corpo
