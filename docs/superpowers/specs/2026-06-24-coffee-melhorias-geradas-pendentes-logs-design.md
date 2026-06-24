# COFFEE — Melhorias em Geradas, Pendentes e Logs

**Data:** 2026-06-24  
**Status:** Aprovado

## Contexto

O sistema COFFEE tem problemas em três áreas:
1. A página "Gerar" mostra apenas notas com `classificacao=gerada`, excluindo `corrigida` (que também foi gerada no SAP).
2. Não existe ação de remover/arquivar notas em "Notas Geradas" nem em "Pendentes".
3. Os Logs têm formatação ruim (JSON cru) e faltam filtros por usuário e granularidade por nota.

## 1. Unificar "Notas Geradas" (gerada + corrigida)

- A seção "Notas Geradas" na página Gerar passa a incluir notas com `classificacao IN ('gerada', 'corrigida')`.
- Backend: `GET /api/coffee/notas?status=gerada` retorna ambas classificações.
- Frontend: tag de status diferencia visualmente (verde=gerada, azul=corrigida).
- O contador reflete a soma: "Notas Geradas — N notas".
- A aba "Corrigidas" continua existindo separada para quem quer ver apenas corrigidas.

## 2. Ação de Arquivar em Geradas e Pendentes

### Novo endpoint
- `POST /api/coffee/arquivar` — recebe `{pk: number, justificativa: string}`.
- Marca `arquivado=1` na nota.
- Registra log: `tipo="acao_usuario"`, `acao="arquivar"`, detalhes incluem justificativa.

### Frontend
- **Notas Geradas**: botão "Arquivar" nas ações de cada linha. Abre `ConfirmModal` com justificativa obrigatória, tom "danger".
- **Notas Pendentes**: botão "Arquivar" nas ações de cada linha. Mesma modal.
- Listagens filtram `WHERE arquivado=0` (ou `arquivado IS NULL`) por padrão. O campo `arquivado` já existe na tabela `notas_coffee`.

## 3. Logs — Filtros e Timeline

### Novos filtros
- **Filtro por usuário**: dropdown populado por `GET /api/coffee/logs/usuarios` (retorna `SELECT DISTINCT usuario FROM coffee_logs WHERE usuario IS NOT NULL`).
- Backend: `GET /api/coffee/logs` aceita novo parâmetro `?usuario=`.
- Filtro por nota PK já existe; torná-lo mais visível. Clicar no PK de uma linha de log preenche o filtro automaticamente.
- Todos os filtros combinam (AND).

### Layout Timeline
- Substituir tabela por lista vertical de cards com linha temporal à esquerda.
- Cada card mostra: timestamp relativo, tipo (tag colorida), ação, usuário, nota PK (clicável), status (sucesso/erro).
- Detalhes expandidos: formato estruturado (chave: valor) em vez de JSON cru.
  - Ex: "SAP anterior: 10000000 → SAP novo: 17251632"
  - Ex: "Tempo resposta: 340ms"
  - Ex: "Justificativa: teste removido"
- O `LogDrawer` (drawer lateral por nota) também adota o layout timeline.

## Escopo excluído

- Não inclui export de logs (CSV, etc.).
- Não inclui busca full-text em logs.
- Não altera a aba "Corrigidas" existente.
- Não inclui paginação de logs (mantém limite por dropdown).
