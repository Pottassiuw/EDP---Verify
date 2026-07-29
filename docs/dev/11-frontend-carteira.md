# Frontend — features/carteira

Seção da Carteira de Notas: dashboard executivo, exploração da projeção
local (Databricks → `carteira_module`), movimentação para o plano,
divergências e estado da sincronização. Quatro abas: **Dashboard**
(landing), **Explorador**, **Divergências** e **Sincronização**.

## Dashboard (Fase 3b)

Aba landing (`dashboard/`), consome `GET /api/carteira/dashboard`.

- **KPIs** (`kpis-dashboard.tsx`): Meta, Planejado, Base disponível, Gap,
  Cobertura (farol reusando `features/relatorios/fmt`). Somam sobre os
  planos **com meta** (o backend já separa OPEX/sem-meta).
- **Heatmap por regional** (`heatmap.tsx`): grade de cards, % cobertura da
  regional colorida por farol; clique dá drill-down. (MVP: cobertura por
  regional, não a matriz regional×plano completa.)
- **Evolução** (`evolucao.tsx`): `ComposedChart` (Recharts via `ui/chart`) —
  barras meta/planejado/executado por mês + linha de executado acumulado.
- **Distribuição** (`distribuicao.tsx`): tabelas por plano e por regional
  (meta/planejado/base/gap/cobertura com farol), clicáveis para drill-down.
- **Drill-down interno**: clicar plano/regional troca para a aba Explorador
  com o filtro aplicado — coordenado por `carteira-section.tsx` (estado
  `drill`), sem tocar `App.tsx`. O landing default (`edp_carteira_sub`) é
  `dashboard` (App.tsx).

Dois ajustes de backend surgiram na validação visual real: (1) o dashboard
só compara meta×base para conjuntos com **meta>0** (senão a base OPEX enorme
— PODA 500k — inflava a cobertura para milhares de %); (2) o filtro
`conjunto` do Explorador passou a casar o código **OU** a `descricao_conjunto`
(o drill do dashboard passa a descrição = `Plano`, não o código).

## Movimentação (Fase 2b)

- **Seleção de linhas** no Explorador: TanStack Table `enableRowSelection`
  + `getRowId=id_onr`; checkbox por linha (com `stopPropagation` para não
  abrir o Sheet de detalhe ao marcar) + checkbox de "selecionar página".
- **Barra de ação**: aparece quando há seleção → "Mover para o plano" +
  "Limpar".
- **`mover/mover-modal.tsx`**: espelha o modal do COFFEE
  (`features/coffee/mover-plano-modal.tsx`). `POST /mover/preview` valida a
  seleção (movível/bloqueada + avisos); `MesExecucaoPicker` +
  `Status_Obra` aplicados ao lote todo; `POST /mover-para-plano` (X-User via
  `getUsuario()`) → invalida `INPUT_DADOS_KEY` + keys da carteira. A nota
  movida some do `fora_do_plano` e vira `no_plano` na próxima leitura
  (situação derivada, sem sync).
- **All-or-nothing na UI**: o botão "Mover" fica desabilitado se houver
  nota bloqueada **ou** duplicata de nº SAP na seleção (o `id_sap` não é
  único na base — 1.548 duplicatas no subset SP; dois `id_onr` virariam o
  mesmo `Numero_Nota`). O backend também recusa o lote (all-or-nothing);
  a guarda no cliente evita o clicar-e-tomar-409.
- **`DialogContent`** portalizado recebe `className="edp carteira-scope"`
  (canvas branco Supabaze), mesma ressalva de Sheet/Select da Fase 1b.
- **Aba Divergências** (`divergencias/divergencias.tsx`): consome
  `GET /divergencias`; badge por tipo (`cancelada`/`ausente_na_origem`).
  Só alerta; nada é alterado automaticamente.
- **Atalho**: o card "fora do plano" dos Relatórios ganhou "Ver na
  carteira" → abre o Explorador filtrado por `situacao=fora_do_plano`
  (handoff via `App.tsx`, padrão `filtrosHandoff`).

## Estrutura

```
frontend/src/features/carteira/
  api.ts                     CarteiraApi (fetch, padrão req<T> do InputApi)
  types.ts                   espelho dos tipos de resposta do backend
  situacao.ts                mapa SituacaoCarteira -> {rotulo, variant}
  subs.ts                    abas (import-light, não puxa a seção)
  use-carteira-notas.ts      página paginada (keepPreviousData)
  use-carteira-resumo.ts     KPIs (seeded via Dexie)
  use-carteira-sync.ts       estado + mutação de sincronização
  carteira-section.tsx       shell: PageHeader + SegTabs
  explorador/
    filtros.tsx              busca + Select regional/situação
    kpis.tsx                 StatTiles do resumo
    colunas.tsx               ColumnDef<NotaCarteira> (TanStack Table)
    tabela.tsx                tabela paginada + navegação
    detalhe-sheet.tsx         Sheet lateral com o detalhe da nota
    explorador.tsx            composição da aba
  sincronizacao/
    sincronizacao.tsx         estado, histórico, botão "Sincronizar agora"
```

## Estado servidor

React Query em tudo. `useCarteiraNotas` usa `keepPreviousData` (evita
flicker na paginação). `useCarteiraResumo` usa o hook compartilhado
`useSeededQuery` (`frontend/src/hooks/use-seeded-query.ts`) — extraído
por Rule of Three a partir do padrão seed→revalidate já usado em
`useInputData`/`useRamalData`.

## Direção visual — Supabaze (DESIGN.md)

Esta é a primeira feature construída na direção visual do DESIGN.md
(decisão registrada no brainstorm da Carteira). O resto do app segue
no tema EDP (`.edp`, dark-first) até a migração completa.

**Mecanismo de escopo:** classe `.carteira-scope` (definida em
`app.css`) sobrescreve as mesmas CSS custom properties que `.edp`
define — como todo componente (StatTile, Badge, Table, Sheet, Button)
já consome essas variáveis via `var(--...)`, a reskin cascateia sem
tocar em nenhum componente compartilhado.

**Duas armadilhas reais encontradas na implementação** (documentadas
para quem for escopar a próxima seção):

1. **Cascade layers.** `:root, .edp { --bg: ...; }` é CSS *sem layer*
   (unlayered). CSS sem layer sempre vence CSS dentro de `@layer`,
   **independente de especificidade do seletor** — por isso
   `.carteira-scope` precisa estar fora de `@layer components {}`
   (mesmo padrão já usado por `[data-slot="sidebar-container"]` no
   rodapé do arquivo). Colocar o override dentro do layer faz o
   `.edp` ancestral vencer silenciosamente — sem erro, sem warning,
   só o valor errado.
2. **Bridge parcial.** Uma custom property herdada (`--background:
   var(--bg)` declarada em `.edp`) já resolveu seu valor *no
   ancestral* — mudar `--bg` num descendente não a recalcula. É
   preciso redeclarar toda a ponte consumida pelos componentes shadcn
   (`--background`, `--foreground`, `--card`, `--popover`, `--primary`,
   `--muted`, `--border`, etc.) dentro do próprio `.carteira-scope`,
   não só os tokens "crus".

**Conteúdo portalizado** (Sheet, Select) renderiza fora da árvore DOM
da seção — a classe `.carteira-scope` precisa ser aplicada
explicitamente em `SheetContent`/`SelectContent` também (mesma
ressalva que já valia para `.edp` em conteúdo do Radix).

**Correção de acessibilidade:** o padrão herdado do tema escuro
(`bg-tint-green` + `text-green`) usa o verde-esmeralda como cor de
*texto* — funciona no dark (alto contraste contra navy), mas falha
AA (1.96:1) em canvas branco. O badge `situPlano` (situação
"no_plano") foi corrigido para o padrão real do DESIGN.md
(`pill-tag-green`): preenchimento sólido + texto quase-preto. Os
outros três tons de status (`indigo`/`amber`/`red`) foram escurecidos
a partir dos valores literais do DESIGN.md para passar AA como texto
pequeno sobre a própria tinta — os valores puros do doc (ex.:
`accent-yellow #ffdb13`) são claros demais para isso.

## Sync dot — a assinatura da tela

Um indicador de frescor (`--carteira-sync-dot`, em `app.css`): verde
= projeção sincronizada, âmbar pulsante = sincronizando. É a mesma
linguagem do "dot" que o DESIGN.md repete como único evento cromático
da marca (wordmark, CTA) — aqui carrega informação real, já que a
tela inteira é sobre a frescor dos dados vindos do Databricks.

## Bugs reais encontrados na validação visual (e corrigidos)

A validação visual (screenshot real via Puppeteer/Chrome, com backend
+ dados reais da sincronização) encontrou dois defeitos que os testes
unitários (com origem mockada) não pegavam:

1. **`"nan"` literal em colunas de texto.** `DataFrame.to_dict("records")`
   preserva `float('nan')` para células vazias; `mapping._texto`
   checava só `valor is None`, que não captura NaN. Corrigido com
   `valor != valor` (truque IEEE754: NaN é o único valor que não é
   igual a si mesmo — evita importar pandas num módulo de domínio
   puro). Coberto por teste (`test_normalizar_linha_trata_nan_do_pandas_como_ausente`).
2. **UPDATE de reconciliação inviável em escala.** A versão original
   usava uma subquery correlacionada *por coluna* (23 subqueries × 98k
   linhas) — rápido quando é 100% INSERT (primeira sync), mas travou
   por minutos quando a maioria das linhas precisa de UPDATE (o caso
   comum de uma sync completa noturna). Reescrito como um único
   `UPDATE ... FROM` (JOIN real) + `id_onr INTEGER PRIMARY KEY` na
   tabela de staging (dá um índice de graça). 63.841 UPDATEs em 45s,
   antes travava indefinidamente.

## Fora de escopo (fases seguintes)

Mover-para-plano em lote, `plano_movimentacoes`, coluna `origem` no
Input, aba Divergências → Fase 2. Dashboard completo (evolução
mensal/acumulada, heatmap, drill-down), filtros salvos, command
palette → Fase 3.
