# Carteira de Notas — Fase 4a (Convergência Relatórios ⟵ Carteira) — Spec

Data: 2026-07-29
Status: aprovado para planejamento (2 decisões-chave confirmadas com o usuário)
Base: design geral (`2026-07-22-carteira-de-notas-design.md`, §12 Fase 4) +
Fase 3 (dashboard da Carteira, implementada) + recomposição de Relatórios
(6 telas, `2026-07-27-relatorios-recomposicao-six-screens.md`, mergeada na
develop em `ae83c9c`).

Detalha a **Fase 4a**, primeira fatia da Convergência: fazer os Relatórios
**derivarem da carteira**, ganhando a camada "base disponível / cobertura"
(fora do plano, projeção COFFEE) que hoje não existe no contrato dos
Relatórios.

---

## 1. Problema

O design-mestre (§12) define a Fase 4 como um bundle de longo prazo
(Relatórios ⟵ carteira; enriquecimento Input/COFFEE; storage; migração
visual). Esta spec recorta **só** a convergência de Relatórios.

O Relatórios recém-recomposto (6 telas) deriva **exclusivamente** de
`input_module.relatorios.montar_dashboard` — meta / carteira-no-plano /
executado por regional×plano×mês. Ele **não conhece** a base COFFEE. O
próprio manual do dev registra o limite
(`docs/dev/09-frontend-relatorios.md`, §"Limites expostos"):

> O endpoint atual informa apenas `corrigidas_fora_do_plano` em nível
> agregado. (…) Dashboard e Inspector exibem "cobertura não confirmável"
> e nunca mostram notas candidatas, cobertura possível ou movimentação
> automática como se fossem dados reais.

A Carteira (Fase 3) **já computa** exatamente esse dado ausente:
`base_disponivel` (notas fora do plano, convertidas a DDPM) e
`cobertura_pct` / `suficiente` por regional×plano, em
`carteira_module/dashboard.py`. Falta ligar as duas superfícies.

**Objetivo da 4a:** trocar "cobertura não confirmável" por cobertura real
nas telas de Relatórios, adicionando a camada base sem duplicar agregação
e sem inverter a dependência entre módulos.

## 2. Decisões confirmadas (usuário, 2026-07-29)

| Decisão | Escolha |
|---|---|
| Fatia da Fase 4 a implementar agora | **Relatórios deriva da carteira** (4a). Enriquecimento Input/COFFEE, storage e migração visual ficam para fatias posteriores. |
| Mecanismo da convergência | **Carteira vira fonte única.** `carteira_module.dashboard.montar` passa a devolver o **superset** do contrato de Relatórios (`DashboardRelatorios`) com a camada base fundida em `visao_anual`/`regionais`. `/api/carteira/dashboard` vira a fonte; os hooks de Relatórios repontam para ele. O endpoint `/api/input/relatorios/dashboard` **permanece vivo** (compat / reuso interno via função). |

Racional do mecanismo: respeita a direção de dependência do design
(`carteira_module → input_module`, nunca o inverso — logo enriquecer o
endpoint do Input com dado de carteira está **proibido**); fonte única
elimina o join duplicado; degrada bem (carteira sem sync ⇒
`base_disponivel = 0`, meta/planejado/executado seguem íntegros pois vêm
de `montar_dashboard`, independente de `carteira.db`).

## 3. Estado atual (dado real, 2026-07-29)

### Contrato hoje — `montar_dashboard` (input)
Retorna:
```
{ano, mes_referencia, regional, hero, visao_anual, mensalizacao,
 regionais, financeiro_ano}
```
A rota `GET /api/input/relatorios/dashboard` (input_module/routes.py:70)
embrulha com `regionais_disponiveis` (= `relatorios.REGIONAIS_CSD`) e
`metas_info` (`{atualizadas_em, arquivo_mtime, erro}` de
`metas.sincronizar_se_preciso()`). Esse embrulho é o
`DashboardRelatorios` que o front consome (frontend types.ts):

- `hero: HeroMes`
- `visao_anual: LinhaAnual[]` — `{plano, nome_curto, area, unidade, meta,
  carteira, saldo, pct_disp, gap_rs, postergado}`
- `mensalizacao: MesMensalizacao[]`
- `regionais: RegionalResumo[]` — `{regional, meta, carteira, saldo, pct_disp}`
- `financeiro_ano`, `metas_info`, `regionais_disponiveis`, `ano`,
  `mes_referencia` (o front lê `mes_corrente` com fallback — pré-existente,
  fora do escopo desta fase; **preservar a chave atual**, não renomear).

### Contrato hoje — `/api/carteira/dashboard`
`carteira_module.dashboard.montar` **descarta** a riqueza do `visao_anual`
e devolve um recorte próprio:
```
{hero, mensalizacao, por_plano, por_regional,
 base_por_plano_sem_meta, regionais_disponiveis}
```
- `por_plano` (só meta>0): `{plano, nome_curto, area, meta, planejado,
  base_disponivel, gap, cobertura_pct, suficiente}`
- `por_regional`: `{regional, meta, planejado, base_disponivel, gap,
  cobertura_pct}`
- `base_por_plano_sem_meta`: `{plano, nome_curto, area, base_disponivel}`
  (OPEX poda/manut etc. — só base, sem cobertura)

Ou seja, **não é superset** de `DashboardRelatorios`: faltam
`saldo`/`pct_disp`/`gap_rs`/`postergado`/`unidade` por plano,
`financeiro_ano`, `metas_info`, `ano`/`mes_referencia`, e `saldo`/`pct_disp`
por regional.

### De-para e conversão (reuso da Fase 3, inalterado)
- Plano: `nota_carteira.descricao_conjunto` == `metas_plano.Plano` ==
  `planos_depara.Plano` (string exata).
- DDPM: `planos_depara.Unidade == 'KM'` ⇒ `quantidade ÷ 1000`; senão as-is.
- Regional: `config.DE_PARA_REGIONAL_DASHBOARD` (CSD carteira → `REGIONAIS_CSD`).
- Base disponível = `nota_carteira` `fora_do_plano`,
  `ausente_na_origem_em IS NULL`, `sap_real=1`, `quantidade_valida=1`.

Nada disso muda na 4a — a agregação já é a mesma; só o **shape de saída**
de `montar` cresce para superset.

## 4. Contrato-alvo — `/api/carteira/dashboard` (superset)

`montar` passa a devolver **todo o `DashboardRelatorios`** + camada base
fundida, mais os recortes específicos da Carteira que já existiam:

```
{
  # --- superset do DashboardRelatorios (drop-in p/ Relatórios) ---
  "ano": int,
  "mes_referencia": int,          # mesma chave de hoje (não renomear)
  "regional": str | null,
  "regionais_disponiveis": [...],
  "hero": HeroMes,                # inalterado
  "visao_anual": [                # LinhaAnual + 3 campos base:
    { …campos atuais…,
      "base_disponivel": float,   # DDPM fora do plano do plano (0 se sem base)
      "cobertura_pct": float|null,# (carteira + base_disponivel) / meta
      "suficiente": bool }        # base_disponivel >= max(0, meta - carteira)
  ],
  "mensalizacao": [...],          # inalterado
  "regionais": [                  # RegionalResumo + 2 campos base:
    { …campos atuais…,
      "base_disponivel": float,
      "cobertura_pct": float|null }
  ],
  "financeiro_ano": {...},
  "metas_info": {...},
  # --- extras específicos da Carteira (mantidos p/ o dashboard da Carteira) ---
  "base_por_plano_sem_meta": [...],
  "versao": "..."                 # composto input+carteira (já existe)
}
```

Regras da fusão (idênticas às da Fase 3, apenas reposicionadas):
- `base_disponivel` por plano vem de `base_por_plano[plano]` (DDPM). Plano
  sem base ⇒ `0.0` (nunca omite a linha — `visao_anual` continua completo).
- `cobertura_pct` = `_pct(carteira + base_disponivel, meta)` (null se meta=0).
- `suficiente` = `base_disponivel >= max(0, meta − carteira)`.
- Regional: `base_disponivel` só soma planos **com meta** (planos sem meta
  ficam em `base_por_plano_sem_meta`) — mantém a semântica de cobertura da
  Fase 3 (base OPEX não infla a %).

**Anti-duplicação (CLAUDE.md — Rule of Three):** `por_plano` e
`por_regional` deixam de existir como estruturas paralelas; a informação
que carregavam passa a viver **dentro** de `visao_anual`/`regionais`
(fonte única). `base_por_plano_sem_meta` permanece — é genuinamente
separado (planos sem meta, ausentes do `visao_anual`).

O endpoint da carteira passa a chamar `metas.sincronizar_se_preciso()`
(como a rota do Input) para preencher `metas_info`, e devolve
`ano`/`mes_referencia`/`regional` do `montar_dashboard`.

## 5. Frontend — repoint + camada base nas telas

### Fonte de dados
- `frontend/src/features/relatorios/use-dashboard.ts` e
  `use-relatorios-data.ts` (fan-out por regional) trocam
  `InputApi.dashboardRelatorios(...)` por `CarteiraApi.dashboard(...)`
  (mesmo endpoint que o dashboard da Carteira já usa). Como o contrato é
  superset, o resto do pipeline (`criarPlanosRelatorio`, ordenação,
  `useRelatoriosData`) **não muda** — só ganha campos.
- `DashboardRelatorios`/`LinhaAnual`/`RegionalResumo` (relatorios/types.ts)
  ganham os campos base como **opcionais** (`base_disponivel?`,
  `cobertura_pct?`, `suficiente?`) — mantém o build resiliente enquanto o
  backend não estiver no ar e evita `any`.

### Onde a camada base aparece
Escopo da UI = **substituir os placeholders de cobertura por dado real**;
sem telas novas. Alvos:
- **Dashboard geral / Resumo-decisão / Ações-críticas**: "cobertura não
  confirmável" → `cobertura_pct` real com farol (`fmt.farol`); coluna/linha
  "base disponível" nas tabelas de plano; badge `suficiente`.
- **Carteira por regional** (ranking/matriz): coluna base + cobertura por
  regional (de `regionais[].base_disponivel/cobertura_pct`).
- **PlanoInspector**: cobertura possível real + base disponível do plano.
- **Drill-down** (opcional, se couber no esforço): clicar um plano/regional
  abre o Explorador da Carteira filtrado (situação=fora_do_plano +
  regional/conjunto). Reusa o handoff existente `carteiraHandoff` do
  App.tsx; se o handoff atual não aceitar filtro composto, estender no
  mesmo molde da Fase 3 (drill-down do dashboard da Carteira).

**Fora do escopo 4a** (limites de OUTROS contratos, não da camada base):
- Postergações (destino/reincidência/R$ deslocado = "—") — depende da
  associação nota-COFFEE↔plano, contrato inexistente.
- Exportar (pacote consolidado) — depende de endpoint próprio de export.
- Notas candidatas / movimentação automática dentro de Relatórios.

Esses seguem exibidos com a limitação honesta que o codex já escreveu;
não os fabricar.

### Dashboard da Carteira (regressão a proteger)
`kpis-dashboard.tsx`, `distribuicao.tsx`, `heatmap.tsx` hoje leem
`por_plano`/`por_regional`. Com a fusão em `visao_anual`/`regionais`,
migram para ler **os mesmos campos** de `visao_anual` (filtrando `meta>0`)
e `regionais`. `base_por_plano_sem_meta` continua igual. O comportamento
visual e os números devem ficar **idênticos** (é refatoração de fonte, não
de regra) — a validação visual da Fase 3b é o gabarito.

## 6. Edge cases → estratégia

| Caso | Estratégia |
|---|---|
| Carteira nunca sincronizada | `base_disponivel = 0` em tudo; `cobertura_pct` = só planejado/meta; Relatórios funciona igual a hoje + zeros na coluna base (degradação graciosa) |
| Plano de Relatórios sem correspondência na base | `base_disponivel = 0`; linha permanece (nunca some) |
| Plano OPEX (sem meta) | continua em `base_por_plano_sem_meta`; **não** entra em `visao_anual` (que é dirigido por metas) — Relatórios nunca listou OPEX, comportamento preservado |
| meta = 0 numa linha do `visao_anual` | `cobertura_pct = null` (sem divisão por zero) — igual ao `_pct` atual |
| Regional divergente de nome | `DE_PARA_REGIONAL_DASHBOARD` (Fase 3, inalterado); não-mapeado → bucket logado |
| `versao` muda (nova sync ou novo dataset) | `versao` composto já invalida cache/ETag; front (React Query) refetch |
| Endpoint da carteira fora / erro | Relatórios trata como qualquer erro de query (estado de erro do hook); **não** silenciar (CLAUDE.md) |

## 7. Cache e performance

- Sem custo novo: `montar` já computa a base (`GROUP BY` leve em
  `carteira.db`) e já chama `montar_dashboard`. A 4a só **reposiciona** o
  resultado no shape de saída.
- `versao` composto (`input.obter_versao_dataset` + `carteira.obter_versao`)
  e ETag/304 no endpoint da carteira — reusar o padrão do endpoint do Input
  (hoje `/api/carteira/dashboard` não faz 304; adicionar ETag por `versao`).
- Front: React Query staleTime 60s (igual hoje). O fan-out por regional
  de `useRelatoriosData` **não** aumenta — troca só a URL de cada query,
  1:1 com hoje.

## 8. Impacto nos módulos

| Módulo | Mudança |
|---|---|
| `carteira_module` | `dashboard.montar` devolve superset (funde base em `visao_anual`/`regionais`, some `por_plano`/`por_regional`); `service.dashboard` chama `metas.sincronizar_se_preciso` p/ `metas_info`; rota `/dashboard` ganha ETag/304 |
| `input_module` | **nenhuma** alteração de escrita nem de contrato; `montar_dashboard` intocado; endpoint `/relatorios/dashboard` permanece (compat) |
| Frontend Relatórios | hooks repontam p/ `CarteiraApi.dashboard`; types ganham campos base opcionais; telas substituem "não confirmável" por cobertura real; drill-down (opcional) |
| Frontend Carteira | `kpis`/`distribuicao`/`heatmap` migram de `por_plano`→`visao_anual` (mesmos números) |
| Docs | `docs/dev/09-frontend-relatorios.md` (remover o limite de cobertura), `docs/dev/10-backend-carteira-module.md` (novo shape do dashboard), `docs/dev/11-frontend-carteira.md` (fonte do dashboard) |

## 9. Divisão em planos

- **Fase 4a-backend:** `dashboard.montar` → superset (fusão base em
  `visao_anual`/`regionais`, `financeiro_ano`/`metas_info`/`ano`/`mes`
  passthrough, remover `por_plano`/`por_regional`); `service.dashboard`
  + `metas_info`; ETag/304 na rota; atualizar/expandir os testes de
  `dashboard.py` (agregação pura) para o novo shape.
- **Fase 4a-frontend:** repoint dos hooks p/ `CarteiraApi.dashboard`;
  campos base opcionais nos types; migração do dashboard da Carteira
  (`por_plano`→`visao_anual`); camada base nas telas de Relatórios
  (cobertura real + coluna base + farol); drill-down (opcional); passe
  visual; docs.

## 10. Critérios de aceite (Fase 4a)

- `/api/carteira/dashboard` devolve **superset** de `DashboardRelatorios`:
  todo o contrato atual dos Relatórios + `base_disponivel`/`cobertura_pct`/
  `suficiente` em cada `visao_anual[]` e `base_disponivel`/`cobertura_pct`
  em cada `regionais[]`, com DDPM correto (KM÷1000) e regional de-para.
- Repointar os hooks de Relatórios p/ o endpoint da carteira **não regride**
  nenhuma das 6 telas (meta/planejado/executado/financeiro idênticos ao
  endpoint do Input); os testes `relatorios-data.test.ts` seguem verdes.
- "Cobertura não confirmável" some das telas onde a base resolve; cobertura
  e base disponível reais aparecem com farol.
- Dashboard da Carteira (Fase 3b) permanece visualmente e numericamente
  idêntico após migrar de `por_plano`→`visao_anual`.
- Carteira sem sync ⇒ Relatórios funciona com `base_disponivel = 0` (sem
  erro, sem número inventado).
- Testes: `dashboard.py` (novo shape) unit-testado; suíte backend verde
  (hoje 262); build frontend verde; `vitest` verde.
- Docs `docs/dev/` atualizados (09/10/11) na mesma entrega (CLAUDE.md).

## 11. Riscos e pontos de atenção

- **Regressão do dashboard da Carteira** ao trocar a fonte `por_plano`→
  `visao_anual`: é o maior risco. Mitigar com validação visual (gabarito
  Fase 3b) e mantendo a regra de agregação intocada (só muda de onde o
  front lê).
- **`mes_corrente` vs `mes_referencia`**: divergência pré-existente entre
  o type do front e o backend; **não** consertar nesta fase (fora do
  escopo) — apenas preservar a chave que o endpoint já emite p/ não
  introduzir regressão nova.
- **ETag no endpoint da carteira**: garantir que o `versao` composto
  realmente muda quando qualquer um dos datasets muda (já é o caso).
```
