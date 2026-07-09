# Fluxos de negócio (cross-cutting)

Este documento amarra os fluxos que atravessam mais de um módulo — a
vida de uma nota do upload até virar SAP real, a regra de geração do
COFFEE, a sincronização com o SAP e os pontos de polling espalhados
pelo frontend. Para os detalhes internos de cada módulo, ver
[`01-frontend-verificar.md`](01-frontend-verificar.md),
[`02-frontend-coffee.md`](02-frontend-coffee.md),
[`03-frontend-input.md`](03-frontend-input.md),
[`05-backend-coffee-module.md`](05-backend-coffee-module.md) e
[`06-backend-input-module.md`](06-backend-input-module.md).

## Ciclo de vida de uma nota

1. **Verificar (triagem)** — o usuário faz upload de um Excel de notas
   ([`01-frontend-verificar.md`](01-frontend-verificar.md)). O backend
   roda as regras de validação (coordenada, referência, imagens,
   executor, local, tipo, SAP, setor, prioridade) e detecta duplicatas.
2. **Correção ou fila COFFEE** — notas com erro corrigível ficam
   disponíveis para correção manual na tela; ao marcar uma nota "a
   gerar", o `POST /marcar-gerar` grava `origem='verificar'`
   (`backend/coffee_module/routes.py:179`). `classify.classificar`
   trata qualquer `origem` diferente de `'avulsa'` (incluindo
   `'verificar'` ou `None`) como `corrigida` ao sair de `pendente`.
   Reabrir a nota na Verificar remove-a da fila: o frontend envia
   `a_gerar=false` com a justificativa automática "Nota reaberta na
   Verificar" (`frontend/src/App.tsx:133`), que a rota exige para
   qualquer remoção da fila.
3. **Pendente** — a nota aparece no hub COFFEE
   ([`02-frontend-coffee.md`](02-frontend-coffee.md)) com
   `classificacao='pendente'` (`id_sap == SAP_PENDENTE`, isto é
   `10000000`).
4. **Geração** — o usuário dispara geração avulsa (`/regerar`) ou em
   lote (`/gerar-lote` → `jobs._rodar_geracao`,
   [`05-backend-coffee-module.md`](05-backend-coffee-module.md)). O
   COFFEE só processa notas **desarquivadas**; ver a regra detalhada
   na seção seguinte.
5. **Gerada / corrigida** — quando o COFFEE atribui o SAP real e
   arquiva a nota, ela é reclassificada como `gerada` (geração avulsa)
   ou `corrigida` (veio de um erro da Verificar), conforme
   `classify.classificar`.
6. **Nota real no SAP** — fim do ciclo: a nota tem `id_sap` real e está
   arquivada no COFFEE.

## Regra de geração COFFEE: desarquivar antes de gerar

O COFFEE só gera notas que estejam **desarquivadas** — é ele quem
atribui o SAP real e arquiva a nota sozinho ao concluir. Por isso,
tanto a geração em lote (`jobs._rodar_geracao`,
`backend/coffee_module/jobs.py:97-98`) quanto o `POST /regerar`
unitário (`backend/coffee_module/routes.py:201-202`) sempre chamam
`client.definir_sap(ident, SAP_PENDENTE)` **e**
`client.desarquivar(ident)` juntos, nunca só um: uma nota arquivada com
SAP pendente fica presa até ser desarquivada. As exceções de
"não re-gera" (SAP real não arquivado, ou SAP real arquivado no lote)
e o histórico do bug de classificação da nota 356322 estão descritos
em detalhe em
[`docs/coffee/fluxo-transicao-notas.md`](../coffee/fluxo-transicao-notas.md)
— este documento não reproduz esse conteúdo.

## Sincronização com SAP

O botão **"Sincronizar SAP"** em `frontend/src/features/input/overview.tsx`
(linha 58) chama `InputApi.syncSap()`, que dispara `POST
/api/input/bases/sync-sap` no backend. Esse endpoint roda o robô RPA
(`Sap_Robot.py`) em subprocesso, extrai IW28/IW38/IW66 do SAP real e
importa os três Excel resultantes para o cache SQLite via
`_processar_upload_base`/`salvar_base_dataframe`, invalidando o cache
em memória do `engine.py` — o detalhe completo dessa migração (que
substituiu leitura direta de Excel por um cache SQLite, mergeada
durante o SP1) está em
[`06-backend-input-module.md`](06-backend-input-module.md#cache-sqlite-dbpy).

Como a sincronização roda em background e pode ser disparada por
qualquer sessão, outras abas/usuários não são notificados
automaticamente — é o polling de 60s em `use-input-data.ts` (ver
tabela abaixo) que detecta a mudança comparando `ultima_alteracao` e
marca `desatualizado = true`, deixando a UI avisar o usuário que os
dados na tela estão obsoletos.

## Debounce e polling — tabela consolidada

| Valor | Onde (arquivo:linha) | O que faz |
|---|---|---|
| 220ms | `frontend/src/features/verificar/upload-screen.tsx:23` | Progresso "falso" da barra de upload (`setPct(65)` depois de 220ms) — não é polling real, é feedback visual enquanto o upload real roda. |
| 250ms × índice | `frontend/src/api.ts:20` | Ao abrir N notas no COFFEE de uma vez, cada `window.open` é escalonado 250ms depois do anterior, para não disparar o bloqueador de pop-up do navegador. |
| 600ms | `frontend/src/features/coffee/coffee-gerar-modal.tsx:162,166` | Retry de polling de status durante geração em lote; desiste após 10 falhas consecutivas. |
| 2000ms (2s) | `frontend/src/features/coffee/coffee-pendentes.tsx:87-111` | Polling de status de um job de busca em lote, até `job.estado === "concluido"`. |
| 3000ms (3s) | `frontend/src/features/coffee/coffee-pendentes.tsx:103` | Banner "Busca concluída" volta ao estado `idle` automaticamente. |
| 10_000ms (10s) | `frontend/src/features/coffee/coffee-logs.tsx:60` | Refresh automático dos logs quando o toggle "ao vivo" está ligado. |
| 60_000ms (60s) | `frontend/src/features/input/use-input-data.ts:29-35` | Verifica se a base de dados do Input foi sincronizada em outra sessão (compara `ultima_alteracao`); se sim, marca `desatualizado = true`. |

## Pontos de atenção

- **Nenhum mecanismo central de polling.** Cada feature com polling
  real contra o servidor (geração em lote, busca em lote, logs ao
  vivo, staleness do Input) implementa seu próprio
  `setInterval`/`setTimeout` isolado, com valores diferentes
  escolhidos independentemente. Não há um hook ou utilitário
  compartilhado — mudar a estratégia de polling (por exemplo trocar
  por WebSocket) exigiria tocar em quatro arquivos distintos
  (`coffee-gerar-modal.tsx`, `coffee-pendentes.tsx`,
  `coffee-logs.tsx`, `use-input-data.ts`; o timer de 220ms do upload
  não conta, é só feedback visual client-side, ver tabela acima).
- **Retry com limite fixo, sem backoff.** O polling de geração em lote
  (`coffee-gerar-modal.tsx:162-166`) desiste após 10 falhas
  consecutivas, mas sempre no mesmo intervalo de 600ms — não há
  backoff exponencial, então uma falha temporária de rede consome o
  orçamento de retries tão rápido quanto uma falha persistente.
- **Regra de desarquivar duplicada em dois lugares.** A sequência
  `definir_sap(SAP_PENDENTE)` + `desarquivar()` está implementada tanto
  em `jobs._rodar_geracao` (`backend/coffee_module/jobs.py:97-98`)
  quanto em `routes.regerar` (`backend/coffee_module/routes.py:201-202`),
  com o mesmo comentário copiado nos dois lugares — uma mudança na
  regra (por exemplo, um novo status intermediário) precisa ser
  aplicada nos dois pontos manualmente.
- **Duas fontes de "a base mudou".** A staleness do Input é detectada
  por polling client-side comparando `ultima_alteracao`
  (`use-input-data.ts`), enquanto a sincronização em si roda
  server-side via subprocesso RPA sem callback — o frontend não sabe
  quando a extração terminou, só infere pela mudança de timestamp na
  próxima consulta do polling de 60s.
- **`window.alert` como aviso de pop-up bloqueado.** `openCoffee`
  (`frontend/src/api.ts:10-22`) usa `window.alert` nativo para avisar
  sobre o escalonamento de abas, destoando do restante da aplicação
  que usa `sonner` (`toast`) para feedback.
