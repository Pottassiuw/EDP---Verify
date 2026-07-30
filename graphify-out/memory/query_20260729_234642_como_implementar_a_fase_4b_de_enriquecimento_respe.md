---
type: "query"
date: "2026-07-29T23:46:42.001621+00:00"
question: "Como implementar a Fase 4b de enriquecimento respeitando as fronteiras atuais da Carteira, Input e COFFEE?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["repository.py", "carteira_module/service.py", "carteira_module/routes.py", "carteira/api.ts", "CoffeeNotaInspector()"]
---

# Q: Como implementar a Fase 4b de enriquecimento respeitando as fronteiras atuais da Carteira, Input e COFFEE?

## Answer

Expanded from original query via graph vocab: [carteira, enriquecimento, coffee, input, sap, nota, inspector, repository, service, sync, frontend, backend]. O fluxo backend existente é repository.py -> service.py -> carteira_module/routes.py; a fronteira frontend é carteira/api.ts. CoffeeNotaInspector já é o ponto de detalhe do COFFEE, enquanto Overview e DataGrid são a composição atual do Input. O plano cria lookup e endpoint na Carteira, card/hook compartilhados, inspector próprio no Input e integração no CoffeeNotaInspector.

## Outcome

- Signal: useful

## Source Nodes

- repository.py
- carteira_module/service.py
- carteira_module/routes.py
- carteira/api.ts
- CoffeeNotaInspector()