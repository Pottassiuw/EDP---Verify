# Módulo Input — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o painel Streamlit de Gestão de Notas (pasta `Input/`) para o EDP-Verify como módulo nativo: backend FastAPI (`backend/input_module/`) + seção React (`frontend/src/input/`).

**Architecture:** O backend ganha um pacote isolado com banco SQLite local, motor de enriquecimento que cruza o banco com Excels da rede EDP, e um `APIRouter` em `/api/input/*`. O frontend ganha a seção "Input" na sidebar com 5 sub-abas. A spec aprovada está em `docs/superpowers/specs/2026-06-11-input-module-design.md`.

**Tech Stack:** FastAPI, pandas, openpyxl, SQLite (stdlib `sqlite3`), React 18 + TypeScript, TanStack Query. **Nenhuma dependência nova** em nenhum dos lados.

**Fonte do porte:** os arquivos `Input/app.py`, `Input/config.py`, `Input/database.py`, `Input/processamento.py` estão no repositório. Quando uma etapa diz "porte de `Input/x.py:N-M`", abra o arquivo e copie aquele trecho aplicando os deltas listados — isso é parte da etapa, não opcional.

**Comandos de verificação:**
- Backend: `cd backend; python -m pytest test_input_module.py -v` (Windows/PowerShell)
- Frontend: `cd frontend; npm run build`

---

## Estrutura de arquivos

```
backend/
├── input_module/
│   ├── __init__.py        (vazio)
│   ├── config.py          dicionários + caminhos (porte de Input/config.py, sem Streamlit)
│   ├── db.py              SQLite local: schema, migração, CRUD, logs, undo, backups
│   ├── engine.py          enriquecimento (porte de Input/processamento.py) + auditoria + cache + cópia Excel
│   └── routes.py          APIRouter /api/input/*
├── data/                  (criado em runtime; .gitignore)
│   ├── notas_departamento.db
│   ├── config_responsaveis.json
│   └── backups/
├── test_input_module.py   testes do módulo (pytest, padrão do projeto: testes na raiz de backend/)
└── main.py                (modificar: incluir router)

frontend/src/
├── types.ts               (modificar: AppSection += "input")
├── App.tsx                (modificar: navegação destravada)
├── components/sidebar.tsx (modificar: botão Input)
└── input/
    ├── types.ts           tipos do módulo
    ├── api.ts             cliente /api/input/* + identidade X-User
    ├── lib.ts             funções puras: filtros, calculadora, ordenação de datas, parse TSV
    ├── columns.ts         definição das colunas (chave, rótulo, tipo, editável)
    ├── use-input-data.ts  hooks TanStack Query (dataset + sync polling)
    ├── input-section.tsx  casca da seção + sub-abas + aviso de sincronização
    ├── notes-table.tsx    tabela virtualizada com ordenação/seleção/edição
    ├── filters.tsx        busca global + filtros avançados + calculadora
    ├── overview.tsx       aba Visão Geral (tabela leitura + export)
    ├── manage.tsx         aba Gerenciar (edição/lote/exclusão/cadastro/colagem/undo)
    ├── reports.tsx        aba Relatórios (auditoria, KPIs, rosca SVG)
    ├── logs.tsx           aba Logs (notas, arquivos, linha do tempo)
    ├── settings.tsx       aba Configurações (responsáveis, bases, backups, nome)
    └── identity-modal.tsx modal "quem é você?"
```

Convenções do backend: módulos importados como top-level (`from input_module import db`) porque o uvicorn/pytest rodam de dentro de `backend/`. Caminhos de teste sobrescritos por variável de ambiente `INPUT_DATA_DIR`.

---

## FASE 1 — Backend núcleo

### Task 1: `config.py` do módulo (dicionários e caminhos)

**Files:**
- Create: `backend/input_module/__init__.py`
- Create: `backend/input_module/config.py`
- Test: `backend/test_input_module.py`
- Modify: `.gitignore`

- [ ] **Step 1: Criar o pacote e o config**

Criar `backend/input_module/__init__.py` vazio.

Criar `backend/input_module/config.py` com esta estrutura (os dicionários grandes são porte literal de `Input/config.py` — copiar o conteúdo exato das linhas indicadas):

```python
"""Dicionários de domínio e caminhos do módulo Input.

Porte de Input/config.py, sem dependência de Streamlit.
"""
import os
from pathlib import Path

# ── Caminhos locais ──────────────────────────────────────────────────────


def data_dir() -> Path:
    """Diretório de dados local (sobrescritível por env para testes)."""
    return Path(os.environ.get("INPUT_DATA_DIR", str(Path(__file__).resolve().parent.parent / "data")))


# ── Caminhos da rede EDP ─────────────────────────────────────────────────
REDE_RAIZ = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM"
REDE_INPUT_SQL = REDE_RAIZ + r"\INPUT SQL"

REDE_DB_ORIGEM = REDE_INPUT_SQL + r"\notas_departamento.db"
CAMINHO_INDICADOR_CONTINUIDADE = REDE_INPUT_SQL + r"\Indicador base conjunto - Limite Aneel.xlsx"
CAMINHO_BASE_IW28 = REDE_INPUT_SQL + r"\Gerada_base_IW28.XLSX"
CAMINHO_CUSTO_ORD_IW38 = REDE_INPUT_SQL + r"\Gerada_custo_ord_IW38.XLSX"
CAMINHO_CLIENTES_CONJUNTO = REDE_INPUT_SQL + r"\Clientes_Conjunto.xlsx"
CAMINHO_CUSTO_MODULAR = REDE_INPUT_SQL + r"\Custo_Modular.xlsx"
CAMINHO_GANHOS = REDE_INPUT_SQL + r"\Ganhos.xlsx"
CAMINHO_TABLE1 = REDE_INPUT_SQL + r"\Table1.xlsx"
CAMINHO_PROJETO_CONSTRUCAO = REDE_RAIZ + r"\config_projeto_construcao.json"
CAMINHO_COPIA_EXCEL = REDE_INPUT_SQL + r"\Base_Notas_Sincronizada.xlsx"

# Bases lidas pelo motor (para o meta.bases da API)
BASES_REDE = {
    "Extração SAP IW28 (Notas)": CAMINHO_BASE_IW28,
    "Extração SAP IW38 (Ordens)": CAMINHO_CUSTO_ORD_IW38,
    "Indicador de Continuidade (Limite ANEEL)": CAMINHO_INDICADOR_CONTINUIDADE,
    "Clientes por Conjunto": CAMINHO_CLIENTES_CONJUNTO,
    "Custos Modulares e Sazonalidade": CAMINHO_CUSTO_MODULAR,
    "Ganhos (CHI-Conjunto)": CAMINHO_GANHOS,
    "Históricos (Table1)": CAMINHO_TABLE1,
}

# Bases gerenciáveis pela aba Configurações (download/upload) — Input/app.py:792-798
BASES_APOIO = {
    "Indicador de Continuidade (Limite ANEEL)": CAMINHO_INDICADOR_CONTINUIDADE,
    "Clientes por Conjunto": CAMINHO_CLIENTES_CONJUNTO,
    "Custos Modulares e Sazonalidade": CAMINHO_CUSTO_MODULAR,
    "Ganhos (CHI-Conjunto)": CAMINHO_GANHOS,
    "Históricos (Table1 - 12M e 3M)": CAMINHO_TABLE1,
}

# ── Dicionários de domínio (porte literal de Input/config.py) ────────────
STATUS_MAP = { ... }          # copiar de Input/config.py:14-25
INV_STATUS_MAP = {v: k for k, v in STATUS_MAP.items()}
DE_PARA_CIDADES = { ... }     # copiar de Input/config.py:29-61
DE_PARA_REGIONAL = { ... }    # copiar de Input/config.py:64-96
DE_PARA_CJ_ANEEL = { ... }    # copiar de Input/config.py:137-213
MAP_FILTROS = { ... }         # copiar de Input/config.py:226-271
MAP_ORDEM_EXECUTADA = { ... } # copiar de Input/config.py:274-300
MAP_REGIONAL_CSD = { ... }    # copiar de Input/config.py:303-362

PRIORIDADES = ["Emergente", "Urgente", "Importante", "Prioritário",
               "Programável", "Informativo", "Protheus", "Nota Projetos"]

# Responsáveis padrão (Input/database.py:87-91) e projeto construção padrão
# (Input/database.py:106-120 — copiar literal)
DE_PARA_RESPONSAVEIS_PADRAO = {
    "Poa": "Danilo", "Suzano": "Danilo", "São José dos Campos": "James",
    "Guaratinguetá": "Danilo", "Litoral Norte": "Danilo", "Guarulhos": "James",
    "Mogi das Cruzes": "Fabricio",
}
MAP_PROJETO_CONSTRUCAO_PADRAO = { ... }  # copiar de Input/database.py:106-120

# Nomes amigáveis de coluna para exports (Input/app.py:67-84, mesma lógica)
NOMES_AMIGAVEIS = {v: k for k, v in MAP_FILTROS.items()}
NOMES_AMIGAVEIS.update({
    "Numero_Nota": "Nº Nota (ID)", "Status_Nota": "Status Nota",
    "Prioridade_Nota": "Prioridade Nota", "Status_Obra": "Status Obra",
    "Planejado_DDPM": "Planejado", "Local_Instalacao": "Local Instalação",
    "Mes_Execucao_Planejado": "Mês Execução Planejado",
    "substacao_conjunto": "Subestação Conj", "CJ_Aneel": "Cj. Aneel",
    "Check": "Check", "Observacao": "Observação",
    "Centro_Responsavel": "Centro de Trabalho Responsável",
    "Total_planejado_ordem": "Total Planejado Ordem (R$)",
    "Total_real_ordem": "Total Real Ordem (R$)", "Modular": "Modular (R$)",
})

# Colunas exibidas/exportadas na ordem do painel (Input/app.py:172-179 — copiar literal)
COLUNAS_PAINEL = [ ... ]
```

Os `{ ... }`/`[ ... ]` acima indicam porte literal das linhas citadas — sem alterar chaves nem valores. Nenhum `import streamlit` deve sobrar.

- [ ] **Step 2: Escrever teste de sanidade**

Criar `backend/test_input_module.py`:

```python
"""Testes do módulo Input (backend)."""
from input_module import config


def test_config_dicionarios_completos():
    assert config.STATUS_MAP[99] == "99 Encerrado"
    assert config.STATUS_MAP[0] == "00 Pendente"
    assert config.INV_STATUS_MAP["99 Encerrado"] == 99
    assert config.DE_PARA_REGIONAL["045"] == "Guarulhos"
    assert config.DE_PARA_CIDADES["130"] == "Mogi das Cruzes - SP"
    assert config.DE_PARA_CJ_ANEEL["POA"] == "POA"
    assert config.MAP_FILTROS["Status"] == "Status_Nota"
    assert config.MAP_ORDEM_EXECUTADA["JAND INVE"] == "SIM"
    assert config.MAP_REGIONAL_CSD["POA"] == "Poa/Suzano"
    assert len(config.BASES_REDE) == 7
    assert len(config.BASES_APOIO) == 5
    assert "Emergente" in config.PRIORIDADES
    assert config.NOMES_AMIGAVEIS["Numero_Nota"] == "Nº Nota (ID)"
    assert "Numero_Nota" in config.COLUNAS_PAINEL


def test_data_dir_respeita_env(monkeypatch, tmp_path):
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path))
    assert config.data_dir() == tmp_path
```

- [ ] **Step 3: Rodar os testes**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: 2 PASSED

- [ ] **Step 4: Ignorar a pasta de dados no git**

Adicionar ao `.gitignore` na raiz do repo:

```
backend/data/
```

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/ backend/test_input_module.py .gitignore
git commit -m "feat(input): config do modulo (dicionarios e caminhos)"
```

### Task 2: `db.py` — conexão, schema e migração inicial

**Files:**
- Create: `backend/input_module/db.py`
- Test: `backend/test_input_module.py`

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_input_module.py`:

```python
import sqlite3

import pytest


@pytest.fixture
def banco_temporario(monkeypatch, tmp_path):
    """Aponta o módulo para um diretório de dados temporário e inicializa o banco."""
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path))
    from input_module import db
    db.inicializar_banco()
    return tmp_path


def test_inicializar_banco_cria_tabelas(banco_temporario):
    from input_module import db
    conn = db.get_db_connection()
    tabelas = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert {"notas", "log_alteracoes", "log_arquivos"} <= tabelas
    assert "bloqueios" not in tabelas  # fora do escopo (spec)


def test_migracao_copia_banco_da_rede(monkeypatch, tmp_path):
    from input_module import config, db
    # Simula o banco "da rede" como um sqlite real noutro tmp
    origem = tmp_path / "rede.db"
    conn = sqlite3.connect(origem)
    conn.execute("CREATE TABLE notas (Numero_Nota INTEGER PRIMARY KEY)")
    conn.execute("INSERT INTO notas VALUES (123)")
    conn.commit(); conn.close()
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "dados"))
    monkeypatch.setattr(config, "REDE_DB_ORIGEM", str(origem))
    resultado = db.migrar_da_rede_se_preciso()
    assert resultado == "migrado"
    conn = db.get_db_connection()
    assert conn.execute("SELECT COUNT(*) FROM notas").fetchone()[0] == 1
    conn.close()
    # Segunda chamada: banco já existe, não migra de novo
    assert db.migrar_da_rede_se_preciso() == "ja-existe"


def test_migracao_sem_rede_retorna_indisponivel(monkeypatch, tmp_path):
    from input_module import config, db
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(config, "REDE_DB_ORIGEM", str(tmp_path / "nao_existe.db"))
    assert db.migrar_da_rede_se_preciso() == "rede-indisponivel"
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: FAIL — `ModuleNotFoundError`/`AttributeError` (db não existe)

- [ ] **Step 3: Implementar**

Criar `backend/input_module/db.py`:

```python
"""Persistência local do módulo Input (SQLite).

Porte de Input/database.py com banco LOCAL (backend/data/) em vez do
arquivo compartilhado na rede. Tabela `bloqueios` não foi portada (sem uso).
"""
import datetime
import glob
import json
import os
import re
import shutil
import sqlite3

import pandas as pd

from input_module import config
from input_module.config import DE_PARA_CIDADES, INV_STATUS_MAP, STATUS_MAP


def obter_caminho_banco() -> str:
    return str(config.data_dir() / "notas_departamento.db")


def get_db_connection() -> sqlite3.Connection:
    config.data_dir().mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(obter_caminho_banco(), timeout=30, check_same_thread=False)
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def migrar_da_rede_se_preciso() -> str:
    """Primeira execução: copia o banco da rede para o diretório local.

    Retorna "ja-existe", "migrado" ou "rede-indisponivel".
    """
    destino = obter_caminho_banco()
    if os.path.exists(destino):
        return "ja-existe"
    if not os.path.exists(config.REDE_DB_ORIGEM):
        return "rede-indisponivel"
    config.data_dir().mkdir(parents=True, exist_ok=True)
    shutil.copy2(config.REDE_DB_ORIGEM, destino)
    return "migrado"


def inicializar_banco() -> None:
    ...
```

`inicializar_banco`: porte de `Input/database.py:138-205` com deltas:
- remover o bloco `CREATE TABLE bloqueios` (linhas 163-169);
- manter `notas`, `log_alteracoes`, `log_arquivos` e o bloco ALTER TABLE defensivo (193-202) exatamente como estão.

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: 5 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/db.py backend/test_input_module.py
git commit -m "feat(input): banco local com schema e migracao da rede"
```

### Task 3: `db.py` — CRUD, logs, undo, backups, edição com diff

**Files:**
- Modify: `backend/input_module/db.py`
- Test: `backend/test_input_module.py`

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_input_module.py`:

```python
import pandas as pd


def _nota(numero=1000, **extras):
    base = {
        "ID_Cronologia": 1, "Numero_Nota": numero, "Status_Obra": "-",
        "Conjunto": "POA", "Circuito": "POA 123", "Local_Instalacao": "045 RL TESTE",
        "Regional": "Guarulhos", "Planejado_DDPM": 2.0,
        "Mes_Execucao_Planejado": "jun-2026", "Data_Envio_Projeto": "01/06/2026",
        "Status_Nota": "10 Em planejamento", "Prioridade_Nota": "Programável",
        "Observacao": "", "Check": "-", "Status_Anterior": "-",
        "Centro_Responsavel": "-",
    }
    base.update(extras)
    return base


def test_upsert_e_carregar(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(1000), _nota(1001, Conjunto="SUZANO")]))
    df = db.carregar_dados()
    assert len(df) == 2
    # carregar_dados devolve o status como texto e a cidade derivada
    linha = df[df["Numero_Nota"] == 1000].iloc[0]
    assert linha["Status_Nota"] == "10 Em planejamento"
    assert linha["Cidade"] == "Guarulhos"
    # upsert: salvar de novo a mesma nota não duplica
    db.salvar_em_massa(pd.DataFrame([_nota(1000, Observacao="editada")]))
    df = db.carregar_dados()
    assert len(df) == 2
    assert df[df["Numero_Nota"] == 1000].iloc[0]["Observacao"] == "editada"


def test_aplicar_edicoes_gera_diff_log_e_status_anterior(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    resultado = db.aplicar_edicoes(
        [{"Numero_Nota": 2000, "Status_Nota": "99 Encerrado", "Observacao": "feita"}],
        usuario="tester")
    assert resultado["alteradas"] == 1
    assert resultado["campos"] == 2
    df = db.carregar_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert linha["Status_Nota"] == "99 Encerrado"
    assert linha["Status_Anterior"] == "10"  # status antigo preservado (numérico)
    logs = db.carregar_logs()
    assert set(logs["Campo_Alterado"]) == {"Status_Nota", "Observacao"}
    assert logs.iloc[0]["Usuario"] == "tester"
    # Editar sem mudar nada não grava log
    resultado = db.aplicar_edicoes([{"Numero_Nota": 2000, "Observacao": "feita"}], usuario="tester")
    assert resultado["alteradas"] == 0


def test_aplicar_edicoes_nota_inexistente_da_erro(banco_temporario):
    from input_module import db
    with pytest.raises(ValueError):
        db.aplicar_edicoes([{"Numero_Nota": 999999, "Observacao": "x"}], usuario="t")


def test_reverter_ultima_alteracao(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(3000)]))
    db.aplicar_edicoes([{"Numero_Nota": 3000, "Status_Nota": "99 Encerrado"}], usuario="t")
    ok, _msg = db.reverter_ultima_alteracao()
    assert ok
    df = db.carregar_dados()
    assert df[df["Numero_Nota"] == 3000].iloc[0]["Status_Nota"] == "10 Em planejamento"
    # Log da reversão é removido (Ctrl+Z infinito): novo undo não tem o que desfazer
    ok, _msg = db.reverter_ultima_alteracao()
    assert not ok


def test_deletar_notas(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(4000), _nota(4001)]))
    assert db.deletar_notas([4000]) == 1
    assert list(db.carregar_dados()["Numero_Nota"]) == [4001]


def test_backup_rotativo(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(5000)]))
    db.realizar_backup(limite=20, intervalo_horas=0)
    pasta = config_backups_dir()
    arquivos = list(pasta.glob("notas_departamento_*.db"))
    assert len(arquivos) == 1
    # Dentro do intervalo, não cria segundo backup
    db.realizar_backup(limite=20, intervalo_horas=2)
    assert len(list(pasta.glob("notas_departamento_*.db"))) == 1


def config_backups_dir():
    from input_module import config
    return config.data_dir() / "backups"


def test_responsaveis_roundtrip(banco_temporario):
    from input_module import db
    padrao = db.carregar_responsaveis()
    assert padrao["Poa"] == "Danilo"
    db.salvar_responsaveis({"Poa": "Maria"})
    assert db.carregar_responsaveis() == {"Poa": "Maria"}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: FAIL — `AttributeError` nas funções novas

- [ ] **Step 3: Implementar**

Em `backend/input_module/db.py`, portar de `Input/database.py` com os deltas indicados:

| Função | Origem | Deltas |
|---|---|---|
| `carregar_dados()` | `Input/database.py:208-274` | nenhum (cópia fiel) |
| `status_para_int()` | `Input/database.py:284-301` | nenhum |
| `salvar_em_massa(df)` | `Input/database.py:304-361` | `realizar_backup()` agora é chamada síncrona (sem thread) |
| `salvar_log_alteracoes(logs)` | `Input/database.py:364-385` | nenhum |
| `carregar_logs()` | `Input/database.py:276-282` | nenhum |
| `deletar_notas(lista)` | `Input/database.py:388-414` | `realizar_backup()` síncrono |
| `reverter_ultima_alteracao()` | `Input/database.py:417-461` | `realizar_backup()` síncrono |
| `obter_data_ultima_alteracao()` | `Input/database.py:463-475` | nenhum |
| `salvar_log_arquivo(...)` / `carregar_log_arquivos()` | `Input/database.py:477-496` | nenhum |
| `realizar_backup(limite=20, intervalo_horas=2)` | `Input/database.py:42-82` (`_realizar_backup_interno`) | vira a própria `realizar_backup` (sem thread — quem decide rodar em background é a rota, via `BackgroundTasks`); recebe `limite`/`intervalo_horas` como parâmetros |
| `carregar_projeto_construcao()` | `Input/database.py:122-132` | se o JSON da rede não existir, **retorna o padrão sem tentar gravar na rede** (`config.MAP_PROJETO_CONSTRUCAO_PADRAO`) |

Responsáveis agora são locais (decisão da spec):

```python
def _caminho_responsaveis() -> str:
    return str(config.data_dir() / "config_responsaveis.json")


def carregar_responsaveis() -> dict:
    caminho = _caminho_responsaveis()
    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    return dict(config.DE_PARA_RESPONSAVEIS_PADRAO)


def salvar_responsaveis(novo: dict) -> None:
    config.data_dir().mkdir(parents=True, exist_ok=True)
    with open(_caminho_responsaveis(), "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=4)
```

E a função nova de edição com diff no servidor (substitui a lógica de
`Input/app.py:537-610`, que era feita na tela):

```python
# Campos que o usuário pode editar pela UI (Input/app.py:540)
CAMPOS_EDITAVEIS = [
    "Status_Nota", "Prioridade_Nota", "Planejado_DDPM", "Observacao",
    "Status_Obra", "Conjunto", "Circuito", "Local_Instalacao",
    "Mes_Execucao_Planejado", "Data_Envio_Projeto", "Check",
]


def aplicar_edicoes(linhas: list, usuario: str) -> dict:
    """Aplica edições parciais: diff campo a campo, log e upsert.

    Cada item de `linhas` é um dict com Numero_Nota + os campos editados.
    A comparação usa a MESMA representação formatada de carregar_dados()
    (status como texto, datas formatadas), que é o que a UI exibe e envia.
    """
    df_banco = carregar_dados()
    if df_banco.empty:
        raise ValueError("Banco vazio: nenhuma nota para editar.")
    df_banco = df_banco.set_index("Numero_Nota", drop=False)

    agora = datetime.datetime.now()
    logs, registros_alterados = [], []
    for linha in linhas:
        numero = int(linha["Numero_Nota"])
        if numero not in df_banco.index:
            raise ValueError(f"Nota {numero} não existe no banco.")
        original = df_banco.loc[numero]
        mudancas = {}
        for campo in CAMPOS_EDITAVEIS:
            if campo not in linha:
                continue
            novo = "" if linha[campo] is None else str(linha[campo]).strip()
            antigo = "" if pd.isna(original.get(campo)) else str(original.get(campo)).strip()
            if novo != antigo:
                mudancas[campo] = linha[campo]
                logs.append((numero, usuario, agora, campo, antigo, novo))
        if not mudancas:
            continue
        registro = original.to_dict()
        registro.update(mudancas)
        if "Status_Nota" in mudancas:
            registro["Status_Anterior"] = original["Status_Nota"]
        if "Local_Instalacao" in mudancas:
            registro["Regional"] = config.DE_PARA_REGIONAL.get(
                str(mudancas["Local_Instalacao"])[:3], "-")
        registros_alterados.append(registro)

    if registros_alterados:
        salvar_log_alteracoes(logs)
        salvar_em_massa(pd.DataFrame(registros_alterados))
    return {"alteradas": len(registros_alterados), "campos": len(logs)}
```

Detalhe do teste `Status_Anterior == "10"`: `salvar_em_massa` converte
`Status_Anterior` para o código numérico via `status_para_int` (comportamento
do original), e a normalização para texto exibível acontece no engine
(`Input/processamento.py:29-34`), não em `carregar_dados`. Como o teste lê
direto de `carregar_dados`, o valor cru pode vir como `"10"` ou `"10.0"`
dependendo da tipagem do SQLite — se vier `"10.0"`, use a asserção
`str(linha["Status_Anterior"]).startswith("10")` no teste (não altere a
implementação por causa disso).

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: 12 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/db.py backend/test_input_module.py
git commit -m "feat(input): CRUD, logs, undo, backups e edicao com diff"
```

### Task 4: `engine.py` — enriquecimento, auditoria, cache e cópia Excel

**Files:**
- Create: `backend/input_module/engine.py`
- Test: `backend/test_input_module.py`

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_input_module.py`:

```python
def _excel_iw28(caminho):
    pd.DataFrame({
        "Nota": [2000], "Status usuário": ["LIBE"],
        "CenTrabalho princ.": ["CT-01"], "Ordem": [777],
        "Encerram.por data": [pd.Timestamp("2026-05-10")],
    }).to_excel(caminho, index=False)


def _excel_iw38(caminho):
    pd.DataFrame({
        "Ordem": [777], "Status usuário": ["JAND INVE"],
        "Status do sistema": ["ENTE"], "Total planejado": [1000.0],
        "Total real": [800.0],
    }).to_excel(caminho, index=False)


@pytest.fixture
def engine_isolado(banco_temporario, monkeypatch, tmp_path):
    """Banco temporário + caminhos de rede apontando para tmp (inexistentes por padrão)."""
    from input_module import config, engine
    for attr in ["CAMINHO_INDICADOR_CONTINUIDADE", "CAMINHO_BASE_IW28",
                 "CAMINHO_CUSTO_ORD_IW38", "CAMINHO_CLIENTES_CONJUNTO",
                 "CAMINHO_CUSTO_MODULAR", "CAMINHO_GANHOS", "CAMINHO_TABLE1",
                 "CAMINHO_PROJETO_CONSTRUCAO"]:
        monkeypatch.setattr(config, attr, str(tmp_path / f"{attr}.xlsx"))
    monkeypatch.setattr(config, "BASES_REDE", {
        "IW28": config.CAMINHO_BASE_IW28, "IW38": config.CAMINHO_CUSTO_ORD_IW38})
    engine.invalidar_cache()
    return tmp_path


def test_engine_fallbacks_sem_rede(engine_isolado):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    df = engine.enriquecer_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert linha["Export_status"] == "Pendente Extração SAP"
    assert linha["Conj.critico"] == "-"
    assert linha["Cidade"] == "Guarulhos"
    assert "Auditoria_Cronograma" in df.columns


def test_engine_cruza_iw28_iw38(engine_isolado):
    from input_module import config, db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000, Status_Nota="99 Encerrado")]))
    _excel_iw28(config.CAMINHO_BASE_IW28)
    _excel_iw38(config.CAMINHO_CUSTO_ORD_IW38)
    df = engine.enriquecer_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert linha["Export_status"] == "LIBE"
    assert linha["Ordem"] == "777"
    assert linha["Ordem_Executada"] == "SIM"
    assert float(linha["Total_real_ordem"]) == 800.0
    assert float(linha["Exec_percentagem_ordem"]) == pytest.approx(80.0)


def test_auditoria_cronograma(engine_isolado):
    from input_module import config, db, engine
    # Nota encerrada (99) com encerramento SAP (mai-2026) ANTES do planejado (jun-2026)
    db.salvar_em_massa(pd.DataFrame([_nota(2000, Status_Nota="99 Encerrado")]))
    _excel_iw28(config.CAMINHO_BASE_IW28)
    _excel_iw38(config.CAMINHO_CUSTO_ORD_IW38)
    df = engine.enriquecer_dados()
    assert df.iloc[0]["Auditoria_Cronograma"] == "🟢 Adiantado"


def test_cache_e_invalidacao(engine_isolado):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    df1 = engine.get_dataset()
    db.salvar_em_massa(pd.DataFrame([_nota(2001)]))
    assert len(engine.get_dataset()) == len(df1)  # cache segura
    engine.invalidar_cache()
    assert len(engine.get_dataset()) == len(df1) + 1


def test_status_bases(engine_isolado):
    from input_module import config, engine
    _excel_iw28(config.CAMINHO_BASE_IW28)
    bases = engine.status_bases()
    por_nome = {b["nome"]: b for b in bases}
    assert por_nome["IW28"]["encontrada"] is True
    assert por_nome["IW38"]["encontrada"] is False
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: FAIL — engine não existe

- [ ] **Step 3: Implementar**

Criar `backend/input_module/engine.py`. Corpo principal: porte de
`Input/processamento.py:1-385` (função `puxar_dados_completos_da_rede`
renomeada para `enriquecer_dados`) com estes deltas obrigatórios:

1. Remover `import streamlit as st`; as duas ocorrências de `st.error(...)`
   (`processamento.py:296` e `:344`) viram `print(...)`.
2. Imports: `from input_module import config` e
   `from input_module.db import carregar_dados, carregar_projeto_construcao`.
3. Todos os caminhos de rede hardcoded dentro da função
   (`processamento.py:84-85, 137, 224, 314, 347`) viram `config.CAMINHO_*`
   (o módulo deve ler `config.<attr>` no momento da chamada — não fazer
   `from config import CAMINHO_X` — para o monkeypatch dos testes funcionar).
4. `CAMINHO_INDICADOR_CONTINUIDADE`, `DE_PARA_CJ_ANEEL`, `DE_PARA_CIDADES`,
   `MAP_ORDEM_EXECUTADA`, `MAP_REGIONAL_CSD`, `MAP_FILTROS` vêm de `config`.
5. Ao final, antes do `return df`, acrescentar a coluna de auditoria:

```python
    df["Auditoria_Cronograma"] = df.apply(avaliar_prazo_sap, axis=1)
    return df
```

Acrescentar ao módulo (porte de `Input/app.py:51` e `Input/app.py:925-994`):

```python
meses_pt_rev = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "maio": 5, "jun": 6,
                "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}


def avaliar_prazo_sap(row):
    ...  # porte literal de Input/app.py:925-994 (função inteira, sem alterações)
```

Cache + meta:

```python
import threading
import time

_CACHE_TTL_SEGUNDOS = 600
_cache = {"df": None, "quando": 0.0}
_cache_lock = threading.Lock()


def get_dataset(forcar: bool = False) -> pd.DataFrame:
    with _cache_lock:
        expirado = time.time() - _cache["quando"] > _CACHE_TTL_SEGUNDOS
        if forcar or _cache["df"] is None or expirado:
            _cache["df"] = enriquecer_dados()
            _cache["quando"] = time.time()
        return _cache["df"]


def invalidar_cache() -> None:
    with _cache_lock:
        _cache["df"] = None


def status_bases() -> list:
    bases = []
    for nome, caminho in config.BASES_REDE.items():
        existe = os.path.exists(caminho)
        bases.append({
            "nome": nome,
            "arquivo": os.path.basename(caminho),
            "encontrada": existe,
            "modificada": datetime.datetime.fromtimestamp(
                os.path.getmtime(caminho)).isoformat() if existe else None,
        })
    return bases
```

E a cópia Excel da rede — porte de `Input/processamento.py:387-433`
(`gerar_copia_excel_rede`) com deltas: usa `enriquecer_dados()`, a lista de
colunas vem de `config.COLUNAS_PAINEL`, o mapa de nomes vem de
`config.NOMES_AMIGAVEIS`, o destino é `config.CAMINHO_COPIA_EXCEL`, e o corpo
inteiro fica num `try/except Exception` que faz `print` do erro (rede fora do
ar não pode derrubar a requisição que disparou a task).

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: 17 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/engine.py backend/test_input_module.py
git commit -m "feat(input): motor de enriquecimento com auditoria, cache e copia excel"
```

### Task 5: `routes.py` — endpoints de leitura + montagem no app

**Files:**
- Create: `backend/input_module/routes.py`
- Modify: `backend/main.py` (após os endpoints existentes, antes do mount estático)
- Test: `backend/test_input_module.py`

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_input_module.py`:

```python
from fastapi.testclient import TestClient


@pytest.fixture
def cliente(engine_isolado):
    from main import app
    return TestClient(app)


def test_get_notas_traz_registros_e_meta(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    from input_module import engine
    engine.invalidar_cache()
    r = cliente.get("/api/input/notas")
    assert r.status_code == 200
    corpo = r.json()
    assert len(corpo["registros"]) == 1
    assert corpo["registros"][0]["Numero_Nota"] == 2000
    meta = corpo["meta"]
    assert "99 Encerrado" in meta["status_opcoes"]
    assert "Emergente" in meta["prioridade_opcoes"]
    assert isinstance(meta["bases"], list)
    assert "ultima_alteracao" in meta
    assert meta["migracao"] in ("ja-existe", "migrado", "rede-indisponivel")


def test_get_sync(cliente):
    r = cliente.get("/api/input/sync")
    assert r.status_code == 200
    assert "ultima_alteracao" in r.json()


def test_get_logs_e_timeline(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    db.aplicar_edicoes([{"Numero_Nota": 2000, "Observacao": "oi"}], usuario="ana")
    assert len(cliente.get("/api/input/logs").json()["registros"]) == 1
    assert len(cliente.get("/api/input/logs/nota/2000").json()["registros"]) == 1
    assert cliente.get("/api/input/logs/nota/999").json()["registros"] == []
    assert cliente.get("/api/input/logs/arquivos").json()["registros"] == []
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: FAIL — 404 nas rotas

- [ ] **Step 3: Implementar**

Criar `backend/input_module/routes.py`:

```python
"""Rotas /api/input/* — módulo de Gestão de Notas (Input)."""
import datetime
import io
import json

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException

from input_module import config, db, engine

router = APIRouter(prefix="/api/input")

# Estado da migração inicial (resolvido no primeiro acesso)
_migracao = {"resultado": None}


def _garantir_banco() -> str:
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
```

Em `backend/main.py`, logo antes do bloco `DIST = pathlib.Path(...)`:

```python
from input_module.routes import router as input_router

app.include_router(input_router)
```

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_input_module.py -v; python -m pytest test_upload.py -v`
Expected: todos PASSED (módulo novo + regressão dos testes existentes)

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/routes.py backend/main.py backend/test_input_module.py
git commit -m "feat(input): endpoints de leitura montados em /api/input"
```

## FASE 1 (cont.) — Endpoints de escrita e configuração

### Task 6: Endpoints de escrita (editar, criar, lote, excluir, desfazer)

**Files:**
- Modify: `backend/input_module/routes.py`
- Test: `backend/test_input_module.py`

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_input_module.py`:

```python
CABECALHO_USER = {"X-User": "ana"}


def test_escrita_exige_x_user(cliente):
    r = cliente.patch("/api/input/notas", json={"linhas": []})
    assert r.status_code == 400
    assert "X-User" in r.json()["detail"]


def test_patch_edita_e_loga(cliente):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000)]))
    engine.invalidar_cache()
    r = cliente.patch("/api/input/notas", headers=CABECALHO_USER,
                      json={"linhas": [{"Numero_Nota": 2000, "Observacao": "via api"}]})
    assert r.status_code == 200
    assert r.json()["alteradas"] == 1
    # cache foi invalidado: GET reflete a edição
    registros = cliente.get("/api/input/notas").json()["registros"]
    assert registros[0]["Observacao"] == "via api"


def test_patch_nota_inexistente_404(cliente):
    r = cliente.patch("/api/input/notas", headers=CABECALHO_USER,
                      json={"linhas": [{"Numero_Nota": 31337, "Observacao": "x"}]})
    assert r.status_code == 404


def test_post_cria_e_rejeita_duplicata(cliente):
    nova = {"Numero_Nota": 6000, "Status_Nota": "00 Pendente",
            "Prioridade_Nota": "Programável", "Local_Instalacao": "045 RL X"}
    r = cliente.post("/api/input/notas", headers=CABECALHO_USER, json=nova)
    assert r.status_code == 200
    from input_module import db
    df = db.carregar_dados()
    linha = df[df["Numero_Nota"] == 6000].iloc[0]
    assert linha["Regional"] == "Guarulhos"  # derivada do Local_Instalacao
    r = cliente.post("/api/input/notas", headers=CABECALHO_USER, json=nova)
    assert r.status_code == 409


def test_bulk_valida_duplicatas(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(7000)]))
    lote = {"notas": [
        {"Numero_Nota": 7000, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
        {"Numero_Nota": 7001, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
    ]}
    r = cliente.post("/api/input/notas/bulk", headers=CABECALHO_USER, json=lote)
    assert r.status_code == 409
    assert "7000" in r.json()["detail"]
    # Duplicata dentro do próprio lote
    lote = {"notas": [
        {"Numero_Nota": 7002, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
        {"Numero_Nota": 7002, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
    ]}
    assert cliente.post("/api/input/notas/bulk", headers=CABECALHO_USER, json=lote).status_code == 409
    # Lote válido entra com ID_Cronologia sequencial
    lote = {"notas": [
        {"Numero_Nota": 7003, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
        {"Numero_Nota": 7004, "Status_Nota": "00 Pendente", "Prioridade_Nota": "Programável"},
    ]}
    r = cliente.post("/api/input/notas/bulk", headers=CABECALHO_USER, json=lote)
    assert r.status_code == 200
    assert r.json()["inseridas"] == 2


def test_delete_e_desfazer(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(8000)]))
    cliente.patch("/api/input/notas", headers=CABECALHO_USER,
                  json={"linhas": [{"Numero_Nota": 8000, "Observacao": "antes do undo"}]})
    r = cliente.post("/api/input/desfazer", headers=CABECALHO_USER, json={})
    assert r.status_code == 200 and r.json()["ok"] is True
    r = cliente.request("DELETE", "/api/input/notas", headers=CABECALHO_USER,
                        json={"numeros": [8000]})
    assert r.status_code == 200 and r.json()["excluidas"] == 1


def test_export_gera_xlsx(cliente):
    from input_module import db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(9000)]))
    engine.invalidar_cache()
    r = cliente.post("/api/input/export",
                     json={"numeros": [9000], "colunas": ["Numero_Nota", "Status_Nota"]})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    df = pd.read_excel(io.BytesIO(r.content))
    assert list(df.columns) == ["Nº Nota (ID)", "Status Nota"]
```

(Adicionar `import io` no topo do arquivo de teste, se ainda não houver.)

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: FAIL — 404/405 nas rotas novas

- [ ] **Step 3: Implementar**

Adicionar a `backend/input_module/routes.py`:

```python
from typing import Optional

from fastapi import Depends, Response
from pydantic import BaseModel


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
    Status_Anterior: str = "-"


class LotePedido(BaseModel):
    notas: list[NovaNota]


class ExclusaoPedido(BaseModel):
    numeros: list[int]


class ExportPedido(BaseModel):
    numeros: list[int]
    colunas: list[str]


def _proximo_id_cronologia(df: pd.DataFrame) -> int:
    if df.empty or "ID_Cronologia" not in df.columns or not df["ID_Cronologia"].notna().any():
        return 1
    return int(pd.to_numeric(df["ID_Cronologia"], errors="coerce").max()) + 1


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
    base_id = _proximo_id_cronologia(df_banco)
    linhas = []
    for i, nota in enumerate(notas):
        registro = nota.model_dump()
        registro["ID_Cronologia"] = base_id + i
        registro["Regional"] = config.DE_PARA_REGIONAL.get(str(nota.Local_Instalacao)[:3], "-")
        registro["Centro_Responsavel"] = "-"
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
    excluidas = db.deletar_notas(pedido.numeros)
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
```

- [ ] **Step 4: Rodar os testes**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: todos PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/routes.py backend/test_input_module.py
git commit -m "feat(input): endpoints de escrita com diff, undo e export"
```

### Task 7: Endpoints de configuração (responsáveis, bases, backups, migração)

**Files:**
- Modify: `backend/input_module/routes.py`
- Test: `backend/test_input_module.py`

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `backend/test_input_module.py`:

```python
def test_responsaveis_api(cliente):
    r = cliente.get("/api/input/responsaveis")
    assert r.json()["Poa"] == "Danilo"
    r = cliente.put("/api/input/responsaveis", headers=CABECALHO_USER,
                    json={"Poa": "Maria"})
    assert r.status_code == 200
    assert cliente.get("/api/input/responsaveis").json() == {"Poa": "Maria"}


def test_bases_lista_download_upload(cliente, monkeypatch, tmp_path):
    from input_module import config
    caminho = tmp_path / "Clientes_Conjunto.xlsx"
    pd.DataFrame({"CONJUNTO_DESC": ["POA"], "QTDE_CONJUNTO": [10]}).to_excel(caminho, index=False)
    monkeypatch.setattr(config, "BASES_APOIO", {"Clientes por Conjunto": str(caminho)})
    r = cliente.get("/api/input/bases")
    assert r.json()["bases"][0]["encontrada"] is True
    r = cliente.get("/api/input/bases/Clientes_Conjunto.xlsx/download")
    assert r.status_code == 200
    # Upload substitui o arquivo e registra no log
    conteudo = caminho.read_bytes()
    r = cliente.post("/api/input/bases/Clientes_Conjunto.xlsx",
                     headers=CABECALHO_USER,
                     files={"arquivo": ("novo.xlsx", conteudo)})
    assert r.status_code == 200
    logs = cliente.get("/api/input/logs/arquivos").json()["registros"]
    assert logs[0]["Nome_Arquivo"] == "Clientes_Conjunto.xlsx"
    assert logs[0]["Acao"] == "Substituição"
    # Base desconhecida -> 404
    assert cliente.get("/api/input/bases/nao_existe.xlsx/download").status_code == 404


def test_backups_lista_e_download(cliente):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(9500)]))
    db.realizar_backup(limite=20, intervalo_horas=0)
    r = cliente.get("/api/input/backups")
    backups = r.json()["backups"]
    assert len(backups) == 1
    nome = backups[0]["arquivo"]
    assert cliente.get(f"/api/input/backups/{nome}/download").status_code == 200
    assert cliente.get("/api/input/backups/..%2Fhack.db/download").status_code in (400, 404)


def test_migrar_endpoint(cliente):
    r = cliente.post("/api/input/migrar", headers=CABECALHO_USER)
    assert r.status_code == 200
    assert r.json()["resultado"] in ("ja-existe", "migrado", "rede-indisponivel")
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend; python -m pytest test_input_module.py -v`
Expected: FAIL nas rotas novas

- [ ] **Step 3: Implementar**

Adicionar a `backend/input_module/routes.py`:

```python
import os
import re as _re

from fastapi import File, UploadFile
from fastapi.responses import FileResponse


def _achar_base(nome_arquivo: str) -> str:
    for caminho in config.BASES_APOIO.values():
        if os.path.basename(caminho) == nome_arquivo:
            return caminho
    raise HTTPException(404, f"Base '{nome_arquivo}' não é gerenciada pelo sistema.")


@router.get("/responsaveis")
def obter_responsaveis():
    return db.carregar_responsaveis()


@router.put("/responsaveis")
def gravar_responsaveis(novo: dict, usuario: str = Depends(usuario_atual)):
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


@router.post("/bases/{nome_arquivo}")
def substituir_base(nome_arquivo: str, arquivo: UploadFile = File(...),
                    usuario: str = Depends(usuario_atual)):
    caminho = _achar_base(nome_arquivo)
    try:
        with open(caminho, "wb") as f:
            f.write(arquivo.file.read())
    except OSError as e:
        raise HTTPException(502, f"Erro ao gravar na rede: {e}")
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


@router.post("/migrar")
def migrar_novamente(usuario: str = Depends(usuario_atual)):
    _migracao["resultado"] = None
    resultado = _garantir_banco()
    engine.invalidar_cache()
    return {"resultado": resultado}
```

- [ ] **Step 4: Rodar os testes + regressão**

Run: `cd backend; python -m pytest test_input_module.py test_upload.py -v`
Expected: todos PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/routes.py backend/test_input_module.py
git commit -m "feat(input): endpoints de responsaveis, bases, backups e migracao"
```

---

## FASE 2 — Frontend: navegação e Visão Geral

### Task 8: Navegação destravada + seção Input na sidebar

**Files:**
- Modify: `frontend/src/types.ts:8`
- Modify: `frontend/src/components/sidebar.tsx`
- Modify: `frontend/src/App.tsx:142-178`
- Create: `frontend/src/input/input-section.tsx` (esqueleto)

- [ ] **Step 1: Atualizar o tipo de seção**

Em `frontend/src/types.ts:8`:

```ts
export type AppSection = "triagem" | "coffee" | "input";
```

- [ ] **Step 2: Botão na sidebar**

Em `frontend/src/components/sidebar.tsx`, adicionar o ícone (junto aos demais) e o botão (logo após o NavBtn do COFFEE, linha 43):

```tsx
const IconInput = (): React.JSX.Element => (
  <svg {...svgBase}><rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" /></svg>
);
```

```tsx
      <NavBtn active={section === "input"} label="Input" onClick={() => setSection("input")}><IconInput /></NavBtn>
```

- [ ] **Step 3: Esqueleto da seção**

Criar `frontend/src/input/input-section.tsx`:

```tsx
import React from 'react';
import type { TweakState } from '../types';

export function InputSection({ t }: { t: TweakState }): React.JSX.Element {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: 24, color: "var(--text-dim)" }}>Gestão de Notas (INPUT) — em construção</div>
    </div>
  );
}
```

(`t` já fica na assinatura porque as abas seguintes usam o tema/densidade.)

- [ ] **Step 4: Destravar o App.tsx**

Em `frontend/src/App.tsx`, substituir o bloco de retorno (linhas 142-178) para que a sidebar exista sempre e o upload trave só a triagem/coffee:

```tsx
  return (
    <div className="edp triage" data-theme={t.theme} data-density={t.density}
         style={{ height: "100vh", display: "flex", flexDirection: "row", background: "var(--bg)", ...accentStyle }}>
      <Sidebar section={section} setSection={changeSection} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {section === "input" ? (
          <InputSection t={t} />
        ) : screen === "upload" ? (
          <UploadScreen theme={t.theme} onDemo={loadDemo} onUpload={handleUpload} />
        ) : (
          <React.Fragment>
            <TopBar t={t} setTweak={setTweak} file={file} source={source} onReset={() => { setCoffeeReturn(null); setScreen("upload"); }} />
            {section === "coffee" && coffeeReturn && (
              /* ...bloco do banner do COFFEE permanece EXATAMENTE como está hoje (linhas 152-170)... */
            )}
            {section === "triagem"
              ? <Dashboard t={t} notes={notes} completed={completed} dupResolved={dupResolved}
                           onToggleComplete={toggleComplete} onMarkMany={markMany} onMarkDuplicate={markDuplicate}
                           onSendToCoffee={sendToCoffeeQueue} />
              : <CoffeeSection notes={notes} layout={t.coffeeLayout} />}
          </React.Fragment>
        )}
      </div>

      <TweaksPanel>
        {/* ...conteúdo atual do TweaksPanel permanece igual (linhas 181-195)... */}
      </TweaksPanel>
    </div>
  );
```

E o import no topo: `import { InputSection } from './input/input-section';`

Os comentários `/* ...permanece... */` indicam manter o código existente daquelas linhas — não removê-lo.

- [ ] **Step 5: Verificar e commitar**

Run: `cd frontend; npm run build`
Expected: build sem erros de tipo

Verificação manual rápida (`npm run dev`): app abre com sidebar visível; clicar em "Input" mostra o esqueleto; "Triagem" mostra a tela de upload.

```bash
git add frontend/src/types.ts frontend/src/components/sidebar.tsx frontend/src/App.tsx frontend/src/input/input-section.tsx
git commit -m "feat(input): secao Input na sidebar com navegacao destravada"
```

### Task 9: Tipos, cliente da API e hooks de dados

**Files:**
- Create: `frontend/src/input/types.ts`
- Create: `frontend/src/input/api.ts`
- Create: `frontend/src/input/use-input-data.ts`

- [ ] **Step 1: Tipos**

Criar `frontend/src/input/types.ts`:

```ts
export type Celula = string | number | null;

/** Uma nota enriquecida vinda de GET /api/input/notas (colunas dinâmicas). */
export interface NotaInput {
  Numero_Nota: number;
  [coluna: string]: Celula | undefined;
}

export interface BaseStatus {
  nome: string;
  arquivo: string;
  encontrada: boolean;
  modificada: string | null;
}

export interface InputMeta {
  status_opcoes: string[];
  prioridade_opcoes: string[];
  bases: BaseStatus[];
  ultima_alteracao: string | null;
  migracao: "ja-existe" | "migrado" | "rede-indisponivel";
  colunas: string[];
}

export interface InputDataset {
  registros: NotaInput[];
  meta: InputMeta;
}

export interface LogRegistro {
  ID_Log: number;
  Numero_Nota: number;
  Usuario: string;
  Data_Hora: string | number | null;
  Campo_Alterado: string;
  Valor_Antigo: string;
  Valor_Novo: string;
}

export interface LogArquivo {
  ID_Log: number;
  Nome_Arquivo: string;
  Usuario: string;
  Data_Hora: string | number | null;
  Acao: string;
}

export interface BackupInfo {
  arquivo: string;
  tamanho_mb: number;
  modificado: string;
}

export interface EdicaoResultado {
  alteradas: number;
  campos: number;
  ultima_alteracao: string | null;
}

export type AbaInput = "visao" | "gerenciar" | "relatorios" | "logs" | "config";
```

- [ ] **Step 2: Cliente da API + identidade**

Criar `frontend/src/input/api.ts` (mesma resolução de base usada em `src/api.ts`: chave `edp_api` no localStorage, fallback `/api`):

```ts
import type {
  BackupInfo, BaseStatus, EdicaoResultado, InputDataset, LogArquivo,
  LogRegistro, NotaInput,
} from './types';

const base = (): string => localStorage.getItem('edp_api') ?? '/api';

export function getUsuario(): string | null {
  return localStorage.getItem('edp_input_user');
}
export function setUsuario(nome: string): void {
  localStorage.setItem('edp_input_user', nome.trim());
}

async function req<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base()}/input${caminho}`, init);
  if (!r.ok) {
    const corpo = await r.text();
    let detalhe = corpo;
    try { detalhe = (JSON.parse(corpo) as { detail?: string }).detail ?? corpo; } catch { /* texto puro */ }
    throw new Error(detalhe || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

function escrita(method: string, corpo?: unknown): RequestInit {
  const usuario = getUsuario();
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(usuario ? { 'X-User': usuario } : {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  };
}

export const InputApi = {
  dados: () => req<InputDataset>('/notas'),
  sync: () => req<{ ultima_alteracao: string | null }>('/sync'),

  editar: (linhas: Partial<NotaInput>[]) =>
    req<EdicaoResultado>('/notas', escrita('PATCH', { linhas })),
  criar: (nota: Partial<NotaInput>) =>
    req<{ inseridas: number }>('/notas', escrita('POST', nota)),
  criarLote: (notas: Partial<NotaInput>[]) =>
    req<{ inseridas: number }>('/notas/bulk', escrita('POST', { notas })),
  excluir: (numeros: number[]) =>
    req<{ excluidas: number }>('/notas', escrita('DELETE', { numeros })),
  desfazer: () =>
    req<{ ok: boolean; mensagem: string }>('/desfazer', escrita('POST', {})),

  logs: () => req<{ registros: LogRegistro[] }>('/logs'),
  logsArquivos: () => req<{ registros: LogArquivo[] }>('/logs/arquivos'),
  timeline: (numero: number) => req<{ registros: LogRegistro[] }>(`/logs/nota/${numero}`),

  responsaveis: () => req<Record<string, string>>('/responsaveis'),
  salvarResponsaveis: (mapa: Record<string, string>) =>
    req<{ ok: boolean }>('/responsaveis', escrita('PUT', mapa)),

  bases: () => req<{ bases: BaseStatus[] }>('/bases'),
  urlDownloadBase: (arquivo: string) => `${base()}/input/bases/${encodeURIComponent(arquivo)}/download`,
  substituirBase: async (arquivo: string, f: File): Promise<void> => {
    const usuario = getUsuario();
    const fd = new FormData();
    fd.append('arquivo', f);
    const r = await fetch(`${base()}/input/bases/${encodeURIComponent(arquivo)}`, {
      method: 'POST', headers: usuario ? { 'X-User': usuario } : {}, body: fd,
    });
    if (!r.ok) throw new Error(await r.text());
  },

  backups: () => req<{ backups: BackupInfo[] }>('/backups'),
  urlDownloadBackup: (nome: string) => `${base()}/input/backups/${encodeURIComponent(nome)}/download`,

  migrar: () => req<{ resultado: string }>('/migrar', escrita('POST')),

  exportar: async (numeros: number[], colunas: string[]): Promise<Blob> => {
    const r = await fetch(`${base()}/input/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numeros, colunas }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.blob();
  },
};

export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Hooks de dados**

Criar `frontend/src/input/use-input-data.ts`:

```ts
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';

export function useInputData() {
  return useQuery({
    queryKey: ['input-dados'],
    queryFn: InputApi.dados,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useRecarregarInput(): () => Promise<void> {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['input-dados'] });
  }, [qc]);
}

/** Polling leve de /sync: retorna true quando outro usuário salvou algo. */
export function useAvisoSincronizacao(ultimaConhecida: string | null | undefined): {
  desatualizado: boolean;
  limpar: () => void;
} {
  const [desatualizado, setDesatualizado] = React.useState(false);
  React.useEffect(() => {
    if (ultimaConhecida === undefined) return;
    const id = window.setInterval(() => {
      InputApi.sync()
        .then((s) => {
          if (s.ultima_alteracao !== (ultimaConhecida ?? null)) setDesatualizado(true);
        })
        .catch(() => { /* backend fora: o erro aparece no fluxo principal */ });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [ultimaConhecida]);
  return { desatualizado, limpar: () => setDesatualizado(false) };
}
```

- [ ] **Step 4: Verificar e commitar**

Run: `cd frontend; npm run build`
Expected: build sem erros

```bash
git add frontend/src/input/types.ts frontend/src/input/api.ts frontend/src/input/use-input-data.ts
git commit -m "feat(input): tipos, cliente da api e hooks de dados"
```

### Task 10: Funções puras (`lib.ts`) e definição de colunas (`columns.ts`)

**Files:**
- Create: `frontend/src/input/lib.ts`
- Create: `frontend/src/input/columns.ts`

- [ ] **Step 1: Criar `lib.ts`**

```ts
import type { Celula, NotaInput } from './types';

export const MESES_PT_REV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, maio: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const ANO_ATUAL = new Date().getFullYear();

/** Chave de ordenação cronológica de "mes-ano" (porte de Input/app.py:53-59). */
export function chaveOrdenacaoData(val: Celula): [number, number, number] {
  const partes = String(val ?? '').split('-');
  if (partes.length === 2) {
    const mes = MESES_PT_REV[partes[0].toLowerCase()];
    const ano = Number(partes[1]);
    if (mes && Number.isFinite(ano)) return ano > ANO_ATUAL ? [1, ano, mes] : [0, -ano, mes];
  }
  return [2, 0, 0];
}

export function compararDatas(a: Celula, b: Celula): number {
  const ka = chaveOrdenacaoData(a);
  const kb = chaveOrdenacaoData(b);
  for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
}

/** "12345, 678; 90" -> [12345, 678, 90] (porte de Input/app.py:136). */
export function parseBuscaGlobal(texto: string): number[] {
  return texto.split(/[ ,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

export interface Filtro {
  campo: string;
  tipo: 'texto' | 'multi' | 'faixa';
  texto?: string;
  valores?: string[];
  min?: number;
  max?: number;
}

/** Motor de filtragem (porte de Input/app.py:247-262, aplicado no cliente). */
export function aplicarFiltros(registros: NotaInput[], filtros: Filtro[]): NotaInput[] {
  const ativos = filtros.filter((f) =>
    (f.tipo === 'texto' && (f.texto ?? '').trim() !== '') ||
    (f.tipo === 'multi' && (f.valores?.length ?? 0) > 0) ||
    (f.tipo === 'faixa' && (f.min !== undefined || f.max !== undefined)));
  if (ativos.length === 0) return registros;
  return registros.filter((r) => ativos.every((f) => {
    const bruto = r[f.campo];
    if (f.tipo === 'texto') {
      return String(bruto ?? '').toUpperCase().includes((f.texto ?? '').trim().toUpperCase());
    }
    if (f.tipo === 'multi') {
      return (f.valores ?? []).includes(String(bruto ?? ''));
    }
    const n = Number(bruto);
    if (!Number.isFinite(n)) return false;
    if (f.min !== undefined && n < f.min) return false;
    if (f.max !== undefined && n > f.max) return false;
    return true;
  }));
}

export function valoresUnicos(registros: NotaInput[], campo: string): string[] {
  const valores = new Set<string>();
  for (const r of registros) {
    const v = r[campo];
    if (v !== null && v !== undefined && String(v).trim() !== '') valores.add(String(v));
  }
  return [...valores].sort((a, b) =>
    campo === 'Mes_Execucao_Planejado' ? compararDatas(a, b) : a.localeCompare(b, 'pt-BR'));
}

export interface ResultadoCalculo { coluna: string; soma: number; media: number; contagem: number; }

/** Calculadora de soma/média/contagem (porte de Input/app.py:267-285). */
export function calcular(registros: NotaInput[], colunas: string[]): ResultadoCalculo[] {
  return colunas.map((coluna) => {
    const nums = registros.map((r) => Number(r[coluna])).filter((n) => Number.isFinite(n));
    const soma = nums.reduce((a, b) => a + b, 0);
    return { coluna, soma, media: nums.length ? soma / nums.length : 0, contagem: nums.length };
  });
}

/** Cola TSV do Excel em registros na ordem fixa de colunas. */
export function parseColagemTsv(texto: string, colunas: string[]): Partial<NotaInput>[] {
  return texto.split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((linha) => {
      const celulas = linha.split('\t');
      const registro: Partial<NotaInput> = {};
      colunas.forEach((c, i) => { registro[c] = (celulas[i] ?? '').trim(); });
      return registro;
    });
}

export function formatarNumero(v: Celula, casas = 2): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '-');
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
```

- [ ] **Step 2: Criar `columns.ts`**

```ts
export interface ColunaDef {
  key: string;
  label: string;
  numeric?: boolean;
  largura?: number;
  editavel?: boolean;
  opcoes?: 'status' | 'prioridade';
}

/** Colunas do painel na ordem original (Input/app.py:172-179) com os rótulos
 *  amigáveis do export (Input/app.py:67-84 / config.py MAP_FILTROS). */
export const COLUNAS: ColunaDef[] = [
  { key: 'Regional', label: 'Regional' },
  { key: 'Numero_Nota', label: 'Nº Nota (ID)', numeric: true, largura: 110 },
  { key: 'Status_Obra', label: 'Status Obra', editavel: true },
  { key: 'Conjunto', label: 'Conjunto', editavel: true },
  { key: 'Circuito', label: 'Circuito', editavel: true },
  { key: 'Local_Instalacao', label: 'Local Instalação', editavel: true, largura: 170 },
  { key: 'Planejado_DDPM', label: 'Planejado', numeric: true, editavel: true },
  { key: 'Mes_Execucao_Planejado', label: 'Mês Execução Planejado', editavel: true },
  { key: 'Data_Envio_Projeto', label: 'Data Envio Projeto', editavel: true },
  { key: 'Centro_Responsavel', label: 'Centro Responsável' },
  { key: 'Prioridade_Nota', label: 'Prioridade Nota', editavel: true, opcoes: 'prioridade' },
  { key: 'Status_Nota', label: 'Status Nota', editavel: true, opcoes: 'status', largura: 180 },
  { key: 'Cidade', label: 'Cidade' },
  { key: 'Observacao', label: 'Observação', editavel: true, largura: 220 },
  { key: 'CJ_Aneel', label: 'Cj. Aneel' },
  { key: 'substacao_conjunto', label: 'Subestação Conj' },
  { key: 'Conj.critico', label: 'Conj. Crítico' },
  { key: 'ranking', label: 'Ranking', numeric: true },
  { key: 'Check', label: 'Check', editavel: true },
  { key: 'Export_status', label: 'Export Status' },
  { key: 'Status_Final', label: 'Status Final' },
  { key: 'Status_Anterior', label: 'Status Anterior' },
  { key: 'Ordem', label: 'Ordem' },
  { key: 'Status_Usuário_Ordem', label: 'Status Usuário Ordem' },
  { key: 'Status_Sistema', label: 'Status Sistema' },
  { key: 'Total_planejado_ordem', label: 'Total Planejado Ordem (R$)', numeric: true },
  { key: 'Total_real_ordem', label: 'Total Real Ordem (R$)', numeric: true },
  { key: 'Exec_percentagem_ordem', label: 'Exec %', numeric: true },
  { key: 'Ordem_Executada', label: 'Ordem Exec.' },
  { key: 'Modular', label: 'Modular (R$)', numeric: true },
  { key: 'Regional_CSD', label: 'Regional CSD' },
  { key: 'N_Clientes_Conjunto', label: 'Nº Clientes Conjunto', numeric: true },
  { key: 'CHI', label: 'CHI', numeric: true },
  { key: 'CI', label: 'CI', numeric: true },
  { key: 'Ocorrencia', label: 'Ocorrências', numeric: true },
  { key: 'DEC', label: 'DEC', numeric: true },
  { key: 'FEC', label: 'FEC', numeric: true },
  { key: 'CHI_Conj', label: 'CHI Conjunto', numeric: true },
  { key: 'Equipamento_Protecao', label: 'DIS Proteção' },
  { key: 'DEC_PROG_CHI', label: 'DEC Prog. CHI', numeric: true },
];

export const ROTULOS: Record<string, string> =
  Object.fromEntries(COLUNAS.map((c) => [c.key, c.label]));

/** Espelho de db.CAMPOS_EDITAVEIS no backend. */
export const CAMPOS_EDITAVEIS = COLUNAS.filter((c) => c.editavel).map((c) => c.key);

/** Calculadora (Input/app.py:199-204). */
export const COLUNAS_CALCULAVEIS: Record<string, string> = {
  'Planejado DDPM': 'Planejado_DDPM',
  'Total Planejado Ordem': 'Total_planejado_ordem',
  'Total Real Ordem': 'Total_real_ordem',
  'Nº Clientes Conjunto': 'N_Clientes_Conjunto',
  CHI: 'CHI',
  CIH: 'CI',
  'Ocorrências': 'Ocorrencia',
  DEC: 'DEC',
  FEC: 'FEC',
};

/** Campos oferecidos nos filtros avançados, por tipo (Input/app.py:216-217). */
export const FILTROS_TEXTO = ['Local_Instalacao', 'Observacao', 'Ordem',
  'Centro_Responsavel', 'Equipamento_Protecao'];
export const FILTROS_FAIXA = ['Planejado_DDPM', 'ranking', 'Total_planejado_ordem',
  'Total_real_ordem', 'Exec_percentagem_ordem', 'N_Clientes_Conjunto',
  'CHI', 'CI', 'Ocorrencia', 'DEC', 'FEC'];
export const FILTROS_MULTI = ['Status_Nota', 'Regional', 'Mes_Execucao_Planejado',
  'Prioridade_Nota', 'Conjunto', 'Cidade', 'CJ_Aneel', 'Conj.critico',
  'Export_status', 'Status_Final', 'Ordem_Executada', 'Regional_CSD'];

/** Colunas da colagem em massa, na ordem (Input/app.py:674-679). */
export const COLUNAS_COLAGEM = ['Numero_Nota', 'Status_Nota', 'Prioridade_Nota',
  'Planejado_DDPM', 'Status_Obra', 'Conjunto', 'Circuito', 'Local_Instalacao',
  'Mes_Execucao_Planejado', 'Data_Envio_Projeto', 'Observacao', 'Check'];
```

- [ ] **Step 3: Verificar e commitar**

Run: `cd frontend; npm run build`
Expected: build sem erros (módulos ainda não usados — `tsc` aceita)

```bash
git add frontend/src/input/lib.ts frontend/src/input/columns.ts
git commit -m "feat(input): funcoes puras de filtro/calculo e definicao de colunas"
```

### Task 11: Tabela de notas virtualizada (`notes-table.tsx`)

**Files:**
- Create: `frontend/src/input/notes-table.tsx`

- [ ] **Step 1: Implementar**

```tsx
import React from 'react';
import type { Celula, NotaInput } from './types';
import type { ColunaDef } from './columns';
import { compararDatas, formatarNumero } from './lib';

const ALTURA_LINHA = 32;

export interface NotesTableProps {
  registros: NotaInput[];
  colunas: ColunaDef[];
  altura?: number;
  /** Seleção por checkbox (edição em lote / exclusão). Ausente = sem coluna de seleção. */
  selecionados?: Set<number>;
  onToggleSelecionado?: (numero: number) => void;
  /** Edições pendentes (sobrepõem o valor exibido). Presente = células editáveis. */
  edicoes?: Map<number, Partial<NotaInput>>;
  onEditar?: (numero: number, campo: string, valor: Celula) => void;
  statusOpcoes?: string[];
  prioridadeOpcoes?: string[];
}

interface CelulaEditando { numero: number; campo: string; }

export function NotesTable(props: NotesTableProps): React.JSX.Element {
  const { registros, colunas, altura = 520, selecionados, onToggleSelecionado,
          edicoes, onEditar, statusOpcoes = [], prioridadeOpcoes = [] } = props;
  const [scrollTop, setScrollTop] = React.useState(0);
  const [ordem, setOrdem] = React.useState<{ campo: string; asc: boolean } | null>(null);
  const [editando, setEditando] = React.useState<CelulaEditando | null>(null);

  const ordenados = React.useMemo(() => {
    if (!ordem) return registros;
    const fator = ordem.asc ? 1 : -1;
    const copia = [...registros];
    if (ordem.campo === 'Mes_Execucao_Planejado') {
      copia.sort((a, b) => fator * compararDatas(a[ordem.campo], b[ordem.campo]));
    } else {
      copia.sort((a, b) => {
        const va = a[ordem.campo]; const vb = b[ordem.campo];
        const na = Number(va); const nb = Number(vb);
        if (Number.isFinite(na) && Number.isFinite(nb)) return fator * (na - nb);
        return fator * String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR');
      });
    }
    return copia;
  }, [registros, ordem]);

  const inicio = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - 5);
  const qtdVisiveis = Math.ceil(altura / ALTURA_LINHA) + 10;
  const fatia = ordenados.slice(inicio, inicio + qtdVisiveis);

  function valor(r: NotaInput, campo: string): Celula {
    const pendente = edicoes?.get(r.Numero_Nota);
    if (pendente && campo in pendente) return pendente[campo] ?? null;
    return r[campo] ?? null;
  }

  function cabecalho(c: ColunaDef): React.JSX.Element {
    const ativa = ordem?.campo === c.key;
    return (
      <th key={c.key} onClick={() => setOrdem({ campo: c.key, asc: ativa ? !ordem!.asc : true })}
          style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface)',
                   borderBottom: '1px solid var(--line)', padding: '6px 10px', textAlign: 'left',
                   fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em',
                   color: ativa ? 'var(--accent)' : 'var(--text-mute)', cursor: 'pointer',
                   whiteSpace: 'nowrap', minWidth: c.largura ?? 90 }}>
        {c.label}{ativa ? (ordem!.asc ? ' ↑' : ' ↓') : ''}
      </th>
    );
  }

  function celula(r: NotaInput, c: ColunaDef): React.JSX.Element {
    const v = valor(r, c.key);
    const editavel = Boolean(onEditar && c.editavel);
    const emEdicao = editando && editando.numero === r.Numero_Nota && editando.campo === c.key;
    const alterada = Boolean(edicoes?.get(r.Numero_Nota) && c.key in (edicoes.get(r.Numero_Nota) ?? {}));

    if (emEdicao && onEditar) {
      const confirmar = (novo: string): void => { onEditar(r.Numero_Nota, c.key, novo); setEditando(null); };
      const opcoes = c.opcoes === 'status' ? statusOpcoes : c.opcoes === 'prioridade' ? prioridadeOpcoes : null;
      return (
        <td key={c.key} style={{ padding: 0 }}>
          {opcoes ? (
            <select autoFocus defaultValue={String(v ?? '')} className="edp-input"
                    onChange={(e) => confirmar(e.target.value)} onBlur={() => setEditando(null)}
                    style={{ width: '100%', height: ALTURA_LINHA - 4 }}>
              {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input autoFocus defaultValue={String(v ?? '')} className="edp-input"
                   onBlur={(e) => confirmar(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') confirmar((e.target as HTMLInputElement).value);
                                       if (e.key === 'Escape') setEditando(null); }}
                   style={{ width: '100%', height: ALTURA_LINHA - 4, boxSizing: 'border-box' }} />
          )}
        </td>
      );
    }
    return (
      <td key={c.key} title={editavel ? 'Duplo clique para editar' : undefined}
          onDoubleClick={editavel ? () => setEditando({ numero: r.Numero_Nota, campo: c.key }) : undefined}
          style={{ padding: '0 10px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
                   overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320, height: ALTURA_LINHA,
                   fontSize: 12.5, cursor: editavel ? 'cell' : 'default',
                   color: alterada ? 'var(--accent)' : 'var(--text)',
                   fontWeight: alterada ? 600 : 400 }}>
        {c.numeric ? formatarNumero(v, c.key === 'Numero_Nota' || c.key === 'ranking' ? 0 : 2) : String(v ?? '')}
      </td>
    );
  }

  const numerosFatia = fatia.map((r) => r.Numero_Nota);
  return (
    <div onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
         style={{ height: altura, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
      <div style={{ height: ordenados.length * ALTURA_LINHA + ALTURA_LINHA, position: 'relative' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', position: 'absolute', top: 0,
                        transform: `translateY(${inicio * ALTURA_LINHA}px)` }}>
          <thead>
            <tr>
              {selecionados && (
                <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface)',
                             borderBottom: '1px solid var(--line)', width: 36 }}>
                  <input type="checkbox"
                         checked={numerosFatia.length > 0 && numerosFatia.every((n) => selecionados.has(n))}
                         onChange={(e) => props.onToggleTodos?.(numerosFatia, e.target.checked)} />
                </th>
              )}
              {colunas.map(cabecalho)}
            </tr>
          </thead>
          <tbody>
            {fatia.map((r) => (
              <tr key={r.Numero_Nota}
                  style={{ background: selecionados?.has(r.Numero_Nota) ? 'var(--accent-tint)' : 'transparent' }}>
                {selecionados && (
                  <td style={{ textAlign: 'center', borderBottom: '1px solid var(--line)' }}>
                    <input type="checkbox" checked={selecionados.has(r.Numero_Nota)}
                           onChange={() => onToggleSelecionado?.(r.Numero_Nota)} />
                  </td>
                )}
                {colunas.map((c) => celula(r, c))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Acrescentar ao tipo `NotesTableProps` (já mostrado acima) a prop
`onToggleTodos?: (numeros: number[], marcar: boolean) => void;` — usada pelo
checkbox do cabeçalho.

Nota: se a classe `edp-input` não existir em `tokens.css`, usar os estilos
inline mostrados (já são suficientes) e remover o `className`.

- [ ] **Step 2: Verificar e commitar**

Run: `cd frontend; npm run build`
Expected: build sem erros

```bash
git add frontend/src/input/notes-table.tsx
git commit -m "feat(input): tabela de notas virtualizada com ordenacao, selecao e edicao"
```

### Task 12: Busca, filtros avançados e calculadora (`filters.tsx`)

**Files:**
- Create: `frontend/src/input/filters.tsx`

- [ ] **Step 1: Implementar**

```tsx
import React from 'react';
import type { NotaInput } from './types';
import type { Filtro, ResultadoCalculo } from './lib';
import { calcular, formatarNumero, valoresUnicos } from './lib';
import { COLUNAS_CALCULAVEIS, FILTROS_FAIXA, FILTROS_MULTI, FILTROS_TEXTO, ROTULOS } from './columns';

export interface FiltersState {
  busca: string;
  filtros: Filtro[];
  calcColunas: string[];
}

export const FILTROS_INICIAIS: FiltersState = { busca: '', filtros: [], calcColunas: [] };

interface FiltersProps {
  registros: NotaInput[];          // base (pós-busca) para montar as opções
  registrosFiltrados: NotaInput[]; // resultado final, para a calculadora
  estado: FiltersState;
  setEstado: (e: FiltersState) => void;
}

function tipoDoCampo(campo: string): Filtro['tipo'] {
  if (FILTROS_TEXTO.includes(campo)) return 'texto';
  if (FILTROS_FAIXA.includes(campo)) return 'faixa';
  return 'multi';
}

export function Filters({ registros, registrosFiltrados, estado, setEstado }: FiltersProps): React.JSX.Element {
  const [aberto, setAberto] = React.useState(false);
  const [calcAberta, setCalcAberta] = React.useState(false);
  const camposDisponiveis = [...FILTROS_MULTI, ...FILTROS_TEXTO, ...FILTROS_FAIXA]
    .filter((c) => !estado.filtros.some((f) => f.campo === c));

  function atualizarFiltro(i: number, mudanca: Partial<Filtro>): void {
    const filtros = estado.filtros.map((f, j) => (j === i ? { ...f, ...mudanca } : f));
    setEstado({ ...estado, filtros });
  }

  const resultados: ResultadoCalculo[] = estado.calcColunas.length
    ? calcular(registrosFiltrados, estado.calcColunas)
    : [];

  const estiloPainel: React.CSSProperties = {
    border: '1px solid var(--line)', borderRadius: 8, padding: 12,
    background: 'var(--surface)', marginTop: 8,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={estado.busca} placeholder="Buscar notas: 12345, 54321; 678"
               onChange={(e) => setEstado({ ...estado, busca: e.target.value })}
               style={{ width: 260, padding: '7px 10px', borderRadius: 7,
                        border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--text)' }} />
        <button className="edp-btn sm" onClick={() => setAberto(!aberto)}>
          🔎 Filtros avançados{estado.filtros.length ? ` (${estado.filtros.length})` : ''}
        </button>
        <button className="edp-btn sm" onClick={() => setCalcAberta(!calcAberta)}>📊 Calculadora</button>
        {(estado.filtros.length > 0 || estado.busca) && (
          <button className="edp-btn ghost sm"
                  onClick={() => setEstado({ ...estado, busca: '', filtros: [] })}>🧹 Limpar</button>
        )}
      </div>

      {aberto && (
        <div style={estiloPainel}>
          <select value="" onChange={(e) => {
                    if (!e.target.value) return;
                    setEstado({ ...estado, filtros: [...estado.filtros,
                      { campo: e.target.value, tipo: tipoDoCampo(e.target.value) }] });
                  }}
                  style={{ marginBottom: 10, padding: 6 }}>
            <option value="">+ Adicionar campo de filtro…</option>
            {camposDisponiveis.map((c) => <option key={c} value={c}>{ROTULOS[c] ?? c}</option>)}
          </select>
          {estado.filtros.map((f, i) => (
            <div key={f.campo} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ minWidth: 160, fontSize: 12, color: 'var(--text-dim)' }}>{ROTULOS[f.campo] ?? f.campo}</span>
              {f.tipo === 'texto' && (
                <input value={f.texto ?? ''} placeholder="Contém…"
                       onChange={(e) => atualizarFiltro(i, { texto: e.target.value })} style={{ padding: 5 }} />
              )}
              {f.tipo === 'faixa' && (
                <React.Fragment>
                  <input type="number" placeholder="mín" value={f.min ?? ''} style={{ width: 90, padding: 5 }}
                         onChange={(e) => atualizarFiltro(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  <input type="number" placeholder="máx" value={f.max ?? ''} style={{ width: 90, padding: 5 }}
                         onChange={(e) => atualizarFiltro(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </React.Fragment>
              )}
              {f.tipo === 'multi' && (
                <select multiple value={f.valores ?? []} size={4} style={{ minWidth: 220 }}
                        onChange={(e) => atualizarFiltro(i, {
                          valores: [...e.target.selectedOptions].map((o) => o.value) })}>
                  {valoresUnicos(registros, f.campo).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              <button className="edp-btn ghost sm"
                      onClick={() => setEstado({ ...estado, filtros: estado.filtros.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          {estado.filtros.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>Nenhum filtro ativo.</div>
          )}
        </div>
      )}

      {calcAberta && (
        <div style={estiloPainel}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {Object.entries(COLUNAS_CALCULAVEIS).map(([rotulo, campo]) => {
              const ativo = estado.calcColunas.includes(campo);
              return (
                <button key={campo} className={`edp-btn sm${ativo ? '' : ' ghost'}`}
                        onClick={() => setEstado({ ...estado, calcColunas: ativo
                          ? estado.calcColunas.filter((c) => c !== campo)
                          : [...estado.calcColunas, campo] })}>{rotulo}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {resultados.map((r) => (
              <div key={r.coluna} style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '8px 12px', fontSize: 12 }}>
                <strong>{ROTULOS[r.coluna] ?? r.coluna}</strong>
                <div>Soma: <span className="edp-mono">{formatarNumero(r.soma)}</span></div>
                <div>Média: <span className="edp-mono">{formatarNumero(r.media)}</span></div>
                <div>Contagem: <span className="edp-mono">{r.contagem}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `cd frontend; npm run build`
Expected: build sem erros

```bash
git add frontend/src/input/filters.tsx
git commit -m "feat(input): busca global, filtros avancados e calculadora"
```

### Task 13: Visão Geral (`overview.tsx`) + casca real da seção

**Files:**
- Create: `frontend/src/input/overview.tsx`
- Modify: `frontend/src/input/input-section.tsx`

- [ ] **Step 1: Criar `overview.tsx`**

```tsx
import React from 'react';
import type { InputDataset, NotaInput } from './types';
import { InputApi, baixarBlob } from './api';
import { aplicarFiltros, parseBuscaGlobal } from './lib';
import { COLUNAS } from './columns';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';
import { NotesTable } from './notes-table';

export function filtrarRegistros(registros: NotaInput[], estado: FiltersState): NotaInput[] {
  let resultado = registros;
  const numeros = parseBuscaGlobal(estado.busca);
  if (estado.busca.trim() !== '') {
    resultado = numeros.length ? resultado.filter((r) => numeros.includes(r.Numero_Nota)) : [];
  }
  return aplicarFiltros(resultado, estado.filtros);
}

export function Overview({ dados }: { dados: InputDataset }): React.JSX.Element {
  const [estado, setEstado] = React.useState<FiltersState>(FILTROS_INICIAIS);
  const [exportando, setExportando] = React.useState(false);
  const filtrados = React.useMemo(
    () => filtrarRegistros(dados.registros, estado), [dados.registros, estado]);

  async function exportar(): Promise<void> {
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        filtrados.map((r) => r.Numero_Nota), COLUNAS.map((c) => c.key));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      baixarBlob(blob, `export_notas_${stamp}.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
          Total de registros: <strong className="edp-mono">{filtrados.length}</strong>
          {filtrados.length !== dados.registros.length ? ` de ${dados.registros.length}` : ''}
        </span>
        <button className="edp-btn sm" disabled={exportando || filtrados.length === 0} onClick={() => { void exportar(); }}>
          {exportando ? 'Gerando…' : '⬇ Exportar Excel'}
        </button>
      </div>
      <Filters registros={dados.registros} registrosFiltrados={filtrados} estado={estado} setEstado={setEstado} />
      <NotesTable registros={filtrados} colunas={COLUNAS} />
    </div>
  );
}
```

- [ ] **Step 2: Substituir o esqueleto de `input-section.tsx`**

```tsx
import React from 'react';
import type { TweakState } from '../types';
import type { AbaInput } from './types';
import { useAvisoSincronizacao, useInputData, useRecarregarInput } from './use-input-data';
import { Overview } from './overview';

const ABAS: { id: AbaInput; rotulo: string }[] = [
  { id: 'visao', rotulo: 'Visão Geral' },
  { id: 'gerenciar', rotulo: 'Gerenciar' },
  { id: 'relatorios', rotulo: 'Relatórios' },
  { id: 'logs', rotulo: 'Logs' },
  { id: 'config', rotulo: 'Configurações' },
];

export function InputSection({ t }: { t: TweakState }): React.JSX.Element {
  const [aba, setAba] = React.useState<AbaInput>('visao');
  const { data: dados, isLoading, error } = useInputData();
  const recarregar = useRecarregarInput();
  const { desatualizado, limpar } = useAvisoSincronizacao(dados?.meta.ultima_alteracao);
  const basesAusentes = dados?.meta.bases.filter((b) => !b.encontrada) ?? [];

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16,
                    padding: '0 22px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <strong style={{ fontSize: 14 }}>Gestão de Notas (INPUT)</strong>
        <div className="edp-seg">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'on' : ''} onClick={() => setAba(a.id)}>{a.rotulo}</button>
          ))}
        </div>
      </div>

      {desatualizado && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 18px',
                      background: 'var(--tint-amber)', borderBottom: '1px solid rgba(240,169,59,.3)', fontSize: 13 }}>
          <span style={{ flex: 1 }}>Os dados foram atualizados por outro usuário.</span>
          <button className="edp-btn sm" onClick={() => { limpar(); void recarregar(); }}>Recarregar dados</button>
        </div>
      )}
      {dados && dados.meta.migracao === 'rede-indisponivel' && dados.registros.length === 0 && (
        <div style={{ padding: '8px 18px', background: 'var(--tint-amber)', fontSize: 13 }}>
          Importação inicial pendente: a rede da EDP estava indisponível.{' '}
          <button className="edp-btn sm" onClick={() => { void (async () => {
            const { InputApi } = await import('./api');
            await InputApi.migrar(); await recarregar();
          })(); }}>Tentar importar de novo</button>
        </div>
      )}
      {basesAusentes.length > 0 && (
        <div style={{ padding: '6px 18px', fontSize: 12, color: 'var(--amber)' }}>
          {basesAusentes.length} de {dados!.meta.bases.length} bases da rede indisponíveis — indicadores parciais.
        </div>
      )}

      {isLoading && <div style={{ padding: 24, color: 'var(--text-dim)' }}>Carregando notas…</div>}
      {error != null && (
        <div style={{ padding: 24, color: 'var(--red, #dc3545)' }}>
          Backend indisponível. O módulo Input exige o backend rodando (porta 8000). Detalhe: {String((error as Error).message)}
        </div>
      )}

      {dados && aba === 'visao' && <Overview dados={dados} />}
      {dados && aba === 'gerenciar' && <div style={{ padding: 24, color: 'var(--text-dim)' }}>Gerenciar — próxima fase.</div>}
      {dados && aba === 'relatorios' && <div style={{ padding: 24, color: 'var(--text-dim)' }}>Relatórios — próxima fase.</div>}
      {dados && aba === 'logs' && <div style={{ padding: 24, color: 'var(--text-dim)' }}>Logs — próxima fase.</div>}
      {dados && aba === 'config' && <div style={{ padding: 24, color: 'var(--text-dim)' }}>Configurações — próxima fase.</div>}
    </div>
  );
}
```

(A prop `t` permanece na assinatura — densidade/tema chegam via CSS vars; o
parâmetro evita mudança de interface nas próximas tarefas. Se o lint reclamar
de não-uso, renomear para `_t`.)

- [ ] **Step 3: Verificar e commitar**

Run: `cd frontend; npm run build`
Expected: build sem erros

Verificação manual (backend rodando + `npm run dev`): seção Input mostra a
tabela com os dados reais, busca e filtros funcionam, export baixa um `.xlsx`.

```bash
git add frontend/src/input/overview.tsx frontend/src/input/input-section.tsx
git commit -m "feat(input): aba visao geral com tabela, filtros e export"
```

---

## FASE 3 — Gerenciar

### Task 14: Identidade + aba Gerenciar (`identity-modal.tsx`, `manage.tsx`)

**Files:**
- Create: `frontend/src/input/identity-modal.tsx`
- Create: `frontend/src/input/manage.tsx`
- Modify: `frontend/src/input/input-section.tsx` (trocar o placeholder de "gerenciar")

- [ ] **Step 1: Criar `identity-modal.tsx`**

```tsx
import React from 'react';
import { setUsuario } from './api';

interface IdentityModalProps {
  aberto: boolean;
  onConfirmado: () => void;
  onCancelar: () => void;
}

export function IdentityModal({ aberto, onConfirmado, onCancelar }: IdentityModalProps): React.JSX.Element | null {
  const [nome, setNome] = React.useState('');
  if (!aberto) return null;
  function confirmar(): void {
    if (!nome.trim()) return;
    setUsuario(nome);
    onConfirmado();
  }
  return (
    <div role="dialog" aria-modal="true"
         style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 60,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)',
                    borderRadius: 12, padding: 24, width: 380 }}>
        <h3 style={{ margin: '0 0 6px' }}>Quem é você?</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '0 0 14px' }}>
          Seu nome identifica suas alterações no log de auditoria. Pode ser trocado depois nas Configurações.
        </p>
        <input autoFocus value={nome} placeholder="Seu nome" onChange={(e) => setNome(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }}
               style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7,
                        border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--text)' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="edp-btn ghost sm" onClick={onCancelar}>Cancelar</button>
          <button className="edp-btn sm" disabled={!nome.trim()} onClick={confirmar}
                  style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `manage.tsx`**

```tsx
import React from 'react';
import type { Celula, InputDataset, NotaInput } from './types';
import { getUsuario, InputApi } from './api';
import { parseColagemTsv } from './lib';
import { COLUNAS, COLUNAS_COLAGEM, ROTULOS } from './columns';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';
import { filtrarRegistros } from './overview';
import { NotesTable } from './notes-table';
import { useRecarregarInput } from './use-input-data';
import { IdentityModal } from './identity-modal';

type Modo = 'rapida' | 'lote' | 'exclusao' | 'cadastro' | 'colagem';
const MODOS: { id: Modo; rotulo: string }[] = [
  { id: 'rapida', rotulo: 'Edição Rápida' },
  { id: 'lote', rotulo: 'Edição em Lote' },
  { id: 'exclusao', rotulo: 'Exclusão' },
  { id: 'cadastro', rotulo: 'Cadastrar Nota' },
  { id: 'colagem', rotulo: 'Colar Planilha' },
];

interface Mensagem { tipo: 'ok' | 'erro'; texto: string; }

const NOTA_VAZIA: Record<string, string> = {
  Numero_Nota: '', Status_Nota: '00 Pendente', Prioridade_Nota: 'Programável',
  Planejado_DDPM: '0', Status_Obra: '-', Conjunto: '-', Circuito: '-',
  Local_Instalacao: '-', Mes_Execucao_Planejado: '-',
  Data_Envio_Projeto: new Date().toLocaleDateString('pt-BR'), Observacao: '', Check: '-',
};

export function Manage({ dados }: { dados: InputDataset }): React.JSX.Element {
  const recarregar = useRecarregarInput();
  const [modo, setModo] = React.useState<Modo>('rapida');
  const [estadoFiltros, setEstadoFiltros] = React.useState<FiltersState>(FILTROS_INICIAIS);
  const [edicoes, setEdicoes] = React.useState<Map<number, Partial<NotaInput>>>(new Map());
  const [selecionados, setSelecionados] = React.useState<Set<number>>(new Set());
  const [msg, setMsg] = React.useState<Mensagem | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [acaoPendente, setAcaoPendente] = React.useState<(() => void) | null>(null);
  const [loteStatus, setLoteStatus] = React.useState('');
  const [lotePrioridade, setLotePrioridade] = React.useState('');
  const [loteMes, setLoteMes] = React.useState('');
  const [novaNota, setNovaNota] = React.useState<Record<string, string>>({ ...NOTA_VAZIA });
  const [textoColagem, setTextoColagem] = React.useState('');

  const filtrados = React.useMemo(
    () => filtrarRegistros(dados.registros, estadoFiltros), [dados.registros, estadoFiltros]);
  const previewColagem = React.useMemo(
    () => parseColagemTsv(textoColagem, COLUNAS_COLAGEM), [textoColagem]);

  function comIdentidade(acao: () => void): void {
    if (getUsuario()) acao();
    else setAcaoPendente(() => acao);
  }

  async function executar(rotuloOk: string, fn: () => Promise<unknown>): Promise<void> {
    setSalvando(true); setMsg(null);
    try {
      await fn();
      await recarregar();
      setMsg({ tipo: 'ok', texto: rotuloOk });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  function onEditar(numero: number, campo: string, valor: Celula): void {
    setEdicoes((prev) => {
      const m = new Map(prev);
      m.set(numero, { ...(m.get(numero) ?? {}), [campo]: valor });
      return m;
    });
  }
  function toggleSelecionado(numero: number): void {
    setSelecionados((prev) => {
      const s = new Set(prev);
      if (s.has(numero)) s.delete(numero); else s.add(numero);
      return s;
    });
  }
  function toggleTodos(numeros: number[], marcar: boolean): void {
    setSelecionados((prev) => {
      const s = new Set(prev);
      numeros.forEach((n) => { if (marcar) s.add(n); else s.delete(n); });
      return s;
    });
  }

  const salvarRapida = (): void => comIdentidade(() => {
    void executar(`${edicoes.size} nota(s) atualizada(s).`, async () => {
      const linhas = [...edicoes.entries()].map(([n, campos]) => ({ Numero_Nota: n, ...campos }));
      await InputApi.editar(linhas);
      setEdicoes(new Map());
    });
  });

  const aplicarLote = (): void => comIdentidade(() => {
    const linhas = [...selecionados].map((n) => {
      const linha: Partial<NotaInput> = { Numero_Nota: n };
      if (loteStatus) linha.Status_Nota = loteStatus;
      if (lotePrioridade) linha.Prioridade_Nota = lotePrioridade;
      if (loteMes.trim()) linha.Mes_Execucao_Planejado = loteMes.trim();
      return linha;
    });
    if (linhas.length === 0 || (!loteStatus && !lotePrioridade && !loteMes.trim())) {
      setMsg({ tipo: 'erro', texto: 'Selecione notas e escolha pelo menos um novo valor.' });
      return;
    }
    void executar(`Lote aplicado em ${linhas.length} nota(s).`, async () => {
      await InputApi.editar(linhas);
      setSelecionados(new Set());
    });
  });

  const excluirSelecionadas = (): void => comIdentidade(() => {
    if (selecionados.size === 0) { setMsg({ tipo: 'erro', texto: 'Nenhuma nota selecionada.' }); return; }
    if (!window.confirm(`Excluir ${selecionados.size} nota(s) do banco? Esta ação não entra no desfazer.`)) return;
    void executar(`${selecionados.size} nota(s) excluída(s).`, async () => {
      await InputApi.excluir([...selecionados]);
      setSelecionados(new Set());
    });
  });

  const desfazer = (): void => comIdentidade(() => {
    if (!window.confirm('Desfazer a última alteração salva no banco de dados?')) return;
    void executar('Última alteração desfeita.', async () => {
      const r = await InputApi.desfazer();
      if (!r.ok) throw new Error(r.mensagem);
    });
  });

  const cadastrar = (): void => comIdentidade(() => {
    if (!/^\d+$/.test(novaNota.Numero_Nota)) { setMsg({ tipo: 'erro', texto: 'Nº da Nota inválido.' }); return; }
    void executar(`Nota ${novaNota.Numero_Nota} cadastrada.`, async () => {
      await InputApi.criar({ ...novaNota, Numero_Nota: Number(novaNota.Numero_Nota),
                             Planejado_DDPM: Number(novaNota.Planejado_DDPM) || 0 });
      setNovaNota({ ...NOTA_VAZIA });
    });
  });

  const salvarColagem = (): void => comIdentidade(() => {
    if (previewColagem.length === 0) { setMsg({ tipo: 'erro', texto: 'Cole os dados antes de salvar.' }); return; }
    void executar(`${previewColagem.length} nota(s) integradas ao banco.`, async () => {
      await InputApi.criarLote(previewColagem.map((r) => ({
        ...r, Numero_Nota: Number(r.Numero_Nota),
        Planejado_DDPM: Number(r.Planejado_DDPM) || 0,
      })));
      setTextoColagem('');
    });
  });

  const comSelecao = modo === 'lote' || modo === 'exclusao';
  const estiloCampo: React.CSSProperties = { padding: '7px 10px', borderRadius: 7,
    border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--text)' };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="edp-seg">
          {MODOS.map((m) => (
            <button key={m.id} className={modo === m.id ? 'on' : ''}
                    onClick={() => { setModo(m.id); setMsg(null); setSelecionados(new Set()); }}>{m.rotulo}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="edp-btn ghost sm" disabled={salvando} onClick={desfazer}>↩ Reverter último salvamento</button>
      </div>

      {msg && (
        <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13,
                      background: msg.tipo === 'ok' ? 'var(--tint-green)' : 'var(--tint-amber)' }}>
          {msg.texto}
        </div>
      )}

      {(modo === 'rapida' || comSelecao) && (
        <React.Fragment>
          <Filters registros={dados.registros} registrosFiltrados={filtrados}
                   estado={estadoFiltros} setEstado={setEstadoFiltros} />

          {modo === 'lote' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={loteStatus} onChange={(e) => setLoteStatus(e.target.value)} style={estiloCampo}>
                <option value="">Status: (manter atual)</option>
                {dados.meta.status_opcoes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={lotePrioridade} onChange={(e) => setLotePrioridade(e.target.value)} style={estiloCampo}>
                <option value="">Prioridade: (manter atual)</option>
                {dados.meta.prioridade_opcoes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input value={loteMes} placeholder="Novo mês execução (ex: jun-2026)"
                     onChange={(e) => setLoteMes(e.target.value)} style={estiloCampo} />
              <button className="edp-btn sm" disabled={salvando} onClick={aplicarLote}
                      style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                Aplicar e salvar lote ({selecionados.size})
              </button>
            </div>
          )}
          {modo === 'exclusao' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                Marque as notas e confirme a exclusão. {selecionados.size} selecionada(s).
              </span>
              <button className="edp-btn sm" disabled={salvando} onClick={excluirSelecionadas}>🗑 Excluir selecionadas</button>
            </div>
          )}
          {modo === 'rapida' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                Duplo clique numa célula para editar. {edicoes.size} nota(s) com alterações pendentes.
              </span>
              <button className="edp-btn sm" disabled={salvando || edicoes.size === 0} onClick={salvarRapida}
                      style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                💾 Salvar edições
              </button>
              <button className="edp-btn ghost sm" disabled={edicoes.size === 0}
                      onClick={() => setEdicoes(new Map())}>❌ Descartar</button>
            </div>
          )}

          <NotesTable registros={filtrados} colunas={COLUNAS}
                      selecionados={comSelecao ? selecionados : undefined}
                      onToggleSelecionado={comSelecao ? toggleSelecionado : undefined}
                      onToggleTodos={comSelecao ? toggleTodos : undefined}
                      edicoes={modo === 'rapida' ? edicoes : undefined}
                      onEditar={modo === 'rapida' ? onEditar : undefined}
                      statusOpcoes={dados.meta.status_opcoes}
                      prioridadeOpcoes={dados.meta.prioridade_opcoes} />
        </React.Fragment>
      )}

      {modo === 'cadastro' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 320px))', gap: 10 }}>
          {Object.keys(NOTA_VAZIA).map((campo) => (
            <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>{ROTULOS[campo] ?? campo}</span>
              {campo === 'Status_Nota' || campo === 'Prioridade_Nota' ? (
                <select value={novaNota[campo]} style={estiloCampo}
                        onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })}>
                  {(campo === 'Status_Nota' ? dados.meta.status_opcoes : dados.meta.prioridade_opcoes)
                    .map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={novaNota[campo]} style={estiloCampo}
                       onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
              )}
            </label>
          ))}
          <div style={{ alignSelf: 'end' }}>
            <button className="edp-btn sm" disabled={salvando} onClick={cadastrar}
                    style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
              💾 Salvar nova nota
            </button>
          </div>
        </div>
      )}

      {modo === 'colagem' && (
        <React.Fragment>
          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
            Cole aqui as linhas copiadas do Excel (sem cabeçalho). Ordem das colunas:{' '}
            {COLUNAS_COLAGEM.map((c) => ROTULOS[c] ?? c).join(' · ')}
          </p>
          <textarea value={textoColagem} rows={8} placeholder="Ctrl+V com as linhas do Excel…"
                    onChange={(e) => setTextoColagem(e.target.value)}
                    style={{ ...estiloCampo, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          {previewColagem.length > 0 && (
            <React.Fragment>
              <span style={{ fontSize: 12.5 }}>{previewColagem.length} linha(s) reconhecida(s) — confira antes de salvar:</span>
              <NotesTable colunas={COLUNAS.filter((c) => COLUNAS_COLAGEM.includes(c.key))}
                          registros={previewColagem.map((r, i) => ({ ...r, Numero_Nota: Number(r.Numero_Nota) || -(i + 1) })) as NotaInput[]}
                          altura={240} />
              <div>
                <button className="edp-btn sm" disabled={salvando} onClick={salvarColagem}
                        style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
                  💾 Salvar lote ({previewColagem.length})
                </button>
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      <IdentityModal aberto={acaoPendente !== null}
                     onConfirmado={() => { const acao = acaoPendente; setAcaoPendente(null); acao?.(); }}
                     onCancelar={() => setAcaoPendente(null)} />
    </div>
  );
}
```

- [ ] **Step 3: Ligar na seção**

Em `input-section.tsx`, trocar o placeholder:

```tsx
import { Manage } from './manage';
// ...
{dados && aba === 'gerenciar' && <Manage dados={dados} />}
```

- [ ] **Step 4: Verificar e commitar**

Run: `cd frontend; npm run build`
Expected: build sem erros

Verificação manual (backend + dev server): editar uma célula e salvar pede o
nome na primeira vez; o log aparece em `GET /api/input/logs`; lote, exclusão,
cadastro, colagem e desfazer funcionam.

```bash
git add frontend/src/input/identity-modal.tsx frontend/src/input/manage.tsx frontend/src/input/input-section.tsx
git commit -m "feat(input): aba gerenciar com edicao, lote, exclusao, cadastro, colagem e undo"
```

---

## FASE 4 — Relatórios e Logs

### Task 15: Aba Relatórios (`reports.tsx`)

**Files:**
- Create: `frontend/src/input/reports.tsx`
- Modify: `frontend/src/input/input-section.tsx` (placeholder de "relatorios")

- [ ] **Step 1: Implementar `reports.tsx`**

```tsx
import React from 'react';
import type { Celula, InputDataset, NotaInput } from './types';
import { InputApi, baixarBlob } from './api';
import { valoresUnicos } from './lib';
import type { ColunaDef } from './columns';
import { NotesTable } from './notes-table';

/** Cores do "semáforo" (porte de Input/app.py:1132-1139). */
const CORES_AUDITORIA: Record<string, string> = {
  '🟢 Adiantado': '#28a745', '🔵 No Prazo': '#007bff', '🔴 Com Atraso': '#dc3545',
  '🟣 Fora do Plano': '#6f42c1', '⚠️ Passível de Encerramento': '#ffc107',
  '⚪ Em Andamento (No Prazo)': '#585c5d', '⚪ Sem Planejamento': '#6c757d',
  '⏳Sem Data SAP': '#410707', '⚠️ Data SAP Inválida': '#343a40',
  '⚠️ Sem Mês Planejado Válido': '#fd7e14', '⚠️ Erro na Análise': '#000000',
};

const COLUNAS_AUDITORIA: ColunaDef[] = [
  { key: 'Numero_Nota', label: 'Nº Nota', numeric: true },
  { key: 'Conjunto', label: 'Conjunto' },
  { key: 'Status_Nota', label: 'Status Nota', largura: 170 },
  { key: 'Status_Final', label: 'Status Final' },
  { key: 'Ordem_Executada', label: 'Ordem Exec.' },
  { key: 'Encerram.por data', label: 'Data Encerramento SAP' },
  { key: 'Mes_Execucao_Planejado', label: 'Mês Planejado' },
  { key: 'Auditoria_Cronograma', label: 'Resultado da Auditoria', largura: 220 },
  { key: 'Regional', label: 'Regional' },
  { key: 'Centro_Responsavel', label: 'Centro Responsável' },
];

const FILTROS_RAPIDOS = ['(Nenhum)', 'Passíveis de Encerramento', 'Em Andamento',
  'Encerradas', 'Ordem Executada (SAP)'] as const;

function anoEncerramento(v: Celula | undefined): number | null {
  if (v === null || v === undefined || v === '-' || v === '') return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

interface FatiaRosca { rotulo: string; qtd: number; cor: string; }

function Rosca({ fatias }: { fatias: FatiaRosca[] }): React.JSX.Element {
  const total = fatias.reduce((a, f) => a + f.qtd, 0) || 1;
  const R = 70; const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Distribuição por status de prazo">
        {fatias.map((f) => {
          const frac = f.qtd / total;
          const offset = acumulado; acumulado += frac;
          return (
            <circle key={f.rotulo} cx="90" cy="90" r={R} fill="none" stroke={f.cor} strokeWidth="34"
                    strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-offset * C}
                    transform="rotate(-90 90 90)" />
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        {fatias.map((f) => (
          <span key={f.rotulo}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                           background: f.cor, marginRight: 6 }} />
            {f.rotulo}: <strong className="edp-mono">{f.qtd}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Reports({ dados }: { dados: InputDataset }): React.JSX.Element {
  const [rapido, setRapido] = React.useState<(typeof FILTROS_RAPIDOS)[number]>('(Nenhum)');
  const [fAnos, setFAnos] = React.useState<string[]>([]);
  const [fStatus, setFStatus] = React.useState<string[]>([]);
  const [fRegional, setFRegional] = React.useState<string[]>([]);
  const [exportando, setExportando] = React.useState(false);

  const auditadas = React.useMemo(() => {
    let r: NotaInput[] = dados.registros;
    if (rapido === 'Passíveis de Encerramento') {
      r = r.filter((n) => n.Status_Nota !== '99 Encerrado' && n.Ordem_Executada === 'SIM');
    } else if (rapido === 'Em Andamento') {
      r = r.filter((n) => n.Status_Nota !== '99 Encerrado');
    } else if (rapido === 'Encerradas') {
      r = r.filter((n) => n.Status_Nota === '99 Encerrado');
    } else if (rapido === 'Ordem Executada (SAP)') {
      r = r.filter((n) => n.Ordem_Executada === 'SIM');
    }
    if (fAnos.length) r = r.filter((n) => fAnos.includes(String(anoEncerramento(n['Encerram.por data']) ?? '')));
    if (fStatus.length) r = r.filter((n) => fStatus.includes(String(n.Auditoria_Cronograma ?? '')));
    if (fRegional.length) r = r.filter((n) => fRegional.includes(String(n.Regional ?? '')));
    return r;
  }, [dados.registros, rapido, fAnos, fStatus, fRegional]);

  const contagens = React.useMemo(() => {
    const mapa = new Map<string, number>();
    auditadas.forEach((n) => {
      const k = String(n.Auditoria_Cronograma ?? '—');
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
    });
    return mapa;
  }, [auditadas]);

  const anosDisponiveis = React.useMemo(() => {
    const anos = new Set<string>();
    dados.registros.forEach((n) => { const a = anoEncerramento(n['Encerram.por data']); if (a) anos.add(String(a)); });
    return [...anos].sort().reverse();
  }, [dados.registros]);

  const kpis: { rotulo: string; valor: number }[] = [
    { rotulo: 'Total Auditadas', valor: auditadas.length },
    { rotulo: 'No Prazo', valor: contagens.get('🔵 No Prazo') ?? 0 },
    { rotulo: 'Antecipadas', valor: contagens.get('🟢 Adiantado') ?? 0 },
    { rotulo: 'Com Atraso', valor: contagens.get('🔴 Com Atraso') ?? 0 },
    { rotulo: 'Fora do Plano', valor: contagens.get('🟣 Fora do Plano') ?? 0 },
    { rotulo: 'Passíveis Encerram.', valor: contagens.get('⚠️ Passível de Encerramento') ?? 0 },
  ];

  const fatias: FatiaRosca[] = [...contagens.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rotulo, qtd]) => ({ rotulo, qtd, cor: CORES_AUDITORIA[rotulo] ?? '#888' }));

  async function exportar(): Promise<void> {
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        auditadas.map((n) => n.Numero_Nota), COLUNAS_AUDITORIA.map((c) => c.key));
      baixarBlob(blob, `Auditoria_Prazos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  function multi(rotulo: string, opcoes: string[], valores: string[], setValores: (v: string[]) => void): React.JSX.Element {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
        <span style={{ color: 'var(--text-dim)' }}>{rotulo}</span>
        <select multiple size={4} value={valores} style={{ minWidth: 180 }}
                onChange={(e) => setValores([...e.target.selectedOptions].map((o) => o.value))}>
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: 18, overflow: 'auto' }}>
      <h3 style={{ margin: 0 }}>Auditoria de Prazos (DDPM vs SAP)</h3>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="edp-seg">
          {FILTROS_RAPIDOS.map((f) => (
            <button key={f} className={rapido === f ? 'on' : ''} onClick={() => setRapido(f)}>{f}</button>
          ))}
        </div>
        {multi('Ano Encerramento (SAP)', anosDisponiveis, fAnos, setFAnos)}
        {multi('Status de Prazo', valoresUnicos(dados.registros, 'Auditoria_Cronograma'), fStatus, setFStatus)}
        {multi('Regional', valoresUnicos(dados.registros, 'Regional'), fRegional, setFRegional)}
        <button className="edp-btn sm" disabled={exportando || auditadas.length === 0}
                onClick={() => { void exportar(); }}>⬇ Baixar relatório</button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpis.map((k) => (
          <div key={k.rotulo} style={{ border: '1px solid var(--line)', borderRadius: 8,
                                       padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase' }}>{k.rotulo}</div>
            <div className="edp-mono" style={{ fontSize: 22 }}>{k.valor}</div>
          </div>
        ))}
      </div>

      <NotesTable registros={auditadas} colunas={COLUNAS_AUDITORIA} altura={420} />
      {fatias.length > 0 && <Rosca fatias={fatias} />}
    </div>
  );
}
```

- [ ] **Step 2: Ligar na seção, verificar, commitar**

Em `input-section.tsx`: `import { Reports } from './reports';` e
`{dados && aba === 'relatorios' && <Reports dados={dados} />}`.

Run: `cd frontend; npm run build`
Expected: build sem erros

```bash
git add frontend/src/input/reports.tsx frontend/src/input/input-section.tsx
git commit -m "feat(input): aba relatorios com auditoria, kpis e grafico de rosca"
```

### Task 16: Aba Logs (`logs.tsx`)

**Files:**
- Create: `frontend/src/input/logs.tsx`
- Modify: `frontend/src/input/input-section.tsx` (placeholder de "logs")

- [ ] **Step 1: Implementar `logs.tsx`**

```tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { InputApi } from './api';
import type { LogRegistro } from './types';

type SubAba = 'notas' | 'arquivos' | 'timeline';

export function formatarDataHora(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR');
}

const estiloTh: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', fontSize: 11,
  textTransform: 'uppercase', color: 'var(--text-mute)', borderBottom: '1px solid var(--line)' };
const estiloTd: React.CSSProperties = { padding: '6px 10px', fontSize: 12.5,
  borderBottom: '1px solid var(--line)' };

export function Logs(): React.JSX.Element {
  const [sub, setSub] = React.useState<SubAba>('notas');
  const [filtroNota, setFiltroNota] = React.useState('');
  const [filtroUsuario, setFiltroUsuario] = React.useState('');
  const [notaTimeline, setNotaTimeline] = React.useState('');

  const logs = useQuery({ queryKey: ['input-logs'], queryFn: InputApi.logs });
  const logsArquivos = useQuery({ queryKey: ['input-logs-arquivos'], queryFn: InputApi.logsArquivos });
  const numeroTimeline = /^\d+$/.test(notaTimeline) ? Number(notaTimeline) : null;
  const timeline = useQuery({
    queryKey: ['input-timeline', numeroTimeline],
    queryFn: () => InputApi.timeline(numeroTimeline as number),
    enabled: numeroTimeline !== null,
  });

  const registros: LogRegistro[] = (logs.data?.registros ?? []).filter((r) =>
    (filtroNota === '' || String(r.Numero_Nota) === filtroNota.trim()) &&
    (filtroUsuario === '' || r.Usuario === filtroUsuario));
  const usuarios = [...new Set((logs.data?.registros ?? []).map((r) => r.Usuario))].sort();

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 18, overflow: 'auto' }}>
      <div className="edp-seg" style={{ alignSelf: 'flex-start' }}>
        <button className={sub === 'notas' ? 'on' : ''} onClick={() => setSub('notas')}>Alterações nas Notas</button>
        <button className={sub === 'arquivos' ? 'on' : ''} onClick={() => setSub('arquivos')}>Bases de Apoio</button>
        <button className={sub === 'timeline' ? 'on' : ''} onClick={() => setSub('timeline')}>Linha do Tempo</button>
      </div>

      {sub === 'notas' && (
        <React.Fragment>
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={filtroNota} placeholder="Filtrar por nº da nota"
                   onChange={(e) => setFiltroNota(e.target.value)}
                   style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--line)',
                            background: 'var(--bg-2)', color: 'var(--text)' }} />
            <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}>
              <option value="">Todos os usuários</option>
              {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Nº Nota', 'Usuário', 'Data e Hora', 'Campo', 'Valor Antigo', 'Valor Novo']
                .map((h) => <th key={h} style={estiloTh}>{h}</th>)}
            </tr></thead>
            <tbody>
              {registros.slice(0, 500).map((r) => (
                <tr key={r.ID_Log}>
                  <td style={estiloTd} className="edp-mono">{r.Numero_Nota}</td>
                  <td style={estiloTd}>{r.Usuario}</td>
                  <td style={estiloTd}>{formatarDataHora(r.Data_Hora)}</td>
                  <td style={estiloTd}>{r.Campo_Alterado}</td>
                  <td style={estiloTd}>{r.Valor_Antigo}</td>
                  <td style={estiloTd}>{r.Valor_Novo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {registros.length === 0 && <span style={{ color: 'var(--text-mute)' }}>Nenhum registro encontrado.</span>}
        </React.Fragment>
      )}

      {sub === 'arquivos' && (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead><tr>{['Arquivo', 'Usuário', 'Data e Hora', 'Ação'].map((h) => <th key={h} style={estiloTh}>{h}</th>)}</tr></thead>
          <tbody>
            {(logsArquivos.data?.registros ?? []).map((r) => (
              <tr key={r.ID_Log}>
                <td style={estiloTd}>{r.Nome_Arquivo}</td>
                <td style={estiloTd}>{r.Usuario}</td>
                <td style={estiloTd}>{formatarDataHora(r.Data_Hora)}</td>
                <td style={estiloTd}>{r.Acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sub === 'timeline' && (
        <React.Fragment>
          <input value={notaTimeline} placeholder="Digite o nº da nota"
                 onChange={(e) => setNotaTimeline(e.target.value)}
                 style={{ width: 220, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--line)',
                          background: 'var(--bg-2)', color: 'var(--text)' }} />
          {(timeline.data?.registros ?? []).map((r) => (
            <div key={r.ID_Log} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                <strong>{formatarDataHora(r.Data_Hora)}</strong> · por <code>{r.Usuario}</code>
              </div>
              <div style={{ fontSize: 13 }}>
                Alterou <strong>{r.Campo_Alterado}</strong> de <code>{r.Valor_Antigo || '—'}</code> para <code>{r.Valor_Novo || '—'}</code>
              </div>
            </div>
          ))}
          {numeroTimeline !== null && timeline.data?.registros.length === 0 && (
            <span style={{ color: 'var(--text-mute)' }}>Nenhum histórico para a nota {numeroTimeline}.</span>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ligar na seção, verificar, commitar**

Em `input-section.tsx`: `import { Logs } from './logs';` e
`{dados && aba === 'logs' && <Logs />}`.

Run: `cd frontend; npm run build`
Expected: build sem erros

```bash
git add frontend/src/input/logs.tsx frontend/src/input/input-section.tsx
git commit -m "feat(input): aba logs com alteracoes, arquivos e linha do tempo"
```

---

## FASE 5 — Configurações e fechamento

### Task 17: Aba Configurações (`settings.tsx`)

**Files:**
- Create: `frontend/src/input/settings.tsx`
- Modify: `frontend/src/input/input-section.tsx` (placeholder de "config")

- [ ] **Step 1: Implementar `settings.tsx`**

```tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InputDataset } from './types';
import { getUsuario, InputApi, setUsuario } from './api';
import { useRecarregarInput } from './use-input-data';

const estiloCampo: React.CSSProperties = { padding: '6px 10px', borderRadius: 7,
  border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--text)' };

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      <h4 style={{ margin: '0 0 10px' }}>{titulo}</h4>
      {children}
    </section>
  );
}

export function Settings({ dados }: { dados: InputDataset }): React.JSX.Element {
  const recarregar = useRecarregarInput();
  const [msg, setMsg] = React.useState('');
  const [nome, setNome] = React.useState(getUsuario() ?? '');
  const [linhasResp, setLinhasResp] = React.useState<[string, string][] | null>(null);

  const responsaveis = useQuery({ queryKey: ['input-resp'], queryFn: InputApi.responsaveis });
  const backups = useQuery({ queryKey: ['input-backups'], queryFn: InputApi.backups });

  const linhas = linhasResp ?? Object.entries(responsaveis.data ?? {});

  async function agir(fn: () => Promise<unknown>, ok: string): Promise<void> {
    setMsg('');
    try { await fn(); setMsg(ok); } catch (e) { setMsg(`Erro: ${(e as Error).message}`); }
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: 18, overflow: 'auto' }}>
      {msg && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--tint-green)', fontSize: 13 }}>{msg}</div>}

      <Cartao titulo="Seu nome (log de auditoria)">
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} style={estiloCampo} />
          <button className="edp-btn sm" disabled={!nome.trim()}
                  onClick={() => { setUsuario(nome); setMsg('Nome atualizado.'); }}>Salvar</button>
        </div>
      </Cartao>

      <Cartao titulo="Responsáveis por Conjunto">
        {linhas.map(([conjunto, pessoa], i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input value={conjunto} style={estiloCampo}
                   onChange={(e) => { const c = [...linhas] as [string, string][]; c[i] = [e.target.value, pessoa]; setLinhasResp(c); }} />
            <input value={pessoa} style={estiloCampo}
                   onChange={(e) => { const c = [...linhas] as [string, string][]; c[i] = [conjunto, e.target.value]; setLinhasResp(c); }} />
            <button className="edp-btn ghost sm"
                    onClick={() => setLinhasResp(linhas.filter((_, j) => j !== i) as [string, string][])}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="edp-btn ghost sm"
                  onClick={() => setLinhasResp([...linhas, ['', '']] as [string, string][])}>+ Adicionar</button>
          <button className="edp-btn sm" onClick={() => { void agir(async () => {
            await InputApi.salvarResponsaveis(Object.fromEntries(linhas.filter(([c]) => c.trim() !== '')));
            await responsaveis.refetch(); setLinhasResp(null);
          }, 'Responsáveis atualizados.'); }}>Salvar responsáveis</button>
        </div>
      </Cartao>

      <Cartao titulo="Bases de Apoio (rede EDP)">
        {dados.meta.bases.map((b) => (
          <div key={b.arquivo} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ minWidth: 280, fontSize: 13 }}>{b.nome}</span>
            <span style={{ fontSize: 11, color: b.encontrada ? 'var(--green)' : 'var(--red, #dc3545)' }}>
              {b.encontrada ? '● conectada' : '● indisponível'}
            </span>
            {b.encontrada && (
              <a className="edp-btn ghost sm" href={InputApi.urlDownloadBase(b.arquivo)} download>⬇ Baixar atual</a>
            )}
            <label className="edp-btn ghost sm" style={{ cursor: 'pointer' }}>
              ↑ Substituir…
              <input type="file" accept=".xlsx" style={{ display: 'none' }}
                     onChange={(e) => {
                       const f = e.target.files?.[0];
                       if (!f) return;
                       if (!getUsuario()) { setMsg('Defina seu nome acima antes de substituir bases.'); return; }
                       if (!window.confirm(`Substituir "${b.arquivo}" na rede pelo arquivo "${f.name}"?`)) return;
                       void agir(async () => {
                         await InputApi.substituirBase(b.arquivo, f);
                         await recarregar();
                       }, `Base "${b.arquivo}" substituída.`);
                     }} />
            </label>
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: 'var(--text-mute)' }}>
          Não altere o nome das abas nem os cabeçalhos das planilhas — o sistema os procura exatamente como estão.
        </p>
      </Cartao>

      <Cartao titulo="Backups do banco (locais, rotativos)">
        {(backups.data?.backups ?? []).map((b) => (
          <div key={b.arquivo} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, fontSize: 12.5 }}>
            <span className="edp-mono" style={{ flex: 1 }}>{b.arquivo}</span>
            <span style={{ color: 'var(--text-dim)' }}>{new Date(b.modificado).toLocaleString('pt-BR')} · {b.tamanho_mb} MB</span>
            <a className="edp-btn ghost sm" href={InputApi.urlDownloadBackup(b.arquivo)} download>⬇ Baixar</a>
          </div>
        ))}
        {(backups.data?.backups ?? []).length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--text-mute)' }}>
            Nenhum backup ainda — o primeiro é criado automaticamente no próximo salvamento.
          </span>
        )}
      </Cartao>
    </div>
  );
}
```

Atenção: as bases da aba Configurações vêm de `dados.meta.bases` (as 7 lidas
pelo motor); o backend só permite download/upload das 5 de `BASES_APOIO` —
para as 2 extrações SAP os botões retornarão 404. Para evitar isso, filtrar:
mostrar botões de download/substituição apenas quando `b.arquivo` não começa
com `Gerada_` (as extrações do robô não são editáveis manualmente).
Implementar esse filtro no `b.encontrada && (...)` e no label de substituição:

```tsx
const gerenciavel = !b.arquivo.startsWith('Gerada_');
```

e envolver os dois botões com `{gerenciavel && (...)}`.

- [ ] **Step 2: Ligar na seção, verificar, commitar**

Em `input-section.tsx`: `import { Settings } from './settings';` e
`{dados && aba === 'config' && <Settings dados={dados} />}`.

Run: `cd frontend; npm run build`
Expected: build sem erros

```bash
git add frontend/src/input/settings.tsx frontend/src/input/input-section.tsx
git commit -m "feat(input): aba configuracoes com responsaveis, bases e backups"
```

### Task 18: Documentação e verificação final

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar o README**

Na seção "Estrutura", acrescentar as linhas do módulo:

```
├── frontend/   React 18 + TypeScript + Vite + TanStack Query
│   └── src/
│       ├── components/   shared, dashboard, sidebar, upload-screen,
│       │                 duplicate-compare, coffee-section, tweaks-panel
│       ├── input/        módulo Input (gestão de notas do departamento)
│       ├── hooks/        useTriageData (TanStack Query)
│       ├── api.ts        integração com o backend + COFFEE/Maps
│       ├── data.ts       dataset de demonstração (offline)
│       └── types.ts      tipos compartilhados
├── backend/    FastAPI + pandas
│   ├── main.py           endpoints /api/* + parsing da planilha
│   ├── input_module/     módulo Input: banco SQLite local + motor de
│   │                     enriquecimento (Excels da rede EDP) + /api/input/*
│   └── test_upload.py / test_input_module.py    testes (pytest)
```

E acrescentar uma seção nova após "API":

```markdown
## Módulo Input (Gestão de Notas)

Porte do painel Streamlit do departamento (spec em
`docs/superpowers/specs/2026-06-11-input-module-design.md`).

- Banco local: `backend/data/notas_departamento.db` (migrado automaticamente
  do servidor `\\ebeat-fp1` na primeira execução, se a rede estiver acessível).
- O motor cruza o banco com as planilhas da rede EDP (SAP IW28/IW38,
  indicadores ANEEL etc.); sem rede, o painel funciona com indicadores parciais.
- Após cada salvamento, regrava `Base_Notas_Sincronizada.xlsx` na rede
  (alimenta o BI do departamento) e mantém backups rotativos locais.
- Escritas exigem o header `X-User` (a UI pede o nome na primeira edição).
- API: `GET/PATCH/POST/DELETE /api/input/notas`, `/api/input/desfazer`,
  `/api/input/logs*`, `/api/input/export`, `/api/input/responsaveis`,
  `/api/input/bases*`, `/api/input/backups*`, `/api/input/sync`.
- O módulo não tem modo demo: exige o backend rodando.
```

- [ ] **Step 2: Verificação completa**

Run: `cd backend; python -m pytest test_input_module.py test_upload.py -v`
Expected: todos PASSED

Run: `cd frontend; npm run build`
Expected: build sem erros

Verificação manual de ponta a ponta (backend + dev server):
1. Abrir o app → sidebar visível sem upload; Triagem ainda pede planilha.
2. Input → Visão Geral carrega notas; filtros, calculadora e export funcionam.
3. Gerenciar → editar célula, salvar (pede nome), conferir em Logs.
4. Reverter último salvamento → valor volta.
5. Relatórios → KPIs e rosca coerentes com os dados.
6. Configurações → bases com status; backups listados após um salvamento.

- [ ] **Step 3: Commit final**

```bash
git add README.md
git commit -m "docs: documenta o modulo Input no README"
```

---

## Fora do escopo deste plano (registrado na spec)

- `Input/Sap_Robot.py` — continua rodando à parte.
- Autenticação com senha; modo demo para o Input; tabela `bloqueios`.
- A pasta `Input/` permanece no repositório como referência até o fim da
  migração; removê-la é decisão futura do usuário.
