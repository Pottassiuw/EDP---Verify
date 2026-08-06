"""[COFFEE-PERF] Sonda de performance da abertura da seção COFFEE.

Mede `GET /api/data` (payload que COFFEE > Verificar consome) e os endpoints
`/api/coffee/*` com planilhas sintéticas de 500 / 2000 / 5000 notas, para
comparar antes/depois de uma mudança sem depender da base de produção.

Roda isolado: INPUT/COFFEE/CARTEIRA_DATA_DIR apontam para um tmp descartável,
então não toca `backend/data/` nem a rede.

    cd backend && .venv/Scripts/python.exe perf_coffee.py
"""
import io
import json
import os
import tempfile
import time

_tmp = tempfile.mkdtemp(prefix="edp_perf_")
for _var in ("INPUT_DATA_DIR", "COFFEE_DATA_DIR", "CARTEIRA_DATA_DIR"):
    os.environ[_var] = _tmp

import pandas as pd  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from coffee_module import db as coffee_db  # noqa: E402

TAMANHOS = (500, 2000, 5000)
COLUNAS_CHK = ["chk_coordenada", "chk_imagens", "chk_referencia", "chk_poste",
               "chk_tipo", "chk_prioridade", "chk_duplicada"]
# A planilha real traz dezenas de colunas que o frontend não lê — é justamente
# o peso que `main.slim_raw` corta.
COLUNAS_EXTRAS = [f"col_extra_{i}" for i in range(30)]


def montar_planilha(quantidade: int) -> bytes:
    linhas = []
    for i in range(quantidade):
        linha = {
            "id": 100000000 + i,
            "prioridade": (i % 6) + 1,
            "tipo_nota": "Manutencao corretiva rede aerea",
            "referencia_fisica": f"SER-{i % 90:02d}",
            "uf": "SP" if i % 2 else "ES",
            "setor": f"Setor {i % 12}",
            "latitude": -20.3 + (i % 100) / 1000,
            "longitude": -40.3 + (i % 100) / 1000,
            "precisao": "GPS",
            "postes": f"TR-{i % 999:03d}",
            "componente": "CONDUTOR",
            "sintoma": "AFROUXADO",
            "causa": "INTEMPERIE",
        }
        for coluna in COLUNAS_CHK:
            linha[coluna] = "ok" if i % 3 else "falha detectada"
        if i % 7 == 0 and i > 0:
            linha["chk_duplicada"] = f"{100000000 + i - 1} / {100000000 + i - 2}"
        for coluna in COLUNAS_EXTRAS:
            linha[coluna] = f"valor {coluna} {i}"
        linhas.append(linha)
    buffer = io.BytesIO()
    pd.DataFrame(linhas).to_excel(buffer, index=False)
    return buffer.getvalue()


def semear_coffee(quantidade: int) -> None:
    coffee_db.inicializar_banco()
    conn = coffee_db.get_db_connection()
    dados = json.dumps({"local_instalacao": "SER-01-TR-001", "descricao": "x" * 120})
    conn.executemany(
        "INSERT OR REPLACE INTO notas_coffee "
        "(pk, id_sap, arquivado, classificacao, dados_json, buscado_em, a_gerar, origem) "
        "VALUES (?,?,?,?,?,?,?,?)",
        [(100000000 + i, 10000000 if i % 2 else 500000 + i, 0,
          "nao_gerada" if i % 2 else "gerada", dados, "2026-07-31T10:00:00",
          1 if i % 2 else 0, "verificar") for i in range(quantidade)],
    )
    conn.commit()
    conn.close()


def cronometrar(rotulo: str, chamada, repeticoes: int = 3) -> None:
    tempos, tamanho = [], 0
    for _ in range(repeticoes):
        inicio = time.perf_counter()
        resposta = chamada()
        tempos.append((time.perf_counter() - inicio) * 1000)
        tamanho = len(resposta.content)
        if resposta.status_code != 200:
            raise RuntimeError(f"{rotulo}: HTTP {resposta.status_code}")
    mediana = sorted(tempos)[len(tempos) // 2]
    print(f"[COFFEE-PERF] {rotulo:<40} min={min(tempos):8.1f}ms  "
          f"mediana={mediana:8.1f}ms  payload={tamanho / 1024:9.1f} KB")


def executar() -> None:
    cliente = TestClient(main.app)
    for quantidade in TAMANHOS:
        resposta = cliente.post(
            "/api/upload",
            files={"file": ("planilha.xlsx", montar_planilha(quantidade))})
        if resposta.status_code != 200:
            raise RuntimeError(f"upload falhou: {resposta.text}")
        print(f"\n===== planilha com {quantidade} notas =====")
        cronometrar(f"GET /api/data ({quantidade})", lambda: cliente.get("/api/data"))

    for quantidade in TAMANHOS:
        semear_coffee(quantidade)
        print(f"\n===== coffee.db com {quantidade} notas =====")
        cronometrar(f"GET /api/coffee/notas ({quantidade})",
                    lambda: cliente.get("/api/coffee/notas"))
        cronometrar(f"GET /api/coffee/operacao ({quantidade})",
                    lambda: cliente.get("/api/coffee/operacao"))


if __name__ == "__main__":
    executar()
