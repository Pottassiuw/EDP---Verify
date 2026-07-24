# COFFEE — Operação em Kanban, inspector de nota e página Concluídas

**Data:** 2026-07-24

**Branch:** `codex/coffee-operacao-kanban`

**Status:** design aprovado em conversa; aguardando revisão desta especificação

## Contexto

O módulo COFFEE distribui um único fluxo operacional entre as páginas
`Gerar`, `Pendentes` e `Corrigidas`. A geração e a consulta ainda acontecem
num modal grande, enquanto as tabelas principais repetem pouca informação e
concentram ações em ícones. Isso dificulta:

- entender em qual etapa cada nota está;
- operar lotes sem perder a visão do conjunto;
- acompanhar uma geração depois de fechar o modal;
- consultar os dados completos de uma nota sem abrir vários drawers;
- distinguir notas realmente `gerada` das `corrigida`.

Há duas limitações técnicas que o redesign precisa resolver:

1. `db.listar_notas("gerada")` retorna hoje `gerada` **e** `corrigida`, embora
   as duas categorias também apareçam em páginas diferentes.
2. Os jobs ficam somente em `_JOBS`, na memória do processo. Um reinício do
   backend apaga o acompanhamento do lote e faz `GET /job/{id}` retornar 404.

## Objetivos

1. Transformar `Gerar` e `Pendentes` numa página única, **Operação**, cuja
   visualização principal é um Kanban de estados reais do backend.
2. Remover o modal `Gerar / Consultar` e incorporar entrada, consulta, seleção
   em lote, progresso e recuperação diretamente na página.
3. Abrir os dados completos de uma nota num **inspector lateral**, sem perder
   filtros, seleção nem posição do quadro.
4. Criar a página **Concluídas**, com separação clara entre `Geradas` e
   `Corrigidas`.
5. Persistir fila e progresso de jobs para que atualização da página ou
   reinício do backend não apaguem o estado operacional.
6. Preservar os temas `Sistema`, `Claro` e `Escuro`, as três cores de destaque
   existentes e as densidades `compact` e `cozy`.

## Decisões confirmadas

- O trabalho em andamento usa **Kanban**.
- `Concluídas` é uma página separada.
- Clicar no corpo do card abre um inspector lateral com a ficha completa.
- Checkbox e clique no card têm funções distintas:
  - checkbox seleciona para ações em lote;
  - corpo do card abre detalhes.
- O inspector cobre a lateral do quadro; não muda a coluna nem a rolagem.
- A experiência respeita `Sistema`, `Claro`, `Escuro` e os acentos
  verde, azul e índigo existentes.
- O modal atual deixa de existir.
- O Kanban não terá arrastar e soltar. As etapas representam estados de
  negócio; não são posições que o usuário possa alterar livremente.

## Nova arquitetura de informação

As subseções do COFFEE passam a ser:

1. **Verificar**
2. **Abrir**
3. **Operação**
4. **Concluídas**
5. **Logs**

`Gerar`, `Corrigidas` e `Pendentes` deixam de ser destinos independentes:

- `Gerar` e `Pendentes` são absorvidas por `Operação`;
- `Corrigidas` passa a ser um filtro de `Concluídas`;
- `Logs` continua como página de auditoria ampla;
- o inspector mostra a atividade da nota sem substituir a página `Logs`.

Valores antigos persistidos em `edp_coffee_sub` serão migrados:

- `geradas` e `pendentes` → `operacao`;
- `corrigidas` → `concluidas`;
- valores válidos atuais permanecem inalterados.

O atalho de Relatórios que hoje abre `corrigidas` passará a abrir
`Concluídas` com o filtro `Corrigidas` selecionado.

## Página Operação

### Cabeçalho e entrada integrada

O topo da página contém:

- eyebrow `FLUXO ATIVO`;
- título `Geração de notas`;
- contagem total em andamento;
- última atualização;
- ação `Atualizar pendentes`;
- ação `Adicionar notas`.

`Adicionar notas` expande uma área de entrada no próprio fluxo. Ela aceita IDs
separados por espaço, vírgula, ponto e vírgula ou quebra de linha. Antes de
enviar, mostra quantos IDs são válidos, repetidos e inválidos. `Consultar`
cria uma operação persistida e recolhe o compositor para devolver espaço ao
quadro. O texto digitado pode ser limpo sem remover cards existentes.

Não haverá uma segunda lista dentro do compositor. Assim que a consulta
começa, cada ID aparece no Kanban.

### Colunas do Kanban

O quadro possui quatro colunas:

| Etapa | Conteúdo | Saída esperada |
|---|---|---|
| **Fila** | IDs recebidos da Verificar ou do compositor, ainda consultando; falhas de consulta permanecem aqui com ação de tentar novamente | `Prontas para gerar`, `Aguardando SAP` ou `Concluídas` |
| **Prontas para gerar** | notas consultadas, elegíveis e sem SAP real | `Processando` |
| **Processando** | notas pertencentes a uma geração em execução | `Aguardando SAP` ou retorno para `Prontas` com erro |
| **Aguardando SAP** | notas com SAP temporário `10000000` | `Concluídas` quando a atualização encontra SAP real |

Cada coluna tem título, contagem, resumo do estado e empty state específico.
Colunas vazias continuam visíveis para explicar o fluxo. Em larguras menores,
o quadro usa scroll horizontal com snap por coluna; não comprime cards até
ficarem ilegíveis.

### Cards

O card mostra apenas informação útil para decidir:

- ID COFFEE;
- origem (`Verificar` ou `Avulsa`);
- local de instalação e alimentador, quando disponíveis;
- prioridade;
- etapa ou bloqueio;
- tempo desde a última mudança;
- progresso compacto quando pertence a um job ativo.

Erro, bloqueio e seleção não dependem só de cor. Cada um combina texto, ícone e
contraste. O acento escolhido pelo usuário identifica seleção, foco e ação
primária; verde, azul, âmbar e vermelho continuam reservados aos significados
semânticos.

O card não é um botão envolvendo outros controles. Ele contém:

- checkbox acessível para lote;
- área explícita `Abrir detalhes`, acionável por teclado;
- ações rápidas somente quando forem essenciais para a etapa.

### Seleção em lote

Ao selecionar pelo menos uma nota, surge uma barra fixa na base do quadro com:

- quantidade selecionada;
- `Selecionar coluna`;
- ação principal válida para a seleção;
- `Limpar seleção`.

A ação depende da etapa:

- `Fila`: consultar novamente;
- `Prontas para gerar`: gerar;
- `Aguardando SAP`: atualizar SAP;
- mistura de etapas: somente ações comuns ou mensagem explicando a
  incompatibilidade.

A seleção não é persistida no backend e é limpa após uma operação concluída.
Trocar filtros ou abrir/fechar o inspector não perde a seleção.

## Inspector lateral

O inspector abre pela direita sobre o quadro. Em desktop, usa largura
`clamp(420px, 38vw, 620px)`. Em telas abaixo de 1024 px, torna-se uma ficha em
tela cheia.

O conteúdo é organizado em blocos:

1. **Identidade:** ID COFFEE, SAP, origem, etapa e atualização.
2. **Local:** local de instalação, cidade e alimentador.
3. **Ocorrência:** descrição, observação e prioridade.
4. **Validações:** IW28, plano, avisos e bloqueios, reutilizando a consulta de
   `useNotaRevisao`.
5. **Atividade:** eventos recentes dos logs da nota.
6. **Próximo passo:** explicação curta da ação recomendada.

As ações do rodapé variam pela etapa:

- comuns: `Abrir no COFFEE`;
- fila/pronta: alterar local e remover da fila;
- pronta: gerar nota;
- aguardando SAP: atualizar SAP;
- concluída: revisar, mover para plano quando permitido e arquivar quando
  aplicável.

Alterar o local exige ação explícita, mantém o valor anterior durante a edição
e mostra erro inline sem descartar o texto. Ações destrutivas mantêm
confirmação e justificativa.

Fechar por `Esc`, botão ou clique externo devolve foco ao card, preservando
coluna, scroll, filtros e seleção. O inspector consolida a ficha de
`RevisarNotaSheet` e a atividade de `LogDrawer`; não abre drawers empilhados.

## Página Concluídas

O cabeçalho contém:

- título e total;
- segmentos `Todas`, `Geradas` e `Corrigidas`, cada um com contagem;
- busca por ID, SAP ou local;
- período;
- ordenação por conclusão mais recente;
- ação `Copiar IDs`.

No desktop, os resultados usam uma lista densa com colunas claras:
ID, SAP, local, resultado, origem e quando. Em telas estreitas, cada linha vira
card. Clicar no resultado abre o mesmo inspector lateral.

`classificacao_em` define data, período e ordenação da conclusão. Notas legadas
sem esse valor usam `buscado_em` como fallback visível, identificado como data
de consulta.

Quando o filtro contém `Corrigidas`, a seleção em lote e `Mover para Plano`
continuam disponíveis. As ações hoje existentes de abrir no COFFEE, revisar,
arquivar e consultar logs são preservadas no inspector ou na barra de lote.

O backend passa a aplicar semântica literal:

- `status=gerada` retorna somente `classificacao = 'gerada'`;
- `status=corrigida` retorna somente `classificacao = 'corrigida'`;
- `status=concluida` retorna ambas.

## Direção visual e temas

`DESIGN.md` continua orientando hierarquia, geometria e contenção visual, mas
as cores literais são traduzidas para o sistema temático existente:

- fundos e superfícies usam `--bg`, `--bg-2`, `--surface` e `--surface-2`;
- texto usa `--text`, `--text-dim` e `--text-mute`;
- bordas usam `--line` e `--line-2`;
- ações e foco usam `--accent`, `--accent-2` e `--accent-tint`;
- estados usam os tokens semânticos existentes;
- não haverá gradientes nem cores arbitrárias.

O layout preserva:

- bordas finas;
- raio de 6 px em controles e 11–12 px em cards;
- títulos com tracking compacto;
- metadados em IBM Plex Mono;
- uso escasso do acento;
- densidade controlada por `data-density`.

`Sistema` continua resolvendo `prefers-color-scheme` em tempo real. O inspector
e qualquer popover portalizado recebem `data-theme`, `data-density` e as
variáveis do acento selecionado. Isso evita o problema atual em que um portal
fora de `.edp` pode receber os tokens escuros de `:root` durante o tema claro.
Nenhum arquivo de `src/components/ui/` será editado.

## Estado e persistência no backend

`notas_coffee` permanece como fonte da classificação observada no COFFEE.
Duas estruturas pequenas separam estado operacional de dados da nota:

### `coffee_fila_operacao`

Uma linha por entrada ativa:

- identificador recebido e `nota_pk` canônico quando resolvido;
- etapa: `fila`, `pronta`, `processando` ou `aguardando_sap`;
- origem;
- operação atual;
- último erro;
- timestamps de criação e atualização.

Quando duas entradas resolvem para o mesmo `nota_pk`, o serviço mantém um único
item canônico, preserva a origem já registrada e agrega o resultado ao mesmo
card. Colar ou receber novamente uma nota que já está ativa não cria duplicata.

Quando uma nota é concluída, ela sai da fila ativa. A classificação e os logs
preservam o histórico.

### `coffee_operacoes`

Snapshot persistido de cada lote:

- `id`;
- tipo: `consulta`, `geracao` ou `atualizacao_sap`;
- estado: `rodando`, `concluida`, `parcial` ou `interrompida`;
- total, concluídas e falhas;
- resultado serializado;
- timestamps.

`jobs.py` continua executando em thread, mas cada transição grava no banco.
`GET /coffee/job/{id}` passa a ler a operação persistida. Depois de reiniciar
o backend:

- operações que estavam `rodando` são marcadas `interrompida`;
- itens que estavam `processando` voltam para `pronta` com aviso;
- nenhuma chamada externa é repetida automaticamente;
- o usuário reconsulta antes de tentar novamente.

Essa recuperação evita tanto perda silenciosa quanto repetição insegura de
efeitos no COFFEE.

## Serviços e API

As rotas permanecem finas e delegam a regra para um serviço de operação.

Novos contratos:

- `GET /api/coffee/operacao` — itens ativos, operações ativas e contagens;
- `POST /api/coffee/operacao/consultar` — recebe IDs e inicia consulta;
- `POST /api/coffee/operacao/gerar` — recebe notas prontas e inicia geração;
- `POST /api/coffee/operacao/atualizar-sap` — reconsulta notas aguardando;
- `POST /api/coffee/operacao/remover` — remove itens com justificativa.

Contratos preservados:

- `GET /api/coffee/job/{id}` mantém o formato consumido pelo frontend, agora
  persistido;
- `/consultar/{id}`, `/gerar-lote`, `/buscar` e `/marcar-gerar` permanecem
  durante a migração e reutilizam o mesmo serviço quando aplicável;
- jobs de correção local continuam compatíveis.

O serviço aplica a máquina de estados. SQL e migrações ficam em `db.py`; regra
de negócio não entra em `routes.py`.

## Frontend e limites de componentes

A implementação segue a arquitetura feature-first:

```text
frontend/src/features/coffee/
  operacao/
    coffee-operacao.tsx
    operacao-api.ts
    use-coffee-operacao.ts
    components/
      operacao-composer.tsx
      operacao-kanban.tsx
      operacao-column.tsx
      nota-operacao-card.tsx
      operacao-batch-bar.tsx
  concluidas/
    coffee-concluidas.tsx
    use-coffee-concluidas.ts
    components/
      concluidas-toolbar.tsx
      concluidas-list.tsx
  components/
    coffee-nota-inspector.tsx
    nota-summary.tsx
    nota-activity.tsx
```

Responsabilidades:

- páginas coordenam queries, seleção e modais de confirmação;
- hooks encapsulam queries, polling e mutations;
- API converte contratos HTTP em tipos;
- componentes renderizam UI e emitem eventos;
- a máquina de estados fica no backend.

React Query será usado para o novo estado de servidor:

- `["coffee", "operacao"]`;
- `["coffee", "operacao", "job", id]`;
- `["coffee", "concluidas"]`;
- `["coffee", "nota", pk]`;
- `["coffee", "nota", pk, "logs"]`.

Jobs ativos usam `refetchInterval`; mutations invalidam somente as chaves
afetadas. Estado de servidor não será copiado para Context. Seleção, inspector
aberto, busca e filtros continuam como estado local derivável.

Os componentes antigos `CoffeeGeradas`, `CoffeeCorrigidas`,
`CoffeePendentes` e `CoffeeGerarModal` são removidos somente depois de suas
ações estarem cobertas pelas novas páginas. `CoffeeNotasTable` permanece se
ainda tiver consumidor; caso contrário, é removido junto com os imports.

## Fluxos

### Consultar

1. Usuário cola IDs e confirma.
2. Backend cria operação persistida e itens em `fila`.
3. Cada consulta atualiza a nota e decide:
   - sem SAP real → `pronta`;
   - SAP `10000000` → `aguardando_sap`;
   - SAP real → sai do quadro e aparece em `Concluídas`;
   - falha → permanece em `fila` com erro.
4. Query do quadro é invalidada e o card muda de coluna.

### Gerar

1. Usuário seleciona notas `pronta`.
2. Backend cria operação, move itens para `processando` e executa a regra já
   existente de placeholder/desarquivamento.
3. Sucesso move para `aguardando_sap`.
4. Falha devolve para `pronta`, preserva erro e permite nova consulta.
5. Sucessos e falhas parciais aparecem inline e em toast-resumo.

### Atualizar SAP

1. Usuário atualiza uma nota, uma seleção ou toda a coluna.
2. Backend consulta o COFFEE com o delay configurado.
3. Placeholder mantido → card continua e atualiza `última busca`.
4. SAP real → classificação `gerada` ou `corrigida`, remoção do quadro e
   entrada em `Concluídas`.
5. Falha → card permanece com próxima ação clara.

## Erros e recuperação

- Falha individual não derruba o lote.
- Toast resume o lote; o card explica o erro específico.
- Erro de rede mantém seleção e dados digitados para tentar novamente.
- Um job interrompido nunca é apresentado como concluído.
- Ações indisponíveis explicam o motivo em texto ou tooltip.
- Empty states diferenciam ausência de dados, filtro sem resultado e falha de
  carregamento.
- `Tentar novamente` invalida a query correta; não recarrega a aplicação.
- Exceções não são ignoradas silenciosamente.

## Acessibilidade e responsividade

- Kanban possui headings e regiões nomeadas por coluna.
- Seleção usa checkbox nativo/Radix com label contendo o ID.
- Abrir detalhes é acessível por teclado sem conflito com o checkbox.
- Inspector preserva foco, fecha com `Esc` e devolve foco ao card.
- Progresso usa `aria-live="polite"` sem anunciar cada tick excessivamente.
- Status nunca depende somente de cor.
- Foco visível usa o acento selecionado com contraste nos dois temas.
- Em tela pequena, o inspector ocupa a viewport e a lista Concluídas vira
  cards; o Kanban mantém colunas legíveis por scroll horizontal.
- `prefers-reduced-motion` reduz transições de card e inspector.

## Migração e compatibilidade

- Migrações SQLite usam `CREATE TABLE IF NOT EXISTS` e não removem colunas.
- `a_gerar` continua escrito durante a transição, mas o novo quadro lê a fila
  operacional.
- Na primeira inicialização, notas com `a_gerar = 1` são normalizadas para a
  etapa compatível com sua classificação.
- Se `sessionStorage["edp_coffee_gerar_rows"]` existir, a página envia
  automaticamente esses IDs ao novo serviço uma única vez e só remove a chave
  depois de resposta bem-sucedida.
- Links internos e o valor persistido da subseção são migrados antes de
  remover as páginas antigas.

## Fora de escopo

- mudar regras externas de classificação, SAP temporário ou origem;
- permitir drag-and-drop entre etapas;
- introduzir WebSocket;
- adicionar biblioteca de Kanban, estado global ou animação;
- refatorar `Verificar`, `Abrir` ou `Logs` além dos links necessários;
- editar componentes vendorizados em `src/components/ui/`;
- paginação server-side de Concluídas nesta primeira entrega.

## Verificação

### Backend

- testes de migração idempotente;
- testes da máquina de estados para consulta, geração e atualização;
- testes de sucesso parcial;
- teste de recuperação de operação `rodando` após reinício;
- teste de `status=gerada`, `status=corrigida` e `status=concluida`;
- regressão dos fluxos de origem e SAP temporário;
- suíte completa com `pytest`.

### Frontend

- `npm run build`;
- nenhuma dependência nova;
- sem `any`, imports mortos ou `console.log`;
- validação manual dos fluxos de lote e do inspector;
- validação em claro e escuro com acentos verde, azul e índigo;
- validação de `Sistema` reagindo à mudança do SO;
- validação em densidades `compact` e `cozy`;
- navegação somente por teclado;
- viewport desktop, tablet e mobile;
- contraste e `prefers-reduced-motion`.

## Critérios de aceite

1. `Operação` substitui `Gerar` e `Pendentes` sem perder nenhuma ação atual.
2. O compositor funciona na página, sem modal.
3. Cards percorrem as quatro etapas segundo respostas reais do backend.
4. Atualizar a página mantém fila, etapa e acompanhamento do job.
5. Reiniciar o backend marca job interrompido e oferece recuperação segura.
6. Checkbox opera lote; abrir o card mostra o inspector completo.
7. Fechar o inspector restaura contexto do quadro.
8. `Concluídas` separa corretamente `Geradas` e `Corrigidas`.
9. O atalho de Relatórios abre `Concluídas > Corrigidas`.
10. Claro, escuro, sistema, acentos e densidades funcionam inclusive nos
    portais.
11. Nenhuma regra de negócio do COFFEE muda.
12. Build, testes backend e checklist de qualidade do repositório passam.
