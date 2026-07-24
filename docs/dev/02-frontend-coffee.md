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

## Operação: Kanban persistido

O botão **Adicionar notas** abre o composer na própria página. IDs separados
por espaço, vírgula, ponto e vírgula ou linha são analisados antes de enviar;
somente números positivos e únicos seguem para `POST /api/coffee/operacao/consultar`.

O Kanban não permite arrastar cards. A API e a máquina de estados definem a
etapa de cada item:

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
