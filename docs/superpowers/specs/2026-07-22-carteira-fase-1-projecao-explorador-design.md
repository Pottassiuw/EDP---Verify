# Carteira de Notas — Fase 1 (Projeção + Explorador) — Spec

Data: 2026-07-22
Status: aprovado para planejamento (mapa de colunas revisado com a engenharia)
Base: design geral (`2026-07-22-carteira-de-notas-design.md`) + descoberta
real (`docs/dev/databricks-schema-discovery.md`).

Esta spec detalha a **Fase 1** do roadmap: a projeção operacional local da
carteira e o explorador da base. É a fonte de verdade para o plano de
implementação.

---

## 1. Escopo

**Entra na Fase 1:**
- Projeção operacional local (`carteira.db`) da base COFFEE, sincronizada.
- Serviço de sincronização **idempotente** (completa + sinal de skip +
  agendada + manual).
- Seção nova **Carteira** com duas abas: **Explorador** (tabela paginada,
  filtros compostos, situação, detalhe em Sheet, KPIs leves) e
  **Sincronização** (estado, histórico, disparo manual).
- Situação da nota **derivada** (função pura: projeção × plano do Input).

**NÃO entra (fases posteriores):**
- Mover-para-plano em lote, `plano_movimentacoes`, coluna `origem` no Input,
  aba Divergências → **Fase 2**.
- Dashboard executivo completo (evolução mensal/acumulada, meta×plano×base,
  heatmap, drill-down), filtros salvos, command palette → **Fase 3**.
- Enriquecimento via `notas_sp` (join `ID_ONR`) → fase posterior.
- Notas de ES; write-back ao Databricks (Databricks é read-only).

## 2. Fonte de dados

- Catálogo/schema: `sandbox_uc.ddpm` (env `DATABRICKS_CATALOG`/
  `DATABRICKS_SCHEMA`, já fixados no `.env`).
- Tabela-base (espinha): **`coffee_onr_es_sp`** (280.834 linhas, 52 colunas).
- **Filtro SP**: `CSD IN ('GUARATINGUETÁ','SÃO JOSÉ DOS CAMPOS','GUARULHOS',
  'SUZANO','MOGI DAS CRUZES','LITORAL')` → ~98.051 linhas. A lista fica numa
  constante em `carteira_module` (não hardcoded espalhado).
- **De-para de regional** (base → app), em `mapping.py`:
  `LITORAL`→`Litoral Norte`, `SUZANO`→`Poá-Suzano`; demais iguais.

## 3. Modelo de dados (`backend/data/carteira.db`, SQLite)

### `nota_carteira` — projeção da espinha

**PK: `id_onr`** (INTEGER) — único e sempre presente (98.051/98.051, 0 nulos).
`id_sap` **não** é chave: tem sentinela `10000000` (pendente), vazios, e
1.548 duplicatas.

| Coluna | Tipo | Origem / regra |
|---|---|---|
| `id_onr` | INTEGER PK | `id_onr` |
| `id_sap` | TEXT | `id_sap` (pode ser `10000000`, vazio; não único) |
| `sap_real` | INTEGER (0/1) | derivado: `id_sap` não-nulo, não-vazio, ≠ `10000000` |
| `conjunto` | TEXT | `conjunto` |
| `descricao_conjunto` | TEXT | `descrição_conjunto` (nome com acento na origem; `mapping.py` referencia por posição/normalização) |
| `regional` | TEXT | `CSD` normalizado via de-para |
| `csd_origem` | TEXT | `CSD` cru (auditoria) |
| `empresa` | TEXT | `EMPRESA` |
| `quantidade` | INTEGER | `quantidade` (0–9999; 9999 = sentinela "sem valor" → `quantidade_valida=0`) |
| `quantidade_valida` | INTEGER (0/1) | derivado: `quantidade` ∉ {9999} |
| `prioridade` | TEXT | `prioridade` |
| `prioridade_sap` | INTEGER | `Prioridade_SAP` |
| `status_sap` | TEXT | `Status_SAP` (esparso: 142k nulos) |
| `data_encerramento_exec` | TEXT (ISO) | `Data_encerramento_exec` (preenchida ~28%) |
| `local_instalacao` | TEXT | `local_instalacao` |
| `alimentador` | TEXT | `alimentador` |
| `executor` | TEXT | `executor` |
| `sintoma` | TEXT | `sintoma` |
| `componente_novo`, `kit`, `n_trafo`, `dispositivo_protecao` | TEXT | equipamento (espalhado; enriquecimento limpo fica p/ `notas_sp` depois) |
| `latitude`, `longitude` | TEXT | coordenadas |
| `hash_conteudo` | TEXT | hash estável das colunas de negócio normalizadas |
| `sincronizado_em` | TEXT (ISO) | timestamp do último sync que tocou a linha |
| `criado_em` | TEXT (ISO) | primeira inserção |
| `atualizado_em` | TEXT (ISO) | última alteração de conteúdo |
| `ausente_na_origem_em` | TEXT (ISO) NULL | tombstone: sumiu da base (nunca DELETE) |

**PII deliberadamente NÃO projetada na Fase 1**: `colaborador`,
`matriculaSAP`, `nomeColaborador`, `Solicitante`. Não são necessárias para
explorador/KPIs; ficam fora até haver necessidade real com controle de acesso.

### `carteira_sync_execucoes` — auditoria de sync

`id` PK, `estrategia` (completa/skip), `iniciado_em`, `finalizado_em`,
`status` (ok/erro/skip), `refresh_marker` (valor de `Atualizacao` da origem),
`novas`, `atualizadas`, `inalteradas`, `ausentes` (tombstoned), `erro` TEXT,
`versao_resultante`. Persistida (sobrevive a restart — corrige o `_JOBS` em
memória do coffee_module).

### `carteira_logs` — observabilidade

`id` PK, `ts`, `trace_id`, `tipo` (databricks_call/sync/erro), `acao`,
`detalhes` JSON, `sucesso`. Padrão `coffee_logs` (best-effort, nunca levanta).

### `carteira_meta` — estado leve

Chave/valor: `ultimo_refresh_marker`, `versao` (contador do dataset p/ ETag).

## 4. Arquitetura backend

```
backend/databricks_module/        # já existe (Fase 0) — reutilizado
backend/carteira_module/
    config.py       # lista SP, nome de tabela/schema, tamanho de chunk
    db.py           # schema carteira.db + versao (bump) + acesso a meta
    repository.py   # SQL da projeção (paginação, filtros, agregados) — SQL
                    #   separado das regras (CLAUDE.md)
    mapping.py      # de-para colunas Databricks→domínio, regional, hash,
                    #   drop de PII, derivações (sap_real, quantidade_valida)
    situacao.py     # função pura: nota_carteira × plano → situação
    sync.py         # serviço de sincronização (completa + skip + reconcile)
    service.py      # casos de uso (página, resumo, estado do sync)
    routes.py       # endpoints finos (validar → service → responder)
```

Registro em `backend/main.py` (`app.include_router(carteira_router)`),
mesmo padrão dos outros módulos. `garantir_banco()` na inicialização.

## 5. Sincronização

`coffee_onr_es_sp` é **refresh completo por ETL**: `Atualizacao` é um único
valor para todas as linhas (carimbo do refresh, formato `dd-MM-yyyy HH:mm`),
não um timestamp por-nota. Portanto **não há incremental por-linha**.

**Algoritmo (`sync.py`):**

1. **Skip-signal:** ler `SELECT MAX(Atualizacao) FROM ...` (1 célula). Se igual
   a `carteira_meta.ultimo_refresh_marker` e o último sync foi `ok` → registrar
   execução `skip` e retornar (custo mínimo).
2. **Leitura completa** do subset SP (`WHERE CSD IN (...)`) via pyarrow, em
   chunks (`fetchmany`/arrow batches) — ~98k linhas cabem tranquilo.
3. **Normalização** (`mapping.py`): de-para regional, drop de PII, derivações,
   `hash_conteudo` por linha.
4. Carregar em `nota_carteira_staging`.
5. **Reconciliação transacional** (uma transação):
   - INSERT novas (por `id_onr`), com `criado_em`;
   - UPDATE onde `hash_conteudo` difere, com `atualizado_em`;
   - inalteradas permanecem;
   - `id_onr` presentes de novo → limpam `ausente_na_origem_em`;
   - `id_onr` ausentes do snapshot → recebem `ausente_na_origem_em` (tombstone);
   - gravar `ultimo_refresh_marker`, bump `versao`.
6. Registrar execução em `carteira_sync_execucoes`.

**Idempotência (por construção):** PK `id_onr` + upsert por hash + tombstone
(sem DELETE) + staging/reconcile transacional + **single-flight** (lock: um
sync por vez; chamada concorrente devolve a execução em andamento). Rodar 1×
ou N× → mesmo estado final.

**Estratégias:** completa (algoritmo acima), skip (curto-circuito), manual
(`POST /sincronizar`), agendada (cadência configurável em `carteira_meta`;
timer próprio do módulo — não copia o `while True` do main.py). Incremental
por-linha fica indisponível até (e se) o enriquecimento por `notas_sp.DATE_LOAD`
entrar.

## 6. Situação derivada (`situacao.py`, função pura)

Entradas: linha de `nota_carteira` + conjunto de `Numero_Nota` presentes no
plano do Input (join `nota_carteira.id_sap` ↔ `notas.Numero_Nota`, só para
`sap_real=1`). Precedência:

1. `cancelada` — `status_sap = 'Cancelado'`.
2. `executada` — `status_sap = 'Encerrado'` **ou** `data_encerramento_exec`
   preenchida.
3. `no_plano` — `sap_real=1` **e** `id_sap` presente no plano do Input.
4. `fora_do_plano` — caso contrário (inclui notas sem SAP real: não movíveis).

`divergente` (no plano mas cancelada/ausente na origem) é **computável** mas
sua superfície (aba Divergências) é Fase 2. Em Fase 1 a situação é somente
leitura, sem ação.

Regras num único módulo puro, unit-testável sem I/O (molde `montar_dashboard`
e `classify.py`).

## 7. APIs (`/api/carteira`)

| Endpoint | Papel |
|---|---|
| `GET /notas` | página do explorador: filtros compostos (`regional`, `conjunto`, `status_sap`, `situacao`, `sap_real`, `q` texto, `periodo` por `data_encerramento_exec`), `page`/`size`, `ordenar_por`/`ordem`; ETag por `versao`. Situação computada no servidor (join plano). |
| `GET /notas/{id_onr}` | detalhe: todos os campos projetados + situação. (Histórico de movimentações = Fase 2, vazio agora.) |
| `GET /resumo` | KPIs leves: total, por situação, por regional (agregados) — cabeçalho do explorador. **Não** é o dashboard completo (Fase 3). |
| `GET /sincronizacao` | estado atual + `ultimo_refresh_marker` + histórico de execuções + contagens. |
| `POST /sincronizar` | dispara sync manual (single-flight; devolve a execução). |

Endpoints finos: validam, chamam `service`, respondem. Sem `mover-para-plano`
(Fase 2).

## 8. Arquitetura frontend

```
frontend/src/features/carteira/
    carteira-section.tsx        # shell: PageHeader + SegTabs (Explorador/Sincronização)
    subs.ts                     # abas
    api.ts                      # CarteiraApi (padrão req<T> do InputApi)
    types.ts                    # espelho das respostas
    use-carteira-notas.ts       # ['carteira','notas',{filtros,page,size,ordem}] keepPreviousData
    use-carteira-resumo.ts      # ['carteira','resumo']
    use-carteira-sync.ts        # estado + mutação de sincronização
    explorador/                 # tabela, filtros, badges, sheet de detalhe
    sincronizacao/              # estado, botão, histórico
```

- Nova `AppSection` `'carteira'` + grupo no sidebar (`SidebarNavGroup`; pode
  ocupar o slot placeholder "De olho no BI" ou entrada própria).
- **Estado servidor:** React Query em tudo (não copiar fetch+tick legado do
  COFFEE). Explorador com `keepPreviousData`, `staleTime` 300s.
- **Explorador:**
  - Linha de KPIs leves (`StatTile`): total, fora do plano, no plano,
    executadas (de `GET /resumo`).
  - Filtros compostos, estado da sessão via `usePersistedState`
    (sessionStorage). Filtros salvos = Fase 3.
  - **Tabela: TanStack Table** (headless) sobre `ui/table`, padrão shadcn
    data-table: paginação server-side, ordenação, visibilidade de colunas,
    seleção múltipla (seleção só visual na Fase 1; ação em lote = Fase 2).
    Dependência nova justificada (não há equivalente no app).
  - Badges de situação: variants novos em `badge.tsx`
    (`fora_do_plano`/`no_plano`/`executada`/`cancelada`), vocabulário
    tagOk/tagErr existente.
  - Detalhe: `Sheet` lateral (padrão kpi-drawer/revisar-nota-sheet).
- **Sincronização:** cartão de estado (última execução, `refresh_marker`,
  contagens), botão "Sincronizar agora" (mutação → invalida keys da carteira),
  histórico de execuções em tabela.
- **Dexie/IndexedDB:** snapshot só de `resumo` + primeira página do explorador
  (nunca a base inteira). Terceira ocorrência do seed→revalidate → **extrair
  `useSeededQuery(key, snapshotKey, fetchFn)`** compartilhado (limpa também
  `useInputData`/`useRamalData`).
- **Visual:** Supabaze (DESIGN.md) — tokens entram no `app.css` primeiro
  (CLAUDE.md proíbe cor arbitrária); skill frontend-design na implementação.

## 9. Cache e performance

- Índices em `nota_carteira`: PK `id_onr`; secundários em `regional`,
  `conjunto`, `status_sap`, `sap_real`, `ausente_na_origem_em`,
  `data_encerramento_exec`.
- Paginação `LIMIT/OFFSET` (suficiente até ~100k; keyset como evolução).
- Agregados (`/resumo`) via SQL no `repository` + cache em memória com TTL +
  invalidação por `versao`.
- ETag/304 por `versao` (padrão de `/input/notas` e `/relatorios/dashboard`).
- Cliente: React Query `staleTime` 300s; Dexie só resumo/primeira página;
  polling de `versao` (padrão `useSincronizacaoAutomatica`) para refletir sync
  concluída em outra sessão.
- Leitura Databricks com pyarrow (cloud fetch) em chunks.

## 10. Observabilidade e falhas

- `carteira_logs` com `trace_id` por execução (padrão `coffee_logs`);
  registra chamadas ao Databricks (timing/status/erro), reconciliação, erros.
- Métricas por execução expostas em `GET /sincronizacao` e na aba
  Sincronização (duração, contagens, refresh_marker, erro).
- Exceções nunca engolidas (CLAUDE.md): erro explica o quê/por quê/próximo
  passo. Retry/backoff já vêm do `databricks_module.client`.
- Falha no meio do sync: transação aborta → projeção anterior intacta; execução
  registrada como `erro`; app segue com a última projeção boa.

## 11. Edge cases → estratégia (com números reais)

| Caso | Estratégia |
|---|---|
| Nota sem SAP real (30.206 sentinela `10000000` + 788 vazios) | projetada normalmente (PK `id_onr`); `sap_real=0`; situação por status; não-movível (marcado p/ Fase 2) |
| `id_sap` duplicado (1.548 no subset) | irrelevante para projeção (PK é `id_onr`); relevante só na movimentação (Fase 2) |
| `Status_SAP` nulo (142k) | situação cai em `no_plano`/`fora_do_plano` por join; sem status ≠ executada/cancelada |
| `quantidade = 9999` (sentinela) | `quantidade_valida=0`; excluída de somatórios/KPIs |
| Nota mudou de regional/conjunto/status | `hash_conteudo` difere → UPDATE; contagem logada |
| Nota entrou/saiu do plano manualmente | situação derivada por join → reflete sozinha, sem sync |
| Nota some da base | tombstone `ausente_na_origem_em`; nunca deletada; filtrável |
| Sync repetido / concorrente | idempotente (hash) + single-flight (lock) |
| Refresh não mudou | skip barato (1 célula), execução registrada como `skip` |
| Regional só ES | fora do subset SP (filtro na origem) |
| Nome de regional divergente | de-para em `mapping.py` |

## 12. Segurança / PII

- Databricks **read-only**; nenhuma escrita.
- Colunas de PII **não projetadas** na Fase 1.
- Amostras de linha **nunca** versionadas (só esquema/agregados).
- Credenciais só em `backend/.env` (gitignored). Token tratado como exposto →
  rotacionar.

## 13. Riscos / pontos a validar na implementação

- Formato de `Atualizacao` (`dd-MM-yyyy HH:mm`) para o skip-signal — comparação
  por string exata basta (é carimbo idêntico p/ todas as linhas).
- Join situação usa `id_sap` (string) ↔ `notas.Numero_Nota` (INTEGER no
  Input) — normalizar tipos na comparação.
- Semântica exata de `quantidade` (é DDPM? outra unidade?) — confirmar rótulo
  nos KPIs com a engenharia.
- `descrição_conjunto` tem acento no nome da coluna na origem — referenciar com
  cuidado (posição/alias no SELECT).

## 14. Critérios de aceite (Fase 1)

- Sync completa popula `nota_carteira` com ~98k linhas do subset SP,
  idempotente (rodar 2× → 0 novas/0 atualizadas na 2ª), com skip quando o
  refresh não mudou.
- `GET /notas` pagina, filtra e ordena; situação correta por amostragem.
- Explorador lista, filtra, mostra badges e abre o detalhe; KPIs batem com os
  agregados.
- Aba Sincronização mostra estado/histórico e dispara sync manual.
- Testes: `sync`/`mapping`/`situacao`/`repository` unit-testados (mock do
  `databricks_module.client`); build do frontend (tsc) verde.
- Docs `docs/dev/` atualizados (novo módulo carteira + seção frontend).
