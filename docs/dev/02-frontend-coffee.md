# Módulo COFFEE

## O que faz

COFFEE concentra a triagem de notas, a operação de geração e o histórico das
notas concluídas. A operação é uma fila persistida: a pessoa consulta IDs,
acompanha a situação das notas e executa geração ou atualização do SAP sem
perder o progresso ao atualizar o navegador.

## Navegação

`coffee-hub.tsx` é a casca da feature. Ele recebe a subpágina de `App.tsx` e
renderiza uma de cinco seções por `SegTabs`:

- **Verificar** — reusa a triagem de planilha e encaminha notas para a fila
  COFFEE.
- **Abrir** — abre IDs manualmente no COFFEE; a lista fica no navegador.
- **Operação** — o Kanban da fila ativa.
- **Concluídas** — histórico separado de notas geradas e corrigidas.
- **Logs** — auditoria filtrável das ações e chamadas de integração.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
<<<<<<< HEAD
| `frontend/src/features/coffee/coffee-hub.tsx` | Casca da feature: cabeçalho, `SegTabs` de navegação entre sub-abas (`verificar`/`abrir`/`geradas`/`corrigidas`/`pendentes`/`logs`) e roteamento condicional para o componente de cada aba. |
| `frontend/src/features/coffee/coffee-gerar-modal.tsx` | Modal de "Gerar / Consultar notas": entrada de IDs, consulta individual (`EDPApi.consultarNota`), edição do local de instalação (`maskLocal`/`unmaskLocal`), geração em lote com polling de job. |
| `frontend/src/features/coffee/coffee-pendentes.tsx` | Lista de notas pendentes (SAP `10000000`): busca em lote com polling de job, seleção múltipla, arquivamento individual e em lote via `ConfirmModal`, e "Revisar Nota" (o CTA de mover fica desabilitado pelo `pode_mover=false` da própria revisão, já que a nota ainda não tem SAP real). |
| `frontend/src/features/coffee/coffee-geradas.tsx` | Lista de notas "a gerar" (fila) e "geradas": abre o modal de gerar/consultar, remove da fila ou arquiva, ambos com justificativa via `ConfirmModal`; "Revisar Nota"/"Mover para o Plano" individual na zona "Notas Geradas". |
| `frontend/src/features/coffee/coffee-corrigidas.tsx` | Lista de notas que transitaram de SAP pendente para SAP real; busca local por ID/SAP, cópia de IDs para a área de transferência, seleção múltipla e "Revisar Nota"/"Mover para o Plano" (individual e em lote). |
| `frontend/src/features/coffee/coffee-abrir.tsx` | Monta uma lista de IDs (independente do backend, via `localStorage`) e abre cada um no COFFEE em nova aba, tudo de uma vez ou em blocos configuráveis. |
| `frontend/src/features/coffee/coffee-logs.tsx` | Tela de histórico de logs: filtros por passo/nota/usuário/limite/período, StatTiles de resumo, toggle "ao vivo" com refresh automático. |
| `frontend/src/features/coffee/confirm-modal.tsx` | `AlertDialog` genérico de confirmação com campo de justificativa opcional/obrigatória; usado por `coffee-pendentes.tsx` e `coffee-geradas.tsx`. |
| `frontend/src/features/coffee/coffee-log-drawer.tsx` | `Sheet` lateral com o histórico de logs de uma única nota (`LogTable` compacto), aberto a partir do botão "Ver logs" das tabelas de lista. |
| `frontend/src/features/coffee/coffee-verificar.tsx` | Sub-aba "Verificar" dentro do hub COFFEE: repassa o `TriageHandoff` recebido de `App.tsx` para `UploadScreen`/`Dashboard` da feature Verificar (reuso direto, sem lógica própria). |
| `frontend/src/features/coffee/coffee-notas-table.tsx` | Tabela compartilhada de notas COFFEE (`CoffeeNotasTable`), `StatusBadge`, `formatRelativeTime`, e os botões reutilizáveis `AbrirCoffeeBtn`/`LogsBtn`/`RevisarNotaBtn`. |
| `frontend/src/features/coffee/coffee-log-table.tsx` | Tabela/timeline de logs (`LogTable`), agrupamento por `trace_id` (`agruparLogs`), filtro por passo (`grupoNoPasso`, sentinel `"todos"` — ver `PASSOS`) e derivação da classificação atual da nota (`classeAtual`). |
| `frontend/src/features/coffee/revisar-nota-sheet.tsx` | `RevisarNotaSheet`: `Sheet` lateral com os dados de uma nota (`GET /api/integracao/nota/{pk}/revisao`) — identificação, proposta de plano, dados SAP (IW28) e dados brutos do COFFEE — e o CTA "Mover para o Plano"/"Atualizar dados". |
| `frontend/src/features/coffee/mover-plano-modal.tsx` | `MoverPlanoModal`: `Dialog` de confirmação (individual ou em lote) para `POST /api/integracao/mover-para-plano`; coleta os campos manuais do plano (mês de execução, status da obra, observação, check) e, em caso de sucesso, oferece a ação de toast "Ver no plano". |
=======
| `coffee-hub.tsx` | Cabeçalho, navegação das cinco subseções e handoffs de Verificar/Relatórios. |
| `operacao/coffee-operacao.tsx` | Orquestra quadro, seleção em lote, confirmações, inspector e ações da fila. |
| `operacao/use-coffee-operacao.ts` | Query do quadro e mutations de consultar, gerar, atualizar SAP e remover. |
| `operacao/components/operacao-composer.tsx` | Entrada de IDs; informa válidos, repetidos e inválidos antes da consulta. |
| `operacao/components/operacao-kanban.tsx` | Quatro colunas responsivas, sem drag and drop: Fila, Prontas, Processando e Aguardando SAP. |
| `components/coffee-nota-inspector.tsx` | Ficha lateral da nota com resumo, atividade, edição de local e ações contextuais. |
| `concluidas/coffee-concluidas.tsx` | Histórico, filtros, arquivamento de geradas e movimento de corrigidas para o Plano. |
| `concluidas/components/concluidas-list.tsx` | Lista responsiva de concluídas e seleção restrita às corrigidas. |
| `coffee-abrir.tsx` | Lista local de IDs e abertura escalonada no COFFEE. |
| `coffee-logs.tsx` e `coffee-log-table.tsx` | Filtros e linha do tempo de auditoria por `trace_id`. |
| `confirm-modal.tsx` | Confirmação com justificativa obrigatória quando a ação exige auditoria. |
| `mover-plano-modal.tsx` | Formulário de integração com o Plano do Input. |
>>>>>>> 83352dd24ea3cf5f538bc8cd5cd9da2523692499

## Operação: Kanban persistido

<<<<<<< HEAD
`coffee-hub.tsx` organiza a feature em seis sub-abas via `SegTabs`
(`COFFEE_SUBS`, definido no módulo leve `features/coffee/subs.ts` para o
sidebar importar sem puxar o hub pro bundle inicial): **Verificar**, **Abrir**,
**Gerar** (rota interna `geradas`), **Corrigidas**, **Pendentes** e
**Logs**. O estado da aba ativa (`sub`) e o `setSub` vêm de fora (de
`App.tsx`), então o hub em si não guarda navegação própria — é só um
`switch` (`coffee-hub.tsx:65-79`) que renderiza um dos seis componentes de
tela. A aba **Verificar** é a única com um cabeçalho extra condicional
(nome do arquivo carregado + indicador "API" + botão "Nova planilha"),
mostrado apenas quando `sub === "verificar"` e `triage.screen ===
"dashboard"`.
=======
O botão **Adicionar notas** abre o composer na própria página. IDs separados
por espaço, vírgula, ponto e vírgula ou linha são analisados antes de enviar;
somente números positivos e únicos seguem para `POST /api/coffee/operacao/consultar`.
>>>>>>> 83352dd24ea3cf5f538bc8cd5cd9da2523692499

O Kanban não permite arrastar cards. A API e a máquina de estados definem a
etapa de cada item:

<<<<<<< HEAD
## Identidade do usuário (X-User)

Toda chamada ao backend do COFFEE (em `api.ts`, nos hooks
`use-coffee-notas.ts`/`use-coffee-logs.ts` e nos componentes) passa por
`coffeeFetch()` (`api.ts`), um wrapper de `fetch` que injeta o header
`X-User` antes de disparar a requisição:

```ts
export async function coffeeFetch(
  url: string,
  init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
): Promise<Response> {
  const headers = { "X-User": await garantirUsuario(), ...init?.headers };
  return fetch(url, { ...init, headers });
}
```

Como o `await` fica encapsulado no wrapper, os call sites continuam
síncronos (cadeias `.then()`), sem precisar converter handlers para
`async`. `garantirUsuario()` (`api.ts`, renomeado de `garantirUsuarioInput` —
agora é compartilhado entre Input e COFFEE, não mais exclusivo do
handoff de `moverParaPlano`) lê o usuário salvo (`getUsuario()`,
`localStorage`) ou pede via `prompt` na primeira chamada. O backend usa
esse header para decidir o **dono** de cada nota nova (`GET /notas`
só devolve as do próprio usuário + as sem dono) — ver
`05-backend-coffee-module.md`. Isso é o motivo dos textos "Suas notas…"
em `coffee-pendentes.tsx`/`coffee-corrigidas.tsx`: a lista já é
implicitamente filtrada pelo dono.

## Fluxo: Gerar / Consultar notas

**Aparência do modal**: o `DialogContent` compartilhado
(`components/ui/dialog.tsx`) foi ajustado para o sistema do `DESIGN.md`
— superfície elevada (`bg-surface` em vez de `bg-background`), borda
hairline (`--line` em vez do anel `--line-2`), raio `--r-lg` e sombra
`--shadow-lg`. O mesmo ajuste vale para o `AlertDialogContent`
(`components/ui/alert-dialog.tsx`, usado pelo `ConfirmModal`), então os
dois modais coffee ficam consistentes. A largura do modal de geração é
fluida (`w-[clamp(560px,72vw,1120px)]`, `coffee-gerar-modal.tsx:210`) em
vez de fixa, com `sm:max-w-[94vw]` para vencer o cap `sm:max-w-lg` do
primitivo. Tipografia segue a regra do módulo: dados/máquina em mono
(IDs, SAP, local, **status**) e texto humano (título, botões) em Inter.
O `DialogContent` do modal de gerar/consultar é `flex flex-col
overflow-hidden` (fix de overflow: antes, uma lista longa de IDs
esticava o modal além de `max-h-[88vh]` e cortava os botões de rodapé;
agora o cabeçalho/input/rodapé ficam `shrink-0` e só a tabela de linhas
rola internamente).
=======
| Coluna | Significado | Ações principais |
|---|---|---|
| Fila | Consulta em andamento ou nota que precisa de nova tentativa. | Reconsultar ou remover. |
| Prontas para gerar | Nota elegível e sem SAP real. | Gerar, editar local, remover. |
| Processando | Geração em andamento. | Acompanhar no card e no inspector. |
| Aguardando SAP | Placeholder `10000000`; falta consultar o SAP real. | Atualizar SAP ou remover. |

`useCoffeeOperacao` consulta `['coffee', 'operacao']` e faz refetch a cada
800 ms somente enquanto houver operação com estado `rodando`. O quadro vem do
SQLite com cards e snapshots de jobs, portanto recarregar a página preserva o
progresso. Em reinício do backend, jobs pendentes são marcados como
interrompidos e itens que estavam em processamento voltam a Prontas com erro
recuperável.
>>>>>>> 83352dd24ea3cf5f538bc8cd5cd9da2523692499

O estado legado do antigo modal, `sessionStorage['edp_coffee_gerar_rows']`, é
migrado na primeira montagem de Operação. A chave só é removida depois de a
consulta ser aceita; se a mutation falhar, os dados ficam na sessão para uma
tentativa futura.

## Inspector da nota

Abrir um card ou uma linha de Concluídas mostra `CoffeeNotaInspector` em um
`Sheet`. Em telas menores que o breakpoint desktop ele ocupa a largura útil;
no desktop fica limitado a `clamp(420px, 38vw, 620px)`. Ao fechar, o foco volta
ao botão que abriu a ficha.

A ficha busca `['coffee', 'revisao', pk]` e
`['coffee', 'nota', pk, 'logs']`, mostra resumo e atividade e indica o próximo
passo. O local de instalação pode ser alterado apenas para cards em Fila ou
Prontas; o valor digitado permanece no campo se a mutation falhar. Conforme a
origem da ficha, os botões oferecem gerar, atualizar SAP, remover, arquivar ou
mover para o Plano. Arquivar só aparece para uma nota gerada em Concluídas.

`useCoffeePortalTheme` propaga tema resolvido, densidade e accent para o
`Sheet`, `Dialog`, `AlertDialog` e `Select` portalizados. Assim, os modos
Sistema, Claro e Escuro e as preferências de densidade/acento também se aplicam
fora da raiz visual do app.

## Concluídas e Plano

`CoffeeConcluidas` consulta `['coffee', 'concluidas']` e separa o histórico
por **Todas**, **Geradas** e **Corrigidas**. A busca cobre ID, SAP e local; o
filtro de período usa `classificacao_em` e indica o fallback para a última
consulta quando esse dado antigo não existir.

Notas geradas podem ser arquivadas após justificativa. Apenas corrigidas podem
ser selecionadas e movidas, individualmente ou em lote, para o Plano. O
`MoverPlanoModal` invalida `INPUT_DADOS_KEY` e a revisão de cada nota movida e
oferece a navegação para a Visão Geral do Input.

## Logs e timings

| Valor | Onde | O que faz |
|---|---|---|
| `800ms` | `operacao/use-coffee-operacao.ts` | Atualiza o quadro enquanto houver job ativo. |
| `10_000ms` | `coffee-logs.tsx` | Atualiza os logs quando o toggle Ao vivo está ligado. |
| `250ms × índice` | `frontend/src/api.ts` | Escalona abertura de múltiplas abas COFFEE. |

## Pontos de atenção

- Não há suite de testes frontend configurada; build e verificação manual do
  preview são a cobertura atual da interface.
- `CoffeeLogs` ainda usa um hook baseado em `fetch` e estado local para a
  listagem geral. Já o inspector usa React Query para os logs de uma nota.
- A conexão com COFFEE/SAP é externa. Falhas de mutation são exibidas com uma
  próxima ação, mas operações que já alcançaram o sistema externo podem exigir
  uma reconsulta para refletir o estado final.
