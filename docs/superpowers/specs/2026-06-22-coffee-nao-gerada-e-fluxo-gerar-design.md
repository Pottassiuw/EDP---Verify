# COFFEE — Status `nao_gerada` + correção do fluxo de geração

**Data:** 2026-06-22
**Status:** Design aprovado, aguardando revisão do spec antes do plano de implementação.

## Problema

O fluxo de "marcar para gerar / regerar" tem dois bugs acoplados, ambos com raiz no modelo de classificação herdado da fundação:

1. **Classificação errada.** A regra atual de `classify.py` é catch-all: qualquer nota com `id_sap != 10000000` cai em `gerada`. Logo, notas que **nunca foram geradas** (sem SAP) aparecem como `gerada`, quando deveriam estar num estado "precisa ser gerada".

2. **A ação de geração não gera.** A rota `/regerar` faz `desarquivar(id)` + `buscar_nota(id)` — nenhuma das duas escreve `id_sap`. Então marcar/regerar uma nota sem SAP não muda nada: ela continua com o mesmo status.

Ciclo de vida correto pretendido:

```
nao_gerada (sem SAP) → [gerar] → pendente (10000000) → [SAP corrigido] → corrigida → gerada
```

## Decisões de domínio (confirmadas)

- Uma nota **nunca gerada** tem `id_sap` **vazio/nulo/0** (ausente). Esse é o discriminador.
- **Gerar** uma nota = `desarquivar(id)` seguido de `arquivar(id, 10000000)`. Isso força o SAP placeholder `10000000`, tornando a nota **pendente**.
- **Gerar** e **regerar** são a mesma operação (rótulo muda conforme a nota já ter sido gerada antes ou não); ambas usam o fluxo acima.
- O placeholder é a constante `config.SAP_PENDENTE` (`10000000`) — usar a constante, nunca hardcode.
- O status terminal `gerada` (SAP real estável) permanece inalterado.

## Solução

### Modelo de classificação corrigido

`classify.py` ganha um caso novo no topo. `id_sap` falsy (`None`, `0`, `""`) → `nao_gerada`; o restante da cadeia é preservado.

| Status | Regra | Significado |
|---|---|---|
| **`nao_gerada`** *(novo)* | `id_sap` é `None`/`0`/vazio | Nunca gerada — precisa ser gerada |
| **`pendente`** | `id_sap == 10000000` | Gerada, aguardando SAP real |
| **`corrigida`** | `id_sap_anterior == 10000000` **e** `id_sap_atual != 10000000` | Transição detectada nesta busca |
| **`gerada`** | `id_sap_atual != 10000000` e não é a transição acima | Estado final |

Assinatura inalterada: `classificar(id_sap_atual, id_sap_anterior) -> str`. A função continua pura.

### Ação de geração corrigida

A rota `POST /api/coffee/regerar` passa de:

```
desarquivar(id) → buscar_nota(id) → upsert
```

para:

```
desarquivar(id) → arquivar(id, config.SAP_PENDENTE) → buscar_nota(id) → upsert
```

O `arquivar(id, 10000000)` é o passo que efetivamente escreve o SAP placeholder. Depois, `buscar_nota` + `upsert` re-buscam o estado e re-classificam a nota como **pendente**. A limpeza da flag `a_gerar` no sucesso (já existente) continua: a nota vira pendente e sai da seção "A gerar" naturalmente.

Tratamento de erro inalterado: qualquer exceção no fluxo loga `acao_usuario`/`regerar` com `sucesso=False` e propaga; o sucesso loga `sucesso=True`.

### Sem migração de banco

`classificacao` é um campo **derivado**, recalculado a cada `upsert_nota`/busca. Nenhuma migração de schema é necessária. Notas hoje marcadas `gerada` indevidamente (sem SAP) se corrigem na próxima busca/geração. Um reclassify em massa fica **fora de escopo** — as notas se re-classificam ao serem buscadas.

### Frontend

- `coffee-notas-table.tsx`: nova cor de tag `.cnt-tag.nao_gerada` (tom de atenção/neutro, distinto de pendente/corrigida/gerada). A coluna de status já renderiza `n.classificacao` dinamicamente, então o label "nao_gerada" aparece automaticamente — adicionar só o estilo da tag.
- A seção "A gerar" da aba Gerar (lista por flag `a_gerar`) passa a exibir a tag correta **Não gerada**; o botão Regerar agora gera de fato (nota → pendente, sai da lista).
- Sem mudança nos rótulos dos botões (Regerar/Gerar continuam apontando para `/regerar`).

## Testes

- **`classify.py`:**
  - Novo: `id_sap` `None` → `nao_gerada`; `0` → `nao_gerada`; `""` → `nao_gerada`.
  - Regressão: `10000000` → `pendente`; transição `10000000 → real` → `corrigida`; `real` estável → `gerada` continuam passando.
- **`routes.py` (`coffee_cliente`):**
  - `/regerar` chama `desarquivar(id)` **e** `arquivar(id, 10000000)`, nessa ordem (mock registra a sequência).
  - Após `/regerar` de uma nota sem SAP (mock de `buscar_nota` devolvendo `id_sap=10000000`), a nota fica `pendente` e a flag `a_gerar` é limpa.
- **`db.py`:** round-trip confirmando que uma nota com `id_sap=None` é classificada `nao_gerada` por `upsert_nota`.

## Critérios de aceite

- [ ] `classify.classificar(None, ...)` / `(0, ...)` / `("", ...)` retornam `"nao_gerada"`.
- [ ] `pendente`/`corrigida`/`gerada` continuam classificando como antes.
- [ ] `POST /regerar` executa `desarquivar` + `arquivar(id, 10000000)` + `buscar` + `upsert`, nessa ordem.
- [ ] Uma nota sem SAP, após `/regerar`, fica `pendente` e perde a flag `a_gerar`.
- [ ] A tabela de notas mostra a tag "Não gerada" com cor própria para `classificacao == "nao_gerada"`.
- [ ] `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q` verde.
- [ ] `cd frontend && npm run build` sem erros.

## Fora de escopo

- Reclassify em massa de notas já no banco (re-classificam ao serem buscadas).
- Renomear rótulos de botões (Regerar/Gerar) no frontend.
- Endpoint dedicado de geração (reaproveitamos `desarquivar` + `arquivar`).
- Aba/filtro dedicado para `nao_gerada` (elas aparecem via flag `a_gerar` na aba Gerar).
