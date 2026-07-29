# Modal Gerar/Consultar + correção do fluxo gerar → pendente → corrigida/gerada

**Data:** 2026-06-27
**Branch:** develop
**Escopo:** Backend (`backend/coffee_module`) + Frontend (`frontend/src/coffee`)

## Problema / Motivação

O workflow de gerar/pendentes/corrigidas tem três defeitos:

1. **Nota concluída na Verificar não aparece na fila.** Ao concluir uma nota numérica na tela Verificar, o front chama `marcarGerar(id, true)`, mas a flag `a_gerar` é gravada no pk errado e a nota some de "A gerar".
2. **Placeholder 10000000 em qualquer nota.** Gerar força `definir_sap(id, 10000000)` sempre, mesmo em notas que já têm SAP real — quando deveria forçar o placeholder só nas que ainda não geraram (ou estão pendentes, re-forçando).
3. **Input de geração pobre.** Hoje é um campo simples de id único + listas. Não dá pra ver as informações da nota (id_coffee, id_sap, local de instalação) antes de gerar, nem alterar o local de instalação.

## Objetivos

1. Corrigir a fila: nota marcada na Verificar aparece em "A gerar".
2. Gerar força o placeholder só em `nao_gerada` e `pendente`; nunca toca SAP real; nunca arquiva.
3. Classificação correta por origem: `gerar → pendente → corrigida` (se da Verificar) ou `gerada` (se avulsa).
4. Modal de gerar/consultar com consulta ao vivo, exibindo `id_coffee · id_sap · local_instalacao · status`, com edição de local (máscara `DDD-DD-resto`) e ações Gerar / Consultar / Salvar local.

## Não-objetivos (YAGNI)

- Não adicionar coluna "Local de instalação" nas tabelas da página (A gerar / Geradas) — local só no modal. Logo, `listar_notas` não muda.
- Não criar lib de máscara — função pequena interna.
- Não mexer no fluxo de `coffee-pendentes` / `coffee-corrigidas` (só herdam a classificação correta).
- Não tocar no `buscar` em lote existente (continua sendo a consulta da tela Pendentes).

## Decisões (confirmadas com o usuário)

- **Gerar** força placeholder `10000000` em notas `nao_gerada` **e** `pendente` (re-forçando geração); **nunca** toca SAP real; a ação de gerar **nunca arquiva**. Nota que já está **arquivada** no COFFEE continua sendo **pulada** (segurança atual mantida).
- **Consulta ao vivo:** ao adicionar um id no modal, consulta na hora.
- **Local de instalação:** input com máscara `DDD-DD-resto`, editável por nota; salva via `/coffee/local-instalacao`.
- **Local só no modal** (não na tabela principal).
- **Geração só pelo modal:** removidos o input único e os botões Gerar/Regerar por-linha.

## Arquitetura

### 1. Backend — bugfix da fila (`routes.py` / `db.py`)

`POST /coffee/marcar-gerar`: hoje liga a flag com `db.marcar_gerar(pedido.id, ...)`, mas a nota foi gravada sob `nota["pk"]`. Quando `pedido.id != nota["pk"]`, a flag vai pra linha errada.

**Correção:** quando `a_gerar=true`, a rota sempre resolve o pk via `client.buscar_nota`, faz upsert, e liga a flag em `nota["pk"]`. Além disso grava `origem='verificar'` (ver §3). O caminho `a_gerar=false` (remover da fila, vindo do `coffee-geradas`) continua recebendo pk do front — mantém.

### 2. Backend — bugfix do placeholder (`jobs.py`)

`_rodar_geracao` passa a, para cada id:

1. `client.buscar_nota(ident)` + `db.upsert_nota(...)` (consulta ao vivo).
2. **Arquivada** → **pula** (mantém o branch atual: registra em `arquivadas`, log `geracao_ignorada_arquivada`, `db.marcar_gerar(pk, False)`). Gerar nunca arquiva, mas respeita quem já está arquivado.
3. Não-arquivada, classifica pelo SAP atual:
   - `nao_gerada` (sem SAP) **ou** `pendente` (SAP == 10000000) → `client.definir_sap(ident, SAP_PENDENTE)`, re-consulta, `db.upsert_nota`, `db.marcar_gerar(pk, False)`.
   - SAP real (`corrigida`/`gerada`) → **pula**; registra log `geracao_ignorada_sap_real`; `db.marcar_gerar(pk, False)`.

`regerar` (rota): aplicar a mesma regra — só `definir_sap(SAP_PENDENTE)` se a nota não tiver SAP real. (A tela usa só o modal agora, mas a rota permanece consistente.)

### 3. Backend — classificação por origem (`routes.py` / `jobs.py`)

A classificação (`classify.py`) já decide `corrigida` (origem ≠ avulsa) vs `gerada` (origem == avulsa) na transição `pendente → SAP real`. O que falta é setar `origem` corretamente:

- `marcar-gerar` (vindo da Verificar) grava `origem='verificar'`.
- Geração avulsa pelo modal grava `origem='avulsa'` (já feito em `_rodar_geracao`).
- `_rodar_geracao` **não sobrescreve** `origem` se a nota já tiver uma (evita que gerar uma nota-da-verificar a rebaixe para `avulsa`).

### 4. Backend — endpoint de consulta síncrona (`routes.py`)

Novo `GET /coffee/consultar/{id}` — síncrono, para a consulta ao vivo do modal:

- `client.buscar_nota(id)` (reusa o existente) + `db.upsert_nota(...)`.
- Retorna `{ pk, id_sap, local_instalacao, classificacao, arquivado }`.
- `local_instalacao` **não existe pronto** na resposta da API COFFEE — é composto a partir dos campos decompostos de `fields`: `cidade`(3 díg, zero à esquerda) + `tipo_local_instalacao`(2 letras) + `local_instalacao_numero`(8 díg, zero à esquerda). Ex.: `cidade='718'`, `tipo='ET'`, `numero=26773` → `718ET00026773` (bate com o formato de escrita `local_instalacao/{id}/{local}`). A composição vive em `client.compor_local_instalacao(fields)` e é exposta por `buscar_nota` (chave `local_instalacao`). `classificacao` vem do upsert/listagem.
- Erro de API COFFEE → 502 com mensagem (a linha do modal mostra o erro).

### 5. Frontend — modal (`coffee/coffee-gerar-modal.tsx`, novo)

Componente de modal que recebe ids iniciais (opcional) e gerencia uma lista de linhas.

**Estado por linha:** `{ id, estado: 'consultando'|'ok'|'erro', pk?, id_sap?, classificacao?, arquivado?, localAtual?, localEditado?, salvandoLocal? , erro? }`.

**Entrada de ids:** campo que aceita lote (separadores: espaço, vírgula, quebra de linha). Ao adicionar, cada id novo dispara `GET /coffee/consultar/{id}` e popula a linha.

**Tabela de linhas:** colunas `id_coffee (pk) · id_sap · local_instalacao (input máscara DDD-DD-resto) · status (tag) · estado`.

**Rodapé:**
- **Consultar** — re-dispara `consultar` para todas as linhas (atualiza sap/status/local; não muta nada externo).
- **Gerar** — `POST /coffee/gerar-lote` com todos os ids + polling (`/coffee/job/{id}`) com progresso; ao concluir, fecha ou re-consulta. Linhas de SAP real aparecem como "já gerada" (vindo do job, via re-consulta).
- **Salvar local** (por linha, habilitado quando `localEditado != localAtual`) — `POST /coffee/local-instalacao { id, local }`; sucesso atualiza `localAtual`.

Toasts (sonner, direto — `lib/notify` não existe mais) em Gerar/Consultar/Salvar local, sucesso e erro.

**Máscara `DDD-DD-resto`:** função interna que mantém só dígitos, insere hífen após 3 e após 5 dígitos, deixa o resto livre.
`// ponytail: máscara 3-2-resto; apertar regra se o formato real for fixo`

### 6. Frontend — `coffee-geradas.tsx` (refator)

- **Remove:** "Zona 1: Gerar Nota" (input único + `regerarId`/`regerarEstado`/`regerarResult`), `TransicaoCard`, função `regerar` local, função `handleRegerarForm`/`handleNova`, seleção por checkbox + "Gerar selecionadas", e os botões "Gerar"/"Regerar" por-linha nas duas tabelas.
- **Adiciona:** botão **"Gerar / Consultar notas"** (abre modal vazio) e, na seção "A gerar", botão **"Gerar fila (N)"** (abre o modal pré-carregado com os pks de `a_gerar`).
- **Mantém:** tabela "A gerar" (Remover da fila + Logs por linha), tabela "Geradas" (Arquivar + Logs por linha), `LogDrawer`, `ConfirmModal` (para remover/arquivar).
- O `gerar-lote` e o polling de progresso migram para dentro do modal.

### 7. Frontend — tipos (`coffee/types.ts`)

Adicionar tipo do retorno de `consultar`:

```ts
export interface CoffeeConsulta {
  pk: number;
  id_sap: number | null;
  local_instalacao: string | null;
  classificacao: string;
  arquivado: boolean | null;
}
```

## Tratamento de erro

- `consultar` por id que falha na API COFFEE → linha em estado `erro` com a mensagem; não bloqueia as outras linhas.
- `gerar-lote` → erros por nota já são coletados no job (`erros[]`) e exibidos no progresso.
- `local-instalacao` → toast de erro; mantém o valor editado para nova tentativa.

## Verificação

- `cd backend && python -m pytest test_coffee_module.py` passa (atualizar/expandir testes de `marcar-gerar` pk, regra do placeholder e origem).
- `cd frontend && npm run build` (`tsc -b && vite build`) sem erros.
- Manual (dev server):
  1. Concluir nota numérica na Verificar → aparece em "A gerar". (bug 1)
  2. Modal: colar ids → consulta ao vivo mostra `id_coffee · id_sap · local · status`.
  3. Gerar com nota de SAP real no lote → ela é pulada ("já gerada"), SAP não muda. (bug 2)
  3b. Gerar com nota arquivada no lote → pulada (sem definir SAP), sai da fila.
  4. Gerar nota `nao_gerada`/`pendente` → vira/segue pendente com SAP 10000000.
  5. Alterar local (máscara DDD-DD-resto) → Salvar → confirma chamada `/local-instalacao`.
  6. Nota da Verificar gerada → ao receber SAP real, classifica `corrigida`; nota avulsa → `gerada`. (bug 3)
  7. Botões Gerar/Regerar por-linha e o input único sumiram; "Gerar fila (N)" abre o modal pré-carregado.

## Arquivos afetados

- `backend/coffee_module/routes.py` — `marcar-gerar` (pk + origem), `regerar` (regra placeholder), novo `GET /consultar/{id}`.
- `backend/coffee_module/jobs.py` — `_rodar_geracao` (regra placeholder, sem branch de arquivada, não sobrescreve origem).
- `backend/test_coffee_module.py` — testes dos três bugs.
- `frontend/src/coffee/coffee-gerar-modal.tsx` — **novo** modal.
- `frontend/src/coffee/coffee-geradas.tsx` — refator (remover input/botões por-linha; entrada via modal).
- `frontend/src/coffee/types.ts` — `CoffeeConsulta`.
- `frontend/src/api.ts` — helper `consultarNota(id)` (opcional, ou fetch direto no modal).
