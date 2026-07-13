# Módulo COFFEE

## O que faz

COFFEE é a integração com o sistema SAP homônimo: gera notas reais a
partir de notas triadas, consulta o status de cada nota (gerada, pendente,
corrigida, não gerada), permite corrigir o local de instalação de notas já
consultadas e reabrir/arquivar notas pendentes. Também expõe um histórico
de logs por ação (geração, consulta, alteração de local, transições de
status) para auditoria.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/features/coffee/coffee-hub.tsx` | Casca da feature: cabeçalho, `SegTabs` de navegação entre sub-abas (`verificar`/`abrir`/`geradas`/`corrigidas`/`pendentes`/`logs`) e roteamento condicional para o componente de cada aba. |
| `frontend/src/features/coffee/coffee-gerar-modal.tsx` | Modal de "Gerar / Consultar notas": entrada de IDs, consulta individual (`EDPApi.consultarNota`), edição do local de instalação (`maskLocal`/`unmaskLocal`), geração em lote com polling de job. |
| `frontend/src/features/coffee/coffee-pendentes.tsx` | Lista de notas pendentes (SAP `10000000`): busca em lote com polling de job, seleção múltipla, arquivamento individual e em lote via `ConfirmModal`. |
| `frontend/src/features/coffee/coffee-geradas.tsx` | Lista de notas "a gerar" (fila) e "geradas": abre o modal de gerar/consultar, remove da fila ou arquiva, ambos com justificativa via `ConfirmModal`. |
| `frontend/src/features/coffee/coffee-corrigidas.tsx` | Lista de notas que transitaram de SAP pendente para SAP real; busca local por ID/SAP e cópia de IDs para a área de transferência. |
| `frontend/src/features/coffee/coffee-abrir.tsx` | Monta uma lista de IDs (independente do backend, via `localStorage`) e abre cada um no COFFEE em nova aba, tudo de uma vez ou em blocos configuráveis. |
| `frontend/src/features/coffee/coffee-logs.tsx` | Tela de histórico de logs: filtros por passo/nota/usuário/limite/período, StatTiles de resumo, toggle "ao vivo" com refresh automático. |
| `frontend/src/features/coffee/confirm-modal.tsx` | `AlertDialog` genérico de confirmação com campo de justificativa opcional/obrigatória; usado por `coffee-pendentes.tsx` e `coffee-geradas.tsx`. |
| `frontend/src/features/coffee/coffee-log-drawer.tsx` | `Sheet` lateral com o histórico de logs de uma única nota (`LogTable` compacto), aberto a partir do botão "Ver logs" das tabelas de lista. |
| `frontend/src/features/coffee/coffee-verificar.tsx` | Sub-aba "Verificar" dentro do hub COFFEE: repassa o `TriageHandoff` recebido de `App.tsx` para `UploadScreen`/`Dashboard` da feature Verificar (reuso direto, sem lógica própria). |
| `frontend/src/features/coffee/coffee-notas-table.tsx` | Tabela compartilhada de notas COFFEE (`CoffeeNotasTable`), `StatusBadge`, `formatRelativeTime`, e os botões reutilizáveis `AbrirCoffeeBtn`/`LogsBtn`. |
| `frontend/src/features/coffee/coffee-log-table.tsx` | Tabela/timeline de logs (`LogTable`), agrupamento por `trace_id` (`agruparLogs`), filtro por passo (`grupoNoPasso`) e derivação da classificação atual da nota (`classeAtual`). |

## Navegação e sub-abas

`coffee-hub.tsx` organiza a feature em seis sub-abas via `SegTabs`
(`COFFEE_SUBS`, `coffee-hub.tsx:13-20`): **Verificar**, **Abrir**,
**Gerar** (rota interna `geradas`), **Corrigidas**, **Pendentes** e
**Logs**. O estado da aba ativa (`sub`) e o `setSub` vêm de fora (de
`App.tsx`), então o hub em si não guarda navegação própria — é só um
`switch` (`coffee-hub.tsx:65-79`) que renderiza um dos seis componentes de
tela. A aba **Verificar** é a única com um cabeçalho extra condicional
(nome do arquivo carregado + indicador "API" + botão "Nova planilha"),
mostrado apenas quando `sub === "verificar"` e `triage.screen ===
"dashboard"`.

Cada sub-aba mostra:
- **Verificar** — a triagem da planilha (mesma tela da feature Verificar,
  documentada em `01-frontend-verificar.md`), embutida para permitir
  enviar notas direto para o COFFEE sem trocar de módulo.
- **Abrir** — lista de IDs para abrir manualmente no COFFEE (sem dados do
  backend, só `localStorage`).
- **Gerar** (`CoffeeGeradas`) — fila "a gerar" + lista de notas já
  geradas.
- **Corrigidas** — notas que voltaram do COFFEE com SAP real após terem
  sido pendentes.
- **Pendentes** — notas com SAP `10000000` (placeholder), aguardando
  virar SAP real.
- **Logs** — histórico de ações sobre notas COFFEE, com filtros.

## Fluxo: Gerar / Consultar notas

`coffee-gerar-modal.tsx` é aberto a partir de `coffee-geradas.tsx` (botão
"Gerar / Consultar notas" ou "Gerar fila (N)"). O usuário cola IDs no
campo de texto (espaço, vírgula ou quebra de linha aceitos como
separador, `parseIds`, `coffee-gerar-modal.tsx:44-49`); cada ID vira uma
linha na tabela e dispara `consultar(id)`, que chama
`EDPApi.consultarNota(id)` e preenche PK, ID SAP, classificação,
`arquivado` e local de instalação atual. A lista de linhas persiste em
`sessionStorage` (`edp_coffee_gerar_rows`) enquanto o modal está aberto,
e linhas que ficaram travadas em `"consultando"` são re-consultadas
automaticamente ao reabrir o modal (`coffee-gerar-modal.tsx:85-94`).

**Edição do local de instalação**: o campo é mascarado no formato
3-2-resto (ex.: `ABC-12-3456`) via `maskLocal`/`unmaskLocal`
(`coffee-gerar-modal.tsx:9-17`):
```ts
function maskLocal(v: string): string {
  const c = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const a = c.slice(0, 3), b = c.slice(3, 5), rest = c.slice(5);
  return [a, b, rest].filter(Boolean).join("-");
}
function unmaskLocal(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, "");
}
```
`maskLocal` primeiro remove tudo que não é dígito/letra maiúscula
(normalizando para maiúsculas), depois fatia em 3 caracteres, 2
caracteres e o resto, juntando com `-` (partes vazias são descartadas —
por isso o hífen só aparece conforme o usuário digita). `unmaskLocal`
faz o caminho inverso: só normaliza, sem inserir separadores. O valor
sem máscara é o que vai para o backend (`POST /coffee/local-instalacao`,
`coffee-gerar-modal.tsx:135-149`); o valor mascarado só existe no input
enquanto `editando` é `true`. Um comentário `ponytail` no topo do arquivo
(`coffee-gerar-modal.tsx:9`) já marca essa máscara como fixa 3-2-resto —
apertar a regra se o formato do local mudar.

**Geração em lote com polling**: `gerar()` (`coffee-gerar-modal.tsx:173-203`)
reúne os IDs com `estado === "ok"`, chama `POST /coffee/gerar-lote` e
recebe um `job_id`, que é então acompanhado por `pollJob`
(`coffee-gerar-modal.tsx:152-171`): a cada tick, faz `GET
/coffee/job/{jobId}`; se `estado === "concluido"`, resolve a Promise; caso
contrário, agenda outro tick com `window.setTimeout(tick, 600)`
(`coffee-gerar-modal.tsx:162`). Se a requisição falhar, incrementa um
contador de falhas consecutivas e tenta de novo após os mesmos `600ms`
(`coffee-gerar-modal.tsx:166`) — só desiste e rejeita a Promise quando
`falhas >= 10` (`coffee-gerar-modal.tsx:165`). Ao concluir, todas as
linhas são reconsultadas e um toast resume sucessos/erros/arquivadas.

## Fluxo: Pendentes / Buscar

`coffee-pendentes.tsx` lista notas pendentes e permite disparar uma
"busca em lote" que reconsulta o SAP para as notas selecionadas (ou
todas, se nada estiver selecionado). `iniciarBusca()`
(`coffee-pendentes.tsx:67-118`) chama `POST /coffee/buscar` com os IDs e
recebe um `job_id`; o progresso é então acompanhado por polling: a cada
`2000ms` (`window.setInterval(..., 2000)`, `coffee-pendentes.tsx:87-111`),
faz `GET /coffee/job/{jobId}` e atualiza uma barra de progresso
(`feitas`/`total`). Quando `job.estado === "concluido"`
(`coffee-pendentes.tsx:97`), o `setInterval` é limpo, a lista é
recarregada (`refetch()`), a seleção é limpa e um toast "Busca concluída"
aparece; o banner de status volta para `"idle"` `3000ms` depois
(`setTimeout(() => setBuscaEstado("idle"), 3000)`,
`coffee-pendentes.tsx:103`), deixando o resultado visível por um tempo
antes de sumir. Erros de rede durante o polling também interrompem o
timer e voltam o estado para `"idle"`, mostrando a mensagem de erro
abaixo dos controles.

O `ConfirmModal` (`frontend/src/features/coffee/confirm-modal.tsx`) é
usado aqui para arquivamento — individual (um clique no ícone de arquivo
de uma linha) e em lote (botão "Arquivar selecionadas"), ambos exigindo
justificativa (`requireJustification`, tom `"danger"`). É um componente
específico desta feature (não documentado em `04-frontend-shared.md`):
um wrapper fino sobre o `AlertDialog` de `components/ui/alert-dialog`,
com um `textarea` de justificativa que fica vazio a cada abertura
(`confirm-modal.tsx:25-27`) e desabilita o botão de confirmar enquanto
`busy` ou enquanto a justificativa é obrigatória e está vazia. O
arquivamento em lote (`arquivarLote`, `coffee-pendentes.tsx:44-65`) roda
sequencialmente (`for...of` com `await`), não em paralelo — um comentário
`ponytail` (`coffee-pendentes.tsx:48`) já sinaliza trocar por um endpoint
de lote real se o volume passar de ~50 notas por vez.

## Timings (tabela consolidada desta feature)

| Valor | Onde | O que faz |
|---|---|---|
| `600ms` | `coffee-gerar-modal.tsx:162,166` | Intervalo entre tentativas do polling de status de uma geração em lote (`pollJob`); desiste após 10 falhas consecutivas (`falhas >= 10`). |
| `2000ms` | `coffee-pendentes.tsx:87-111` | Intervalo do polling de status do job de busca em lote (`window.setInterval`), até `job.estado === "concluido"`. |
| `3000ms` | `coffee-pendentes.tsx:103` | Após a busca concluir, o banner "Busca concluída" volta ao estado `idle` (`setTimeout`). |
| `10_000ms` | `coffee-logs.tsx:60` | Com o toggle "ao vivo" ligado, refresh automático da lista de logs (`window.setInterval(refresh, 10_000)`). |
| `250ms` | `frontend/src/api.ts:20` | Ao abrir várias notas no COFFEE de uma vez, cada `window.open` é escalonado `i * 250` depois do anterior, para não disparar o bloqueador de pop-up. |

Timing adicional encontrado fora do Step 1:
- **`api.ts:12-18`** — não é um timer, mas está ligado ao mesmo fluxo de
  abertura em lote: um `window.alert` de aviso ("vamos abrir N abas...")
  dispara uma única vez por sessão (`coffeeWarned`, flag em módulo) quando
  `list.length > 3`, antes de escalonar os `window.open`.

## Pontos de atenção

- `coffee-gerar-modal.tsx:94` — o `useEffect` de hidratação/reconsulta ao
  abrir o modal tem `// eslint-disable-line react-hooks/exhaustive-deps`
  e só depende de `open`; `consultar` e `idsIniciais` ficam de fora da
  lista de dependências deliberadamente, mas isso significa que um
  `idsIniciais` diferente passado com o modal já aberto não dispara nova
  consulta.
- `coffee-gerar-modal.tsx:299` — o botão "Salvar" da edição de local fica
  desabilitado quando `unmaskLocal(r.localEditado ?? "") === (r.localAtual
  ?? "")`, comparando o valor sem máscara com o valor cru vindo do
  backend; se o backend já devolver o local com separadores diferentes de
  `-`, essa comparação pode nunca bater e o botão nunca habilita mesmo
  após uma edição real.
- `coffee-pendentes.tsx:20,40-42` — o `timerRef` do polling só é limpo no
  `useEffect` de unmount do componente e nos `.then`/`.catch` do próprio
  polling; se o usuário trocar de sub-aba enquanto a busca está rodando
  (desmontando `CoffeePendentes`), o cleanup do `useEffect` cobre isso,
  mas não há como cancelar a busca do lado do backend — o job continua
  rodando no servidor mesmo com a UI já desmontada.
- `coffee-abrir.tsx:64,67` — `block` (tamanho do bloco de abertura) é
  limitado a `1..50` (`setBlockClamped`), mas não há aviso equivalente ao
  de `api.ts:12-18` nesta tela: abrir "próximas N" com N alto ainda passa
  pelo mesmo `coffeeWarned` global de `openCoffee`, então o aviso só
  aparece na primeira vez da sessão inteira, não por ação.
- `coffee-logs.tsx:39-44` — a lista de usuários para o filtro é buscada
  uma vez ao montar (`GET /coffee/logs/usuarios`) e falhas são
  silenciadas (`.catch(() => {})`), deixando o `<Select>` de usuário sem
  opções e sem qualquer indicação de erro ao operador.
- `coffee-log-table.tsx:103` — o cabeçalho de um grupo de log
  (`cabecalho`) é escolhido como a primeira `acao_usuario` com `nota_pk
  === null`, senão a primeira `acao_usuario` qualquer, senão o primeiro
  log da lista; se um `trace_id` não tiver nenhuma `acao_usuario` (só
  `api_call`/`transicao`), o cabeçalho vira um log técnico que pode não
  fazer sentido como resumo da linha do tempo para o usuário.
