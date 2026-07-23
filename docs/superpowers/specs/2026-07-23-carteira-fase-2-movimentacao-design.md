# Carteira de Notas — Fase 2 (Movimentação) — Spec

Data: 2026-07-23
Status: aprovado para planejamento (3 decisões-chave confirmadas com o usuário)
Base: design geral (`2026-07-22-carteira-de-notas-design.md`) + Fase 1
(`2026-07-22-carteira-fase-1-projecao-explorador-design.md`, implementada) +
descoberta real (`docs/dev/databricks-schema-discovery.md`).

Detalha a **Fase 2**: mover notas da carteira para o plano em lote, histórico
de movimentações, rastreio de origem no Input e aba de Divergências.

---

## 1. Escopo

**Entra:**
- Coluna `origem` na tabela `notas` do Input (`manual | coffee | carteira`),
  preenchida no momento da inserção. Corrige a dívida apontada no design
  (nota do COFFEE/carteira era indistinguível de manual).
- Mover-para-plano em lote a partir do Explorador (all-or-nothing), funilado
  por `input_service.criar_notas`.
- `plano_movimentacoes`: histórico das movimentações feitas via app.
- Endpoint de pré-visualização (proposta + avisos + movíveis) para o modal.
- Aba **Divergências**: notas no plano cuja carteira está `cancelada` ou
  ausente na origem (tombstone).
- Frontend: seleção de linhas no Explorador, barra de ação, modal de
  movimentação (mês/status do lote), aba Divergências.

**NÃO entra (fases seguintes):**
- Saída do plano (`plano_movimentacoes` prevê `acao`, mas Fase 2 só faz
  `entrada`); write-back ao Databricks (segue read-only).
- Dashboard completo, filtros salvos, command palette → Fase 3.
- Distinção `colagem` vs `manual` no `origem` (ambos ficam `manual` nesta
  fase; ver §7).
- Enriquecimento por `notas_sp` (join `ID_ONR`).

## 2. Decisões confirmadas (usuário, 2026-07-23)

| Decisão | Escolha |
|---|---|
| Coluna `origem` | Adicionar **agora**, na Fase 2. Migração aditiva; `criar_notas` ganha param `origem`. |
| Mês de execução ao mover | **Um mês para o lote todo** (modal com `Mes_Execucao_Planejado` + `Status_Obra` aplicados a todas as selecionadas), igual ao `integracao_module`. |
| Aba Divergências | **Cancelada + ausente na origem** apenas (nota no plano cujo id_sap casa na carteira e está `cancelada` OU tombstoned). |
| Quantidade → `Planejado_DDPM` | **As-is + aviso** (o `conjunto` da carteira é código, não o texto "Denom.conjunto" do IW28 — a conversão m→km do `integracao_module` não se aplica). |

## 3. Precedente reutilizado

O `integracao_module` já faz exatamente esse fluxo para o COFFEE
(`mover_para_plano` → `mapping.montar_nova_nota` → `input_service.criar_notas`,
lote all-or-nothing, `CAMPOS_MANUAIS = [Mes_Execucao_Planejado, Status_Obra,
Observacao, Check]`). A Fase 2 espelha esse desenho para a carteira, mas:
- lê de `carteira.db` (`nota_carteira`, chave `id_onr`), não de `coffee.db`;
- a carteira **tem `conjunto`** → a nota entra no plano com `Conjunto`
  preenchido (o COFFEE deixava `-`).

`carteira_module` NÃO importa `integracao_module` (mantém o baixo
acoplamento); ambos funilam por `input_service.criar_notas`.

## 4. Modelo de dados

### Input `notas` — coluna nova

`ALTER TABLE notas ADD COLUMN origem TEXT` (sem default → `NULL` nas linhas
legadas, que ficam "origem desconhecida"). Padrão idempotente já usado no
`inicializar_banco` (checa `PRAGMA table_info(notas)` antes de adicionar).

`input_service.criar_notas(notas, usuario, origem="manual")`:
- `_preparar_novas` grava `registro["origem"] = origem`;
- call-sites: `input_module/routes.py` (single/bulk) → `"manual"`;
  `integracao_module/service.py` → `"coffee"`; `carteira_module` → `"carteira"`.

### `carteira.db` — `plano_movimentacoes`

`id` PK, `id_onr` INTEGER, `numero_nota` TEXT (o id_sap movido),
`acao` TEXT (`entrada`), `usuario` TEXT, `lote_id` TEXT (agrupa um lote),
`mes_execucao` TEXT, `status_obra` TEXT, `movido_em` TEXT (ISO),
`snapshot` TEXT (JSON dos campos enviados). Índice em `id_onr` e `lote_id`.

## 5. Regras de movimentação

Uma nota da carteira é **movível** quando:
- `sap_real = 1` (id_sap real; exclui sentinela `10000000` e vazio);
- ainda **não** está no plano (`input_db.obter_nota_plano(id_sap) is None`);
- não é tombstoned (`ausente_na_origem_em IS NULL`) — não mover o que sumiu
  da origem;
- não gera duplicata de `Numero_Nota` no lote (dois `id_onr` com o mesmo
  `id_sap` — a carteira tem 1.548 duplicatas de id_sap no subset SP).

Lote **all-or-nothing**: qualquer nota inválida aborta antes de escrever
(mesmo contrato de `integracao_module.mover_para_plano` +
`input_service.criar_notas`, que já levanta `NotasDuplicadasErro`).

**Mapa carteira → `NovaNota`** (`carteira_module/movimentacao.py`):

| NovaNota | Origem na carteira |
|---|---|
| `Numero_Nota` | `int(id_sap)` |
| `Conjunto` | `conjunto` (ganho — antes ficava `-`) |
| `Local_Instalacao` | `local_instalacao` ou `-` |
| `Circuito` | `alimentador` ou `-` |
| `Prioridade_Nota` | de-para de `prioridade` (fallback `"Programável"` + aviso) |
| `Planejado_DDPM` | `quantidade` as-is (aviso: sem conversão m→km) |
| `Status_Nota` | `"01 Sem providência"` (inicial, como integracao) |
| `Data_Envio_Projeto` | data de hoje `dd/mm/yyyy` |
| `Mes_Execucao_Planejado` | manual (modal) |
| `Status_Obra` | manual (modal) |
| `Observacao` / `Check` | manual (modal) |

`Regional` NÃO é enviado — `criar_notas` já deriva do prefixo de
`Local_Instalacao` (convenção do plano; pode divergir da regional CSD da
carteira, aceitável — o plano tem sua própria regra).

**Avisos** (o modal exibe, não bloqueia): prioridade fora do de-para;
local de instalação vazio; `quantidade` sem valor válido (`quantidade_valida=0`).

## 6. Divergências

`nota_carteira` com (`status_sap = 'Cancelado'` OU `ausente_na_origem_em IS
NOT NULL`) **e** `CAST(id_sap AS INT)` presente no conjunto de `Numero_Nota`
do plano (`input_db.listar_numeros_nota()`, já existente da Fase 1a).

Cada divergência traz o tipo (`cancelada` | `ausente_na_origem`) e os campos
da nota. É **somente alerta** — nunca remove nem altera o plano
automaticamente (o usuário decide). Notas do plano fora do subset SP da
carteira (ramal/ES/legado) **não** são sinalizadas (decisão §2).

## 7. APIs (`/api/carteira`)

| Endpoint | Papel |
|---|---|
| `POST /mover/preview` | body `{id_onrs: int[]}` → por nota: `movivel`, `motivo_bloqueio`, `proposta` (campos derivados), `avisos`. Não escreve. |
| `POST /mover-para-plano` | body `{id_onrs: int[], mes_execucao, status_obra, observacao?, check?}` → valida tudo, cria via `criar_notas(origem="carteira")`, grava `plano_movimentacoes`, invalida caches. all-or-nothing. Retorna `{inseridas, lote_id}`. |
| `GET /movimentacoes` | histórico (opcional `?id_onr=`). |
| `GET /divergencias` | lista de divergências (§6). |

Erros → HTTP explícito (409 já-no-plano/duplicata, 422 nota não-movível),
mensagem clara (o quê/por quê). Endpoints finos: validam, chamam service.

## 8. Frontend

- **Explorador — seleção:** ligar a seleção de linha do TanStack Table
  (na Fase 1 era só visual). Checkbox por linha + "selecionar página".
- **Barra de ação:** quando há seleção, aparece "Mover N para o plano".
- **Modal de movimentação** (`branded/` ou `features/carteira/mover/`):
  - lista as selecionadas com badge de movível/bloqueada + avisos (de
    `POST /mover/preview`);
  - `MesExecucaoPicker` (componente existente) para `Mes_Execucao_Planejado`;
  - `Status_Obra` (Select), `Observacao`/`Check` opcionais;
  - confirmar → `POST /mover-para-plano`; sucesso invalida
    `INPUT_DADOS_KEY` + keys da carteira; toast com contagem; bloqueadas
    impedem o envio (all-or-nothing).
- **Aba Divergências:** novo `CarteiraSubPage` `"divergencias"`; tabela
  (mesma linguagem do Explorador) com tipo de divergência + badge.
- **Atalhos (leves):** o card `resumo-fora-do-plano` dos Relatórios passa a
  abrir o Explorador filtrado por `situacao=fora_do_plano`; banner no Input
  linka para a Carteira. (Reusa o handoff `filtrosHandoff` do App.tsx.)
- Visual Supabaze (`.carteira-scope`), consistente com a Fase 1b.

## 9. Idempotência, cache e observabilidade

- Mover é **não-idempotente por natureza** (cria registro no plano), mas
  protegido: `criar_notas` recusa duplicata (lote + banco), e a regra
  "não movível se já no plano" evita reinserção. Reenviar o mesmo lote →
  erro claro, nada é inserido.
- Pós-escrita: `input_service.pos_escrita` (invalida cache do engine +
  copia Excel de rede) — mesmo choke point das outras escritas do plano.
  A projeção da carteira NÃO muda (situação é derivada; a nota vira
  `no_plano` na próxima leitura, sem sync).
- Log em `carteira_logs` (trace_id) para cada movimentação; `plano_movimentacoes`
  é o histórico consultável.

## 10. Edge cases → estratégia

| Caso | Estratégia |
|---|---|
| id_sap sentinela/vazio | `sap_real=0` → não movível (bloqueado no preview) |
| id_sap duplicado (1.548 no subset) | dedupe de `Numero_Nota` no lote → erro claro; mover só um dos `id_onr` |
| Nota já no plano | bloqueada no preview; `criar_notas` recusa (409) |
| Nota tombstoned | não movível (sumiu da origem) |
| Lote misto (válidas + inválidas) | all-or-nothing: aborta, nada inserido, lista as inválidas |
| Prioridade fora do de-para | fallback `"Programável"` + aviso |
| Após mover, nota reaparece na carteira | situação vira `no_plano` (derivada, sem sync) |
| Nota no plano cancelada na origem | aparece em Divergências (alerta, não auto-corrige) |
| Reenvio do mesmo lote | erro de duplicata; nada inserido (protege idempotência prática) |

## 11. Impacto nos módulos

| Módulo | Mudança |
|---|---|
| Input | coluna `origem` em `notas` (migração aditiva); `criar_notas` ganha param `origem` (default `"manual"`, retrocompatível) |
| integracao_module | 1 linha: passa `origem="coffee"` em `criar_notas` |
| carteira_module | novo `movimentacao.py` (mapa + mover + divergências) + endpoints + `plano_movimentacoes` |
| Relatórios | card fora-do-plano linka para o Explorador filtrado |
| COFFEE / Verificar | intocados |

## 12. Divisão em planos

- **Fase 2a (backend):** coluna `origem` + `criar_notas(origem)` + call-sites;
  `plano_movimentacoes`; `movimentacao.py` (preview/mover/divergências);
  endpoints; testes. Testável por pytest.
- **Fase 2b (frontend):** seleção no Explorador, barra de ação, modal de
  movimentação, aba Divergências, atalhos. Gate `npm run build` + validação
  visual.

## 13. Critérios de aceite (Fase 2)

- `origem` gravado corretamente por caller (manual/coffee/carteira);
  migração idempotente; notas legadas ficam `NULL` sem quebrar nada.
- Preview lista movíveis/bloqueadas + avisos corretos por amostragem.
- Mover em lote all-or-nothing: lote válido insere e grava
  `plano_movimentacoes`; lote com 1 inválida não insere nada.
- Nota movida some do `fora_do_plano` e entra em `no_plano` na próxima
  leitura (situação derivada), sem sync.
- Divergências lista apenas cancelada/ausente que casam no plano.
- Testes: `movimentacao` (mapa/mover/divergências) + `origem` unit-testados;
  suíte backend inteira verde; build frontend verde.
- Docs `docs/dev/` atualizados (carteira_module + Input `origem`).
