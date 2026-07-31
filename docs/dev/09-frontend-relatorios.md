# Frontend — Relatórios de Recomposição

## Estrutura e navegação

`frontend/src/features/relatorios/` concentra as seis telas da Central de
Recomposição:

1. Dashboard geral;
2. Carteira por regional;
3. Mensalização;
4. Financeiro;
5. Postergações;
6. Exportar.

`RelatoriosSection` é o shell compartilhado. Ele renderiza o cabeçalho,
`SegTabs`, filtros globais e o `PlanoInspector`; as telas são componentes
filhos da feature. O tipo `RelatoriosPage` e o normalizador ficam em
`frontend/src/types.ts`. `App.tsx` persiste a aba ativa em `sessionStorage`
sob a chave `edp_relatorios_page`, e `app-sidebar.tsx` usa
`RELATORIOS_TABS` para espelhar as mesmas seis entradas na navegação lateral.

## Filtros e contrato de dados

`FiltrosGlobais` mantém mês, regional e busca no estado do shell:

- **Regional** refaz a query de dashboard com
  `GET /api/carteira/dashboard?regional=<nome>` (Fase 4a: Relatórios deriva
  da carteira — o endpoint é superset do contrato de Relatórios, com a camada
  base disponível/cobertura fundida em `visao_anual`/`regionais`).
- **Mês** seleciona o recorte da série mensal devolvida pelo endpoint. O
  payload usa `mes_referencia`; o frontend não usa mais o nome legado
  `mes_corrente`.
- **Busca** é um filtro de cliente sobre código do plano, nome, área,
  regional e unidade.

`useRelatoriosData` busca o dashboard do escopo ativo e, para a visão SP,
consulta cada regional disponível. Isso fornece linhas com regional real para
ranking, matriz e detalhamento sem inventar um rateio do total agregado.
Com uma regional selecionada, ele usa apenas o dashboard daquela regional, de
forma que o filtro global permanece consistente em todas as telas.

Quando o mês global não é o mês corrente, os resumos regionais usam a linha
correspondente de `mensalizacao` de cada regional. Até esse detalhamento chegar,
a interface aguarda os dados em vez de reutilizar os totais do mês corrente.

`relatorios-data.ts` converte `LinhaAnual` em `PlanoRelatorio`. As regras
centrais são:

- `deficit = max(-saldo, 0)`;
- `gapFinanceiro = max(-gap_rs, 0)`;
- o déficit crítico é a soma dos déficits por plano, sem compensar uma falta
  com sobra de outro plano;
- a ordenação crítica é gap financeiro desc, disponibilidade asc e déficit
  desc.

Essas regras são protegidas em `relatorios-data.test.ts`.

## Executado e aviso de data SAP

O dashboard recebe `avisos.executadas_sem_data`, contador anual por nota e
por filtro regional. Valor maior que zero mostra banner âmbar no topo:
notas com código 99 foram contabilizadas no mês planejado porque
`Encerram.por data` estava ausente. O banner usa `role="status"` herdado de
`Banner`.

## Cobertura (Fase 4a — deriva da carteira)

Desde a convergência (Fase 4a), o Dashboard (`resumo-decisao`,
`acoes-criticas`) e o `PlanoInspector` exibem **cobertura possível** e **base
disponível** reais, vindas da camada base do `/api/carteira/dashboard`
(`base_disponivel`/`cobertura_pct`/`suficiente` por plano, com farol). Se a
carteira não estiver sincronizada — ou o plano não tiver meta/base — o valor
degrada para `—`, sem inventar número. A associação por-nota (quais notas do
COFFEE atendem um plano) segue **não** disponível; a cobertura é agregada por
plano (planejado + base fora do plano ÷ meta), não uma lista de notas
candidatas.

## Limites ainda expostos pela interface

A tela Postergações só mostra totais por plano e o valor
do mês corrente; destino, reincidência e R$ deslocado aparecem como `—` com
a limitação descrita na UI. A tela Exportar também não chama
`InputApi.exportar`, pois aquele endpoint exporta notas do Input e não um
pacote consolidado de Relatórios. Enquanto não houver contrato próprio, a
ação apenas informa essa dependência.

Os seis blocos do pacote são selecionáveis para tornar o escopo explícito na
UI, mas o nome do arquivo é apenas uma prévia até existir o endpoint próprio.

## UI e acessibilidade

As telas montam a UI a partir de `components/branded/section.tsx`
(`SectionPage`, `PageHeader`, `StatTile`, `StatNumber`, `Eyebrow`, `Banner`,
`SegTabs`) e dos primitivos de `components/ui/` (`Card` no lugar do antigo
`.edp-panel`, `Table` já com a pele do projeto embutida). O lote 4c-2 eliminou
as classes `.edp-*` desta feature — eram 84 ocorrências em 20 arquivos, a maior
concentração do app. Não há cores estáticas ou estilos inline de layout; os
poucos estilos inline são somente larguras/alturas calculadas dos gráficos de
barras.

`Select`, `Sheet` e `Tooltip` portalizados pelo Radix herdam tema, densidade e
accent direto de `:root`. O hook `useRelatoriosPortalTheme` e a classe de
escopo replicada no conteúdo do portal foram removidos na Fase 4c — não há
mais nada a repassar.

As ações de plano e de mês são botões nativos, portanto permanecem acessíveis
por teclado sem transformar linhas de tabela em controles. O Inspector usa
`Sheet` Radix controlado e oferece o handoff para as notas do plano no Input.
Selecionar uma regional nas grades aplica o filtro global.

## Verificação

No diretório `frontend/`:

```bash
npm test       # Vitest: regras de dados dos Relatórios
npm run build  # type-check e build de produção
```

Vitest é dependência de desenvolvimento porque o frontend não possuía runner
de testes; foi adicionado apenas para cobrir as transformações críticas de
Relatórios.
