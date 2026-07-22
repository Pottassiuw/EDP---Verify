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
  `docs/dev/databricks-schema-discovery.md`.

## Segurança

`backend/.env` NUNCA é versionado (`.gitignore`). Databricks é **somente
leitura** nesta fase. Token de acesso deve ser rotacionado periodicamente.

## Testes

`backend/test_databricks_module.py` — offline, conexão mockada/injetada.
Rodar: `venv/Scripts/python -m pytest test_databricks_module.py -v`.

## Limitações conhecidas (a refinar na Fase 1)

- Retentativa hoje repete qualquer exceção; refinar para não repetir erros
  não transitórios (ex.: autenticação) quando os tipos reais forem conhecidos.
- Paginação de introspecção usa `LIMIT`; para leitura em massa (sync da
  carteira) o `carteira_module` fará chunking próprio.

## Mapa de colunas da base COFFEE → domínio da aplicação

Preencher a partir de `databricks-schema-discovery.md`; decidir com a engenharia.
Ação: **incorporar** (vira coluna de `nota_carteira`) · **ignorar** ·
**enriquecer** (leva também para Input/COFFEE/Relatórios).

| Origem (Databricks) | Tipo | Significado | Equivalente atual | Ação | Observação |
|---|---|---|---|---|---|
| numero_nota (ex.) | ? | nº SAP da nota | notas.Numero_Nota | incorporar (chave natural) | confirmar unicidade |
| conjunto (ex.) | ? | rubrica/plano | Conjunto (ausente no Input) | enriquecer | pedido explícito da engenharia |
| equipamento (ex.) | ? | tipo do ativo | — (novo) | incorporar | dimensão de dashboard |
| regional (ex.) | ? | regional CSD | Regional | incorporar | conferir de-para |
| (coluna de atualização) | ? | última alteração | — | avaliar | viabiliza sync incremental |
