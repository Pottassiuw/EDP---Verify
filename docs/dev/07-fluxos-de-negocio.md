# Fluxos de negócio (cross-cutting)

Este documento amarra os fluxos que atravessam mais de um módulo — a
vida de uma nota do upload até virar SAP real, a regra de geração do
COFFEE, a sincronização com o SAP e os pontos de polling espalhados
pelo frontend. Para os detalhes internos de cada módulo, ver
[`01-frontend-verificar.md`](01-frontend-verificar.md),
[`02-frontend-coffee.md`](02-frontend-coffee.md),
[`03-frontend-input.md`](03-frontend-input.md),
[`05-backend-coffee-module.md`](05-backend-coffee-module.md),
[`06-backend-input-module.md`](06-backend-input-module.md) e
[`08-integracao-coffee-input.md`](08-integracao-coffee-input.md).

## Ciclo de vida de uma nota

1. **Verificar (triagem)** — o usuário faz upload de um Excel de notas
   ([`01-frontend-verificar.md`](01-frontend-verificar.md)). O backend
   roda as regras de validação (coordenada, referência, imagens,
   executor, local, tipo, SAP, setor, prioridade) e detecta duplicatas.
2. **Correção ou fila COFFEE** — notas escolhidas na triagem são
   encaminhadas para a fila persistida da página Operação. O
   `POST /marcar-gerar` registra `origem='verificar'`; reabrir a nota
   remove o card com a justificativa automática exigida pela rota.
3. **Operação** — a pessoa consulta IDs e acompanha os cards em Fila,
   Prontas para gerar, Processando e Aguardando SAP. Uma nota com
   `id_sap == SAP_PENDENTE` (`10000000`) permanece em Aguardando SAP até
   nova consulta.
4. **Geração** — a página chama `POST /operacao/gerar` apenas para cards
   Prontos. O COFFEE só processa notas **desarquivadas**; ver a regra
   detalhada na seção seguinte.
5. **Gerada / corrigida** — quando o COFFEE atribui o SAP real, a
   atualização SAP remove o card da operação e a nota aparece em
   Concluídas, classificada conforme `classify.classificar`.
6. **Nota real no SAP** — fim do ciclo: a nota tem `id_sap` real e está
   arquivada no COFFEE.
7. **COFFEE → Plano (opcional)** — com a nota já gerada (`id_sap`
   real), o usuário pode revisar (`GET
   /api/integracao/nota/{pk}/revisao`) e mover a nota para o plano do
   Input (`POST /api/integracao/mover-para-plano`), que cria ou
   atualiza o registro correspondente
   ([`08-integracao-coffee-input.md`](08-integracao-coffee-input.md)).
   Esse passo é a única ponte entre COFFEE e Input — nenhum dos dois
   módulos conhece o outro diretamente, só `integracao_module`.

## Regra de geração COFFEE: desarquivar antes de gerar

O COFFEE só gera notas que estejam **desarquivadas** — é ele quem
atribui o SAP real e arquiva a nota sozinho ao concluir. Por isso,
tanto a geração da Operação (`jobs._executar_geracao`) quanto o
`POST /regerar` unitário sempre chamam
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
tabela abaixo) que detecta a mudança comparando `versao`
(`db.obter_versao_dataset()`, retornada por `GET /sync`) e invalida
`INPUT_DADOS_KEY` em background, avisando o usuário via `toast.info`
(ver "Sincronização SAP" em [`03-frontend-input.md`](03-frontend-input.md)).

## Debounce e polling — tabela consolidada

| Valor | Onde (arquivo:linha) | O que faz |
|---|---|---|
| 220ms | `frontend/src/features/verificar/upload-screen.tsx:23` | Progresso "falso" da barra de upload (`setPct(65)` depois de 220ms) — não é polling real, é feedback visual enquanto o upload real roda. |
| 250ms × índice | `frontend/src/api.ts:20` | Ao abrir N notas no COFFEE de uma vez, cada `window.open` é escalonado 250ms depois do anterior, para não disparar o bloqueador de pop-up do navegador. |
| 800ms | `frontend/src/features/coffee/operacao/use-coffee-operacao.ts` | Refetch do quadro enquanto existir job com estado `rodando`. |
| 10_000ms (10s) | `frontend/src/features/coffee/coffee-logs.tsx:60` | Refresh automático dos logs quando o toggle "ao vivo" está ligado. |
| 60_000ms (60s) | `frontend/src/features/input/use-input-data.ts:29-35` | Verifica se a base de dados do Input foi sincronizada em outra sessão (compara `versao`); se sim, invalida `INPUT_DADOS_KEY` em background e avisa via `toast.info`. |

## Pontos de atenção

- **Polling descentralizado.** Operação usa `refetchInterval` do React
  Query; logs ao vivo e staleness do Input ainda usam timers próprios.
  Uma migração para WebSocket ou SSE continuaria exigindo mudanças em
  mais de uma feature.
- **Regra de desarquivar duplicada em dois lugares.** A sequência
  `definir_sap(SAP_PENDENTE)` + `desarquivar()` aparece em
  `jobs._executar_geracao` e em `routes.regerar`. Uma mudança na regra
  precisa ser aplicada nos dois pontos manualmente.
- **Duas fontes de "a base mudou".** A staleness do Input é detectada
  por polling client-side comparando `versao`
  (`use-input-data.ts`), enquanto a sincronização em si roda
  server-side via subprocesso RPA sem callback — o frontend não sabe
  quando a extração terminou, só infere pela mudança de timestamp na
  próxima consulta do polling de 60s.
- **`window.alert` como aviso de pop-up bloqueado.** `openCoffee`
  (`frontend/src/api.ts:10-22`) usa `window.alert` nativo para avisar
  sobre o escalonamento de abas, destoando do restante da aplicação
  que usa `sonner` (`toast`) para feedback.
