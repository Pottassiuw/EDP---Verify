# Correções de fluxo de geração COFFEE — Design

**Data:** 2026-06-23
**Status:** Aprovado (aguardando revisão da spec)

## Contexto

A sub-página **Gerar** do hub COFFEE permite colocar notas para geração (atribuir o
SAP placeholder `10000000` para que o robô SAP as processe) e regerar notas já
geradas. Quatro problemas de fluxo/lógica foram identificados e devem ser resolvidos:

1. **Geração arquiva indevidamente.** O fluxo de "colocar para geração" não pode
   arquivar a nota — arquivar significa considerá-la correta. Deve apenas atribuir
   `id_sap = 10000000`.
2. **Não há como remover notas da fila de geração.** Notas postas por engano ficam
   presas na fila "A gerar". É preciso uma ação de remover, com justificativa
   obrigatória e modal de confirmação.
3. **Não há atalho para abrir a nota no COFFEE** a partir da fila de geração, apesar
   de já existir infraestrutura (`api.coffeeUrl` / `openCoffee`).
4. **Não há geração em lote real.** Hoje só existe "Regerar todas", que encadeia
   chamadas no frontend. Geração em lote de verdade (seleção + job no backend) é
   crítica.

### Esclarecimentos do domínio (decididos no brainstorming)

- **`GET /sap/{id}/{sap}` NÃO arquiva** a nota — apenas atribui o `id_sap`. A função
  `client.arquivar(id, sap)` tem nome enganoso: na prática só "define o SAP".
- **Colocar para geração** = apenas `GET /sap/{id}/10000000`. Sem desarquivar, sem
  arquivar; o restante do estado da nota é preservado.
- **Lote** = seleção por checkbox na UI + job no backend com barra de progresso
  (mesmo padrão de `jobs.iniciar_busca` / `POST /buscar`).
- **Modal de confirmação SEMPRE** em toda ação de escrita (princípio a manter em
  funcionalidades futuras). O campo de justificativa é **opcional** na maioria das
  ações e **obrigatório apenas ao remover uma nota da fila**.

## Estado atual (referência)

| Peça | Comportamento hoje |
|---|---|
| `client.arquivar(id, sap)` | `GET /sap/{id}/{sap}` — só define o SAP (nome enganoso). |
| `client.desarquivar(id)` | `GET /desarquivar/{id}`. |
| `POST /regerar` | `desarquivar` → `arquivar(id, 10000000)` → `buscar_nota` → `upsert_nota` → `marcar_gerar(pk, False)`. **Bug: o `desarquivar` mexe no estado de arquivamento sem necessidade.** |
| `POST /marcar-gerar` | Liga/desliga `a_gerar`; busca a nota se ainda não existe. Sem justificativa. |
| Fila "A gerar" (`coffee-geradas.tsx`) | Tabela com botões *Regerar* / *Logs* por linha + *Regerar todas* (loop no front). Sem remover, sem abrir-no-COFFEE, sem seleção. |
| `jobs.py` | `iniciar_busca` / `obter_job` (job in-process consultável por polling). |
| `coffee_logs` | Tabela com coluna `usuario`; `registrar_log` best-effort. |
| `api.coffeeUrl(id)` / `api.openCoffee(ids)` | `frontend/src/api.ts` — abre a nota no COFFEE em nova aba. Usado em Abrir/Duplicatas. |

## Objetivo

Corrigir o fluxo de geração para que "colocar para geração" apenas defina o SAP
placeholder; adicionar remoção da fila com justificativa obrigatória; expor o atalho
"Abrir no COFFEE" na fila; e entregar geração em lote por seleção, processada como
job no backend. Padronizar um modal de confirmação reutilizável para toda ação de
escrita.

## Arquitetura

Mudanças no backend (`coffee_module/`) e no frontend (`frontend/src/coffee/`),
seguindo os padrões existentes (imports top-level, testes na raiz de `backend/`,
estilos inline com CSS custom properties, fetch manual). Sem novas dependências.

---

### A) Item 1 — corrigir "colocar para geração" (backend)

**Arquivos:** `coffee_module/client.py`, `coffee_module/routes.py`,
`coffee_module/jobs.py`, `backend/test_coffee_module.py`.

- **Renomear** `client.arquivar(id, sap)` → `client.definir_sap(id, sap)`. A URL
  (`/sap/{id}/{sap}`) e o log (`api_call`/`acao="definir_sap"`) acompanham. Atualizar
  todas as chamadas (`routes.sap`, `routes.regerar`, futura `jobs.iniciar_geracao`) e
  os testes que referenciam `arquivar`.
- **`POST /regerar`** (geração unitária): **remover a chamada `client.desarquivar`**.
  Passa a fazer apenas `definir_sap(id, 10000000)` → `buscar_nota` → `upsert_nota` →
  `marcar_gerar(pk, False)`. Aceita campo opcional `justificativa: str | None`,
  gravado em `registrar_log("acao_usuario", "regerar", ...)` dentro de `detalhes`.

A rota `POST /sap` (que usa `client.arquivar`/`definir_sap` diretamente) mantém o
mesmo contrato externo — só muda o nome da função interna.

### B) Item 4 — geração em lote via job (backend)

**Arquivos:** `coffee_module/jobs.py`, `coffee_module/routes.py`,
`backend/test_coffee_module.py`.

- **`jobs.iniciar_geracao(ids: list, justificativa: str | None = None) -> str`**:
  mesmo padrão de `iniciar_busca` (thread daemon, dict de progresso sob lock). Para
  cada `id`: `definir_sap(id, SAP_PENDENTE)` → `buscar_nota` → `upsert_nota` →
  `marcar_gerar(pk, False)`. Falha de uma nota não derruba o lote: registra erro por
  `pk` em `erros` e segue. Respeita `config.DELAY_GERACAO` entre notas. Estado
  consultável pelo `GET /job/{job_id}` existente
  (`{estado, total, feitas, erros, iniciado_em}`).
- **`POST /api/coffee/gerar-lote`** body `{ids: list[int], justificativa?: str}` →
  `{job_id}`. Valida lista não-vazia (400 se vazia). Loga
  `acao_usuario`/`geracao_lote` com `{total, justificativa}` antes de iniciar o job.

### C) Item 2 — remover da fila + justificativa (backend)

**Arquivos:** `coffee_module/routes.py`, `backend/test_coffee_module.py`.

- **`POST /marcar-gerar`**: o modelo `MarcarGerarPedido` ganha
  `justificativa: str | None = None`. O valor entra em `detalhes` do
  `registrar_log`.
- **Remover da fila** = `marcar-gerar` com `a_gerar=false`. Nesse caso a
  **justificativa é obrigatória**: a rota retorna **400** se `a_gerar is False` e
  `justificativa` for vazia/ausente.

### D) Frontend — peças reutilizáveis

**Arquivos:** `frontend/src/coffee/confirm-modal.tsx` (novo),
`frontend/src/coffee/coffee-notas-table.tsx`.

- **`ConfirmModal`** — componente reutilizável: `title`, `message`, `confirmLabel`,
  `tone` (`default`/`danger`), `requireJustification: boolean`, callbacks
  `onConfirm(justificativa: string)` / `onCancel`. Renderiza overlay + textarea de
  justificativa (rótulo "obrigatória"/"opcional" conforme a flag); botão confirmar
  desabilitado enquanto a justificativa obrigatória estiver vazia. ESC/clique-fora
  cancelam. Reaproveita o padrão visual do `LogDrawer` (overlay + painel, CSS custom
  properties). **Toda ação de escrita da página Gerar passa por ele.**
- **`CoffeeNotasTable`** — novas props **opcionais**:
  `selectable?: boolean`, `selectedPks?: Set<number>`,
  `onToggleSelect?: (pk: number) => void`, `onToggleAll?: () => void`. Quando
  `selectable`, renderiza uma coluna de checkbox (header = selecionar todas). Sem
  essas props, a tabela se comporta exatamente como hoje — as páginas
  Corrigidas/Pendentes/Verificar não mudam.

### E) Frontend — página Gerar (`coffee-geradas.tsx`) + item 3

**Arquivos:** `frontend/src/coffee/coffee-geradas.tsx`,
`frontend/src/coffee/use-coffee-notas.ts` (se necessário para o polling do job).

- **Fila "A gerar"** com seleção: `CoffeeNotasTable` em modo `selectable`. Botão
  **"Gerar selecionadas (N)"** → `ConfirmModal` (justificativa opcional) →
  `POST /gerar-lote` → barra de progresso via polling de `GET /job/{job_id}` →
  ao concluir, `refetch` das listas. Substitui o "Regerar todas" encadeado.
- **Ações por linha na fila "A gerar":**
  - **Gerar** → `ConfirmModal` (opcional) → `POST /regerar` (single).
  - **Abrir no COFFEE** → link/botão `target="_blank"` com
    `api.coffeeUrl(String(nota.pk))` (item 3; sem nova infra).
  - **Remover da fila** → `ConfirmModal` (`tone="danger"`,
    `requireJustification`) → `POST /marcar-gerar` com `a_gerar:false` +
    justificativa.
  - **Logs** → `LogDrawer` (como hoje).
- **Form de geração unitária** (topo): também passa pelo `ConfirmModal` (opcional)
  antes de chamar `/regerar`.
- **Tabela "Notas Geradas"** (abaixo): ganha o botão **"Abrir no COFFEE"** por linha,
  além de Regerar/Logs já existentes. (As tabelas de Pendentes/Corrigidas ficam fora
  deste escopo — o atalho some restrito à página Gerar.)

## Fluxo de dados (geração em lote)

```
UI (checkboxes) --selectedPks--> "Gerar selecionadas"
   --> ConfirmModal(justificativa opcional)
   --> POST /gerar-lote {ids, justificativa}
   --> jobs.iniciar_geracao  --> {job_id}
UI faz polling GET /job/{job_id} --> progresso {feitas/total, erros}
   por nota: definir_sap(10000000) -> buscar_nota -> upsert_nota -> marcar_gerar(False)
   --> concluído --> refetch(a_gerar) + refetch(gerada)
```

## Tratamento de erros

- **Lote:** uma nota com erro não derruba as demais; o erro é acumulado em
  `job.erros` e exibido no resumo ao final.
- **Remover sem justificativa:** rejeitado no backend (400) e bloqueado na UI
  (botão confirmar desabilitado).
- **Logging best-effort** mantém a garantia atual: `registrar_log` nunca derruba a
  operação primária.

## Testes

- **Backend (pytest, `cd backend && .venv/Scripts/python.exe -m pytest
  test_coffee_module.py -q`):**
  - `definir_sap` monta a URL `/sap/{id}/{sap}` e loga `api_call`.
  - `/regerar` **não** chama `desarquivar`; chama `definir_sap(id, 10000000)`;
    grava justificativa no log quando enviada.
  - `jobs.iniciar_geracao` gera várias notas, isola erro de uma, respeita o
    progresso; `/gerar-lote` retorna `job_id` e loga `geracao_lote`.
  - `/marcar-gerar` com `a_gerar=false` **sem** justificativa → 400; **com**
    justificativa → grava no log.
- **Frontend:** sem framework de teste — verificação via `cd frontend && npm run
  build` a cada task, mais checklist manual (seleção, modal, progresso do lote,
  remover-da-fila, abrir-no-COFFEE).

## Fora de escopo

- Atalho "Abrir no COFFEE" nas páginas Pendentes/Corrigidas.
- Seleção em lote nas páginas que não a fila "A gerar".
- Reprocessamento automático/retentativa de notas com erro no lote.
- Histórico/auditoria de justificativas além do que já vai para `coffee_logs`.
