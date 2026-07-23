# Carteira de Notas — Fase 3 (Dashboard / Inteligência) — Spec

Data: 2026-07-23
Status: aprovado para planejamento (3 decisões-chave confirmadas com o usuário)
Base: design geral (`2026-07-22-carteira-de-notas-design.md`) + Fases 1–2
(implementadas) + investigação de dado real (abaixo).

Detalha a **Fase 3**: o dashboard executivo da Carteira — meta × planejado ×
base disponível × executado, cobertura com farol, distribuições, evolução
mensal/acumulada, heatmap e drill-down.

---

## 1. Escopo

**Entra:**
- Aba **Dashboard** na seção Carteira (vira a landing da seção).
- Backend: `GET /api/carteira/dashboard` — reusa a agregação dos Relatórios
  (meta/planejado/executado por regional×plano×mês) e **adiciona a camada
  "base disponível" (fora do plano)** da projeção da carteira.
- KPIs (meta, planejado, base disponível, gap, % cobertura com farol),
  distribuição por plano/regional, evolução mensal e acumulada,
  comparativo planejado × executado, heatmap regional×plano, drill-down
  (clique abre o Explorador filtrado).

**NÃO entra (fase seguinte 3b):**
- Filtros salvos (nomeados), command palette (⌘K).

**Removido do roadmap (não é viável):**
- Sync incremental com watermark — a Fase 1a comprovou que `Atualizacao` é
  carimbo de refresh da tabela inteira (valor único p/ todas as linhas), não
  timestamp por-linha. Não há incremental por-linha em `coffee_onr_es_sp`.

## 2. Decisões confirmadas (usuário, 2026-07-23)

| Decisão | Escolha |
|---|---|
| Métrica | **Quantidade convertida para DDPM** (m→km nos planos de rede) — bate a unidade da meta. |
| Arquitetura da agregação | **Reusar `input_module.relatorios.montar_dashboard`** (meta/planejado/executado mensal) + adicionar a camada "base disponível" da `carteira.db`. Acoplamento read-only aceito; convergência total é Fase 4. |
| Escopo | **Só o dashboard.** Filtros salvos e command palette = Fase 3b. |

## 3. Dado real (investigação, 2026-07-23)

- **De-para de plano:** `carteira.nota_carteira.descricao_conjunto` ==
  `metas_plano.Plano` == `planos_depara.Plano` (string exata). Ex.: carteira
  conjunto `46`/desc `"POSTES - CAPEX"` ↔ meta `"POSTES - CAPEX"`.
- **Nem todo conjunto tem meta:** os 2 maiores volumes são OPEX (`PODA DE
  ARVORES - OPEX` 43,9k; `MANUT. CIRC. PRIMARIO - MT - OPEX` 33,6k) e **não**
  estão nas metas (~17 planos, quase todos CAPEX/Construção). Meta×carteira
  só se aplica aos planos com meta; a base disponível é mostrada para todos.
- **Conversão de unidade:** `planos_depara.Unidade` = `Und.`/`KM`/`Ponto`.
  Planos com `Unidade == 'KM'` (REDE COMPACTA TRIF/MONO, BLINDAGEM, REDE
  MULTIPLEXADA MT, MELHORIA OPERATIVA) têm a `quantidade` da carteira em
  metros → **÷1000** para virar DDPM. Demais: `quantidade` as-is.
- **De-para de regional (carteira → Relatórios):** a `regional` da carteira
  (CSD normalizado) NÃO casa com `relatorios.REGIONAIS_CSD`:

  | carteira | Relatórios (`REGIONAIS_CSD`) |
  |---|---|
  | GUARATINGUETÁ | Guaratinguetá |
  | GUARULHOS | Guarulhos |
  | MOGI DAS CRUZES | Mogi das Cruzes |
  | SÃO JOSÉ DOS CAMPOS | São José dos Campos |
  | Litoral Norte | Litoral Norte |
  | Poá-Suzano | Poa/Suzano |

  Necessário `DE_PARA_REGIONAL_DASHBOARD` em `carteira_module`.

## 4. Reuso da agregação dos Relatórios

A rota atual dos Relatórios monta o dashboard assim (referência):
```python
relatorios.montar_dashboard(
    engine.get_dataset(), db.carregar_dados_ramal(),
    db.carregar_metas(ano), db.carregar_planos_depara(),
    db.carregar_postergacoes(ano),
    ano=ano, mes_referencia=mes, regional=regional)
```
Retorna meta/planejado(carteira-no-plano)/executado por regional×plano×mês
(`hero`, `visao_anual`, `mensalizacao`, `regionais`). O dashboard da Carteira
chama exatamente isso e **acrescenta** a camada base.

## 5. Camada "base disponível" (nova)

Da `carteira.db` (`nota_carteira`, `ausente_na_origem_em IS NULL`):
- **base disponível** = notas `fora_do_plano` (situação derivada), agregadas
  por `regional`(de-para dashboard) × `descricao_conjunto`, somando
  `quantidade` convertida a DDPM (÷1000 se `Unidade=='KM'`, senão as-is);
  só `sap_real=1` e `quantidade_valida=1`.
- **cobertura**: para cada regional×plano com meta, `% cobertura da meta =
  (planejado + base disponível) / meta` — responde "existe quantidade
  suficiente na base para atingir a meta?". Farol reusando os limiares de
  `relatorios.fmt` (≥1 verde, ≥0.85 âmbar, senão vermelho).
- **gap** = `meta − planejado` (o que falta planejar); **suficiência** =
  `base disponível ≥ gap`.

`dashboard.py` (função pura, molde `montar_dashboard`) recebe os DataFrames +
o snapshot agregado da carteira e devolve o payload unificado, testável sem
I/O.

## 6. API

`GET /api/carteira/dashboard?ano=&mes=&regional=` → payload:
```
{
  "hero": {...},              # do montar_dashboard (meta/planejado/executado)
  "mensalizacao": [...],      # do montar_dashboard (por mês)
  "por_plano": [              # linha por plano: meta, planejado, base, gap,
    { "plano", "nome_curto", "area", "meta", "planejado", "base_disponivel",
      "gap", "cobertura_pct", "suficiente" } ],
  "por_regional": [...],      # idem agregado por regional
  "base_por_plano_sem_meta": [...],  # OPEX etc. (só base, sem meta)
  "regionais_disponiveis": [...],
  "metas_info": {...},
  "versao": "..."             # composto: versao input + versao carteira
}
```
ETag por `versao` (padrão existente). Endpoint fino: valida, chama o service.

## 7. Frontend

- **Nova aba `dashboard`** (`CarteiraSubPage`), primeira da lista (landing da
  seção Carteira). Ordem: Dashboard · Explorador · Divergências · Sincronização.
- **KPIs** (`StatTile`): Meta total, Planejado, Base disponível, Gap,
  % Cobertura (com farol). Reusa `fmt` (farol/fmtQtd/fmtPct) dos Relatórios.
- **Evolução mensal** e **acumulada**: Recharts (`ui/chart`), séries
  meta/planejado/executado por mês (do `mensalizacao`). Reusa o padrão do
  `relatorios/mensalizacao-chart.tsx`.
- **Distribuição por plano**: tabela/barras — meta, planejado, base, cobertura
  (farol). **Distribuição por regional**: idem.
- **Heatmap regional × plano**: CSS grid (não Recharts), célula colorida pela
  % cobertura (farol). Responde "onde está faltando".
- **Drill-down**: clicar um plano/regional/célula abre o Explorador filtrado
  (situação=fora_do_plano + regional/conjunto), via o handoff `carteiraHandoff`
  do App.tsx (estendido para aceitar filtros compostos).
- **Comparativo planejado × executado**: já vem do `mensalizacao`.
- Visual Supabaze (`.carteira-scope`), gráficos com tokens (`var(--accent)`
  etc.), farol com os tokens de cor existentes.

## 8. Edge cases → estratégia

| Caso | Estratégia |
|---|---|
| Conjunto sem meta (OPEX poda/manut) | aparece em `base_por_plano_sem_meta` (só base, sem cobertura); não polui o meta×carteira |
| Meta sem carteira correspondente | linha com base=0; cobertura só do planejado |
| Regional divergente de nome | `DE_PARA_REGIONAL_DASHBOARD` normaliza; não-mapeado cai em bucket "Outras" (logado) |
| `quantidade` sentinela 9999 / inválida | excluída (só `quantidade_valida=1`) |
| Plano KM com quantidade em metros | ÷1000 (via `Unidade`); flag de validação: confirmar que a origem está em metros |
| Meta=0 | cobertura `null` (não divide por zero) — mesmo tratamento do `_pct` dos Relatórios |
| Carteira base muda (nova sync) | dashboard recomputa na próxima leitura (situação derivada); cache invalida por `versao` |

## 9. Cache e performance

- Agregação da base: SQL na `carteira.db` (`GROUP BY regional, descricao_conjunto`
  com filtro de situação) — leve (98k linhas, ~23 conjuntos × 6 regionais).
- `montar_dashboard` já é rápido (agrega poucos milhares de notas do plano).
- Cache em memória com TTL + invalidação por `versao` composto
  (input `obter_versao_dataset` + carteira `obter_versao`); ETag/304.
- Frontend: React Query staleTime 60s; sem Dexie (dado pequeno e derivado).

## 10. Impacto nos módulos

| Módulo | Mudança |
|---|---|
| carteira_module | novo `dashboard.py` (agregação pura) + `repository` (base por regional×plano) + rota `/dashboard` |
| input_module | nenhuma alteração de escrita; apenas leitura reusada (`relatorios.montar_dashboard`, loaders, metas) |
| Relatórios | intocado (convergência é Fase 4) |
| Frontend Carteira | nova aba Dashboard + charts/heatmap; handoff estendido p/ drill-down |

## 11. Divisão em planos

- **Fase 3a (backend):** `DE_PARA_REGIONAL_DASHBOARD`, conversão DDPM via
  `planos_depara.Unidade`, `repository.base_por_plano`, `dashboard.py`
  (agregação pura reusando `montar_dashboard` + camada base), rota
  `/dashboard`, testes.
- **Fase 3b-front:** aba Dashboard, KPIs, charts (evolução mensal/acumulada,
  distribuições), heatmap, drill-down; passe visual.

## 12. Critérios de aceite (Fase 3)

- `/dashboard` devolve meta/planejado/executado (do `montar_dashboard`) +
  base disponível por regional×plano, com conversão DDPM correta (KM÷1000).
- De-para de regional casa carteira↔metas por amostragem (Guarulhos, Poa/Suzano).
- Cobertura = (planejado+base)/meta com farol; suficiência = base ≥ gap.
- Conjuntos sem meta aparecem só na camada base, sem quebrar o meta×carteira.
- Frontend: aba Dashboard como landing; KPIs, evolução, distribuições,
  heatmap e drill-down para o Explorador filtrado.
- Testes: `dashboard.py` (agregação pura) e `repository.base_por_plano`
  unit-testados; suíte backend verde; build frontend verde.
- Docs `docs/dev/` atualizados (carteira_module dashboard + frontend).
