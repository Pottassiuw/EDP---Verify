# COFFEE — Fluxo de transição de status das notas

## Status
`nao_gerada` → `pendente` → `gerada` (avulsa) **ou** `pendente` → `corrigida` → `gerada` (erro/Verificar).

## Regra de geração (2026-07-06)
O COFFEE **só gera notas desarquivadas**: ele atribui o SAP real e **arquiva
sozinho** ao concluir. Logo, forçar a geração (`POST /regerar` e o lote em
`jobs._rodar_geracao`) sempre faz `definir_sap(id, 10000000)` **e**
`desarquivar(id)` — a nota tem que sair desarquivada do nosso fluxo.
Exceções (não re-gera): SAP real **não arquivada** (transiente, só sai da
fila) e SAP real **arquivada** no lote (já gerada — pulada; o `regerar`
unitário, por ser pedido explícito, volta ao placeholder e desarquiva).
Nota arquivada **sem SAP** não é pulada: entra no caminho de força.
Tanto o lote quanto o `regerar` unitário marcam `origem='avulsa'` quando a
nota ainda não tem origem.

## Regra de classificação (`classify.classificar`)
- `id_sap` vazio/0 → `nao_gerada`.
- `id_sap == SAP_PENDENTE (10000000)` → `pendente`.
- `id_sap_anterior == SAP_PENDENTE` e `id_sap` real:
  - origem `avulsa` → `gerada`;
  - origem desconhecida (veio da Verificar com erro) → `corrigida`.
- caso contrário → `gerada`.

## Como os dois caminhos são distinguidos
A geração avulsa (`jobs._rodar_geracao`) marca `origem='avulsa'`. Notas que
entram pendentes por outro caminho (correção de erro na Verificar) ficam sem
origem e, ao receberem SAP real, classificam como `corrigida`.

## Nota 356322 (diagnóstico)
A nota 356322 recebeu SAP real (`id_sap=17259425`) após ser gerada avulsamente
pelo usuário via regerar na UI (`id_sap_anterior=10000000` = SAP_PENDENTE). Como
o campo `origem` não existia no momento da re-busca, `classificar` não tinha como
distinguir a geração avulsa de uma correção de erro, e rotulou a nota
`classificacao="corrigida"` em vez de `"gerada"`. A nota ficou com
`arquivado=true`. A causa raiz não é falta de re-busca (o SAP real foi buscado e
persistido corretamente), mas sim a ausência de contexto de origem na transição
`pendente → SAP real`. A correção (Task 3b) introduz o campo `origem` na tabela
`notas_coffee` e faz `_rodar_geracao` marcar `origem='avulsa'` antes do upsert,
de modo que notas geradas avulsamente passam a classificar como `"gerada"`.
