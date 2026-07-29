# SP3: Manual do Desenvolvedor — Design

**Date:** 2026-07-08
**Status:** Approved in brainstorm (aguardando revisão da spec)

## Contexto

SP1 (limpeza + estrutura), SP2a (preflight + tailwind utilities) e SP2b
(componentes shadcn) já foram mergeados em `develop`. SP3 é o terceiro e
último sub-projeto do roadmap original de refatoração: um manual do
desenvolvedor detalhado — stack, lógica, negócio, debounce times, por que
das escolhas técnicas, sugestões de pontos de atenção.

Diferente de SP1/SP2a/SP2b, SP3 não muda código — é documentação pura.

## Objetivo

Um conjunto de 8 documentos em `docs/dev/`, cobrindo frontend e backend,
organizados por feature/módulo (não arquivo-a-arquivo — o projeto tem
~29 arquivos só em `features/`, documentar um por um viraria referência
inchada e cara de manter). Cada documento de feature/módulo termina com
uma seção curta "Pontos de atenção" — débito técnico real observado no
código, não brainstorm especulativo.

## Estrutura dos documentos

1. **`docs/dev/00-overview.md`** — arquitetura geral (feature-first,
   `features/{verificar,coffee,input,configuracoes}` +
   `components/{ui,branded}` global), stack completo (React 18,
   TypeScript, Vite, Tailwind v4, Radix/shadcn, React Query, FastAPI,
   Pandas, OpenPyXL, httpx) e o porquê de cada escolha onde há
   contexto real no histórico do projeto (não genérico), como rodar o
   projeto localmente (frontend + backend), mapa de alto nível do
   fluxo de dados (Verificar → COFFEE → Input, onde cada um entra).

2. **`docs/dev/01-frontend-verificar.md`** — `features/verificar/`:
   dashboard (filtros, fila de duplicatas), upload-screen (fluxo de
   upload, debounce/polling reais do código), kpi-drawer,
   duplicate-compare, shared.tsx (PriorityChip/StatusTag/Field).

3. **`docs/dev/02-frontend-coffee.md`** — `features/coffee/`: hub e
   navegação por sub-abas, geração/consulta (Gerar modal — fluxo de
   consulta+edição local+geração em lote com polling, valores reais de
   intervalo), pendentes/geradas/corrigidas, logs, confirm-modal,
   log-drawer.

4. **`docs/dev/03-frontend-input.md`** — `features/input/`: overview,
   manage (edição em lote), ramal, filters (com o padrão
   reset-para-vazio-depois-de-escolher), reports, logs, sincronização
   SAP (o botão "Sincronizar SAP" e o que ele dispara no backend).

5. **`docs/dev/04-frontend-shared.md`** — `features/configuracoes/`
   (tema/densidade/accent), `components/branded/` (composições sobre
   shadcn), `components/ui/` (o que foi customizado e por quê — link
   para as decisões de SP2b), `context/settings-context.tsx`,
   `hooks/` (use-mobile, use-persisted-state), e o sistema de tokens
   de `app.css` (bridge `@theme inline`, `.edp[data-density]`,
   `@layer` — por que preflight+utilities+components nessa ordem).

6. **`docs/dev/05-backend-coffee-module.md`** — `backend/coffee_module/`:
   `client.py` (integração SAP/COFFEE), `jobs.py` (geração em
   background, a regra de desarquivar-antes-de-gerar), `classify.py`,
   `db.py`, `routes.py`.

7. **`docs/dev/06-backend-input-module.md`** — `backend/input_module/`:
   `engine.py` (cruzamento IW28/IW38/IW66, cache SQLite via
   `salvar_base_dataframe`/`carregar_base_dataframe`), `db.py`,
   `routes.py`.

8. **`docs/dev/07-fluxos-de-negocio.md`** — cross-cutting, não
   organizado por arquivo: ciclo de vida completo de uma nota
   (Verificar → triagem → COFFEE → arquivada/desarquivada → SAP real),
   a regra de geração COFFEE (nota tem que estar desarquivada,
   `definir_sap` + `desarquivar` sempre juntos), sincronização SAP (de
   onde vêm os dados, como o cache SQLite substituiu leitura direta de
   Excel), e uma tabela consolidada de debounce/polling times com os
   valores reais encontrados no código (arquivo:linha), não valores
   inventados.

## Regras de conteúdo

- **Fatos, não meta-informação.** Descrever o que o código faz e por
  que (quando há um motivo real documentado em commit/comentário/spec
  anterior), nunca "isso poderia ser melhorado fazendo X" como
  afirmação genérica — isso vai na seção "Pontos de atenção", que é
  descritiva de débito real, não brainstorm.
- **Debounce/polling times são extraídos do código, não inventados.**
  Cada valor citado tem uma referência `arquivo:linha` verificável.
- **Sem duplicar o que specs/plans já documentam em detalhe.** Onde um
  fluxo já tem uma spec própria (ex.: a regra de geração COFFEE tem
  `docs/coffee/fluxo-transicao-notas.md`), o manual resume e linka, não
  reescreve.
- **pt-BR**, consistente com o resto do repositório (specs, plans,
  comentários de código).
- Cada doc de feature/módulo (1-7) termina com "Pontos de atenção" —
   3-6 itens, cada um com localização exata e a observação concreta
  (não "considerar refatorar", mas "X está duplicado entre Y e Z" ou
  "W não tem tratamento de erro para caso N").

## Tratamento de erros / riscos

- Risco de o manual ficar desatualizado — fora de escopo do SP3 em si
  (não é um mecanismo de sincronização automática), mas
  `CLAUDE.md` já tem a regra "Whenever architecture changes: Update
  relevant documentation" — o manual entra nesse guarda-chuva daqui
  pra frente.
- Sem código mudando nesta fase — nenhum teste novo, nenhum build
  quebra. Verificação é leitura humana (revisão de conteúdo), não
  `npm run build`/`pytest`.

## Testes

- N/A (documentação pura). Verificação: cada afirmação técnica no
  manual deve ser confirmável lendo o código-fonte apontado.

## Fora de escopo

- Automação de sincronização manual↔código.
- Diagramas visuais (Mermaid/imagens) — texto + tabelas apenas, a
  menos que o usuário peça depois.
- Documentação de API pública (OpenAPI/Swagger) — já gerada
  automaticamente pelo FastAPI, não duplicada aqui.
