# Módulo Input

## O que faz

Input é a visão consolidada e editável das notas de manutenção
importadas do SAP (IW28/IW38/IW66): mostra todos os registros num
grid tipo planilha, permite edição rápida ou em lote, filtros
avançados, exportação para Excel, relatórios de auditoria de prazo
(DDPM vs SAP) e histórico de alterações. Também dispara e acompanha a
sincronização com o SAP e alerta quando outra sessão altera a base
enquanto o usuário está com a tela aberta.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/features/input/input-section.tsx` | Casca da feature: cabeçalho, `SegTabs` das sub-abas (`INPUT_SUBS`), banners de aviso (dados desatualizados, importação inicial pendente, bases ausentes) e roteamento condicional para o componente de cada sub-aba. |
| `frontend/src/features/input/overview.tsx` | Sub-aba "Visão Geral": busca global + `Filters`, `DataGrid` somente-leitura, botões "Sincronizar SAP" e "Exportar Excel", status de vínculos automáticos (`useAutoVinculos`) e o `HierarquiaCard`. |
| `frontend/src/features/input/manage.tsx` | Sub-aba "Gerenciar": cinco modos (Edição Rápida, Edição em Lote, Exclusão, Cadastrar Nota, Colar Planilha) sobre a base principal, cada um operando via `NotesTable`. |
| `frontend/src/features/input/ramal.tsx` | Equivalente a `manage.tsx` para a base "Ramal" (dataset separado, `useRamalData`), com um modo "Visão Geral" a mais (via `DataGrid`). |
| `frontend/src/features/input/filters.tsx` | Componente `Filters`: busca global por número de nota + filtros avançados por campo (texto, faixa numérica, multi-seleção), reaproveitado por `overview.tsx` e `manage.tsx`. |
| `frontend/src/features/input/reports.tsx` | Sub-aba "Relatórios": auditoria de prazo (DDPM vs SAP) com filtros rápidos, filtros por ano/status/regional, KPIs (`StatTile`) e um gráfico de rosca (SVG desenhado à mão). |
| `frontend/src/features/input/logs.tsx` | Sub-aba "Logs": três sub-abas (Alterações nas Notas, Bases de Apoio, Linha do Tempo), cada uma consumindo um endpoint próprio via `useQuery`. |
| `frontend/src/features/input/settings.tsx` | Sub-aba "Configurações": nome do usuário (log de auditoria), responsáveis por conjunto, status/substituição das bases de apoio, lista de backups locais para download. |
| `frontend/src/features/input/notes-table.tsx` | Tabela windowed (virtualização manual por `scrollTop`) usada nos modos editáveis/selecionáveis de `manage.tsx`/`ramal.tsx`: seleção por checkbox, edição inline por duplo clique, ordenação por coluna. |
| `frontend/src/features/input/hierarquia-card.tsx` | Card de vínculo manual de hierarquia (nota-mãe/notas-filhas): busca a hierarquia de uma nota, lista candidatas órfãs do mesmo conjunto e aplica o vínculo (`InputApi.vincularHierarquia`). |
| `frontend/src/features/input/data-grid.tsx` | Grid somente-leitura estilo Excel sobre `react-datasheet-grid`: ordenação, redimensionamento/autofit de colunas por arraste, barra de status com soma/média/contagem da seleção. |
| `frontend/src/features/input/use-input-data.ts` | Hooks de dados da base principal: `useInputData` (React Query, exporta a chave `INPUT_DADOS_KEY` para outros hooks/features invalidarem o mesmo cache), `useRecarregarInput` (invalidação) e `useSincronizacaoAutomatica` (polling que detecta alteração feita em outra sessão e revalida em background). |
| `frontend/src/features/input/ui.ts` | Constantes de estilo compartilhadas: `CLASSE_SELECT_MONO` para `SelectContent` mono-styling, usada por `filters.tsx`, `manage.tsx` e `ramal.tsx`. Nota: `MesExecucaoPicker` (agora em `components/branded/`) declara sua própria instância internamente. |
| `frontend/src/components/branded/mes-execucao-picker.tsx` | `MesExecucaoPicker`: dropdown do campo "Mês de Execução Planejado", movido para `components/branded/` para reutilização entre features (Input e futura integração COFFEE). |
| `frontend/src/features/input/colagem-planilha.tsx` | `ColagemPlanilha`: bloco presentacional do modo "Colar Planilha" (cabeçalho de colunas + textarea + preview), reaproveitado por `manage.tsx` e `ramal.tsx`. |

## Fluxo: Overview e sub-navegação

`input-section.tsx` define as seis sub-abas do módulo em `INPUT_SUBS`
(`input-section.tsx:15-22`): Visão Geral, Gerenciar, Ramal, Relatórios,
Logs e Configurações, renderizadas pelo `SegTabs`
(`input-section.tsx:51`). O estado da aba ativa (`sub`/`setSub`) chega
via props — quem decide e persiste a aba ativa é o componente pai, o
mesmo padrão do hub COFFEE documentado em `02-frontend-coffee.md`.
`InputSection` em si só busca os dados (`useInputData`,
`input-section.tsx:30`) e faz um `switch` condicional
(`input-section.tsx:85-90`) que renderiza um dos seis componentes de
sub-aba, todos recebendo o mesmo `dados: InputDataset` já carregado
(exceto `Logs`, que não depende dele).

Acima do conteúdo da sub-aba, `input-section.tsx` mostra até dois
banners independentes: aviso de importação inicial pendente por rede
indisponível (com botão "Tentar importar de novo" que chama
`InputApi.migrar()`), e contagem de bases da rede EDP indisponíveis
(`basesAusentes`, `input-section.tsx:65-69`). Não há mais um banner de
"dados desatualizados por outra sessão" — ver "Sincronização SAP"
abaixo, que agora revalida em background sem intervenção do usuário.

## Fluxo: Edição em lote (manage.tsx)

`manage.tsx` organiza cinco modos via `SegTabs` (`MODOS`,
`manage.tsx:22-28`); trocar de modo (`trocarModo`, `manage.tsx:161-163`)
limpa a mensagem de status e a seleção atual. Os modos "Edição em
Lote" e "Exclusão" compartilham a flag `comSelecao`
(`manage.tsx:159`), que ativa as props de seleção (`selecionados`,
`onToggleSelecionado`, `onToggleTodos`) na `NotesTable` renderizada
mais abaixo (`manage.tsx:251-262`) — a mesma tabela também atende o
modo "Edição Rápida" trocando essas props pelas de edição inline
(`edicoes`/`onEditar`), nunca as duas ao mesmo tempo.

No modo "Edição em Lote" (`manage.tsx:186-221`), dois `Select`
(status e prioridade) e um `MesExecucaoPicker` (mês de execução)
definem os novos valores; como o primitivo `Select` do shadcn/Radix
não aceita `value=""`, "manter valor atual" é representado por um
valor sentinela `"__manter"` que é convertido de volta para string
vazia em `onValueChange` (`manage.tsx:191-210`). `aplicarLote`
(`manage.tsx:104-120`) monta uma linha por nota selecionada só com os
campos preenchidos e recusa a operação (mensagem de erro) se nenhuma
nota estiver selecionada ou nenhum campo tiver sido escolhido. O
`Select` customizado em si (`@/components/ui/select`) não tem doc
próprio ainda — não está documentado em `04-frontend-shared.md`.

### Registro de notas — `MesExecucaoPicker` e `ColagemPlanilha`

`MesExecucaoPicker` (`mes-execucao-picker.tsx`) resolve o campo "Mês
de Execução Planejado" como dropdown em vez de texto livre, gravando
sempre `MMM-YYYY` minúsculo. `construirOpcoesMes(anoAtual)`
(`mes-execucao-picker.tsx`) gera os 12 meses do ano corrente (ano via
`new Date().getFullYear()`, nunca hardcoded) mais dois futuros fixos —
`jan-<anoAtual+1>` e `jan-2050` — sempre em janeiro. O componente
recebe `valorNeutro`/`rotuloNeutro` porque o significado de "nenhum
mês" muda por modo: no Cadastrar Nota é `'-'` (o default de
`NOTA_VAZIA`/`NOTA_RAMAL_VAZIA`); na Edição em Lote é `''` ("manter
atual", mesma convenção do sentinela `"__manter"` dos `Select` de
status/prioridade). Usado em `manage.tsx:213,289` e
`ramal.tsx:255,322`.

`ColagemPlanilha` (`colagem-planilha.tsx`) substitui o antigo bloco
"Colar Planilha" (`Card` + `Textarea` cru) por um container com uma
linha de cabeçalho fixa mostrando os rótulos das colunas esperadas
(mesmo estilo mono/uppercase do header da `NotesTable`) *antes* de
colar qualquer coisa — o formato esperado fica visível de antemão. É
puramente presentacional: recebe texto/preview/callbacks do pai
(`manage.tsx:308`, `ramal.tsx:342`) e não guarda estado próprio nem
chama a API diretamente.

## Fluxo: Filtros (filters.tsx)

O `Select` "+ Adicionar campo de filtro…" (`filters.tsx:84-105`) não
recebe `value` — ele é não controlado do ponto de vista do React. O
efeito de "voltar para vazio depois de cada escolha" não vem de um
reset explícito: `camposDisponiveis` (`filters.tsx:48-52`) filtra do
`SelectContent` qualquer campo que já esteja em `estado.filtros`, e
`onValueChange` (`filters.tsx:85-93`) adiciona o campo escolhido a
`estado.filtros` imediatamente. Como o campo recém-escolhido some da
lista de `SelectItem` no próximo render, o `SelectValue` interno do
Radix não encontra mais um item correspondente ao valor selecionado e
volta a exibir o `placeholder` — visualmente idêntico a um reset, mas
é consequência da lista de opções encolher, não de um `setState`
que zera o campo.

Cada filtro adicionado renderiza um controle conforme o tipo
(`tipoDoCampo`, `filters.tsx:36-40`): campo de texto livre (`"texto"`,
`filters.tsx:114-124`), faixa numérica mín/máx (`"faixa"`,
`filters.tsx:125-158`) ou `<select multiple>` nativo com os valores
únicos da coluna (`"multi"`, `filters.tsx:159-180`). O botão "🧹
Limpar" (`filters.tsx:74-79`) zera busca e filtros de uma vez; esse
sim é um reset explícito via `setEstado`.

## Sincronização SAP

O botão "Sincronizar SAP" em `overview.tsx:58-66` chama
`InputApi.syncSap()` (`POST /bases/sync-sap`, `api.ts:63`) dentro de um
`toast.promise`, disparando a extração no backend em background (ver
`06-backend-input-module.md` para o que o backend faz com esse
endpoint). O botão não guarda estado de "rodando" — não fica desabilitado
enquanto a sincronização está em andamento (ver "Pontos de atenção").

Como a sincronização roda em background e pode ser disparada por
qualquer sessão, `use-input-data.ts:25-43` mantém um polling próprio
para detectar quando os dados mudaram em outro lugar: a cada `60_000ms`
(`window.setInterval(..., 60_000)`), `useSincronizacaoAutomatica` chama
`InputApi.sync()` e compara `s.ultima_alteracao` com o valor conhecido;
se mudou, dispara um `toast.info` avisando o usuário e invalida
`INPUT_DADOS_KEY` (`qc.invalidateQueries`) — a tabela é revalidada em
segundo plano automaticamente, sem exigir clique. Isso substituiu o
antigo `useAvisoSincronizacao`, que só marcava um flag `desatualizado`
e dependia de um banner com botão "Recarregar dados"
(`useRecarregarInput`) para o usuário buscar os dados novos manualmente.

`INPUT_DADOS_KEY` (`use-input-data.ts:6`) é a `queryKey` de
`useInputData`, exportada para que qualquer código fora do hook — o
próprio polling, `use-auto-vinculos.ts` e futuras integrações (ex.:
módulo COFFEE movendo notas) — invalide o mesmo cache sem duplicar o
array literal `['input-dados']`.

## Timings (tabela consolidada desta feature)

| Valor | Onde | O que faz |
|---|---|---|
| `60_000ms` | `use-input-data.ts:29` | Polling de `InputApi.sync()` (`useSincronizacaoAutomatica`); compara `ultima_alteracao` com o valor conhecido e, se mudou, avisa via `toast.info` e invalida `INPUT_DADOS_KEY` em background. |
| `300_000ms` | `use-input-data.ts:12` | `staleTime` da query `useInputData` (React Query): por 5 minutos os dados carregados são considerados "frescos" e não disparam refetch automático em background (o default global de 60s do `QueryClient`, ver `04-frontend-shared.md`, não se aplica aqui). |
| `300_000ms` | `use-ramal-data.ts:8` | `staleTime` da query `useRamalData`, mesmo racional do `useInputData` acima — dataset separado (base "Ramal"), mesma cadência de frescor. |

## Pontos de atenção

- `filters.tsx:84-105` — o `Select` de "Adicionar campo de filtro" é
  não controlado; o "reset" visual depende de `camposDisponiveis`
  (`filters.tsx:48-52`) sempre excluir o campo recém-escolhido do
  `SelectContent`. Se essa lista algum dia parar de excluir campos já
  ativos (ex.: permitir múltiplos filtros no mesmo campo), o `Select`
  passa a reter a última seleção visualmente, quebrando o padrão atual
  sem nenhum aviso em tempo de compilação.
- `manage.tsx:191-210` (e o mesmo padrão em `ramal.tsx:233-252`) — o
  valor sentinela `"__manter"` para "manter valor atual" nos `Select`
  de edição em lote é uma convenção implícita: qualquer novo `Select`
  de edição em lote precisa lembrar de repetir esse mapeamento
  manualmente, não há um wrapper compartilhado que resolva isso uma
  vez.
- `manage.tsx:124,132` — a exclusão em lote e o "desfazer" usam
  `window.confirm` nativo, diferente do `ConfirmModal` (`AlertDialog`)
  usado no módulo COFFEE (`coffee-pendentes.tsx`, documentado em
  `02-frontend-coffee.md`) para o mesmo tipo de ação destrutiva —
  inconsistência de padrão de UI entre módulos, sem campo de
  justificativa nem estilo consistente com o resto do app.
- `overview.tsx:58-66` — o botão "Sincronizar SAP" não guarda estado de
  "em andamento": nada impede múltiplos cliques disparando várias
  sincronizações em paralelo no backend, diferente do botão "Exportar
  Excel" logo ao lado, que usa `exportando` para se desabilitar
  (`overview.tsx:25,67-70`).
- `use-input-data.ts:39` — falhas do polling de sincronização são
  silenciadas (`.catch(() => {})`) com o comentário "o erro aparece no
  fluxo principal"; mas se apenas o polling falhar (ex.: `/sync`
  intermitente) enquanto o carregamento principal continua ok, o
  usuário não tem nenhuma indicação de que a checagem de sincronização
  parou de funcionar (não há mais banner ligado a esse estado — a
  falha simplesmente não gera o `toast.info` de aviso).
- `app.css` (bloco `.input-scope`) — os cards do módulo Input usam a
  borda `--line` (hairline discreto) em vez de `--line-2` (usada em
  todo o resto do app), e os `Select` internos renderizam em
  `var(--font-mono)`. Escopado via classe `input-scope` na raiz de
  `input-section.tsx` para não vazar para Coffee/Verificar. O mono nos
  `Select` é um desvio deliberado do `DESIGN.md` (que reserva mono
  para código) — decisão explícita para casar com a estética "grade de
  dados" do Input. `MesExecucaoPicker` (agora em `components/branded/`)
  já declara `CLASSE_SELECT_MONO` internamente; qualquer outro novo
  `SelectContent` do módulo precisa lembrar de aplicá-la manualmente,
  pois o conteúdo é portalado para fora de `.input-scope`.
