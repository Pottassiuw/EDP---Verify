# Carteira de Notas — Fase 4d (Reavaliação de Storage) — Spec de decisão

Data: 2026-07-29
Status: **gate de decisão, não compromisso de build** — o design-mestre
condiciona esta fase a "SE volume/uso crescer". Sem gatilho medido, a
recomendação é **não migrar agora**.
Base: design geral (`2026-07-22-carteira-de-notas-design.md`, §9 Cache/perf,
§12 Fase 4, §13 Riscos).

Quarta fatia da Convergência: avaliar migrar a projeção da carteira de
SQLite (`carteira.db`) para Postgres. Esta spec **não** projeta a migração —
define os **gatilhos** que a justificariam e o que medir antes.

---

## 1. Contexto

A projeção hoje é SQLite (`backend/data/carteira.db`, ~98k linhas SP,
índices em regional/conjunto/etc.). O design (§9) já afirma: "LIMIT/OFFSET
suficiente até ~500k com índices; keyset como evolução se precisar". A
Fase 1 validou sync de 98k em ~52s e leitura paginada fluida. **Não há
gargalo medido.**

## 2. Recomendação

**Não migrar para Postgres agora.** Migrar storage sem gatilho é otimização
prematura (CLAUDE.md: "Never abstract for hypothetical future use";
"Prefira menos dependências"). SQLite + índices atende o volume atual e o
projetado (~500k) com folga. Postgres adiciona: operação (um serviço a
subir/manter), deploy, backup, e uma dependência de infra que o resto do
app (Input/COFFEE em SQLite) não tem.

## 3. Gatilhos que reabririam a decisão (medir, não supor)

Migrar só se **algum** for observado e persistente:

| Gatilho | Métrica / limiar sugerido |
|---|---|
| Volume | projeção estável **> ~1M linhas** (2× o teto do design) e paginação LIMIT/OFFSET degradando (p95 de página > ~1s) |
| Concorrência de escrita | mais de um sync/escrita simultâneos travando por lock do SQLite (hoje single-flight resolve) |
| Multi-instância | necessidade de mais de um processo backend compartilhando a projeção (SQLite file-lock não serve) |
| Consultas analíticas pesadas | dashboards exigindo agregações que o SQLite não sustenta no TTL de cache |
| Requisito de infra | política que exija banco gerenciado/central |

## 4. Antes de migrar (evoluções mais baratas primeiro)

Escadinha de custo — esgotar antes de trocar de banco:
1. **Keyset pagination** (já previsto no design §9) no lugar de LIMIT/OFFSET
   — resolve o gargalo de paginação profunda sem trocar storage.
2. **Índices/`ANALYZE`/`VACUUM`** afinados por perfil de query real.
3. **Cache de agregação** por `versao` (já existe) — ampliar TTL/escopo.
4. **WAL mode** no SQLite — melhora concorrência leitura/escrita.

Só depois, se os gatilhos persistirem: Postgres.

## 5. Se/quando migrar — esboço (não implementar ainda)

- `carteira_module.db`/`repository` já isolam o SQL num único lugar (CLAUDE.md
  "SQL separado das regras") → o ponto de troca é contido.
- Manter a **projeção como conceito** (Databricks segue source of truth,
  read-only); muda só o motor local.
- Reusar o padrão de `versao`/ETag/single-flight — independem do motor.
- Migração de dados: re-sync completo do Databricks recria a projeção do
  zero (idempotente por construção) — não há dado "de origem" a migrar,
  simplifica o corte.

## 6. Critérios de aceite (desta spec)

- Decisão registrada: **não migrar sem gatilho**; escadinha de evolução
  barata documentada.
- Gatilhos e métricas definidos para revisão futura.
- Nenhuma implementação nesta fatia.

## 7. Próximo passo

Instrumentar o básico (tempo de sync, p95 de página, tamanho da projeção)
para ter dado real quando/se a pergunta voltar. Sem isso, qualquer decisão
de storage é chute.
