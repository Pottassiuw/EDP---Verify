# Backend — databricks_module

Camada de integração genérica e reutilizável com o Databricks SQL Warehouse.
Sem conhecimento de domínio: qualquer módulo (carteira, relatórios, etc.)
usa `client.consultar` sem duplicar lógica de conexão.

## Componentes

- `config.py` — credenciais e parâmetros via `backend/.env` (python-dotenv).
  Variáveis: `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`,
  `DATABRICKS_TOKEN` (obrigatórias); `DATABRICKS_CATALOG`,
  `DATABRICKS_SCHEMA`, `DATABRICKS_TIMEOUT`, `DATABRICKS_MAX_TENTATIVAS`,
  `DATABRICKS_BACKOFF_BASE` (opcionais). Falha com mensagem clara se faltar.
- `client.py` — `consultar(sql, params) -> DataFrame`, único ponto que fala
  com o Databricks. Retentativas com backoff exponencial e logging por
  tentativa (logger `databricks`). Conexão injetável (`conectar=`) para teste.
- `schema.py` — introspecção: `listar_tabelas`, `descrever_tabela`,
  `amostrar`, `contar`, `detectar_coluna_atualizacao`. Identificadores
  validados (não são bind params).
- `discover_databricks.py` (script) — execução manual da descoberta; gera
  um relatório com esquema/amostras (não commitar saída com PII).

## Fonte confirmada (Fase 0)

- Catálogo: `sandbox_uc` · Schema: `ddpm`.
- **Tabela-base da Carteira: `coffee_onr_es_sp`** (espinha; filtrar `CSD`
  para SP). Enriquecimento futuro via `notas_sp` (join `ID_ONR`).
- Esquema real, distribuições e mapa de colunas:
  [`databricks-schema-discovery.md`](./databricks-schema-discovery.md).

## Segurança

`backend/.env` NUNCA é versionado (`.gitignore`). Databricks é **somente
leitura**. Token de acesso deve ser rotacionado periodicamente. A base tem
colunas de PII (`matriculaSAP`, `nomeColaborador`, `colaborador`,
`Solicitante`) — a projeção local deve isolá-las e nunca versionar amostras.

## Testes

`backend/test_databricks_module.py` — offline, conexão mockada/injetada.
Rodar: `venv/Scripts/python -m pytest test_databricks_module.py -v`.

## Limitações conhecidas (a refinar na Fase 1)

- Retentativa hoje repete qualquer exceção; refinar para não repetir erros
  não transitórios (ex.: autenticação) quando os tipos reais forem conhecidos.
- Paginação de introspecção usa `LIMIT`; para leitura em massa (sync da
  carteira) o `carteira_module` fará chunking próprio.

## Mapa de colunas da base COFFEE → domínio da aplicação

Preenchido com dados reais em
[`databricks-schema-discovery.md`](./databricks-schema-discovery.md)
(52 colunas de `coffee_onr_es_sp` + ação proposta por coluna + de-para de
regional). Falta a **revisão final com a engenharia** — gate da Fase 1.
