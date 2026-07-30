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
  tombstone), listagem (filtros+paginação+situação via TEMP TABLE), resumo e
  lookup determinístico por número SAP.
- `sync.py` — orquestração: skip-signal (`Atualizacao`), leitura injetável,
  reconcile transacional, single-flight, registro de execuções.
- `service.py` — casos de uso; `routes.py` — endpoints finos `/api/carteira`.
- `movimentacao.py` (Fase 2) — mover carteira→plano: mapa `nota_carteira`→
  `NovaNota`, `preview`, `mover_para_plano` (all-or-nothing), `listar_divergencias`.
- `dashboard.py` (Fase 3) — agregação pura do dashboard: `converter_ddpm`
  (÷1000 se KM) + `montar` (junta meta/planejado do `montar_dashboard` com a
  base disponível por plano/regional, calcula gap/cobertura/suficiência).

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

## Lookup SAP para enriquecimento (Fase 4B)

`repository.obter_por_id_sap(conn, numero)` lê somente `nota_carteira`. Aceita
apenas `sap_real=1` e, se houver duplicidade de `id_sap`, escolhe
deterministicamente o registro por `sincronizado_em DESC, id_onr ASC`. Retorna
o identificador interno e os campos de enriquecimento permitidos, além dos
marcadores de sincronização/tombstone; não consulta `notas_sp` nem expõe PII.

`service.enriquecimento_por_sap(numero)` estabelece o contrato interno de
enriquecimento: retorna `numero_sap`, `estado`, `dados`,
`ausente_na_origem_em` e `versao`. Os estados são `base_nao_sincronizada`
(versão `"0"`), `sem_correspondencia`, `encontrada` e `ausente_na_origem`.
`dados` é `None` nos dois primeiros; nos demais contém exclusivamente
`descricao_conjunto`, `conjunto`, `sintoma`, `componente_novo`, `kit`,
`n_trafo`, `dispositivo_protecao`, `status_sap` e `prioridade_sap`. Campos
textuais vazios permanecem `None`, conforme a normalização da Carteira; o
tombstone preserva o último conjunto de dados e informa quando saiu da origem.
Falhas SQLite não são convertidas no service.

`GET /api/carteira/notas/por-sap/{numero}` expõe esse contrato sem acrescentar
campos. A rota estática é declarada antes de `GET /notas/{id_onr}`. Ela envia
`ETag: W/"{versao}"` e `Cache-Control: no-cache`; com `If-None-Match` exatamente
igual ao ETag retorna `304` com os mesmos headers. Ausência continua sendo um
corpo `200` do service; falhas reais continuam a ser respostas `500` do FastAPI.

## Movimentação (Fase 2)

`movimentacao.py` move notas da carteira para o plano do Input, espelhando o
`integracao_module` (que já move COFFEE→plano) **sem acoplá-lo**: ambos
funilam por `input_service.criar_notas(origem="carteira")`.

- **Mapa** `nota_carteira`→`NovaNota`: `Numero_Nota=int(id_sap)`,
  `Conjunto=conjunto` (ganho — o COFFEE deixava `-`), `Local_Instalacao`,
  `Circuito=alimentador`, `Prioridade_Nota` (de-para 1-6, fallback
  `Programável`), `Planejado_DDPM=quantidade` as-is (aviso: sem conversão
  m→km, pois o `conjunto` é código, não o texto "Denom.conjunto" do IW28),
  `Status_Nota="01 Sem providência"`. `Mes_Execucao_Planejado`/`Status_Obra`/
  `Observacao`/`Check` vêm do modal (um valor para o lote todo).
- **Movível** quando: `sap_real=1` E não já no plano E `ausente_na_origem_em
  IS NULL` E sem duplicata de `Numero_Nota` no lote. Lote **all-or-nothing**
  (`preview` bloqueia antes de escrever; `MovimentacaoBloqueadaErro`).
- **`plano_movimentacoes`** (`carteira.db`): histórico (id_onr, numero_nota,
  acao=`entrada`, usuario, lote_id, mes/status, snapshot JSON, movido_em).
- **Divergências**: `nota_carteira` com (`status_sap='Cancelado'` OU
  tombstoned) cujo `id_sap` casa em `Numero_Nota` do plano. Só alerta,
  nunca auto-corrige.

## Dashboard (Fase 3)

`GET /dashboard` reusa `input_module.relatorios.montar_dashboard`
(meta/planejado/executado por regional×plano×mês) e **adiciona a camada
"base disponível"** (fora do plano) da `carteira.db`, sem tocar nos
Relatórios (convergência é Fase 4).

- **De-para de plano:** `nota_carteira.descricao_conjunto` == `metas.Plano`
  == `planos_depara.Plano` (string exata).
- **Conversão DDPM:** `planos_depara.Unidade == 'KM'` → `quantidade/1000`;
  senão as-is (`dashboard.converter_ddpm`).
- **De-para de regional** (`config.DE_PARA_REGIONAL_DASHBOARD`): a `regional`
  da carteira (`GUARULHOS`, `Poá-Suzano`…) → nomes de `relatorios.REGIONAIS_CSD`
  (`Guarulhos`, `Poa/Suzano`…).
- **`repository.base_por_plano`**: base disponível por regional×plano (só
  `fora_do_plano`: sap_real, quantidade_valida, não cancelada/executada, não
  no plano, não tombstone).
- **`dashboard.montar`**: por plano → meta, planejado, base_disponivel, gap
  (`meta−planejado`), cobertura_pct (`(planejado+base)/meta`, farol),
  suficiente (`base ≥ gap`). Conjuntos **sem meta** (OPEX poda/manut) saem
  em `base_por_plano_sem_meta`. Versao composta (input+carteira) para ETag.

### Superset de Relatórios (Fase 4a — convergência)

`dashboard.montar` deixou de emitir `por_plano`/`por_regional` e passou a
**fundir a camada base** (`base_disponivel`/`cobertura_pct`/`suficiente`)
**dentro** de cada `visao_anual[]` e `regionais[]` do `montar_dashboard`,
preservando todo o contrato de Relatórios (`ano`, `mes_referencia`,
`regional`, `hero`, `mensalizacao`, `financeiro_ano`, `avisos`,
`regionais_disponiveis`) + `base_por_plano_sem_meta`. O campo
`avisos.executadas_sem_data` é repassado sem alteração. `service.dashboard`
acrescenta `metas_info`
(via `metas.sincronizar_se_preciso`, idempotente por mtime) e a rota
`GET /dashboard` responde ETag/304 por `versao` composto.

Resultado: `/api/carteira/dashboard` é **fonte única** — superset drop-in de
`DashboardRelatorios`, consumido tanto pelo dashboard da Carteira quanto pelos
Relatórios (que derivam dele; `input_module` intocado, boundary preservado).
O split `meta>0` é idêntico à Fase 3 (zero-regressão dos números).

## APIs

`GET /notas` (filtros+paginação), `GET /notas/por-sap/{numero}` (enriquecimento
com ETag/304), `GET /notas/{id_onr}`, `GET /resumo`,
`GET /dashboard` (Fase 3), `GET /sincronizacao`, `POST /sincronizar`.
Movimentação (Fase 2): `POST /mover/preview` (não escreve),
`POST /mover-para-plano` (X-User obrigatório; 422 bloqueada, 409 duplicata;
`pos_escrita`), `GET /movimentacoes`, `GET /divergencias`.

## Testes

`backend/test_carteira_module.py` — offline, origem Databricks injetada.
Rodar: `venv/Scripts/python -m pytest test_carteira_module.py -v`.

## Fora de escopo (fases seguintes)

Saída do plano (`plano_movimentacoes` prevê `acao` mas Fase 2 só faz
`entrada`); dashboard completo, filtros salvos, command palette (Fase 3);
enriquecimento via `notas_sp` (join `ID_ONR`).
