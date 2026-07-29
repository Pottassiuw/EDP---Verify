# Carteira de Notas — Design Arquitetural

Data: 2026-07-22
Status: aprovado em brainstorm (seções validadas uma a uma com o usuário)
Escopo: arquitetura completa da feature Carteira de Notas e do módulo de
integração com o Databricks; implementação dividida em fases (ver Roadmap).

---

## 1. Contexto e objetivo

Hoje o sistema trabalha quase só com as notas que já entraram no plano
(tabela `notas` do `input_module`). A base COFFEE no Databricks contém
**todas** as notas já geradas — dentro ou fora do plano — e passa a ser
pilar de informação do sistema.

Objetivo: dar à engenharia domínio sobre a carteira completa:

- Meta da regional vs. carteira no plano vs. carteira total na base.
- O que falta incorporar ao plano, onde falta (regional, equipamento,
  rubrica), e se existe quantidade suficiente para atingir a meta.
- Acompanhamento mensal e acumulado; comparativos planejado × executado.
- Localizar notas fora do plano, selecionar em massa e movê-las para o
  plano com validação e histórico.

## 2. Decisões tomadas no brainstorm

| Decisão | Escolha |
|---|---|
| Acesso ao Databricks | Direto via `databricks-sql-connector`, autenticado por Access Token (env vars). Elimina o notebook exportador de CSV. |
| Arquitetura de dados | Híbrida: Databricks é o Source of Truth; a aplicação mantém uma **projeção operacional local** (SQLite) sincronizada por serviço idempotente. Nenhuma requisição do usuário consulta o Databricks em tempo real. |
| Sentido da escrita | Databricks é **somente leitura**. Movimentações escrevem apenas no banco local da aplicação. |
| Volume estimado | ~50 mil a ~500 mil notas → SQLite com índices atende; paginação server-side obrigatória; IndexedDB não recebe a base inteira. |
| Superfície de produto | **Seção nova "Carteira"** no app (abordagem A), com vistas derivadas/atalhos no Input e Relatórios. |
| Direção visual | **DESIGN.md (brand Supabaze) é autoritativo** para telas novas; `app.css` (.edp) é legado a migrar. Tokens Supabaze entram no `app.css` como variáveis (CLAUDE.md proíbe cores arbitrárias). |
| Dimensões | Rubrica ≈ Plano/Conjunto atual (metas em `metas_plano`); Equipamento é coluna nova vinda do Databricks. |
| Tabela do Explorador | TanStack Table (headless, padrão shadcn data-table) — dependência nova justificada. |
| Command palette | Sim, via shadcn Command (cmdk), na fase 3. |

## 3. Onde a feature aparece na aplicação

Nova seção top-level **Carteira** (nova `AppSection` + grupo no sidebar,
padrão `SidebarNavGroup`), com sub-abas:

- **Dashboard** — inteligência executiva (fase 3).
- **Explorador** — base completa: tabela paginada, filtros compostos,
  seleção múltipla, mover-para-plano em lote (fases 1–2).
- **Divergências** — inconsistências carteira × plano (fase 2).
- **Sincronização** — estado, histórico e disparo manual do sync (fase 1).

Módulos existentes recebem só **vistas derivadas**, nunca lógica da
carteira:

- **Input**: banner/atalho "N notas disponíveis na base → Carteira"
  (abre o Explorador já filtrado, via handoff no App.tsx, padrão
  `filtrosHandoff` existente).
- **Relatórios**: o card `resumo-fora-do-plano` (hoje só contagem) passa
  a linkar para o Explorador filtrado.
- **COFFEE**: detalhe de nota pode exibir a situação-na-carteira
  (read-only).

A ideia do engenheiro (ver a base toda "dentro do Input") é atendida na
íntegra como fluxo — busca → seleção → movimentação em lote → validação
→ histórico — mas mora na seção Carteira, evitando transformar o Input
(já com 6 sub-abas) em god module.

## 4. Domínio e bounded contexts

```
┌─────────────────────────────────────────────────────────┐
│ INTEGRAÇÃO DATABRICKS (novo, genérico, sem domínio)     │
│ backend/databricks_module/                              │
│ client (conexão/retry/logs) · config · schema discovery │
│ expõe: consultar(sql, params) → DataFrame               │
└────────────────────┬────────────────────────────────────┘
                     │ usado por
┌────────────────────▼────────────────────────────────────┐
│ CARTEIRA (novo, domínio)                                │
│ backend/carteira_module/                                │
│ sync service · projeção local (carteira.db, SQLite)     │
│ agregações · situação · movimentação → plano            │
└────────────────────┬────────────────────────────────────┘
                     │ mover-para-plano via input_module.service
┌────────────────────▼────────────────────────────────────┐
│ EXISTENTES (intocados na essência)                      │
│ input_module (plano) · coffee_module (geração SAP)      │
│ integracao_module (ponte COFFEE→plano)                  │
└─────────────────────────────────────────────────────────┘
```

`databricks_module` não conhece o conceito de nota — só conecta,
consulta e descreve schema. Qualquer módulo futuro o reutiliza sem
duplicação. `carteira_module` é o dono do domínio: normaliza colunas
COFFEE → vocabulário da aplicação, mantém a projeção, agrega e
movimenta.

### Entidades novas (SQLite `backend/data/carteira.db`)

**`nota_carteira`** — projeção local da nota na base COFFEE.
Chave natural: `numero_nota` (SAP). Colunas definitivas saem do
discovery (fase 0); esqueleto:

- Identificação: `numero_nota`, chave alternativa p/ notas sem SAP real.
- Classificação: conjunto/rubrica, equipamento, regional, município,
  circuito, local de instalação.
- Quantidades: DDPM planejado e afins.
- Estado: status na origem, datas relevantes.
- Metadados de sync: `hash_conteudo` (hash estável das colunas de
  negócio normalizadas — detecção de mudança), `sincronizado_em`,
  `criado_em`, `atualizado_em`, `ausente_na_origem_em` (tombstone —
  nota sumiu da base: marca, nunca deleta).

**`carteira_sync_execucoes`** — auditoria de cada sincronização:
estratégia (completa/incremental), início/fim, status, contagens
(novas/atualizadas/ausentes/duplicadas descartadas), watermark usado,
erro. Persistida em SQLite — sobrevive a restart (corrige a fragilidade
do padrão `_JOBS` em memória do coffee_module).

**`plano_movimentacoes`** — histórico de movimentações feitas pelo app:
nota, ação (entrada/saída), usuário (header `X-User`, padrão existente),
`lote_id`, snapshot dos campos enviados.

### Situação derivada — decisão-chave

"Está no plano?" **nunca é armazenado**. A situação da nota
(`fora_do_plano | no_plano | executada | cancelada | divergente`) é
**função pura** (`situacao.py`) que cruza `nota_carteira` × tabela
`notas` do Input em tempo de leitura — no molde do `classify.py` do
COFFEE. Nota que entrou/saiu do plano por qualquer caminho (manual,
colagem, COFFEE, carteira) reflete na situação sem sincronização
nenhuma. Elimina por construção a classe de bugs de reconciliação
plano × carteira.

### Correção de dívida incluída

A tabela `notas` do Input ganha coluna `origem`
(`manual | colagem | coffee | carteira`). Hoje nota vinda do COFFEE é
indistinguível de manual — a Carteira tropeçaria no mesmo buraco.

## 5. Arquitetura backend

Clean Architecture traduzida para o padrão do repositório — módulos
simples, sem framework de DI:

```
backend/databricks_module/            # genérico, reutilizável, zero domínio
    config.py      # env vars, catálogo/schema, timeouts
    client.py      # databricks-sql-connector: conectar, consultar(sql, params)
                   #   → DataFrame; retry com backoff exponencial (manual);
                   #   toda chamada logada (timing, status, erro — padrão
                   #   client.py do COFFEE)
    schema.py      # discovery: tabelas, colunas, tipos, amostras, COUNT

backend/carteira_module/
    routes.py      # endpoints finos (validar → service → responder)
    service.py     # casos de uso: página do explorador, dashboard,
                   #   mover lote, estado da sincronização
    sync.py        # serviço de sincronização (estratégias)
    mapping.py     # de-para colunas Databricks → domínio (molde do
                   #   integracao_module/mapping.py)
    situacao.py    # função pura: nota_carteira × plano → situação
    agregacao.py   # função pura estilo montar_dashboard (testável sem I/O)
    repository.py  # SQL da projeção (SQL separado das regras — CLAUDE.md)
    db.py          # schema carteira.db + versao do dataset
```

Camadas: `routes` (interface) → `service` (casos de uso) →
`repository`/`client` (infra); `mapping` + `situacao` + `agregacao` são
o núcleo de domínio puro, unit-testável sem I/O.

Dependência nova: `databricks-sql-connector` (driver oficial, sem
alternativa razoável — passa o critério de dependências do CLAUDE.md).

### Credenciais

`backend/.env` (adicionar ao `.gitignore` — hoje **não** está coberto),
lido com `python-dotenv` (dependência já existente):
`DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`,
`DATABRICKS_TOKEN`. Token nunca versionado nem colado em chat/log.

### APIs

| Endpoint | Papel |
|---|---|
| `GET /api/carteira/notas` | página do explorador: filtros compostos (regional, conjunto/rubrica, equipamento, status, situação, texto, período) + paginação server-side + ordenação; ETag por versao |
| `GET /api/carteira/notas/{numero}` | detalhe + situação + histórico de movimentações |
| `GET /api/carteira/dashboard` | agregado meta × plano × base × gap por ano/mês/regional (molde `montar_dashboard`) |
| `GET /api/carteira/divergencias` | notas no plano canceladas/ausentes/divergentes na origem |
| `POST /api/carteira/mover-para-plano` | lote all-or-nothing; funil por `input_module.service.criar_notas` (precedente do integracao_module); grava `plano_movimentacoes` + `origem='carteira'` |
| `POST /api/carteira/sincronizar` | sincronização manual sob demanda |
| `GET /api/carteira/sincronizacao` | estado atual + histórico de execuções |
| `GET /api/carteira/schema` | resultado do discovery (dev/admin) |

## 6. Sincronização com o Databricks

### Algoritmo (estratégia completa)

1. Consulta a base COFFEE em chunks (`fetchmany`), normaliza via
   `mapping.py`, calcula `hash_conteudo` por linha.
2. Carrega em `nota_carteira_staging` (tabela de trabalho).
3. Reconciliação em SQL, numa transação:
   - INSERT das novas (com `criado_em`);
   - UPDATE onde o hash difere (com `atualizado_em`);
   - intocadas permanecem;
   - presentes novamente limpam `ausente_na_origem_em`;
   - ausentes do snapshot ganham `ausente_na_origem_em` (tombstone;
     nunca DELETE).
4. Grava execução em `carteira_sync_execucoes`; bump da `versao` do
   dataset (invalida caches/ETag).

### Estratégias suportadas

- **Completa** — algoritmo acima; única que tombstona.
- **Incremental** — watermark na coluna de última atualização da origem
  (se o discovery confirmar que existe); nunca tombstona (não enxerga
  ausência); a completa noturna reconcilia remoções.
- **Manual sob demanda** — `POST /sincronizar`.
- **Agendada** — cadência configurável persistida em SQLite; completa
  noturna por default + incremental opcional. Timer próprio do módulo
  (não copia o `while True` do main.py; documentado como padrão a
  substituir o agendador antigo futuramente).

### Idempotência — garantida por construção

- Chave natural (`numero_nota`) + upsert por comparação de hash.
- Tombstone em vez de delete.
- Staging + reconciliação transacional (falhou no meio → projeção
  anterior intacta).
- Single-flight: uma sincronização por vez (lock); chamada concorrente
  retorna a execução em andamento.

Rodar 1× ou 10×, em qualquer ordem → mesmo estado final.

## 7. Edge cases e estratégias

| Caso | Tratamento |
|---|---|
| Nota mudou de regional/equipamento/conjunto | hash difere → UPDATE; dashboards refletem projeção atual; contagem de mudanças logada na execução |
| Nota entrou no plano manualmente | situação é derivada por join → reflete sozinha, sem sync |
| Nota retirada do plano | idem; `plano_movimentacoes` registra apenas movimentações via app |
| Nota cancelada na origem | status origem → situação `cancelada`; se está no plano → aparece em Divergências (alertar, nunca auto-corrigir) |
| Nota duplicada na origem | dedupe determinístico no sync (mais recente vence), contagem logada |
| Nota sem conjunto | bucket `SEM CONJUNTO` — filtrável, visível no dashboard, não some |
| Nota sem SAP real | mantida na projeção com chave alternativa; marcada não-movível (mesma regra 422 do integracao_module) |
| Nota parcialmente executada | status/quantidades da origem exibidos; conta no dashboard por status |
| Metas alteradas após sync | metas são dataset independente (sync Excel existente); meta × carteira sempre computado em leitura — zero acoplamento |
| Divergência carteira × plano | aba/endpoint Divergências: no plano mas ausente da base; quantidade divergente; cancelada mas planejada |
| Sync falha no meio | transação aborta → projeção anterior intacta; execução registrada como erro; app segue com a última projeção boa (a resiliência é a própria projeção) |

## 8. Arquitetura frontend

```
frontend/src/features/carteira/
    carteira-section.tsx        # shell: PageHeader + SegTabs
    subs.ts                     # Dashboard · Explorador · Divergências · Sincronização
    api.ts                      # CarteiraApi (padrão req<T> do InputApi, /api/carteira)
    types.ts                    # espelho 1:1 das respostas do backend
    use-carteira-dashboard.ts   # ['carteira','dashboard',ano,mes,regional]
    use-carteira-notas.ts       # ['carteira','notas',{filtros,pagina,ordem}]
    use-carteira-sync.ts        # estado + mutação de sincronização
    + componentes por aba
```

- **Estado servidor**: React Query em tudo (não copiar o padrão
  fetch+tick legado do COFFEE). Paginação com `keepPreviousData`,
  staleTime 300s (precedente de dataset grande).
- **Dexie/IndexedDB**: snapshot apenas de dashboard + primeira página do
  explorador — nunca a base inteira (50–500k). Terceira ocorrência do
  padrão seed→revalidate → Rule of Three: extrair helper compartilhado
  `useSeededQuery` (limpa também `useInputData`/`useRamalData`).
- **Filtros**: estado da sessão via `usePersistedState`
  (sessionStorage); **filtros salvos** nomeados em localStorage — sem
  backend.
- **Tabela do Explorador**: TanStack Table (headless) sobre `ui/table`,
  no padrão shadcn data-table: ordenação, seleção múltipla, visibilidade
  de colunas, integração com paginação server-side.
- **Situação**: variants novos no `badge.tsx` (vocabulário
  tagOk/tagErr existente).
- **Detalhe**: Sheet lateral (padrão kpi-drawer/revisar-nota-sheet).
- **Mover em lote**: Dialog com proposta + avisos + validação
  all-or-nothing (molde `mover-plano-modal`), invalidando
  `INPUT_DADOS_KEY` + keys da carteira.
- **Dashboard**: StatTiles (meta · no plano · disponível · gap · %
  cobertura com farol) → Recharts via `ui/chart.tsx` (barras mensais
  meta×plano×executado, acumulado, distribuições por
  regional/rubrica/equipamento) → heatmap regional×rubrica (CSS grid) →
  drill-down: clique abre o Explorador filtrado.
- **Command palette** (fase 3): shadcn Command (cmdk) — busca de nota na
  carteira toda + navegação + filtros rápidos.
- **Visual**: Supabaze (DESIGN.md) é a direção para telas novas; tokens
  entram primeiro no `app.css` (CLAUDE.md proíbe cor arbitrária); skill
  frontend-design na implementação. O restante do app migra depois
  (fase 4) — inconsistência visual temporária aceita.

## 9. Cache e performance

- **SQLite**: índices em `numero_nota` (PK), regional, conjunto,
  equipamento, status, `ausente_na_origem_em`; paginação LIMIT/OFFSET
  (suficiente até ~500k com índices; keyset como evolução se precisar).
- **Agregações**: SQL no `repository` + shaping em `agregacao.py`
  (pura); cache em memória com TTL + invalidação por `versao` (padrão
  `engine.get_dataset`).
- **HTTP**: ETag/304 por `versao` (padrão existente em `/notas` e
  `/relatorios/dashboard`).
- **Cliente**: React Query (staleTime 300s) + Dexie só para
  dashboard/primeira página; polling de `versao` (padrão
  `useSincronizacaoAutomatica`) para detectar sync concluída em outra
  sessão.

## 10. Observabilidade e tratamento de falhas

- Tabela `carteira_logs` com `trace_id` por execução de sync (padrão
  `coffee_logs`), registrando chamadas ao Databricks (timing, status,
  erro), transições e ações de usuário.
- Métricas por execução expostas em `GET /sincronizacao` e na aba
  Sincronização: duração, contagens, watermark, erro.
- Exceções nunca engolidas (CLAUDE.md): erro explica o que falhou, por
  quê, próximo passo.
- Retry com backoff exponencial no client Databricks; timeouts
  explícitos; falha total mantém a última projeção boa.

## 11. Impacto nos módulos existentes

| Módulo | O que muda |
|---|---|
| Input | coluna `origem` em `notas`; banner/atalho para a Carteira; futuramente colunas enriquecidas (Conjunto etc.) |
| Relatórios | `resumo-fora-do-plano` passa a linkar para o Explorador filtrado; fase 4: converge para derivar da carteira |
| COFFEE | intocado; opcionalmente exibe situação-na-carteira no detalhe |
| integracao_module | intocado; carteira segue o mesmo precedente sem tocá-lo |
| Verificar | intocado |
| Compartilhado | tokens Supabaze no app.css; `useSeededQuery`; TanStack Table + data-table; shadcn Command |

## 12. Roadmap

**Fase 0 — Discovery (fundação)**
Credenciais em `.env` (+ `.gitignore`), `databricks_module`
(config+client+schema), discovery: tabelas, colunas, tipos, amostras,
COUNT real, existência de coluna de última atualização (decide
viabilidade do incremental). Saída: **mapa de colunas revisado com a
engenharia** — incorporar / ignorar / enriquecer domínio. Sem UI.

**Fase 1 — MVP: projeção + explorador**
`carteira_module` (mapping, sync completa manual+agendada, projeção,
situação derivada, repository paginado), seção Carteira com Explorador
(TanStack Table, filtros compostos, badges, Sheet detalhe) e
Sincronização (status, histórico, trigger). Valor imediato: a engenharia
enxerga a base inteira pela primeira vez.

**Fase 2 — Movimentação**
Mover-para-plano em lote (proposta+avisos+all-or-nothing),
`plano_movimentacoes`, coluna `origem` no Input, aba Divergências,
atalhos no Input/Relatórios.

**Fase 3 — Inteligência**
Dashboard completo (meta×plano×base×gap, cobertura com farol, evolução
mensal/acumulada, planejado×executado, distribuições, heatmap,
drill-down), filtros salvos, sync incremental com watermark, command
palette.

**Fase 4 — Convergência (visão de longo prazo, não compromisso)**
Relatórios deriva da carteira; enriquecimento profundo do Input/COFFEE
com colunas do Databricks; reavaliação de storage (Postgres) se
volume/uso crescer; migração visual Supabaze do resto do app.

Cada fase é entregável e auditável sozinha (build + backend + /simplify
+ /code-review ao final, conforme fluxo padrão do projeto).

## 13. Riscos e pontos em aberto (resolvidos na fase 0)

- **Schema real da base COFFEE é desconhecido** — todo o modelo de
  `nota_carteira` é esqueleto até o discovery; o mapa de colunas com a
  engenharia é gate da fase 1.
- **Coluna de última atualização pode não existir** — sem ela, só sync
  completa (aceitável no volume estimado).
- **Chave natural a confirmar** — assumido `numero_nota` (SAP); se a
  base tiver pk próprio do COFFEE, a chave alternativa para notas sem
  SAP real usa esse pk.
- **Latência/limites do SQL Warehouse** — medir na fase 0; chunking e
  cadência ajustados conforme.
- **Semântica de "equipamento"** — coluna(s) exata(s) definidas no
  discovery com a engenharia.

## 14. Referências internas (precedentes reusados)

- `backend/input_module/relatorios.py::montar_dashboard` — agregação pura.
- `backend/integracao_module/mapping.py` + `service.py` — de-para e
  movimentação all-or-nothing.
- `backend/coffee_module/classify.py` — status como função pura.
- `backend/coffee_module/db.py::coffee_logs` — auditoria com trace_id.
- `backend/input_module/db.py::obter_versao_dataset` + ETag — invalidação.
- `frontend/src/features/input/cache.ts` + `use-input-data.ts` — Dexie
  seed→revalidate + banner offline.
- `frontend/src/features/relatorios/` — shape de dashboard, farol, fmt.
- `frontend/src/components/branded/section.tsx` — PageHeader, StatTile,
  SegTabs.
