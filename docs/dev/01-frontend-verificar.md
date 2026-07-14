# Módulo Verificar

## O que faz

Verificar é a triagem inicial da planilha de notas SAP: o usuário faz
upload de um arquivo (`.xlsx`/`.xls`/`.csv`), o backend processa e devolve
a lista de notas com suas falhas de conformidade, e o dashboard permite
filtrar, buscar, marcar notas como concluídas e comparar candidatas a
duplicata lado a lado. Um drawer de KPIs mostra a taxa de conformidade e
contagens (erro, duplicata, visíveis, concluídas) sobre o conjunto
carregado.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/features/verificar/dashboard.tsx` | Tela principal pós-upload: filtros (busca, UF, setor, urgência, status, situação, bloqueio/regra), fila de notas, painel de detalhe da nota selecionada, seleção em lote e ações (concluir/reabrir/enviar ao COFFEE). |
| `frontend/src/features/verificar/upload-screen.tsx` | Tela de upload (drag-and-drop ou seleção de arquivo), barra de progresso simulada e mensagem de erro de conexão com o backend. |
| `frontend/src/features/verificar/kpi-drawer.tsx` | Drawer lateral (FAB + painel deslizante) com o percentual de conformidade e contagens de erro/duplicata/visíveis/concluídas; lista as notas selecionadas em lote. |
| `frontend/src/features/verificar/duplicate-compare.tsx` | Comparação campo a campo entre a nota aberta e cada candidata a duplicata, com indicação de campos-chave iguais/diferentes e ação de marcar/desmarcar duplicata. |
| `frontend/src/features/verificar/shared.tsx` | Componentes e constantes compartilhados da feature: `PriorityChip` (com `prioMeta()`), `StatusTag`, `Field`, e os caminhos dos logos EDP dark/light. |
| `frontend/src/features/verificar/useTriageData.ts` | Hook de React Query que busca os dados de triagem (`fetchData` da API) sob a chave `['triage']`. |
| `frontend/src/features/verificar/malha-fina.ts` | `detectarNoveExtra(notes)`: função pura que agrupa locais de instalação com um "9" extra no final (candidatos a correção em massa). |
| `frontend/src/features/verificar/malha-fina-panel.tsx` | Painel colapsável "Malha fina", montado logo abaixo dos filtros do `Dashboard`; lista os grupos detectados e dispara a correção em lote no COFFEE. |

## Fluxo de dados

O estado de triagem (`notes`, `completed`, `dupResolved`, `source`, `file`,
`screen`) vive em `App.tsx` (`AppContent`), não dentro da feature — a
feature só recebe callbacks e dados via um objeto `TriageHandoff`, passado
adiante por `coffee-verificar.tsx`, que decide entre renderizar
`UploadScreen` (`triage.screen === "upload"`) ou `Dashboard`.

- **Upload → dashboard**: `UploadScreen.onUpload` é `handleUpload` em
  `App.tsx:106-121`. Ele chama `EDPApi.upload(f)` e depois
  `EDPApi.fetchData()`, atualiza `notes`/`completed`/`source`/`file` e
  muda `screen` para `"dashboard"`.
- **Hidratação inicial via React Query**: `useTriageData()` (`App.tsx:94`)
  busca os mesmos dados de triagem de forma independente do fluxo de
  upload. Um efeito em `App.tsx:96-104` promove `apiData` para o estado
  local (`notes`, `completed`, `source: "api"`, `screen: "dashboard"`)
  somente se não houver snapshot de sessão (`_snap`) e a tela ainda
  estiver em `"upload"` — cobre o caso de recarregar a página com dados já
  carregados no backend.
- **Persistência entre navegações**: um efeito separado (`App.tsx:84-87`)
  grava `notes`/`completed`/`dupResolved`/`file`/`source`/`screen` em
  `sessionStorage` (`edp_triage_snapshot`) sempre que há notas na tela
  `"dashboard"`, para sobreviver a trocas de seção (COFFEE, Input) sem
  refazer o upload.
- **Dashboard**: recebe `notes`/`completed`/`dupResolved` como props e
  deriva todo o resto (filtros, fila ordenada, seleção) localmente com
  `useState`/`useMemo`/`usePersistedState`. Ações do usuário (concluir,
  marcar duplicata, enviar ao COFFEE) sobem via callbacks
  (`onToggleComplete`, `onMarkMany`, `onMarkDuplicate`, `onSendToCoffee`)
  para `App.tsx`, que atualiza o estado e, quando `source === "api"`,
  replica a mudança no backend (`EDPApi.toggleComplete`,
  `EDPApi.marcarGerar`, `EDPApi.markDuplicate`). Concluir uma nota de id
  numérico a marca na fila de geração do COFFEE (`a_gerar=true`);
  reabrir a desmarca, enviando a justificativa automática "Nota reaberta
  na Verificar" exigida pelo `POST /marcar-gerar` para remoções da fila
  (`App.tsx:133`, `App.tsx:153`).
- **`duplicate-compare.tsx`**: renderizado dentro do painel de detalhe do
  `Dashboard` (`Detail`) quando `sel.duplicates.length > 0`; consome a
  nota selecionada (`note`) e o estado `resolved` (via `dupResolved`) só
  para decidir o rótulo do botão ("Marcar como duplicata" vs. "Reabrir");
  não busca dados por conta própria.
- **`kpi-drawer.tsx`**: recebe apenas números já calculados pelo
  `Dashboard` (`pct`, `cTotal`, `cOk`, `cErr`, `cDup`, `cDone`,
  `cVisible`) e a lista de notas atualmente em seleção em lote
  (`selectedNotes`); não tem estado de dados próprio, só o `open` do
  drawer.
- **`useTriageData.ts`**: usado apenas em `App.tsx`, não é consumido
  diretamente pelo `Dashboard` nem pelos demais componentes da feature.

## Lógica de negócio notável

- **`prioMeta()` (`shared.tsx:16-21`)** — classifica a prioridade numérica
  de uma nota:
  ```ts
  function prioMeta(p: number): ["high" | "med" | "low" | "none", string | number] {
    if (p >= 99) return ["none", "—"];
    if (p <= 2) return ["high", p];
    if (p <= 4) return ["med", p];
    return ["low", p];
  }
  ```
  Ou seja: `p >= 99` → "none" (exibe "—"); `p <= 2` → "high"; `p <= 4` →
  "med"; qualquer outro valor → "low". `Dashboard.tsx:15` usa uma faixa
  equivalente (`urgBand`) para o filtro de Urgência: alta = `p <= 2`,
  média = `p <= 4`, baixa = demais — consistente com `prioMeta`.
- **`StatusTag` (`shared.tsx:36-66`)** — ordem de precedência real, lida
  direto no corpo do componente: **`dup` > `done` > `status`**. Se
  `dup` for `true`, sempre mostra "Duplicata", independente de `done` ou
  `status`. Só se `dup` for falso é que verifica `done` ("Concluída").
  Só se nenhum dos dois for verdadeiro é que olha `status` ("Conforme"
  para `"ok"`, "Com erro" para qualquer outro valor).
- **Duplicatas — "campos-chave" (`duplicate-compare.tsx:36-41`)** — quatro
  campos são comparados para decidir se uma candidata é forte:
  `local_instalacao`, `poste`, `referencia`, `problema` (`DUPC_KEYS`). Uma
  candidata é "forte" (`strong`, badge verde "●") quando está na mesma
  planilha (`in_sheet === true`) **e** todos os 4 campos-chave batem
  (normalizados por `dupcNorm`: trim + lowercase). Candidatas fora da
  planilha (`in_sheet !== true`) são sempre badge "⧉ Externo" e não
  entram na comparação automática de campos.
- **Ordenação da fila (`dashboard.tsx:68-69`)** — notas com erro vêm
  primeiro, depois por prioridade crescente (`a.prioridade - b.prioridade`).
- **Envio ao COFFEE por duplicata (`dashboard.tsx:267`)** — o botão de
  café ao lado de uma nota com `flagDup` envia `n.duplicates.map(d =>
  d.id)` (as candidatas, não a própria nota) para a fila do COFFEE.
- **IDs não viram chips de filtro** — comentário explícito em
  `dashboard.tsx:83-84`: termos de busca (IDs) não geram chips em
  "Ativos" porque, com muitos IDs, a barra estourava (um chip por nota,
  sem scroll); o gerenciamento desses termos é feito direto na search bar.

## Malha fina (local com 9 extra)

- **`malha-fina.ts` — `detectarNoveExtra(notes)`** — função pura, sem
  efeitos colaterais: agrupa por `local_instalacao` toda nota cujo local
  tem 14 caracteres terminados em "9". O formato válido é fixo em 13
  caracteres (cidade 3 + tipo 2 + número 8), então 14 caracteres já é
  provadamente um dígito a mais — a correção é sempre remover o "9"
  final. Não exige nota-referência na planilha: a planilha do Verificar
  é de notas com problema, e a versão correta (13 chars) normalmente
  nem aparece nela; além disso a segurança real está no backend, que
  re-confirma cada nota no COFFEE antes de alterar (só altera se o local
  lá for exatamente `proposto + "9"`, senão marca `divergente` e pula).
  Notas sem id numérico (`/^\d+$/`) são contadas em `ignoradasSemId` mas
  ficam fora de `notasAfetadas` (o COFFEE é chaveado por id numérico);
  grupos sem nenhuma nota corrigível são descartados. É estado derivado
  (`React.useMemo(() => detectarNoveExtra(notes), [notes])` em
  `dashboard.tsx`); nada é persistido.
- **`malha-fina-panel.tsx` — `<MalhaFinaPanel grupos={...} />`** —
  painel colapsável renderizado logo abaixo do bloco de filtros do
  `Dashboard`, retorna um fragment vazio (invisível) quando não há
  grupos, sem condicional adicional no `Dashboard`. Permite selecionar
  grupos individualmente ou todos de uma vez, uma switch "Gerar após
  corrigir", e confirma a ação via `AlertDialog` antes de disparar
  `POST /coffee/corrigir-local-lote` (`corrigirLocalLote` em `api.ts`).
  O progresso é acompanhado por polling de `GET /coffee/job/{id}`
  (mesmo padrão de `pollJob` usado em `coffee-gerar-modal.tsx`), com uma
  barra `Progress` enquanto roda e chips de resultado ao concluir
  (corrigidas / já corrigidas / divergentes / geradas / erros). Grupos
  corrigidos com sucesso somem da lista (`tratados`), sem precisar
  recarregar a planilha.

## Timings

- **`upload-screen.tsx:23`** — `window.setTimeout(() => setPct(65), 220)`:
  a barra de progresso é simulada, não reflete progresso real do upload.
  A sequência é `setPct(15)` (síncrono, ao iniciar), depois `65%` após
  220ms via `setTimeout`, e `100%` só quando a Promise `onUpload(file)`
  resolve. Existe porque o upload não usa long-polling nem eventos de
  progresso reais do XHR/fetch — é só feedback visual de que algo está
  acontecendo enquanto a requisição está em voo. Em caso de erro, o timer
  é cancelado (`window.clearTimeout(tick)`) e `pct` volta a `0`.
- Não há outros debounces/timeouts na feature: a busca (`q`) filtra a
  cada tecla sem debounce (`dashboard.tsx:52-57`), e o `Detail` só
  registra um listener de `keydown` para `Escape` sair da tela cheia
  (`dashboard.tsx:335-340`), sem timer associado.

## Pontos de atenção

- `dashboard.tsx:71-73` — o `useEffect` que reposiciona `selId` quando o
  filtro muda tem `// eslint-disable-line react-hooks/exhaustive-deps` e
  omite `selId`/`filtered` das dependências; funciona porque a lista de
  deps é só os filtros, mas qualquer novo filtro adicionado precisa ser
  lembrado manualmente nesse array.
- `dashboard.tsx:74` — `sel` cai para `filtered[0]` quando `selId` não
  bate com nenhuma nota de `notes`, mas isso roda a cada render (não é
  `useMemo`); com listas grandes, `notes.find` roda em todo re-render do
  `Dashboard`.
- `upload-screen.tsx:23-36` — se `onUpload` rejeitar depois dos 220ms (o
  `tick` já disparou e setou `pct` para 65), o `catch` chama
  `clearTimeout` (inofensivo, o timer já rodou) e zera `pct`, mas não há
  proteção contra o `tick` disparar *depois* que o componente já
  desmontou (sem cleanup em unmount) — poderia gerar um "set state em
  componente desmontado" se o usuário navegar para longe durante o
  upload.
- `duplicate-compare.tsx:47-48` — `dupcEq` trata string vazia normalizada
  como sempre diferente (`dupcNorm(a) !== ""`), então dois campos
  vazios/nulos nunca contam como "iguais" na contagem de campos-chave,
  mesmo que ambas as notas realmente não tenham o dado.
- `shared.tsx:16-21` — `prioMeta` não valida `p` negativo ou não-finito;
  qualquer valor `< 99` que não seja `<= 4` cai em `"low"`, incluindo
  `NaN` (`NaN <= 2` é `false`, `NaN <= 4` é `false`, então `NaN` vira
  `"low"` silenciosamente).
- `App.tsx:127` — ao reabrir uma nota (`toggleComplete` com `reopening
  === true`), o código também remove o id de `dupResolved`, então
  reabrir uma nota concluída desfaz automaticamente seu status de
  duplicata — comportamento implícito não documentado nos componentes de
  UI que o disparam (`Dashboard`/`Detail`).
