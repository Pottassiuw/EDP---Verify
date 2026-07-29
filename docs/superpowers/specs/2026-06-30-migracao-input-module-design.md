# Spec — Migração de melhorias `new_input_modules` → `input_module`

**Data:** 2026-06-30
**Status:** Aprovado (design). Execução em 4 fases, cada uma com seu plano/impl/review.

---

## 1. Contexto

`backend/input_module/` é a implementação atual (FastAPI), fonte de verdade,
montada em `main.py:292`, coberta por `backend/test_input_module.py` e consumida
pelo frontend (`frontend/src/input/columns.ts`).

`backend/new_input_modules/` é a versão mais recente desenvolvida para o software
antigo em Streamlit. Serve apenas como **referência**; não deve ser copiada
diretamente. Mapeamento de equivalência:

| new_input_modules | input_module | Observação |
|---|---|---|
| `config.py` | `config.py` | dicts de domínio + caminhos |
| `database.py` | `db.py` | persistência SQLite |
| `processamento.py` | `engine.py` | motor de enriquecimento |
| — | `routes.py` | rotas FastAPI (sem par no Streamlit) |

**Fora de escopo (não migram):** `SQL.py` (ETL one-shot), `Sap_Robot.py` (RPA SAP),
`executar_painel.py` (launcher Streamlit), `check_app.py` (verificador de `app.py`),
`@st.cache_data`, conexão singleton + PRAGMA de rede (input usa DB local, abordagem
correta), tabela `bloqueios` (teste `test_inicializar_banco_cria_tabelas` proíbe),
export `xlsxwriter`/Power Query (alvo diferente — input gera `Base_Notas_Sincronizada`).

## 2. Achados de correção (motivam o Grupo C)

Inspeção do `notas_departamento.db` novo confirmou que o Grupo C é **correção**,
não cosmético:

1. `Mes_Execucao_Planejado` armazenado como ISO `2026-12-01 00:00:00`. O
   `salvar_em_massa` atual **não** reconverte → ao editar, grava a string de
   exibição (`dez-2026`) e corrompe a data. `converter_para_iso_data` corrige.
2. `Status_Nota` contém `997` no DB novo. `STATUS_MAP` do input **não tem 997**
   → essas notas renderizam vazias (`.map(STATUS_MAP)` = NaN). Adicionar 997 corrige.
3. Input tem `53: "Programado Execução"` (sem prefixo numérico) → `status_para_int`
   não acha dígito no regex `^(\d+)` e retorna `0` → salvar status 53 corrompe.
   Novo `53: "53 Programado Execução"` corrige o roundtrip.

## 3. Decisões

- **Faseamento:** 4 fases sequenciais; cada fase é spec→plan→impl→review→
  (`build frontend` + subir backend) antes de prosseguir.
- **Grupo C** tratado como correção, exceto o item abaixo.
- **`Ordem` mantém o sentinela `"Fora SAP"`** — trocar por `"-"` é regressão
  (quebra `df.loc[df['Ordem'] != "Fora SAP"]` e `test_engine_cruza_iw28_iw38`).
- **Fase 4 (Ramal/Nota_Mae) gated:** o DB novo já contém `notas_ramal` (52.412
  linhas) e `Nota_Mae` (319 vínculos). A substituição/merge do DB ativo
  (`data/notas_departamento.db`, 16.258 notas) exige **confirmação explícita**
  antes de sobrescrever. Ramal **não** puxa automático — apenas CRUD manual via API/UI.
- Toda mudança de front usa a skill `frontend-design`.

## 4. Fases

### Fase 1 — Grupo A (baixo risco, somente backend)

Arquivos: `input_module/db.py`, `input_module/engine.py`, `test_input_module.py`.

- `db.inicializar_banco`: criar índices `idx_log_alteracoes_nota`,
  `idx_log_alteracoes_data`, `idx_log_arquivos_data`.
- `db.deletar_notas`: registrar log de auditoria (`Campo_Alterado = "EXCLUSÃO DE NOTA"`)
  na mesma transação, antes do `DELETE`. Usuário do log: parâmetro recebido da rota
  (não `os.getlogin()`, que não faz sentido no servidor).
- `db.carregar_logs` / `db.carregar_log_arquivos`: fallback `DataFrame` vazio (colunas
  conhecidas) em exceção.
- `db.carregar_dados`: `pd.to_datetime(..., format='mixed')`; normalização
  `Prioridade_Nota` (`Programavel`→`Programável`, `Prioritario`→`Prioritário`).
- `engine.enriquecer_dados`: `Total_planejado_ordem`/`Total_real_ordem` numéricos
  (`pd.to_numeric().fillna(0.0)`); sazonalidade via `iloc[:, 20:32]` em vez de
  `usecols="U:AF"`; preencher `Total_planejado_modular = Modular * quantidade`.

Critérios de aceite: suíte `test_input_module.py` verde; `deletar_notas` passa a
gerar log sem alterar o count retornado.

### Fase 2 — Grupo B (IW66 Medidas)

Arquivos: `config.py`, `engine.py`, `routes.py` (meta), `frontend/src/input/columns.ts`,
`test_input_module.py`.

- `config`: `CAMINHO_BASE_IW66` (`Gerada_medidas_IW66.XLSX`) + entrada em `BASES_REDE`.
- `engine`: leitor de medidas + `classificar_row` (m/un) + agregação por nota →
  `Medida_SAP` (`"X km / Y un"`); `Medida_vs_Planejado`. Fallback sem arquivo = `"-"`.
- `config.COLUNAS_PAINEL` / `NOMES_AMIGAVEIS`: incluir `Medida_SAP`,
  `Medida_vs_Planejado`, `Total_planejado_modular`.
- Frontend: colunas correspondentes em `columns.ts` (+ filtros se pertinente).
- Teste: fixture IW66 → assert `Medida_SAP`.

### Fase 3 — Grupo C (formato/contrato — correção)

Arquivos: `config.py`, `db.py`, `engine.py`, `test_input_module.py`.

- `config.STATUS_MAP`: `53: "53 Programado Execução"`, `999: "ENCE EXEC"`,
  `997: "SUPR CANC"`. Recriar `INV_STATUS_MAP`.
- `db.status_para_int`: ramos `"SUPR CANC"`/`"ENCE CANC"` → 997.
- `db.salvar_em_massa`: aplicar `converter_para_iso_data` em `Mes_Execucao_Planejado`.
- Alinhar tratamento numérico de `Status_Anterior`/`Status_Final` ao `processamento`
  **sem** quebrar `avaliar_prazo_sap` (lê `'99' in status`). Avaliar caso a caso.
- Excluído: troca do sentinela `Ordem` (mantém `"Fora SAP"`).
- Testes: 997 renderiza/roundtrip; status 53 roundtrip; save→load de data ISO.

### Fase 4 — Grupo D (Ramal + Nota_Mae) — gated

Arquivos: `db.py`, `routes.py`, frontend (aba Ramal + vínculo), `test_input_module.py`.

- **Migração de dados (com confirmação explícita):** substituir/mesclar
  `data/notas_departamento.db` pelo DB novo, que já traz `notas_ramal` e `Nota_Mae`.
- `db.inicializar_banco`: `ALTER TABLE notas ADD COLUMN Nota_Mae TEXT DEFAULT '-'`;
  `CREATE TABLE IF NOT EXISTS notas_ramal (...)`.
- `db`: portar `carregar_dados_ramal`, `salvar_em_massa_ramal`, `deletar_notas_ramal`,
  `vincular_notas_hierarquia(_lote)`; `reverter_ultima_alteracao` ciente de `notas`
  **e** `notas_ramal`.
- Rotas: `/api/input/ramal/*` (CRUD) + `/api/input/hierarquia` (vínculo).
- Frontend: aba Ramal + UI de vínculo mãe-filha.
- Ramal **não** puxa automático (sem RPA/ETL); apenas o que está no DB + CRUD manual.

## 5. Restrições transversais

- Preservar todas as rotas/contratos `/api/input/*` existentes.
- Manter separação routes (validação) / engine (regras) / db (acesso a dados).
- Sem `any` no TS; tokens de design no front (sem cores arbitrárias).
- Ao fim de cada fase: `build` do frontend + subir backend antes de reportar.
