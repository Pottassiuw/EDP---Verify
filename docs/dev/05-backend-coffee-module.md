# Backend: coffee_module

## O que faz

`backend/coffee_module/` integra o backend com o sistema externo COFFEE
(que por sua vez fala com o SAP) para gerar notas reais, consultar seu
status e corrigir dados como o local de instalação. As buscas e gerações
em lote rodam como jobs em background (thread + polling), e cada nota
consultada é classificada localmente (`nao_gerada` / `pendente` /
`corrigida` / `gerada`) a partir do histórico de `id_sap` salvo em SQLite.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `backend/coffee_module/client.py` | Cliente HTTP (httpx) para a API externa COFFEE: busca de nota e as 3 escritas (`sap`, `desarquivar`, `local_instalacao`), com logging de cada chamada. |
| `backend/coffee_module/jobs.py` | Jobs in-process (thread + dict em memória) para busca em lote e geração em lote, com progresso consultável via polling. |
| `backend/coffee_module/classify.py` | Função pura `classificar()` que deriva o status de uma nota (`nao_gerada`/`pendente`/`corrigida`/`gerada`) a partir de `id_sap` atual, anterior e origem. |
| `backend/coffee_module/db.py` | Persistência local em SQLite (`coffee.db`): tabelas `notas_coffee` e `coffee_logs`, upsert com classificação automática, sistema de logs. |
| `backend/coffee_module/routes.py` | Router FastAPI `/api/coffee/*`: expõe busca, geração, consulta, correção de local, arquivamento, fila "a gerar" e logs para o frontend. |
| `backend/coffee_module/config.py` | Configuração: chave da API COFFEE, URL base, diretório de dados, delays entre chamadas e a constante `SAP_PENDENTE` (`10000000`). |

## client.py — integração externa

Todas as chamadas usam `httpx` síncrono contra `config.base_url()`
(`https://coffee.edp.gpti.com.br/api/{COFFEE_API_KEY}/deolhonarede`), com
timeout de 120s, e cada chamada é logada em `coffee_logs` via
`db.registrar_log("api_call", ...)`, sucesso ou falha.

- `buscar_nota(id)` (`client.py:33`) — `GET json_all/{id}`. A API COFFEE
  devolve uma string JSON duplamente codificada (`json.loads` sobre o
  corpo já decodificado pelo `httpx`), de onde é extraído o primeiro
  registro (`bruto[0]`). Retorna um dict com `pk`, `id_sap`, `arquivado`,
  `local_instalacao` (montado por `compor_local_instalacao`) e os
  `fields` brutos.
- `compor_local_instalacao(fields)` (`client.py:17`) — a API não devolve
  um campo pronto de local de instalação: ele é montado a partir de
  `cidade` (3 dígitos, zero-padded) + `tipo_local_instalacao` (2 letras) +
  `local_instalacao_numero` (8 dígitos, zero-padded). Retorna `None` se
  faltar qualquer componente.
- `definir_sap(id, sap)` (`client.py:79`) — `GET sap/{id}/{sap}`, atribui
  (ou reseta, com `SAP_PENDENTE`) o campo `id_sap` da nota no COFFEE.
- `desarquivar(id)` (`client.py:83`) — `GET desarquivar/{id}`.
- `alterar_local(id, local)` (`client.py:87`) — `GET
  local_instalacao/{id}/{local}`.

As três escritas (`definir_sap`, `desarquivar`, `alterar_local`)
compartilham o helper interno `_get_logado()` (`client.py:62`), que faz o
GET, loga e propaga a exceção em caso de erro — não há retry.

## jobs.py — geração em background

Dois jobs in-process, guardados num dict em memória (`_JOBS`, protegido
por `threading.Lock`) e identificados por `job_id` (`uuid4().hex`):
`iniciar_busca()` (`jobs.py:13`) roda `client.buscar_nota` +
`db.upsert_nota` para cada ID, sem alterar nada no COFFEE. `iniciar_geracao()`
(`jobs.py:54`) é o caminho de "forçar geração": para cada ID, decide entre
pular (já tem SAP real) ou forçar via placeholder + desarquivamento.

A regra central de `_rodar_geracao()` (`jobs.py:70-110`) é: **o COFFEE só
processa notas desarquivadas** — ele atribui o SAP real e arquiva sozinho
ao concluir. Por isso, forçar a geração sempre chama `client.definir_sap(id,
config.SAP_PENDENTE)` **e** `client.desarquivar(id)` juntos
(`jobs.py:97-98`), nunca só um dos dois — mandar só o SAP placeholder sem
desarquivar deixaria a nota arquivada e o COFFEE nunca a pegaria. Notas já
com SAP real (arquivadas ou não) são puladas em vez de re-geradas. Detalhe
completo da regra, das exceções e do histórico do bug de classificação
associado (nota 356322) em
[`docs/coffee/fluxo-transicao-notas.md`](../coffee/fluxo-transicao-notas.md).

Um job é disparado pelas rotas `POST /api/coffee/buscar` e `POST
/api/coffee/gerar-lote` (ver routes.py abaixo), que retornam um `job_id`
imediatamente; o estado (`estado`/`total`/`feitas`/`erros`) é consultado
por polling em `GET /api/coffee/job/{job_id}` (`obter_job()`,
`jobs.py:48`). No frontend, `coffee-pendentes.tsx` faz esse polling a cada
`2000ms` para a busca em lote, e `coffee-gerar-modal.tsx` (`pollJob`) a
cada `600ms` para a geração em lote (desistindo após 10 falhas
consecutivas) — ambos documentados em `02-frontend-coffee.md`.

## classify.py

`classificar(id_sap_atual, id_sap_anterior, origem=None)` (`classify.py:5`)
é uma função pura que deriva o status local da nota a partir de três
valores: sem `id_sap` → `nao_gerada`; `id_sap == SAP_PENDENTE` →
`pendente`; transição de `SAP_PENDENTE` para um SAP real → `gerada` (se
`origem == "avulsa"`) ou `corrigida` (origem desconhecida/`"verificar"`,
mantido por compatibilidade retroativa); qualquer outro caso → `gerada`.
O campo `arquivado` **não** entra nessa classificação — é tratado à parte
(ver `db.py`). `origem` é o que distingue geração avulsa (via COFFEE, fila
"a gerar") de correção de erro vinda da triagem Verificar.

## db.py

SQLite local em `config.data_dir() / "coffee.db"` (WAL habilitado), com
duas tabelas criadas/migradas em `inicializar_banco()`:

- **`notas_coffee`** — uma linha por `pk` de nota, com `id_sap`,
  `id_sap_anterior` (snapshot para a classificação), `arquivado`,
  `classificacao`, `dados_json` (fields brutos), `a_gerar` (flag da fila),
  `origem` (`"avulsa"` | `"verificar"` | `NULL`) e `classificacao_em`
  (timestamp da última mudança de classificação, preservado entre
  re-buscas que não mudam a classe).
- **`coffee_logs`** — log de auditoria (`api_call` / `acao_usuario` /
  `transicao`), com `usuario` (best-effort via `getpass.getuser()`, nunca
  levanta) e `trace_id` (correlaciona um lote e suas chamadas filhas,
  setado via `contextvars` em `definir_trace()`/`trace_atual()`).

`upsert_nota()` (`db.py:102`) é o ponto único de escrita de notas: lê o
`id_sap`/`classificacao`/`origem` anteriores, chama `classify.classificar()`
e grava, registrando uma entrada `transicao` em `coffee_logs` quando a
classificação muda. Nota: `arquivado` é intencionalmente **excluído** do
upsert (comentário `ponytail`, `db.py:103-104`) — representa uma ação do
usuário no app (via `arquivar_nota()`), não o estado do COFFEE, que arquiva
como parte do seu próprio workflow normal ao gerar.

## routes.py

Router `/api/coffee` (prefixo). Mapeamento para o frontend
(`02-frontend-coffee.md`):

| Rota | O que faz | Usado por |
|---|---|---|
| `POST /buscar` | Dispara `jobs.iniciar_busca` para uma lista de IDs. | `coffee-pendentes.tsx` |
| `GET /job/{job_id}` | Consulta estado de um job (busca ou geração). | `coffee-pendentes.tsx`, `coffee-gerar-modal.tsx` |
| `GET /notas` | Lista notas, filtrável por `status` (`pendente`/`gerada`/`a_gerar`/...). | `coffee-geradas.tsx`, `coffee-corrigidas.tsx`, `coffee-pendentes.tsx` |
| `GET /consultar/{id}` | Busca síncrona de uma nota (sem job) para o modal. | `coffee-gerar-modal.tsx` (`EDPApi.consultarNota`) |
| `POST /sap` | Define `id_sap` de uma nota diretamente. | uso interno/manual |
| `POST /desarquivar` | Desarquiva uma nota diretamente. | uso interno/manual |
| `POST /local-instalacao` | Corrige o local de instalação de uma nota. | `coffee-gerar-modal.tsx` |
| `GET /logs` | Lista logs, filtrável por `nota_pk`/`tipo`/`usuario`/`since`/`limit`. | `coffee-logs.tsx`, `coffee-log-drawer.tsx` |
| `GET /logs/usuarios` | Lista usuários distintos que aparecem nos logs. | `coffee-logs.tsx` |
| `POST /arquivar` | Arquiva uma nota (exige justificativa). | `coffee-pendentes.tsx`, `coffee-geradas.tsx` |
| `POST /marcar-gerar` | Liga/desliga a flag `a_gerar` (fila); resolve o `pk` real via `client.buscar_nota` ao adicionar, exige justificativa para remover. | `coffee-geradas.tsx` |
| `POST /regerar` | Força a geração de uma única nota (mesma regra desarquivar+SAP de `jobs.py`, sem passar por um job). | `coffee-geradas.tsx`, `coffee-gerar-modal.tsx` |
| `POST /gerar-lote` | Dispara `jobs.iniciar_geracao` para uma lista de IDs. | `coffee-gerar-modal.tsx` |

Um middleware de trace (não neste arquivo, mas exercitado pelas rotas)
carimba cada requisição com um `trace_id` propagado às chamadas filhas de
`client.py`/`jobs.py`, usado para agrupar logs de um mesmo lote em
`coffee-log-table.tsx`.

## Pontos de atenção

- `coffee_module/routes.py:103-112` — `POST /sap` e `POST /desarquivar`
  chamam `client.definir_sap`/`client.desarquivar` isoladamente, sem
  passar pela regra de "sempre os dois juntos" de `jobs.py`/`regerar`; são
  rotas de uso manual/interno e não têm proteção contra deixar uma nota
  com SAP placeholder mas ainda arquivada.
- `coffee_module/jobs.py:104-106` e `jobs.py:33-37` — uma falha em um ID
  do lote é capturada com `except Exception` e só grava `erros`/
  `registrar_erro`, sem detalhe do tipo de exceção; um erro de
  configuração (ex.: `COFFEE_API_KEY` ausente) afetaria todos os IDs do
  lote da mesma forma que um timeout pontual, sem diferenciação para o
  usuário.
- `coffee_module/config.py:15-17` — a `COFFEE_API_KEY` tem um valor
  hardcoded como default (não só um placeholder), usado sempre que a
  variável de ambiente não está definida.
- `coffee_module/db.py:154-158` — `arquivar_nota()` faz `UPDATE ... SET
  arquivado = 1` sem checar se o `pk` existe; a rota `POST /arquivar`
  cobre isso checando `db.nota_existe()` antes, mas uma chamada direta à
  função pulando essa checagem falha silenciosamente (0 linhas afetadas,
  sem erro).
- `coffee_module/routes.py:14-17` — `_garantir_banco()` inicializa o banco
  sob demanda na primeira requisição de cada rota que precisa dele
  (`_estado["inicializado"]`, estado de módulo), em vez de uma
  inicialização única no startup do FastAPI; rotas que esquecem de chamar
  `_garantir_banco()` (como `/sap` e `/desarquivar`) simplesmente não
  tocam o banco.
- `coffee_module/jobs.py:9-10` — `_JOBS` é um dict em memória do processo,
  sem TTL/limpeza: jobs concluídos ficam acumulando indefinidamente até o
  processo reiniciar.
