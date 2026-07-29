# Carteira de Notas — Fase 4b (Enriquecimento Input/COFFEE com Databricks) — Spec

Data: 2026-07-29
Status: aprovado para planejamento (decisões confirmadas em 2026-07-29)
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

## 2. Decisões confirmadas

| Decisão | Escolha |
|---|---|
| Chave do join | Input usa `Numero_Nota` e COFFEE usa `coffee.id_sap`; ambos consultam `nota_carteira.id_sap`, exclusivamente com `sap_real=1`. Não será criada ponte por `id_onr`. |
| Campos read-only | `descricao_conjunto` (rubrica), `conjunto`, `sintoma`, `componente_novo`, `kit`, `n_trafo`, `dispositivo_protecao`, `status_sap` e `prioridade_sap`. |
| `notas_sp` | **Fora da 4b.** A fase usa somente o que `nota_carteira` já projeta; o novo pull e a decisão de PII ficam isolados em uma futura 4b-2. |
| Onde aparece | Somente nos detalhes do Input e do COFFEE, no card read-only "Dados da base COFFEE". Nenhum campo de enriquecimento entra nas grids. |
| Composição visual | Card hierárquico: rubrica em destaque, conjunto abaixo, estado da base e grade responsiva com os demais campos. |
| Estados indisponíveis | Distinguir sem correspondência, tombstone e base nunca sincronizada; tombstone preserva os últimos dados com aviso e data. |
| Sentido da integração | Somente leitura. Nenhum campo será copiado para `notas` do Input ou para o banco do COFFEE. |
| Estratégia de entrega | Concluir 4b-backend e 4b-frontend antes de iniciar a fundação visual 4c. |

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
- Backend (carteira_module): `GET /api/carteira/notas/por-sap/{numero}` →
  devolve o estado do enriquecimento e, quando existente, as colunas do §2.
- Frontend: bloco read-only "Dados da base COFFEE" no detalhe da nota do
  **Input** e no `CoffeeNotaInspector`, carregado sob demanda (React Query,
  `staleTime` alto — o dado muda somente durante a sincronização da Carteira).
- O Input ainda não possui inspector de nota. A 4b cria um
  `InputNotaInspector` em Sheet, aberto por um botão acessível numa coluna
  utilitária estreita da grade da Visão Geral. A coluna contém apenas a ação
  "Abrir detalhes"; nenhum dado enriquecido entra na tabela. O clique na linha
  inteira não será capturado, preservando a seleção estilo planilha. O Sheet
  apresenta primeiro um resumo dos campos que já existem em `NotaInput` e,
  abaixo, o card de enriquecimento.
- Degradação explícita para sem correspondência, tombstone, base não
  sincronizada e erro real.

**NÃO entra:**
- `notas_sp` (pull novo do Databricks) — fatia 4b-2, exige decidir colunas
  PII (Solicitante etc. **nunca** projetadas) e novo mapeamento.
- Persistir/copiar colunas em `notas` do Input (é a movimentação, não 4b).
- Colunas de enriquecimento nas grids do Input ou do COFFEE.

## 5. Arquitetura

- **Repositório:** adicionar `obter_por_id_sap(conn, numero) -> dict|None`,
  sempre filtrando `sap_real=1`. Se `id_sap` estiver duplicado, usar
  `ORDER BY sincronizado_em DESC, id_onr ASC LIMIT 1`: projeção mais recente,
  com desempate estável.
- **Service:** distinguir a Carteira nunca sincronizada de uma busca válida
  sem correspondência e mapear o resultado para o contrato público.
- **Endpoint fino:** validar → chamar o service → responder. Ausência esperada
  retorna `200`, não `404`; falha real de leitura continua sendo erro. ETag usa
  a `versao` da Carteira e aceita `304`.
- **Frontend:** `useCarteiraEnriquecimento(numeroSap)` e
  `CarteiraEnriquecimentoCard` pertencem à feature Carteira. Input e COFFEE
  consomem essa fronteira; não duplicam hook nem apresentação.
- **Carregamento:** a query só é habilitada quando o detalhe está aberto e há
  número SAP válido. O skeleton fica dentro do card e não bloqueia o restante
  do inspector.

### 5.1 Contrato do endpoint

```json
{
  "numero_sap": 12345678,
  "estado": "encontrada",
  "dados": {
    "descricao_conjunto": "Poda de vegetação",
    "conjunto": "SJC-04",
    "sintoma": "Galho na rede",
    "componente_novo": "Rede primária",
    "kit": "KIT-PODA-03",
    "n_trafo": "TR-4481",
    "dispositivo_protecao": "Religador R-12",
    "status_sap": "Liberada",
    "prioridade_sap": 1
  },
  "ausente_na_origem_em": null,
  "versao": "..."
}
```

`estado` admite `encontrada`, `ausente_na_origem`, `sem_correspondencia` e
`base_nao_sincronizada`. `dados` é `null` nos dois últimos estados.

## 6. Edge cases → estratégia

| Caso | Estratégia |
|---|---|
| Nota sem SAP real ou sem registro correspondente | card neutro "Sem correspondência na base COFFEE"; não é erro |
| `id_sap` duplicado na base | projeção com `sincronizado_em` mais recente; `id_onr` crescente desempata |
| Nota ausente da base (tombstone) | mostrar a última projeção + aviso âmbar "Ausente na origem desde X" |
| Carteira nunca sincronizada | card "Base não sincronizada" com link para Carteira → Sincronização |
| Erro real de leitura | alerta claro dentro do card + ação "Tentar novamente" |
| PII | as colunas do §2 **não** incluem matriculaSAP/nomeColaborador/colaborador/Solicitante — manter assim |

## 7. Impacto nos módulos

| Módulo | Mudança |
|---|---|
| `carteira_module` | `repository.obter_por_id_sap`, service de estado e endpoint de enriquecimento |
| `input_module` | **nenhuma** no backend; frontend ganha `InputNotaInspector` e a ação acessível na grade |
| `coffee_module` | **nenhuma** no backend; `CoffeeNotaInspector` ganha o card usando `coffee.id_sap` |
| `features/carteira` | API, hook, tipos e card read-only reutilizável |
| Docs | `docs/dev/10-backend-carteira-module.md` (endpoint), `03-frontend-input.md`, `02-frontend-coffee.md` |

## 8. Divisão em planos

- **4b-backend:** `repository.obter_por_id_sap`, endpoint, testes.
- **4b-frontend:** API/hook/card; novo inspector do Input; integração no
  inspector do COFFEE; validação visual; docs.
- **4b-2 (futuro):** `notas_sp` via Databricks (novo mapping + decisão PII).

Os dois planos são sequenciais: backend antes de frontend. A 4c só começa
depois de ambos concluídos e validados.

## 9. Critérios de aceite

- Detalhes do Input e do COFFEE com SAP real mostram os nove campos aprovados
  no card hierárquico.
- A grade do Input mantém a interação de planilha e ganha somente uma ação
  acessível para abrir o inspector; nenhum campo enriquecido vira coluna.
- Sem correspondência, tombstone e base não sincronizada têm apresentações
  distintas; apenas falha real oferece retry.
- Nenhuma coluna PII exposta; `input_module` intocado no backend; boundary
  preservado.
- Testes backend cobrem filtro `sap_real`, duplicata, tombstone, base vazia,
  contrato e ETag. Testes frontend cobrem os quatro estados, retry,
  carregamento sob demanda e integração nos dois inspectors.
- Suíte backend, build e vitest verdes; docs 02/03/10 atualizados na mesma
  entrega.

## 10. Riscos

- **Join por `id_sap`** depende de SAP real — cobre só parte da base (30,2k
  pendentes com sentinela + 788 vazios ficam de fora). Aceitável (o valor
  está nas notas já com SAP); comunicar o limite na UI.
- **notas_sp** traz PII e novo custo de Databricks — por isso isolado em 4b-2.
