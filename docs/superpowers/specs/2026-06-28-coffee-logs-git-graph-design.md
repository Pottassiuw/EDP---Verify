# Logs COFFEE — árvore git-graph, toggle de Dev e filtro por passo

**Data:** 2026-06-28
**Branch:** develop
**Escopo:** Backend (`backend/main.py`, `backend/coffee_module/{db,routes,jobs,client}.py`) + Frontend (`frontend/src/coffee/coffee-log-table.tsx`, `coffee-logs.tsx`, `coffee-log-drawer.tsx`, `context/settings-context.tsx`, `pages/configuracoes.tsx`, `coffee/types.ts`)

## Problema

A timeline de logs (spec 2026-06-24) é plana: cada `api_call`/`transicao`/`acao_usuario` é um card solto. Não dá pra ver que um `buscar_nota` + `classificar` foram filhos de um `geracao_lote`. Faltam: agrupamento visual (git-graph), um jeito de esconder o ruído de baixo nível, e filtro pelos passos do fluxo de negócio.

## Objetivos

1. Agrupar logs por ação: cabeçalho = `acao_usuario`, filhos = `api_call`/`transicao` da mesma operação, renderizados estilo `git log --graph` (`├──`/`└──`).
2. Toggle **"Logs de Dev"** em Configurações: OFF mostra só cabeçalhos; ON expande os filhos.
3. Filtro por **passo do fluxo** (`Gerar | Consultar | Alterar local | Corrigidas | Pendentes`), substituindo o segmentado `API | Transição | Usuário`.
4. Filtrar por nota (campo PK ou `LogDrawer`) enraíza a árvore na nota: `Nota → ações → eventos dev`.

## Não-objetivos (YAGNI)

- Sem export, sem busca full-text, sem paginação (mantém o `limit` por dropdown, até 500).
- Sem foto de usuário (Microsoft/VPN — sub-projeto separado).
- Sem novo endpoint: `GET /logs` ganha só o `trace_id` no retorno e um ajuste no filtro `nota_pk`.

## Decisões (confirmadas com o usuário)

- **Vínculo explícito** via `trace_id` por requisição (não heurística por janela de tempo).
- Agrupamento, filtro de passo e toggle de dev são **client-side**; o backend só fornece o `trace_id` e o ajuste do filtro `nota_pk`.
- `corrigidas`/`pendentes` filtram pelo **evento de transição** (`transicao classificar`, `detalhes.novo`), não pelo estado atual da nota.
- Filtro de passo trocado **nas duas** superfícies (`CoffeeLogs` e `LogDrawer`).

## Backend

### 1. Coluna `trace_id`

`coffee_logs` ganha `trace_id TEXT` (nullable), via o mesmo `ALTER TABLE ... ADD COLUMN` já usado pra coluna `usuario` (db.py:74-75). Logs antigos ficam `NULL` → grupo unitário no front (sem regressão).

### 2. Geração e propagação

- `contextvars.ContextVar[str | None]` em `db.py` (`_trace_atual`), com `definir_trace(id)` e leitura dentro de `registrar_log` (grava na coluna nova). Uma linha a mais no insert; nada nos call sites.
- Middleware em `backend/main.py`: por requisição, `definir_trace(uuid4().hex[:12])`. (Endpoints sync rodam no threadpool do anyio, que copia o contexto — o contextvar setado no middleware é visível em `registrar_log`.)
- **Jobs:** `/buscar` e `/gerar-lote` capturam o trace atual e passam pra `iniciar_busca`/`iniciar_geracao`; no início da thread (`_rodar`/`_rodar_geracao`), `definir_trace(id_recebido)`. Assim o lote inteiro compartilha o grupo do `busca_lote`/`geracao_lote`. (Thread crua não herda contextvar; por isso o id viaja explícito.)

### 3. Dois cabeçalhos que faltam

- `GET /consultar/{id}` **sucesso** → grava `acao_usuario "consultar"` (hoje só em falha).
- `POST /local-instalacao` → grava `acao_usuario "alterar_local"` (hoje a rota não loga; só o `client` grava o `api_call`).

### 4. Filtro `nota_pk` inclui os cabeçalhos de lote

Hoje `WHERE nota_pk = ?` exclui `busca_lote`/`geracao_lote` (que têm `nota_pk = NULL`). Passa a:

```sql
WHERE nota_pk = ?
   OR (tipo = 'acao_usuario'
       AND trace_id IN (SELECT trace_id FROM coffee_logs
                        WHERE nota_pk = ? AND trace_id IS NOT NULL))
```

Traz os eventos da nota + as ações-cabeçalho dos traces dela, sem puxar filhos de outras notas do mesmo lote.

## Frontend

### 5. Toggle "Logs de Dev"

Reusa a infra existente: `Settings` ganha `devLogs: boolean` (default `false`, persistido no `localStorage` que o `settings-context` já gere). Configurações ganha um card "Logs" com um `<Switch>` — cópia do padrão "Mostrar KPIs".

**O que o toggle esconde:** apenas `api_call` + `transicao` (os "logs que envolvem api e eventos"). `acao_usuario` aparece **sempre** — seja como cabeçalho, seja como filho. Assim, com Dev OFF, um `geracao_lote` ainda mostra embaixo os `geracao_ignorada_*` (decisões de pular nota), mas não o `buscar_nota`/`classificar`.

### 6. Agrupamento (função pura)

`agruparLogs(logs, opts?: { notaRoot?: number }): Grupo[]` em `coffee-log-table.tsx`:

- Agrupa por `trace_id`. Um trace pode ter **mais de uma** `acao_usuario` (ex.: `geracao_lote` + vários `geracao_ignorada_*` do mesmo lote). Regra do cabeçalho: a `acao_usuario` com `nota_pk` NULL (a de lote) se existir, senão a primeira `acao_usuario`; senão (trace só de api/transição ou NULL) o primeiro log. As `acao_usuario` restantes viram filhos.
- Cada grupo = `{ cabecalho, filhos, transicaoNova?: "corrigida"|"pendente" }`, onde `transicaoNova` vem de qualquer `transicao classificar` com esse `detalhes.novo` no grupo.
- Com `notaRoot`: envelopa as ações numa raiz `Nota #pk` cujo badge = classificação do `classificar` mais recente nos logs (`// ponytail:` derivado dos logs, sem fetch/endpoint novo; sem transição → só "Nota #pk").

### 7. Render git-graph

`LogTable` passa a renderizar grupos. Cabeçalho reusa o card/dot/tag atuais. Os filhos aparecem indentados com conectores (`├──`, `└──` no último) em `var(--font-mono)`, reusando `clog-tag`, `formatDetailValue` e `StructuredDetails` (clique no filho ainda expande detalhes). Filhos `api_call`/`transicao` só com `devLogs` ON; filhos `acao_usuario` sempre. Tag `→ corrigida`/`→ pendente` no cabeçalho quando `transicaoNova` existe. Grupo sem filhos visíveis = só cabeçalho.

### 8. Filtro por passo

Segmentado `Todos | Gerar | Consultar | Alterar local | Corrigidas | Pendentes` em `CoffeeLogs` e `LogDrawer`, substituindo `TIPOS`. Aplicado client-side ao nível dos grupos de ação (na visão geral e nas ações sob a raiz da nota):

- **Gerar** → cabeçalho em `{geracao_lote, regerar, geracao_ignorada_sap_real, geracao_ignorada_arquivada}`
- **Consultar** → `{busca_lote, consultar}`
- **Alterar local** → `{alterar_local}`
- **Corrigidas** → grupo com `transicaoNova === "corrigida"`
- **Pendentes** → `transicaoNova === "pendente"`

O frontend para de mandar `?tipo=`; o param fica no backend (funcional, só sem uso pela nova UI — `// ponytail:` removê-lo exigiria mexer em rota+testes por ganho nulo).

### 9. Tipos

`CoffeeLog` ganha `trace_id?: string | null`.

## Tratamento de erro

- `registrar_log` continua best-effort (nunca levanta); sem `trace_id` no contexto, grava `NULL`.
- Middleware: se algo falhar ao setar o trace, a requisição segue (log fica `NULL`).
- Agrupamento no front é defensivo: trace NULL → grupo unitário; grupo sem `acao_usuario` → primeiro log vira cabeçalho. Nada some.

## Verificação

**Backend** — `cd backend && python -m pytest test_coffee_module.py`:
- `registrar_log` dentro de um trace setado grava o `trace_id`; sem contexto grava `NULL`.
- Job (`_rodar_geracao`) com trace recebido carimba os filhos com o mesmo id do `geracao_lote`.
- `/consultar` sucesso e `/local-instalacao` gravam a `acao_usuario` esperada.
- `listar_logs(nota_pk=X)` inclui o cabeçalho `geracao_lote` (nota_pk NULL) do trace que tocou X, sem filhos de outras notas.

**Frontend** — `cd frontend && npm run build` (sem test runner); manual no dev server:
1. Visão geral, Dev OFF → só ações; Dev ON → árvore git-graph com filhos.
2. Filtro `Gerar`/`Consultar`/`Alterar local` → só os grupos da ação; `Corrigidas`/`Pendentes` → grupos com a tag de transição.
3. Campo PK (e `LogDrawer`) → raiz `Nota #pk` com badge; ações como sub-cabeçalhos; Dev ON aninha api/transição.
4. Toggle em Configurações persiste (reload mantém).

## Arquivos afetados

- `backend/coffee_module/db.py` — coluna `trace_id`, contextvar + `definir_trace`, `registrar_log` grava trace, `listar_logs` ajusta filtro `nota_pk`.
- `backend/main.py` — middleware de trace por requisição.
- `backend/coffee_module/jobs.py` — `iniciar_*`/`_rodar_*` recebem e setam o trace.
- `backend/coffee_module/routes.py` — `/buscar` e `/gerar-lote` passam o trace; `/consultar` sucesso e `/local-instalacao` logam `acao_usuario`.
- `backend/test_coffee_module.py` — testes do trace, dos cabeçalhos novos e do filtro `nota_pk`.
- `frontend/src/context/settings-context.tsx` + `pages/configuracoes.tsx` — setting `devLogs` + Switch.
- `frontend/src/coffee/coffee-log-table.tsx` — `agruparLogs`, render git-graph.
- `frontend/src/coffee/coffee-logs.tsx` + `coffee-log-drawer.tsx` — filtro de passo, toggle de dev.
- `frontend/src/coffee/types.ts` — `trace_id` em `CoffeeLog`.
