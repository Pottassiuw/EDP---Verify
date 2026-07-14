"""Job in-process de busca em lote de notas COFFEE, com progresso (polling)."""
import datetime
import threading
import time
import uuid

from coffee_module import client, config, db

_JOBS: dict = {}
_LOCK = threading.Lock()


def iniciar_busca(ids: list, trace: str | None = None) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(ids),
            "feitas": 0,
            "erros": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar, args=(job_id, list(ids), trace), daemon=True).start()
    return job_id


def _rodar(job_id: str, ids: list, trace: str | None = None) -> None:
    db.definir_trace(trace)
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["fields"])
        except Exception as exc:  # noqa: BLE001 — uma falha não derruba o lote
            try:
                db.registrar_erro(int(ident), str(exc))
            except (ValueError, TypeError):
                pass
            with _LOCK:
                _JOBS[job_id]["erros"].append({"pk": ident, "msg": str(exc)})
        finally:
            with _LOCK:
                _JOBS[job_id]["feitas"] += 1
        time.sleep(config.DELAY_BUSCA)
    with _LOCK:
        _JOBS[job_id]["estado"] = "concluido"


def obter_job(job_id: str):
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None


def iniciar_geracao(ids: list, justificativa: str | None = None,
                    trace: str | None = None) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(ids),
            "feitas": 0,
            "erros": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar_geracao, args=(job_id, list(ids), trace),
                     daemon=True).start()
    return job_id


def _rodar_geracao(job_id: str, ids: list, trace: str | None = None) -> None:
    db.definir_trace(trace)
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["fields"])
            pk = nota["pk"]
            sap = nota["id_sap"]
            arquivado = nota["arquivado"]
            if arquivado and sap and sap != config.SAP_PENDENTE:
                # Arquivada com SAP real: ja foi gerada — pula.
                local = nota["local_instalacao"]
                with _LOCK:
                    _JOBS[job_id].setdefault("arquivadas", []).append(
                        {"pk": pk, "id_sap": sap, "local_instalacao": local})
                db.registrar_log("acao_usuario", "geracao_ignorada_arquivada", pk,
                                 {"id_sap": sap, "local_instalacao": local}, True)
                db.marcar_gerar(pk, False)
            elif sap and sap != config.SAP_PENDENTE:
                # SAP real, nao arquivada: nao re-gera, so tira da fila.
                db.registrar_log("acao_usuario", "geracao_ignorada_sap_real", pk,
                                 {"id_sap": sap}, True)
                db.marcar_gerar(pk, False)
            else:
                # Sem SAP ou SAP=10000000: define o placeholder e desarquiva.
                # O COFFEE so gera notas DESARQUIVADAS — ele atribui o SAP real
                # e arquiva sozinho ao concluir; a nota tem que sair desarquivada.
                client.definir_sap(ident, config.SAP_PENDENTE)
                client.desarquivar(ident)
                nota = client.buscar_nota(ident)
                db.upsert_nota(nota["pk"], nota["id_sap"], nota["fields"])
                db.marcar_gerar(nota["pk"], False)
                if db.origem_atual(nota["pk"]) is None:
                    db.definir_origem(nota["pk"], "avulsa")
        except Exception as exc:  # noqa: BLE001 — uma falha não derruba o lote
            with _LOCK:
                _JOBS[job_id]["erros"].append({"pk": ident, "msg": str(exc)})
        finally:
            with _LOCK:
                _JOBS[job_id]["feitas"] += 1
        time.sleep(config.DELAY_GERACAO)
    with _LOCK:
        _JOBS[job_id]["estado"] = "concluido"


def iniciar_correcao_local(itens: list, gerar_apos: bool = False,
                           trace: str | None = None) -> str:
    """Corrige em lote locais de instalacao com '9' extra (malha fina)."""
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(itens),
            "feitas": 0,
            "erros": [],
            "corrigidas": [],
            "ja_corrigidas": [],
            "divergentes": [],
            "geradas": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar_correcao_local,
                     args=(job_id, [dict(i) for i in itens], gerar_apos, trace),
                     daemon=True).start()
    return job_id


def _rodar_correcao_local(job_id: str, itens: list, gerar_apos: bool,
                          trace: str | None = None) -> None:
    db.definir_trace(trace)
    for item in itens:
        ident, local = item["id"], item["local"]
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["fields"])
            atual = nota["local_instalacao"]
            if atual == local:
                # Alguem ja corrigiu antes: idempotente, nao e erro.
                with _LOCK:
                    _JOBS[job_id]["ja_corrigidas"].append(ident)
                db.registrar_log("acao_usuario", "correcao_local_ja_corrigida",
                                 nota["pk"], {"id": ident, "local": local}, True)
            elif atual != local + "9":
                # Planilha defasada: nunca altera o que nao reconhecemos.
                with _LOCK:
                    _JOBS[job_id]["divergentes"].append(
                        {"pk": ident, "local_atual": atual})
                db.registrar_log("acao_usuario", "correcao_local_divergente",
                                 nota["pk"],
                                 {"id": ident, "esperado": local + "9",
                                  "atual": atual}, False)
            else:
                client.alterar_local(ident, local)
                with _LOCK:
                    _JOBS[job_id]["corrigidas"].append(ident)
                db.registrar_log("acao_usuario", "correcao_local", nota["pk"],
                                 {"id": ident, "de": atual, "para": local}, True)
                if gerar_apos:
                    _gerar_apos_correcao(job_id, ident, nota)
        except Exception as exc:  # noqa: BLE001 — uma falha não derruba o lote
            with _LOCK:
                _JOBS[job_id]["erros"].append({"pk": ident, "msg": str(exc)})
        finally:
            with _LOCK:
                _JOBS[job_id]["feitas"] += 1
        time.sleep(config.DELAY_GERACAO)
    with _LOCK:
        _JOBS[job_id]["estado"] = "concluido"


def _gerar_apos_correcao(job_id: str, ident, nota: dict) -> None:
    """Encadeia a geracao de uma nota recem-corrigida (mesma logica do gerar-lote)."""
    sap = nota["id_sap"]
    if sap and sap != config.SAP_PENDENTE:
        # SAP real: ja foi gerada — nao re-gera.
        db.registrar_log("acao_usuario", "geracao_ignorada_sap_real", nota["pk"],
                         {"id_sap": sap}, True)
        db.marcar_gerar(nota["pk"], False)
        return
    # O COFFEE so gera notas DESARQUIVADAS — placeholder + desarquivar,
    # mesma sequencia do _rodar_geracao.
    client.definir_sap(ident, config.SAP_PENDENTE)
    client.desarquivar(ident)
    atualizada = client.buscar_nota(ident)
    db.upsert_nota(atualizada["pk"], atualizada["id_sap"], atualizada["fields"])
    db.marcar_gerar(atualizada["pk"], False)
    if db.origem_atual(atualizada["pk"]) is None:
        db.definir_origem(atualizada["pk"], "avulsa")
    with _LOCK:
        _JOBS[job_id]["geradas"].append(ident)
