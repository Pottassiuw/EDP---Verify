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

A verificação TLS é controlada por `config.ssl_verify()` (env
`COFFEE_SSL_VERIFY`) e passada como `verify=` em toda chamada `httpx`. A
rede corporativa injeta um CA raiz auto-assinado na cadeia, que o bundle
público rejeita (`CERTIFICATE_VERIFY_FAILED`); por isso o padrão é
`"false"` (verificação desligada, host interno da EDP). Aceita também
`"true"` (bundle padrão) ou o caminho de um CA bundle `.pem` — recomendado
em produção. Sem essa configuração, toda `buscar_nota` falha no handshake
e a rota `/marcar-gerar` responde 502 "Nao foi possivel buscar a nota".

- `buscar_nota(id)` (`client.py:41`) — `GET json_all/{id}`. A API COFFEE
  devolve uma string JSON duplamente codificada (`json.loads` sobre o
  corpo já decodificado pelo `httpx`), de onde é extraído o primeiro
  registro (`bruto[0]`). Para um id inexistente a API responde 200 com
  lista vazia; nesse caso `buscar_nota` levanta
  `NotaNaoEncontradaErro` (`client.py:12`), que as rotas `/consultar` e
  `/marcar-gerar` convertem em 404 (qualquer outra exceção vira 502).
  Retorna um dict com `pk`, `id_sap`, `arquivado`, `local_instalacao`
  (montado por `compor_local_instalacao`) e os `fields` brutos.
- `compor_local_instalacao(fields)` (`client.py:25`) — a API não devolve
  um campo pronto de local de instalação: ele é montado a partir de
  `cidade` (3 dígitos, zero-padded) + `tipo_local_instalacao` (2 letras) +
  `local_instalacao_numero` (8 dígitos, zero-padded). Retorna `None` se
  faltar qualquer componente.
- `definir_sap(id, sap)` (`client.py:89`) — `GET sap/{id}/{sap}`, atribui
  (ou reseta, com `SAP_PENDENTE`) o campo `id_sap` da nota no COFFEE.
- `desarquivar(id)` (`client.py:93`) — `GET desarquivar/{id}`.
- `alterar_local(id, local)` (`client.py:97`) — `GET
  local_instalacao/{id}/{local}`.

As três escritas (`definir_sap`, `desarquivar`, `alterar_local`)
compartilham o helper interno `_get_logado()` (`client.py:72`), que faz o
GET, loga e propaga a exceção em caso de erro — não há retry.

## jobs.py — geração em background

Três jobs in-process, guardados num dict em memória (`_JOBS`, protegido
por `threading.Lock`) e identificados por `job_id` (`uuid4().hex`):
`iniciar_busca()` (`jobs.py:13`) roda `client.buscar_nota` +
`db.upsert_nota` para cada ID, sem alterar nada no COFFEE. `iniciar_geracao()`
(`jobs.py:54`) é o caminho de "forçar geração": para cada ID, decide entre
pular (já tem SAP real) ou forçar via placeholder + desarquivamento.
`iniciar_correcao_local()` (`jobs.py:115`) é a malha fina: corrige em lote
locais de instalação com "9" extra — confirma o local atual via `buscar_nota`
antes de alterar (já corrigido → `ja_corrigidas`; diferente de esperado →
`divergentes`, nunca altera; senão `alterar_local` → `corrigidas`).

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

Um job é disparado pelas rotas `POST /api/coffee/buscar`, `POST
/api/coffee/gerar-lote` e `POST /api/coffee/corrigir-local-lote` (ver
routes.py abaixo), que retornam um `job_id` imediatamente; o estado
(`estado`/`total`/`feitas`/`erros`/`corrigidas`/`ja_corrigidas`/`divergentes`/`geradas`)
é consultado por polling em `GET /api/coffee/job/{job_id}` (`obter_job()`,
`jobs.py:48`). No frontend, `coffee-pendentes.tsx` faz esse polling a cada
`2000ms` para a busca em lote, e `coffee-gerar-modal.tsx` (`pollJob`) a
cada `600ms` para a geração em lote (desistindo após 10 falhas
consecutivas) — ambos documentados em `02-frontend-coffee.md`. Com
`gerar_apos=true` na correção de local, o job encadeia a geração apenas
para os locais corrigidos, seguindo a mesma regra de `_rodar_geracao`
(placeholder + desarquivamento para SAP ausente ou `SAP_PENDENTE`; pula
notas com SAP real).

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
  `origem` (`"avulsa"` | `"verificar"` | `NULL`), `classificacao_em`
  (timestamp da última mudança de classificação, preservado entre
  re-buscas que não mudam a classe) e `usuario` — o **dono** da nota
  (quem trouxe primeiro), não um log de quem mexeu por último.
- **`coffee_logs`** — log de auditoria (`api_call` / `acao_usuario` /
  `transicao`), com `usuario` (identidade da requisição — ver
  "Identidade do usuário" abaixo) e `trace_id` (correlaciona um lote e
  suas chamadas filhas, setado via `contextvars` em
  `definir_trace()`/`trace_atual()`).

### Identidade do usuário (`_usuario_atual`/`definir_usuario`)

`db._usuario_atual()` (`db.py`) resolve a identidade da operação atual
nesta ordem: (1) o contextvar `_usuario_req`, setado por
`db.definir_usuario(usuario)`; (2) fallback best-effort via
`getpass.getuser()` (nunca levanta). `definir_usuario()` é chamado em
dois pontos: a dependência `usuario_coffee` de `routes.py` (lê o header
`X-User`, `None` se ausente/vazio) no início de cada request, e cada
`_rodar*` de `jobs.py` (recebe `usuario` como argumento e o propaga na
thread do job antes do loop de IDs — contextvars não atravessam threads
sozinhos). Hoje o app roda localmente (um usuário por processo), então
o fallback `getpass` raramente entra em jogo; o desenho já deixa o
código pronto para um deploy multi-usuário em servidor, onde o header
`X-User` é a única fonte confiável.

`upsert_nota()`/`registrar_erro()` gravam `usuario=_usuario_atual()` só
na *primeira* vez que o `pk` aparece (`COALESCE(notas_coffee.usuario,
excluded.usuario)` no `ON CONFLICT`) — quem trouxe a nota primeiro
continua sendo o dono mesmo que outro usuário rebusque/atualize a
mesma nota depois.

`upsert_nota()` (`db.py:102`) é o ponto único de escrita de notas: lê o
`id_sap`/`classificacao`/`origem` anteriores, chama `classify.classificar()`
e grava, registrando uma entrada `transicao` em `coffee_logs` quando a
classificação muda. Nota: `arquivado` é intencionalmente **excluído** do
upsert (comentário `ponytail`, `db.py:103-104`) — representa uma ação do
usuário no app (via `arquivar_nota()`), não o estado do COFFEE, que arquiva
como parte do seu próprio workflow normal ao gerar.

`obter_nota(pk)` (`db.py:188`) — leitura passiva de uma nota única por
primary key, retorna um dict com a mesma forma de `listar_notas` (todos os
campos em `_COLUNAS`, `dados_json` parseado, booleans coercidos), ou `None`
se a nota não existe **ou está arquivada localmente** — mesmo filtro
`(arquivado IS NULL OR arquivado = 0)` de `listar_notas`, para que uma nota
que o usuário arquivou (ação local, distinta do arquivamento do próprio
COFFEE) não fique acessível para revisão/movimentação por outros módulos.
`integracao_module` consome essa função para revisar e mover notas para o
plano do Input.

## routes.py

Router `/api/coffee` com `dependencies=[Depends(usuario_coffee)]` — a
identidade (`X-User` → `db.definir_usuario()`) é garantida em toda rota
do módulo, inclusive rotas futuras, sem opt-in por assinatura. Só as
rotas que usam o *valor* do usuário (`/buscar`, `/notas`, `/gerar-lote`,
`/corrigir-local-lote` — repassam para jobs/filtro) redeclaram
`Depends(usuario_coffee)` como parâmetro; o FastAPI cacheia a dependency
por request, então ela não roda duas vezes.

`usuario_coffee` **precisa ser `async def`**: dependency síncrona roda em
`run_in_threadpool` numa cópia de contexto descartada, então o
`ContextVar.set()` nunca chegaria ao corpo da rota (o dono seria gravado
com o fallback `getpass` e a nota sumiria da lista do requisitante).
Async roda no task do request; o endpoint sync herda o contexto via
`copy_context`. Regressão coberta por
`test_rota_consultar_grava_dono_do_header` /
`test_rota_buscar_log_acao_com_usuario_do_header`
(`test_coffee_module.py`).
Mapeamento para o frontend (`02-frontend-coffee.md`):

| Rota | O que faz | Usado por |
|---|---|---|
| `POST /buscar` | Dispara `jobs.iniciar_busca` para uma lista de IDs, propagando o usuário do header para a thread do job. | `coffee-pendentes.tsx` |
| `GET /job/{job_id}` | Consulta estado de um job (busca ou geração). | `coffee-pendentes.tsx`, `coffee-gerar-modal.tsx` |
| `GET /notas` | Lista notas, filtrável por `status` (`pendente`/`gerada`/`a_gerar`/...) **e** por dono: com `X-User` presente, só devolve notas do próprio usuário ou sem dono (`(usuario = ? OR usuario IS NULL)`, notas legadas pré-migração ficam visíveis a todos até alguém rebuscá-las). | `coffee-geradas.tsx`, `coffee-corrigidas.tsx`, `coffee-pendentes.tsx` |
| `GET /consultar/{id}` | Busca síncrona de uma nota (sem job) para o modal. 404 se o id não existe no COFFEE, 502 para falha real da API. | `coffee-gerar-modal.tsx` (`EDPApi.consultarNota`) |
| `POST /sap` | Define `id_sap` de uma nota diretamente. | uso interno/manual |
| `POST /desarquivar` | Desarquiva uma nota diretamente. | uso interno/manual |
| `POST /local-instalacao` | Corrige o local de instalação de uma nota. | `coffee-gerar-modal.tsx` |
| `GET /logs` | Lista logs, filtrável por `nota_pk`/`tipo`/`usuario`/`since`/`limit`. | `coffee-logs.tsx`, `coffee-log-drawer.tsx` |
| `GET /logs/usuarios` | Lista usuários distintos que aparecem nos logs. | `coffee-logs.tsx` |
| `POST /arquivar` | Arquiva uma nota (exige justificativa). | `coffee-pendentes.tsx`, `coffee-geradas.tsx` |
| `POST /marcar-gerar` | Liga/desliga a flag `a_gerar` (fila); resolve o `pk` real via `client.buscar_nota` ao adicionar (404 se o id não existe, 502 para falha real da API), exige justificativa para remover. | `coffee-geradas.tsx`; Verificar via `EDPApi.marcarGerar` (`App.tsx` — concluir adiciona, reabrir remove com justificativa automática) |
| `POST /regerar` | Força a geração de uma única nota (mesma regra desarquivar+SAP de `jobs.py`, sem passar por um job). | `coffee-geradas.tsx`, `coffee-gerar-modal.tsx` |
| `POST /gerar-lote` | Dispara `jobs.iniciar_geracao` para uma lista de IDs. | `coffee-gerar-modal.tsx` |
| `POST /corrigir-local-lote` | Malha fina: corrige em lote locais de instalação com "9" extra. Body `{itens: [{id, local}], gerar_apos}`; `local` é o proposto (13 chars). Devolve `{job_id}` (polling via `GET /job/{job_id}`). O job confirma o local atual via `buscar_nota` antes de alterar: igual ao proposto → `ja_corrigidas`; diferente de `local+"9"` → `divergentes` (nunca altera); senão `alterar_local` → `corrigidas`. Com `gerar_apos=true`, encadeia a geração (placeholder SAP + desarquivar, mesma sequência do gerar-lote) apenas para os corrigidos — relatório em `geradas`. | futuro frontend malha fina |

Um middleware de trace (não neste arquivo, mas exercitado pelas rotas)
carimba cada requisição com um `trace_id` propagado às chamadas filhas de
`client.py`/`jobs.py`, usado para agrupar logs de um mesmo lote em
`coffee-log-table.tsx`.

## Pontos de atenção

- `coffee_module/routes.py:107-116` — `POST /sap` e `POST /desarquivar`
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
