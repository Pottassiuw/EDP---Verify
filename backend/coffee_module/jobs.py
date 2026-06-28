"""Job in-process de busca em lote de notas COFFEE, com progresso (polling)."""
import datetime
import threading
import time
import uuid

from coffee_module import client, config, db

_JOBS: dict = {}
_LOCK = threading.Lock()


def iniciar_busca(ids: list) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(ids),
            "feitas": 0,
            "erros": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar, args=(job_id, list(ids)), daemon=True).start()
    return job_id


def _rodar(job_id: str, ids: list) -> None:
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
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


def iniciar_geracao(ids: list, justificativa: str | None = None) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "estado": "rodando",
            "total": len(ids),
            "feitas": 0,
            "erros": [],
            "iniciado_em": datetime.datetime.now().isoformat(),
        }
    threading.Thread(target=_rodar_geracao, args=(job_id, list(ids)),
                     daemon=True).start()
    return job_id


def _rodar_geracao(job_id: str, ids: list) -> None:
    for ident in ids:
        try:
            nota = client.buscar_nota(ident)
            db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
            pk = nota["pk"]
            sap = nota["id_sap"]
            if nota["arquivado"]:
                local = nota["fields"].get("local_instalacao")
                with _LOCK:
                    _JOBS[job_id].setdefault("arquivadas", []).append(
                        {"pk": pk, "id_sap": sap, "local_instalacao": local})
                db.registrar_log("acao_usuario", "geracao_ignorada_arquivada", pk,
                                 {"id_sap": sap, "local_instalacao": local}, True)
                db.marcar_gerar(pk, False)
            elif sap and sap != config.SAP_PENDENTE:
                # Ja tem SAP real: nao re-gera, so tira da fila.
                db.registrar_log("acao_usuario", "geracao_ignorada_sap_real", pk,
                                 {"id_sap": sap}, True)
                db.marcar_gerar(pk, False)
            else:
                # nao_gerada ou pendente: forca o placeholder (re-)gerando.
                client.definir_sap(ident, config.SAP_PENDENTE)
                nota = client.buscar_nota(ident)
                db.upsert_nota(nota["pk"], nota["id_sap"], nota["arquivado"], nota["fields"])
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
