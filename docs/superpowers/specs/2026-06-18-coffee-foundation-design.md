# Spec — Fundação COFFEE (camada de integração backend)

**Data:** 2026-06-18
**Status:** Aprovado para implementação

> **Contexto maior:** Este é o **Sub-projeto 1** de uma iniciativa para transformar a seção COFFEE (hoje só um abridor de notas) num hub operacional com sub-páginas. Os próximos sub-projetos (não cobertos aqui) são: (2) Hub de navegação no frontend; (3+) as sub-páginas de dados (Verificar, Geradas, Corrigidas, Pendentes). Esta spec entrega **apenas a fundação backend** — sem UI.

## Problema

A seção COFFEE precisará exibir notas classificadas por status (Pendente / Corrigida / Gerada) e executar ações sobre elas (arquivar/desarquivar SAP, alterar local de instalação). Os dados vêm de uma **API externa da EDP** (`coffee.edp.gpti.com.br`) que:

- Retorna dados de **uma nota por vez** (`json_all/{id}`), sem endpoint de listagem.
- Exige **rate limiting**: ~1s entre buscas, ~0,5s entre operações de geração/escrita.
- Usa uma **chave de API** na URL que não pode ser exposta no navegador.

Buscar N notas leva N segundos — não pode ser uma requisição síncrona que trava a tela. E a classificação "Corrigida" depende de detectar uma **transição** de estado (SAP `10000000` → SAP real), o que exige guardar o estado anterior.

## Solução

Um módulo backend isolado `backend/coffee_module/` que encapsula a API externa, executa buscas em lote como **job com progresso (polling)**, classifica cada nota e persiste o resultado em **SQLite local**, expondo tudo via `/api/coffee/*`. Espelha as convenções do `input_module/` já existente.

## Modelo de classificação

Discriminador central: o campo `id_sap` do retorno da API. O placeholder de "ainda não gerada" é o valor **`10000000`**. A classificação compara o snapshot **anterior** (persistido) com o **atual**:

| Status | Regra |
|---|---|
| **Pendente** | `id_sap == 10000000` |
| **Corrigida** | `id_sap_anterior == 10000000` **e** `id_sap_atual != 10000000` (transição detectada nesta busca) |
| **Gerada** | `id_sap_atual != 10000000` e não é a transição acima (estado final) |

A transição "Corrigida" é **consumida**: após detectá-la, a busca grava `id_sap_anterior ← id_sap_atual`, então a próxima re-busca da mesma nota (SAP ainda real) cai em **Gerada**.

O campo `arquivado` (booleano) é **armazenado à parte**, não entra na classificação. Ele será usado pela futura sub-página "Geradas" como condição da ação "mover para o Input" (regra do `.md`: SAP real ⇒ `arquivado == true`).

### Formato real do `json_all` (confirmado)

A resposta é um JSON **duplamente codificado**: `response.json()` devolve uma *string*, que precisa de um segundo `json.loads`, resultando numa lista com um objeto `{model, pk, fields}`. Campos relevantes em `fields`:

```jsonc
"pk": 355617,                        // chave (ID Olho na Rede) — vem no objeto raiz, não em fields
"id_sap": 17247854,                  // SAP atual (placeholder = 10000000)
"arquivado": true,                   // booleano
"local_instalacao_corrigido": false, // flags informativos (guardados no JSON cru)
"alimentador_corrigido": false,
"trafo_corrigido": false
```

O JSON cru completo é persistido; a fundação extrai e indexa apenas `pk`, `id_sap`, `arquivado`.

## Arquitetura — `backend/coffee_module/`

| Arquivo | Responsabilidade |
|---|---|
| `__init__.py` | Vazio (pacote) |
| `config.py` | Chave da API, URL base, delays e constantes — tudo via env com defaults |
| `client.py` | Encapsula as 4 chamadas externas. Puro: só fala com a API e faz parsing |
| `classify.py` | Função pura de classificação a partir de `id_sap` atual/anterior |
| `db.py` | SQLite local (`backend/data/coffee.db`): upsert com snapshot, consulta por status |
| `jobs.py` | Runner in-process do job de busca em lote (thread + dicionário de progresso) |
| `routes.py` | `APIRouter` em `/api/coffee/*` |

Convenções (iguais ao `input_module`): imports top-level (`from coffee_module import db`), diretório de dados sobrescritível por env (`COFFEE_DATA_DIR`) para testes, SQLite com WAL.

### `config.py`

```python
COFFEE_API_KEY   = os.environ.get("COFFEE_API_KEY", "")                  # OBRIGATÓRIA via env — sem default no repo
COFFEE_BASE_URL  = f"https://coffee.edp.gpti.com.br/api/{COFFEE_API_KEY}/deolhonarede"
DELAY_BUSCA      = float(os.environ.get("COFFEE_DELAY_BUSCA", "1.0"))     # s entre json_all
DELAY_GERACAO    = float(os.environ.get("COFFEE_DELAY_GERACAO", "0.5"))   # s entre escritas
SAP_PENDENTE     = 10000000                                              # placeholder "não gerada"
```

A chave é **lida exclusivamente de `COFFEE_API_KEY`** — nunca commitada no repositório (nem como default). Em desenvolvimento, vem de um `.env`/variável de ambiente local (não versionado); o `client` deve falhar de forma clara se a chave estiver vazia. Nunca é enviada ao frontend. Os testes setam `COFFEE_API_KEY` para um valor fake e `COFFEE_DELAY_BUSCA=0` para não dormir.

### `client.py`

Quatro funções, cada uma montando a URL e tratando timeout/status. `requests` já é dependência do backend.

- `buscar_nota(id) -> dict | None` — GET `json_all/{id}`; faz o duplo-parse; retorna `{"pk": ..., "id_sap": ..., "arquivado": ..., "fields": {...}}` ou `None`/raise em erro.
- `arquivar(id, sap) -> bool` — GET `sap/{id}/{sap}`.
- `desarquivar(id) -> bool` — GET `desarquivar/{id}`.
- `alterar_local(id, local) -> bool` — GET `local_instalacao/{id}/{local}`.

Erros (timeout, status ≠ 200, JSON malformado) são capturados e propagados como exceção/sinal de falha, **sem** quebrar quem chama em lote.

### `db.py` — schema

```sql
CREATE TABLE IF NOT EXISTS notas_coffee (
  pk              INTEGER PRIMARY KEY,  -- ID Olho na Rede
  id_sap          INTEGER,             -- SAP atual
  id_sap_anterior INTEGER,             -- SAP do snapshot anterior (NULL na 1ª busca)
  arquivado       INTEGER,             -- 0/1
  classificacao   TEXT,                -- 'pendente' | 'corrigida' | 'gerada'
  dados_json      TEXT,                -- JSON cru de fields
  buscado_em      TEXT,                -- timestamp ISO da última busca
  erro            TEXT                 -- mensagem, se a busca daquele pk falhou
);
```

Funções: `get_db_connection()`, `inicializar_banco()`, `upsert_nota(pk, id_sap, arquivado, dados_json)` (lê a linha existente, define `id_sap_anterior ← id_sap antigo`, recalcula `classificacao` via `classify`, grava), `registrar_erro(pk, mensagem)`, `listar_notas(status: str | None)`.

### `jobs.py` — busca em lote

Dicionário module-level `JOBS: dict[str, dict]` protegido por `Lock`. Cada job: `{"estado": "rodando"|"concluido", "total": N, "feitas": k, "erros": [{"pk": id, "msg": ...}], "iniciado_em": ts}`.

`iniciar_busca(ids: list) -> str`: cria `job_id` (uuid4), registra o job, dispara uma `threading.Thread` que, para cada id: chama `client.buscar_nota`, em sucesso `db.upsert_nota`, em falha `db.registrar_erro` + acrescenta a `erros`, incrementa `feitas`, dorme `config.DELAY_BUSCA`. Ao fim, `estado = "concluido"`.

`obter_job(job_id) -> dict | None`.

### `routes.py` — `/api/coffee/*`

| Método | Rota | Corpo / Params | Retorno |
|---|---|---|---|
| POST | `/api/coffee/buscar` | `{ "ids": ["355617", ...] }` | `{ "job_id": "..." }` |
| GET | `/api/coffee/job/{job_id}` | — | `{ estado, total, feitas, erros }` (404 se inexistente) |
| GET | `/api/coffee/notas` | `?status=pendente\|corrigida\|gerada` (opcional) | `{ "registros": [...] }` |
| POST | `/api/coffee/sap` | `{ "id": ..., "sap": ... }` | `{ "ok": true }` (arquivar) |
| POST | `/api/coffee/desarquivar` | `{ "id": ... }` | `{ "ok": true }` |
| POST | `/api/coffee/local-instalacao` | `{ "id": ..., "local": ... }` | `{ "ok": true }` |

Montagem em `backend/main.py`, junto do `input_router`:

```python
from coffee_module.routes import router as coffee_router
app.include_router(coffee_router)
```

As rotas de escrita são wrappers finos sobre o `client` — existem na fundação, mas **quando/como** serão chamadas é definido pelas sub-páginas (sub-projetos futuros).

## Erros e resiliência

- Falha de uma nota no job **não** derruba o lote: registra erro por `pk` e segue.
- API fora do ar / timeout / 4xx-5xx → exceção capturada; a nota fica com `erro` preenchido.
- O job sempre termina em `concluido`, com a lista de `erros` populada.
- A chave da API jamais transita para o frontend.

## Verificação

Backend usa pytest (rodado de dentro de `backend/`). Testes com a **API externa mockada** (sem rede real) e `COFFEE_DELAY_BUSCA=0`:

- `client.py`: monkeypatch de `requests.get` — valida montagem de URL das 4 funções, o duplo-parse do `json_all`, e tratamento de status ≠ 200 / timeout.
- `classify.py`: testes puros das três regras, incluindo a transição `10000000 → real` (Corrigida) e a re-busca seguinte (Gerada).
- `db.py`: round-trip de `upsert_nota`; confirma que `id_sap_anterior` recebe o valor antigo e que a `classificacao` é recalculada na re-busca.
- `jobs.py`: `buscar_nota` mockado — progresso vai de 0 a `total`, erros são capturados por `pk`, resultados persistem, estado final `concluido`.
- `routes.py`: `TestClient` com `client` mockado — fluxo `POST /buscar` → `GET /job/{id}` → `GET /notas?status=...`; as três rotas de escrita retornam `ok`.

Comando: `cd backend; python -m pytest test_coffee_module.py -v`

## Fora de escopo (sub-projetos futuros)

- Qualquer UI / navegação / sub-páginas (Sub-projeto 2+).
- A ação "mover para o Input" (lógica de negócio da sub-página "Geradas").
- Persistência de histórico além de um snapshot anterior (não guardamos série temporal completa, só o último `id_sap`).
- Refinamento da sequência "arquivar→desarquivar" para casos específicos — a fundação expõe as duas operações; o orquestramento fica nas sub-páginas.
- Reaproveitamento dos flags `*_corrigido` (ficam no JSON cru, disponíveis, mas sem uso na classificação).
