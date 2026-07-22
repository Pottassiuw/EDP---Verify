# Backend — carteira_module

Projeção operacional local da base COFFEE (Databricks) e API do explorador.
Reutiliza `databricks_module` para leitura; não fala com o Databricks fora do
`sync.py`.

## Componentes

- `config.py` — `data_dir`, catálogo/schema/tabela (`sandbox_uc.ddpm.coffee_onr_es_sp`),
  `REGIONAIS_SP` (filtro), `DE_PARA_REGIONAL`, `TAMANHO_CHUNK`.
- `db.py` — schema `carteira.db` (`nota_carteira` PK `id_onr`,
  `carteira_sync_execucoes`, `carteira_logs`, `carteira_meta`), `versao`, meta.
- `mapping.py` — normalização origem→domínio: de-para regional, derivações
  (`sap_real`, `quantidade_valida`), `hash_conteudo`, drop de PII.
- `situacao.py` — função pura: `cancelada`/`executada`/`no_plano`/`fora_do_plano`.
- `repository.py` — SQL: staging, reconciliação idempotente (insert/update/
  tombstone), listagem (filtros+paginação+situação via TEMP TABLE), resumo.
- `sync.py` — orquestração: skip-signal (`Atualizacao`), leitura injetável,
  reconcile transacional, single-flight, registro de execuções.
- `service.py` — casos de uso; `routes.py` — endpoints finos `/api/carteira`.

## Sincronização

Sempre completa (a origem faz refresh total; `Atualizacao` é carimbo único da
tabela). Skip-signal: se `MAX(Atualizacao)` == último marker e o último sync foi
ok, pula. Idempotência: PK `id_onr` + upsert por hash + tombstone
(`ausente_na_origem_em`, nunca DELETE) + staging/reconcile transacional +
single-flight (`threading.Lock`).

## Situação

Derivada em tempo de leitura cruzando `nota_carteira.id_sap` com o conjunto de
`Numero_Nota` do plano (`input_module.db.listar_numeros_nota`). A mesma lógica
existe em `situacao.py` (pura) e no `CASE` do `repository.py` (para filtrar/
paginar em SQL).

## APIs

`GET /api/carteira/notas` (filtros+paginação+ETag futuro), `GET /notas/{id_onr}`,
`GET /resumo`, `GET /sincronizacao`, `POST /sincronizar`.

## Testes

`backend/test_carteira_module.py` — offline, origem Databricks injetada.
Rodar: `venv/Scripts/python -m pytest test_carteira_module.py -v`.

## Fora de escopo (fases seguintes)

Mover-para-plano em lote, `plano_movimentacoes`, aba Divergências (Fase 2);
dashboard completo, filtros salvos, command palette (Fase 3); enriquecimento
via `notas_sp` (join `ID_ONR`).
