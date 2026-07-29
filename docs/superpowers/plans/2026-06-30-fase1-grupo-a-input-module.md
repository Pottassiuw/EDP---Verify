# Fase 1 — Grupo A (melhorias de baixo risco) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar para `backend/input_module/` as melhorias internas de baixo risco do `new_input_modules` (índices SQL, log de exclusão, fallback de logs, robustez de datas/prioridade, coerção numérica e `Total_planejado_modular`), sem alterar contratos da API nem o frontend.

**Architecture:** Mudanças cirúrgicas em `db.py` e `engine.py`, com uma linha em `routes.py` para repassar o usuário ao log de exclusão. Cada tarefa segue TDD: teste falhando → implementação mínima → teste verde → commit. Suíte `backend/test_input_module.py` é a rede de segurança.

**Tech Stack:** Python, FastAPI, pandas, SQLite (sqlite3), pytest.

## Global Constraints

- Preservar todas as rotas/contratos `/api/input/*` existentes.
- Manter separação routes (validação) / engine (regras) / db (acesso a dados).
- `Ordem` mantém o sentinela `"Fora SAP"` (não trocar por `"-"`).
- Não criar tabela `bloqueios` (teste `test_inicializar_banco_cria_tabelas` proíbe).
- Testes rodam a partir de `backend/`: `cd backend && python -m pytest test_input_module.py -v`.
- Mensagens de commit em português, prefixo conventional commits.

---

## Mapa de arquivos

- Modify: `backend/input_module/db.py` — Tarefas 1, 2, 3, 4
- Modify: `backend/input_module/routes.py` — Tarefa 2 (repasse de `usuario`)
- Modify: `backend/input_module/engine.py` — Tarefa 5
- Test: `backend/test_input_module.py` — todas as tarefas

---

### Task 1: Índices SQL nas tabelas de log

**Files:**
- Modify: `backend/input_module/db.py` (`inicializar_banco`, ~linha 99-105)
- Test: `backend/test_input_module.py`

**Interfaces:**
- Consumes: fixture `banco_temporario` (já existe), `db.get_db_connection`.
- Produces: índices `idx_log_alteracoes_nota`, `idx_log_alteracoes_data`, `idx_log_arquivos_data` no schema.

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `backend/test_input_module.py` (após `test_inicializar_banco_cria_tabelas`):

```python
def test_inicializar_banco_cria_indices(banco_temporario):
    from input_module import db
    conn = db.get_db_connection()
    indices = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index'").fetchall()}
    conn.close()
    assert {"idx_log_alteracoes_nota", "idx_log_alteracoes_data",
            "idx_log_arquivos_data"} <= indices
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && python -m pytest test_input_module.py::test_inicializar_banco_cria_indices -v`
Expected: FAIL (índices não existem).

- [ ] **Step 3: Implementar (mínimo)**

Em `db.py`, dentro de `inicializar_banco`, imediatamente antes de `conn.commit()`:

```python
    # Índices para acelerar auditoria e logs
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_alteracoes_nota ON log_alteracoes(Numero_Nota)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_alteracoes_data ON log_alteracoes(Data_Hora DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_log_arquivos_data ON log_arquivos(Data_Hora DESC)')
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && python -m pytest test_input_module.py::test_inicializar_banco_cria_indices -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/db.py backend/test_input_module.py
git commit -m "perf(input): índices SQL em log_alteracoes e log_arquivos"
```

---

### Task 2: `deletar_notas` registra log de auditoria

**Files:**
- Modify: `backend/input_module/db.py` (`deletar_notas`, ~linha 379-398)
- Modify: `backend/input_module/routes.py` (`excluir_notas`, ~linha 186)
- Test: `backend/test_input_module.py`

**Interfaces:**
- Consumes: `db.salvar_em_massa`, `db.carregar_logs`, helper `_nota`.
- Produces: `db.deletar_notas(lista_numeros_nota: list, usuario: str = "sistema") -> int` — agora insere uma linha em `log_alteracoes` por nota excluída, na mesma transação, com `Campo_Alterado = "EXCLUSÃO DE NOTA"`.

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `backend/test_input_module.py`:

```python
def test_deletar_notas_gera_log(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([_nota(4100)]))
    assert db.deletar_notas([4100], usuario="tester") == 1
    logs = db.carregar_logs()
    linha = logs[logs["Numero_Nota"] == 4100].iloc[0]
    assert linha["Campo_Alterado"] == "EXCLUSÃO DE NOTA"
    assert linha["Usuario"] == "tester"
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && python -m pytest test_input_module.py::test_deletar_notas_gera_log -v`
Expected: FAIL (`deletar_notas` não aceita `usuario` / não grava log).

- [ ] **Step 3: Implementar — substituir `deletar_notas` inteira**

Em `db.py`, substituir a função `deletar_notas` por:

```python
def deletar_notas(lista_numeros_nota: list, usuario: str = "sistema") -> int:
    """Exclui notas do banco e registra a exclusão no log de auditoria.

    O log e o DELETE ocorrem na mesma transação.
    """
    realizar_backup()
    if not lista_numeros_nota:
        return 0

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        data_hora_log = datetime.datetime.now()
        logs_exclusao = [
            (int(nota), usuario, data_hora_log,
             "EXCLUSÃO DE NOTA", "Registro Existente", "Registro Apagado")
            for nota in lista_numeros_nota
        ]
        cursor.executemany('''
            INSERT INTO log_alteracoes (Numero_Nota, Usuario, Data_Hora, Campo_Alterado, Valor_Antigo, Valor_Novo)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', logs_exclusao)

        notas_para_deletar = [(int(nota),) for nota in lista_numeros_nota]
        cursor.executemany('DELETE FROM notas WHERE Numero_Nota = ?', notas_para_deletar)
        count = cursor.rowcount
        conn.commit()
        return count
    except Exception as e:
        print(f"Erro ao deletar notas do banco: {e}")
        raise e
    finally:
        conn.close()
```

- [ ] **Step 4: Repassar o usuário pela rota**

Em `routes.py`, dentro de `excluir_notas`, trocar:

```python
    excluidas = db.deletar_notas(pedido.numeros)
```

por:

```python
    excluidas = db.deletar_notas(pedido.numeros, usuario=usuario)
```

- [ ] **Step 5: Rodar e confirmar que passa (e não regrediu)**

Run: `cd backend && python -m pytest test_input_module.py::test_deletar_notas_gera_log test_input_module.py::test_deletar_notas test_input_module.py::test_delete_e_desfazer -v`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/input_module/db.py backend/input_module/routes.py backend/test_input_module.py
git commit -m "feat(input): log de auditoria ao excluir notas"
```

---

### Task 3: Fallback dos leitores de log

**Files:**
- Modify: `backend/input_module/db.py` (`carregar_logs` ~linha 268-274 e `carregar_log_arquivos` ~linha 476-481)
- Test: `backend/test_input_module.py`

**Interfaces:**
- Consumes: `db.pd` (pandas importado no módulo).
- Produces: `carregar_logs()` e `carregar_log_arquivos()` retornam `DataFrame` vazio com colunas conhecidas em caso de exceção, em vez de propagar o erro.

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `backend/test_input_module.py`:

```python
def test_carregar_logs_fallback_em_erro(banco_temporario, monkeypatch):
    from input_module import db

    def boom(*args, **kwargs):
        raise RuntimeError("falha simulada de leitura")

    monkeypatch.setattr(db.pd, "read_sql", boom)
    logs = db.carregar_logs()
    assert logs.empty
    assert "Campo_Alterado" in logs.columns
    arquivos = db.carregar_log_arquivos()
    assert arquivos.empty
    assert "Nome_Arquivo" in arquivos.columns
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && python -m pytest test_input_module.py::test_carregar_logs_fallback_em_erro -v`
Expected: FAIL (RuntimeError propagado).

- [ ] **Step 3: Implementar — substituir as duas funções**

Em `db.py`, substituir `carregar_logs`:

```python
def carregar_logs() -> pd.DataFrame:
    """Carrega todos os registros da tabela de log de alterações."""
    conn = get_db_connection()
    try:
        return pd.read_sql("SELECT * FROM log_alteracoes ORDER BY Data_Hora DESC", conn)
    except Exception:
        return pd.DataFrame(columns=["ID_Log", "Numero_Nota", "Usuario",
                                     "Data_Hora", "Campo_Alterado",
                                     "Valor_Antigo", "Valor_Novo"])
    finally:
        conn.close()
```

e `carregar_log_arquivos`:

```python
def carregar_log_arquivos() -> pd.DataFrame:
    conn = get_db_connection()
    try:
        return pd.read_sql("SELECT * FROM log_arquivos ORDER BY Data_Hora DESC", conn)
    except Exception:
        return pd.DataFrame(columns=["ID_Log", "Nome_Arquivo", "Usuario",
                                     "Data_Hora", "Acao"])
    finally:
        conn.close()
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && python -m pytest test_input_module.py::test_carregar_logs_fallback_em_erro -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/db.py backend/test_input_module.py
git commit -m "fix(input): fallback de DataFrame vazio nos leitores de log"
```

---

### Task 4: Robustez de datas e normalização de prioridade em `carregar_dados`

**Files:**
- Modify: `backend/input_module/db.py` (`carregar_dados`, ~linha 211 e ~linha 248-249)
- Test: `backend/test_input_module.py`

**Interfaces:**
- Consumes: helper `_nota`.
- Produces: `carregar_dados()` parseia `Mes_Execucao_Planejado` com `format='mixed'` (não quebra com formatos heterogêneos) e normaliza acentuação de `Prioridade_Nota`.

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `backend/test_input_module.py`:

```python
def test_carregar_dados_qualidade(banco_temporario):
    from input_module import db
    db.salvar_em_massa(pd.DataFrame([
        _nota(4300, Prioridade_Nota="Programavel", Mes_Execucao_Planejado="jun-2026"),
        _nota(4301, Prioridade_Nota="Prioritario", Mes_Execucao_Planejado="2026-12-01 00:00:00"),
    ]))
    df = db.carregar_dados()
    assert len(df) == 2
    pri = dict(zip(df["Numero_Nota"], df["Prioridade_Nota"]))
    assert pri[4300] == "Programável"
    assert pri[4301] == "Prioritário"
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && python -m pytest test_input_module.py::test_carregar_dados_qualidade -v`
Expected: FAIL (prioridade sem acento).

- [ ] **Step 3a: Implementar — `format='mixed'`**

Em `carregar_dados`, trocar a linha:

```python
        dt_mes = pd.to_datetime(df['Mes_Execucao_Planejado'], errors='coerce')
```

por:

```python
        dt_mes = pd.to_datetime(df['Mes_Execucao_Planejado'], errors='coerce', format='mixed')
```

- [ ] **Step 3b: Implementar — normalização de prioridade**

Ainda em `carregar_dados`, dentro do bloco `if not df.empty:`, logo após o laço
`for col in df.columns:` que limpa textos (depois do tratamento de `Observacao`/`Check`)
e antes do `else:` do `if not df.empty`, inserir:

```python
        # Normaliza acentuação de prioridades comuns vindas do banco
        if 'Prioridade_Nota' in df.columns:
            df['Prioridade_Nota'] = df['Prioridade_Nota'].astype(str).str.strip()
            df['Prioridade_Nota'] = df['Prioridade_Nota'].replace({
                'Programavel': 'Programável', 'programavel': 'Programável',
                'PROGRAMAVEL': 'Programável', 'Prioritario': 'Prioritário',
                'prioritario': 'Prioritário', 'PRIORITARIO': 'Prioritário',
            })
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && python -m pytest test_input_module.py::test_carregar_dados_qualidade -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/db.py backend/test_input_module.py
git commit -m "fix(input): datas com format=mixed e prioridade acentuada em carregar_dados"
```

---

### Task 5: Coerção numérica de totais + `Total_planejado_modular` + sazonalidade robusta

**Files:**
- Modify: `backend/input_module/engine.py` (`enriquecer_dados`: bloco IW38 ~linha 285-289; bloco modulares ~linha 324-325, ~linha 367-368 e ~linha 377)
- Test: `backend/test_input_module.py`

**Interfaces:**
- Consumes: fixtures `engine_isolado`, `_excel_iw28`, `_excel_iw38`, helper `_nota`.
- Produces: `engine.enriquecer_dados()` retorna `Total_planejado_ordem`/`Total_real_ordem` numéricos (`float`) quando o IW38 existe, expõe a coluna `Total_planejado_modular` (= `Modular * Planejado_DDPM`, `0.0` sem base modular) e lê a sazonalidade por `iloc[:, 20:32]`.

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `backend/test_input_module.py` (junto aos testes de engine):

```python
def test_engine_totais_numericos_e_modular(engine_isolado):
    from input_module import config, db, engine
    db.salvar_em_massa(pd.DataFrame([_nota(2000, Status_Nota="99 Encerrado")]))
    _excel_iw28(config.CAMINHO_BASE_IW28)
    _excel_iw38(config.CAMINHO_CUSTO_ORD_IW38)
    df = engine.enriquecer_dados()
    linha = df[df["Numero_Nota"] == 2000].iloc[0]
    assert isinstance(linha["Total_planejado_ordem"], (int, float))
    assert isinstance(linha["Total_real_ordem"], (int, float))
    assert float(linha["Total_planejado_ordem"]) == 1000.0
    assert float(linha["Total_real_ordem"]) == 800.0
    assert "Total_planejado_modular" in df.columns
    assert float(linha["Total_planejado_modular"]) == 0.0
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && python -m pytest test_input_module.py::test_engine_totais_numericos_e_modular -v`
Expected: FAIL (`Total_planejado_modular` ausente; totais como string).

- [ ] **Step 3a: Coerção numérica dos totais (bloco IW38)**

Em `engine.py`, substituir as 4 linhas:

```python
                df.loc[df['Ordem'] != "Fora SAP", 'Total_planejado_ordem']  = chave_busca_ordem.map(dicionario_total_planejado_ordem).fillna("0")
                df['Total_planejado_ordem'] = df['Total_planejado_ordem'].fillna("0")

                df.loc[df['Ordem'] != "Fora SAP", 'Total_real_ordem']  = chave_busca_ordem.map(dicionario_total_real_ordem).fillna("0")
                df['Total_real_ordem'] = df['Total_real_ordem'].fillna("0")
```

por:

```python
                df.loc[df['Ordem'] != "Fora SAP", 'Total_planejado_ordem'] = chave_busca_ordem.map(dicionario_total_planejado_ordem).fillna(0.0)
                df['Total_planejado_ordem'] = pd.to_numeric(df['Total_planejado_ordem'], errors='coerce').fillna(0.0)

                df.loc[df['Ordem'] != "Fora SAP", 'Total_real_ordem'] = chave_busca_ordem.map(dicionario_total_real_ordem).fillna(0.0)
                df['Total_real_ordem'] = pd.to_numeric(df['Total_real_ordem'], errors='coerce').fillna(0.0)
```

- [ ] **Step 3b: Inicializar `Total_planejado_modular`**

Em `engine.py`, trocar:

```python
    colunas_modulo_9 = ['Modular', 'CHI', 'CI', 'Ocorrencia', 'DEC_PROG_CHI', 'CHI_Sazonal_2025']
```

por:

```python
    colunas_modulo_9 = ['Modular', 'CHI', 'CI', 'Ocorrencia', 'DEC_PROG_CHI', 'CHI_Sazonal_2025', 'Total_planejado_modular']
```

- [ ] **Step 3c: Calcular `Total_planejado_modular`**

Em `engine.py`, dentro de `if 'Conjunto' in df.columns:`, logo após a linha:

```python
                df['Modular'] = chave_busca.map(dict_custo).fillna(0.0)
```

inserir:

```python
                df['Total_planejado_modular'] = df['Modular'] * quantidade_g2
```

- [ ] **Step 3d: Sazonalidade por `iloc`**

Em `engine.py`, substituir o bloco:

```python
            dict_sazonal = {}
            try:
                df_sazonal_excel = pd.read_excel(config.CAMINHO_CUSTO_MODULAR, sheet_name='Modulares', skiprows=1, nrows=4, usecols="U:AF")
                dict_sazonal = dict(zip(df_sazonal_excel.iloc[0].astype(int), df_sazonal_excel.iloc[3].astype(float)))
            except Exception as e_saz:
                print(f"Sazonalidade não carregada: {e_saz}")
```

por:

```python
            dict_sazonal = {}
            try:
                df_sazonal_full = pd.read_excel(config.CAMINHO_CUSTO_MODULAR, sheet_name='Modulares', skiprows=1, nrows=4)
                if len(df_sazonal_full.columns) >= 21:
                    df_sazonal_excel = df_sazonal_full.iloc[:, 20:32]
                    if not df_sazonal_excel.empty:
                        dict_sazonal = dict(zip(df_sazonal_excel.iloc[0].astype(int), df_sazonal_excel.iloc[3].astype(float)))
            except Exception as e_saz:
                print(f"Sazonalidade não carregada: {e_saz}")
```

- [ ] **Step 4: Rodar e confirmar que passa (e não regrediu)**

Run: `cd backend && python -m pytest test_input_module.py::test_engine_totais_numericos_e_modular test_input_module.py::test_engine_cruza_iw28_iw38 test_input_module.py::test_auditoria_cronograma -v`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/input_module/engine.py backend/test_input_module.py
git commit -m "feat(input): totais de ordem numéricos, Total_planejado_modular e sazonalidade robusta"
```

---

### Task 6: Verificação final da fase

**Files:** nenhum (apenas verificação).

- [ ] **Step 1: Rodar a suíte completa do módulo Input**

Run: `cd backend && python -m pytest test_input_module.py -v`
Expected: todos PASS (incluindo os 5 testes novos).

- [ ] **Step 2: Subir o backend e checar boot**

Run: `cd backend && python -m uvicorn main:app --port 8000` (encerrar após confirmar startup sem erro).
Expected: servidor sobe sem traceback; `/api/input/notas` responde 200.

- [ ] **Step 3 (se houver `develop` limpa): nada a commitar** — commits já feitos por tarefa.

---

## Self-Review

- **Cobertura do spec (Fase 1):** índices (T1), log de exclusão (T2), fallback de logs (T3), `format='mixed'` + prioridade (T4), coerção numérica + `Total_planejado_modular` + sazonalidade (T5). Todos os itens do Grupo A no spec têm tarefa.
- **Placeholders:** nenhum — todo passo de código mostra o código exato.
- **Consistência de tipos:** `deletar_notas(lista, usuario="sistema")` definida em T2 e consumida pela rota em T2; nomes de colunas (`Total_planejado_modular`, `Campo_Alterado`) idênticos entre tarefas e testes.
- **Decisão preservada:** `"Fora SAP"` mantido em T5 (não trocado por `"-"`).
