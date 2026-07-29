# Carteira de Notas — Fase 4b (Enriquecimento Input/COFFEE com Databricks) — Spec

Data: 2026-07-29
Status: rascunho para brainstorm (decisões-chave marcadas "a confirmar")
Base: design geral (`2026-07-22-carteira-de-notas-design.md`, §11 Impacto,
§12 Fase 4) + projeção da carteira (Fase 1, `nota_carteira` em `carteira.db`)
+ discovery (`docs/dev/databricks-schema-discovery.md`).

Segunda fatia da Convergência: enriquecer as notas do **Input** e do
**COFFEE** com colunas que já vivem na projeção da carteira (base COFFEE do
Databricks), read-only — sem duplicar sync nem inverter dependência.

---

## 1. Problema

As notas do Input vêm de `notas_departamento.db` (rede) e carregam um
conjunto restrito de campos (`NoteRaw`: tipo, referência, setor, uf,
local_instalação, alimentador, colaborador, executor, lat/long, id_sap,
descrição, poste). Elas **não sabem** a que **Conjunto/rubrica** pertencem,
nem carregam sintoma/componente/kit/proteção — dados que a base COFFEE tem
e que a projeção da carteira **já materializa** em `nota_carteira`
(`carteira.db`).

O design-mestre (§11) já sinaliza a dívida: "Input (…) futuramente colunas
enriquecidas (Conjunto etc.)". O ganho: triagem (Verificar) e geração
(COFFEE) passam a ver a classificação real da nota sem consultar o
Databricks em runtime.

## 2. Decisões (a confirmar com o usuário)

| Decisão | Proposta (recomendada) | Alternativa |
|---|---|---|
| Chave do join Input↔carteira | `numero_nota` (SAP) quando `sap_real=1`; senão sem enriquecimento (nota do Input não tem `id_onr`). **A confirmar:** o Input tem como casar `id_onr`? Se não, só notas com SAP real enriquecem. | Materializar `id_onr` no Input via alguma ponte |
| Colunas a expor | `descricao_conjunto` (=Conjunto/rubrica), `conjunto`, `sintoma`, `componente_novo`, `kit`, `n_trafo`, `dispositivo_protecao`, `status_sap`, `prioridade_sap` | subconjunto menor (só Conjunto) |
| notas_sp (enriquecimento profundo) | **Fora do 4b** — 4b usa só o que `nota_carteira` já projeta; `notas_sp` (join `ID_ONR`, novo pull do Databricks) é fatia posterior (4b-2) | trazer `notas_sp` já no 4b |
| Onde aparece | Detalhe da nota (Input `revisar-nota-sheet` / COFFEE detalhe) como bloco read-only "Dados da base COFFEE"; **não** em colunas da tabela (evita poluir a grid) | coluna Conjunto na tabela do Input |
| Sentido | **Read-only display.** NÃO copiar os campos para dentro de `notas` do Input (isso é o que a movimentação mover-para-plano já faz, com `origem`). 4b é só leitura enriquecida. | persistir cópia (rejeitado: duplica estado, viola situação-derivada) |

## 3. Estado atual (dado real)

- `nota_carteira` (carteira.db, PK `id_onr`) já tem: `id_sap`, `sap_real`,
  `conjunto`, `descricao_conjunto`, `regional`, `csd_origem`, `empresa`,
  `quantidade`, `status_sap`, `prioridade`/`prioridade_sap`,
  `local_instalacao`, `alimentador`, `executor`, `sintoma`,
  `componente_novo`, `kit`, `n_trafo`, `dispositivo_protecao`, lat/long.
- Input `notas` casa por `Numero_Nota` (SAP). `carteira_module.service`
  já cruza os dois (`_numeros_no_plano`, `repository.listar` com o join
  `plano_atual`). O caminho de leitura carteira→input **existe**; falta o
  inverso (Input pedindo dados da carteira p/ uma nota).
- Boundary: `carteira_module` importa `input_module`, nunca o contrário.
  Logo o Input **não** pode importar `carteira_module`. O enriquecimento é
  exposto por um endpoint do **carteira_module** que o front do Input/COFFEE
  consome (mesma lógica da Fase 4a: quem faz o join é a carteira).

## 4. Escopo

**Entra:**
- Backend (carteira_module): `GET /api/carteira/notas/por-sap/{numero}` (ou
  reuso do `GET /notas/{id_onr}` existente + um lookup por `id_sap`) →
  devolve o bloco de enriquecimento de uma nota (as colunas do §2).
- Frontend: bloco read-only "Dados da base COFFEE" no detalhe da nota do
  **Input** (`revisar-nota-sheet`) e do **COFFEE** (detalhe), carregado
  sob demanda (React Query, staleTime alto — dado muda só no sync).
- Degradação: nota sem SAP real ou ausente da base ⇒ bloco mostra
  "sem correspondência na base COFFEE" (não erro).

**NÃO entra:**
- `notas_sp` (pull novo do Databricks) — fatia 4b-2, exige decidir colunas
  PII (Solicitante etc. **nunca** projetadas) e novo mapeamento.
- Persistir/copiar colunas em `notas` do Input (é a movimentação, não 4b).
- Coluna Conjunto na grid do Input (a confirmar; default é só no detalhe).

## 5. Arquitetura

- **Reuso:** `carteira_module.repository` já sabe ler `nota_carteira` +
  cruzar com o plano. Adicionar `obter_por_id_sap(conn, numero) -> dict|None`
  (lookup por `id_sap` com `sap_real=1`; se houver duplicata id_sap — sabido
  1.548 no subset SP — desempatar pelo mais recente, como o dedupe do sync).
- **Endpoint fino** no carteira_module (valida → service → responde), ETag
  por `versao` da carteira.
- **Frontend:** hook `useCarteiraEnriquecimento(numeroSap)` (carteira/api);
  o detalhe do Input/COFFEE o chama. Cross-feature: Input/COFFEE importam
  `CarteiraApi` (mesmo precedente da 4a).

## 6. Edge cases → estratégia

| Caso | Estratégia |
|---|---|
| Nota sem SAP real (`sap_real=0`) | sem join possível; bloco "sem correspondência" |
| `id_sap` duplicado na base | desempate determinístico (mais recente), como o dedupe do sync |
| Nota ausente da base (tombstone) | mostrar dado da última projeção + aviso "ausente na origem desde X" |
| Carteira nunca sincronizada | bloco "base não sincronizada" (link p/ Sincronização) |
| PII | as colunas do §2 **não** incluem matriculaSAP/nomeColaborador/colaborador/Solicitante — manter assim |

## 7. Impacto nos módulos

| Módulo | Mudança |
|---|---|
| `carteira_module` | `repository.obter_por_id_sap` + endpoint de enriquecimento |
| `input_module` | **nenhuma** no backend; front do detalhe ganha o bloco (consome CarteiraApi) |
| `coffee_module` | idem: detalhe ganha o bloco (opcional, se o COFFEE tiver detalhe de nota) |
| Docs | `docs/dev/10-backend-carteira-module.md` (endpoint), `03-frontend-input.md`, `02-frontend-coffee.md` |

## 8. Divisão em planos (quando greenlit)

- **4b-backend:** `repository.obter_por_id_sap`, endpoint, testes.
- **4b-frontend:** bloco read-only no detalhe do Input + COFFEE; hook;
  passe visual (skill frontend-design); docs.
- **4b-2 (futuro):** `notas_sp` via Databricks (novo mapping + decisão PII).

## 9. Critérios de aceite

- Detalhe de uma nota do Input com SAP real mostra Conjunto/rubrica +
  sintoma/componente/kit/proteção reais da base COFFEE.
- Nota sem SAP / ausente / base não sincronizada ⇒ mensagem honesta, sem erro.
- Nenhuma coluna PII exposta; `input_module` intocado no backend; boundary
  preservado.
- Testes backend do lookup verdes; build/vitest verdes; docs atualizados.

## 10. Riscos

- **Join por `id_sap`** depende de SAP real — cobre só parte da base (30,2k
  pendentes com sentinela + 788 vazios ficam de fora). Aceitável (o valor
  está nas notas já com SAP); comunicar o limite na UI.
- **notas_sp** traz PII e novo custo de Databricks — por isso isolado em 4b-2.
