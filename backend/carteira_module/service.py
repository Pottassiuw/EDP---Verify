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
