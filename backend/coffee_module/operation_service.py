"""MÃ¡quina de estados da pÃ¡gina OperaÃ§Ã£o do mÃ³dulo COFFEE."""

from coffee_module import config, db


def etapa_da_classificacao(classificacao: str) -> str | None:
    if classificacao == "nao_gerada":
        return "pronta"
    if classificacao == "pendente":
        return "aguardando_sap"
    return None


def adicionar_entradas(
    ids: list[int],
    origem: str,
    operacao_id: str,
) -> None:
    for entrada_id in dict.fromkeys(ids):
        db.upsert_item_operacao(
            entrada_id=int(entrada_id),
            etapa="fila",
            origem=origem,
            operacao_id=operacao_id,
        )


def aplicar_consulta(
    entrada_id: int,
    nota: dict,
    origem: str,
    operacao_id: str | None,
) -> str | None:
    pk = int(nota["pk"])
    classificacao = db.upsert_nota(
        pk,
        nota["id_sap"],
        nota["fields"],
    )
    if db.origem_atual(pk) is None:
        db.definir_origem(pk, origem)
    etapa = etapa_da_classificacao(classificacao)
    if etapa is None:
        db.remover_item_operacao(pk)
        db.remover_item_operacao(int(entrada_id))
        return None
    db.upsert_item_operacao(
        entrada_id=int(entrada_id),
        nota_pk=pk,
        etapa=etapa,
        origem=origem,
        operacao_id=operacao_id,
    )
    db.marcar_gerar(pk, etapa == "pronta")
    return etapa


def marcar_processando(pks: list[int], operacao_id: str) -> None:
    itens = {item["nota_pk"]: item for item in db.listar_itens_operacao()}
    for pk in pks:
        item = itens.get(int(pk))
        if item is None or item["etapa"] != "pronta":
            raise ValueError(f"Nota {pk} nÃ£o estÃ¡ pronta para gerar.")
        db.upsert_item_operacao(
            entrada_id=item["entrada_id"],
            nota_pk=int(pk),
            etapa="processando",
            origem=item["origem"],
            operacao_id=operacao_id,
        )


def aplicar_geracao_sucesso(pk: int, operacao_id: str) -> None:
    itens = {item["nota_pk"]: item for item in db.listar_itens_operacao()}
    item = itens.get(int(pk))
    if item is None:
        return
    db.upsert_item_operacao(
        entrada_id=item["entrada_id"],
        nota_pk=int(pk),
        etapa="aguardando_sap",
        origem=item["origem"],
        operacao_id=operacao_id,
    )
    db.marcar_gerar(int(pk), False)


def aplicar_falha(pk: int, etapa_retorno: str, mensagem: str) -> None:
    itens = {
        item["nota_pk"] or item["entrada_id"]: item
        for item in db.listar_itens_operacao()
    }
    item = itens.get(int(pk))
    if item is None:
        db.upsert_item_operacao(
            entrada_id=int(pk),
            etapa=etapa_retorno,
            origem="avulsa",
            erro=mensagem,
        )
        return
    db.upsert_item_operacao(
        entrada_id=item["entrada_id"],
        nota_pk=item["nota_pk"],
        etapa=etapa_retorno,
        origem=item["origem"],
        erro=mensagem,
    )


def normalizar_fila_legada() -> None:
    ativos = {
        item["nota_pk"] or item["entrada_id"]
        for item in db.listar_itens_operacao()
    }
    for nota in db.listar_notas("a_gerar"):
        if nota["pk"] in ativos:
            continue
        etapa = etapa_da_classificacao(nota["classificacao"])
        if etapa is None:
            continue
        db.upsert_item_operacao(
            entrada_id=nota["pk"],
            nota_pk=nota["pk"],
            etapa=etapa,
            origem=nota.get("origem") or "verificar",
        )


def listar_quadro() -> dict:
    normalizar_fila_legada()
    notas = {nota["pk"]: nota for nota in db.listar_notas()}
    itens = []
    for item in db.listar_itens_operacao():
        itens.append({
            **item,
            "nota": notas.get(item["nota_pk"]),
        })
    contagens = {
        etapa: sum(1 for item in itens if item["etapa"] == etapa)
        for etapa in ("fila", "pronta", "processando", "aguardando_sap")
    }
    return {
        "itens": itens,
        "operacoes_ativas": db.listar_operacoes_ativas(),
        "contagens": contagens,
    }
