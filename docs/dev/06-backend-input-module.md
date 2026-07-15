# Backend: input_module

## O que faz

`backend/input_module/` gerencia o cadastro de notas de engenharia
(DDPM) e as enriquece cruzando três extrações SAP (IW28 status/datas,
IW38 custo de ordens, IW66 medidas realizadas) com bases de apoio
(indicador de continuidade, clientes por conjunto, custos modulares,
sazonalidade, ganhos, históricos). O cadastro em si vive num SQLite
local; as bases de cruzamento também foram migradas para SQLite (ver
"Cache SQLite" abaixo). O resultado consolidado é exposto ao frontend
via `/api/input/*`.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `backend/input_module/engine.py` | Motor de enriquecimento: carrega o cadastro do SQLite e cruza com IW28/IW38/IW66 e as bases de apoio; auditoria de prazo (`avaliar_prazo_sap`); cache em memória com TTL. |
| `backend/input_module/db.py` | Persistência SQLite local: schema/migração do banco de notas, CRUD com diff/log/undo, backups rotativos, e o cache de bases externas (`salvar_base_dataframe`/`carregar_base_dataframe`). |
| `backend/input_module/iw28.py` | Contrato de leitura somente-consulta da `base_iw28` por número de nota (`obter_por_nota`, `extraida_em`), sem duplicar o SQL de `engine.py`. |
| `backend/input_module/service.py` | Caminho canônico de escrita (criação de notas + migração/init do banco), reusado por `routes.py` e por outros módulos que precisem escrever no Input (ex.: integração Coffee→Input). |
| `backend/input_module/routes.py` | Router FastAPI `/api/input/*`: leitura/escrita de notas, configuração (responsáveis, bases, backups), sincronização SAP, ramal e hierarquia. |
| `backend/input_module/config.py` | Dicionários de domínio (status, cidades, regionais, prioridades), caminhos de rede e locais, e as constantes de colunas/nomes do painel. |

## engine.py — cruzamento de bases

`enriquecer_dados()` (`engine.py:170`) é a função central: parte de
`carregar_dados()` (o cadastro em `notas`, via `db.py`) e vai
adicionando colunas em blocos sucessivos, cada um isolado em
`try/except` para não derrubar o restante do enriquecimento se uma base
faltar ou vier com formato inesperado:

- **Geográfico** — mapeia `Cidade`/`CJ_Aneel` a partir dos 3 primeiros
  caracteres de `Local_Instalacao`/`Circuito` (`config.DE_PARA_CIDADES`,
  `config.DE_PARA_CJ_ANEEL`).
- **Indicador de continuidade** (`db.carregar_base_dataframe("base_indicador_continuidade")`)
  — calcula `Conj.critico` (`regra_conjunto_critico`, `engine.py:78`) e
  `ranking` por conjunto, casando pela chave normalizada (maiúscula,
  sem acento) de `CJ_Aneel`.
- **IW28** (`db.carregar_base_dataframe("base_iw28")`) — chave `Nota` →
  `Numero_Nota`: preenche `Export_status` (status SAP da nota),
  `Centro_SAP`, `Ordem` (usada depois para casar com IW38) e
  `Encerram.por data`. `Status_Final` cai para `Status_Nota` local
  quando a nota está "Fora SAP".
- **Clientes por conjunto** (`db.carregar_base_dataframe("base_clientes")`)
  — `N_Clientes_Conjunto`, denominador de DEC/FEC.
- **IW38** (`db.carregar_base_dataframe("base_iw38")`) — chave `Ordem`
  (a mesma extraída do IW28): `Status_Usuário_Ordem`,
  `Status_Sistema`, `Total_planejado_ordem`, `Total_real_ordem`,
  `Exec_percentagem_ordem` e `Ordem_Executada` (via
  `config.MAP_ORDEM_EXECUTADA`).
- **Custo modular / sazonalidade** (`base_custo_modular`, `base_sazonal`)
  — multiplica custos unitários (`CHI`, `CI`, `Ocorrencia`,
  `DEC_PROG_CHI`) pelo volume planejado (`Planejado_DDPM`), chave
  `Conjunto`.
- **DEC/FEC** — calculado localmente (`CHI`/`N_Clientes_Conjunto`,
  `CI`/`N_Clientes_Conjunto`), sem base externa.
- **Ganhos** (`base_ganhos`) — chave composta `Conjunto + "_" + CJ_Aneel`
  para `CHI_Conj`.
- **Históricos 12M/3M** — descontinuado (fonte Table1 fora de uso);
  colunas `CI_12M`/`CHI_12M`/`OCO_12M`/`OCO_3M` seguem no schema,
  sempre `"-"`.
- **IW66** (`_ler_export_medidas()` → `db.carregar_base_dataframe("base_iw66")`)
  — agrupa medidas por `Nota`, classifica cada linha em metros ou
  unidades (`_classificar`, `engine.py:554`) e monta `Medida_SAP`
  (ex.: `"1.2 km / 3 un"`); `Medida_vs_Planejado`
  (`_comparar_medida_planejado`, `engine.py:35`) compara com
  `Planejado_DDPM`.
- **Auditoria de prazo** — `avaliar_prazo_sap` (`engine.py:88`) compara
  o mês/ano planejado (`Mes_Execucao_Planejado`) contra a data real de
  encerramento SAP (`Encerram.por data`), produzindo
  `Auditoria_Cronograma` (`🟢 Adiantado`, `🔵 No Prazo`, `🔴 Com Atraso`,
  etc.).

`get_dataset(forcar=False)` (`engine.py:622`) envelopa
`enriquecer_dados()` num cache em memória (TTL de 600s, protegido por
`threading.Lock`); `invalidar_cache()` é chamado após qualquer escrita
(ver `routes.py`).

## Cache SQLite (db.py)

`salvar_base_dataframe(nome_tabela, df)` e
`carregar_base_dataframe(nome_tabela)` (`db.py:722` e `db.py:734`)
substituem o que antes era leitura direta de Excel via
`pd.read_excel(config.CAMINHO_*)` a cada cruzamento em `engine.py`.
Essa mudança **não fez parte do plano do SP1** — veio de uma feature de
sincronização SAP construída separadamente pelo usuário (robô RPA que
extrai IW28/IW38/IW66 do SAP) e foi integrada a este código durante a
fase de merge do SP1 (commit `6a6ea7b Merge origin/develop (SAP sync
feature) into develop`). O upload manual de bases de apoio
(`routes.py`, `_processar_upload_base`) também grava no SQLite pelo
mesmo par de funções, então tanto a extração automática quanto o
upload manual convergem para a mesma origem de dados lida por
`engine.py`.

Cada base vira uma tabela própria (`base_iw28`, `base_iw38`,
`base_iw66`, `base_indicador_continuidade`, `base_clientes`,
`base_custo_modular`, `base_sazonal`, `base_ganhos`, `base_table1`),
sempre substituída por inteiro (`if_exists="replace"`) — não há
schema fixo por tabela: as colunas seguem exatamente o que veio do
Excel de origem, e `engine.py` lida com nomes de coluna variáveis
(ex.: fallback entre `DELTA_INDICADOR _12MM_CONJUNTO` com espaço e sem
espaço, `engine.py:194`). `carregar_base_dataframe` devolve `None` (não
levanta) se a tabela ainda não existir, o que `engine.py` trata como
"base pendente de extração".

O cadastro de notas (tabela `notas`, schema fixo — ver
`inicializar_banco()`, `db.py:46`) é uma persistência SQLite diferente
e mais antiga, não relacionada a essa migração: é o CRUD principal do
módulo (upsert, diff/log, undo, backups rotativos).

## Versão do dataset (`db.obter_versao_dataset`)

`obter_versao_dataset() -> str` (`db.py`) é uma versão barata do
dataset, montada sem tabela nova nem migração de schema — só compõe um
string a partir de colunas que já existem:

```
f"{max_alt}|{qtd_alt}|{max_arq}|{qtd_notas}"
```

onde `max_alt`/`qtd_alt` vêm de `MAX(Data_Hora)`/`COUNT(*)` em
`log_alteracoes`, `max_arq` de `MAX(Data_Hora)` em `log_arquivos`, e
`qtd_notas` de `COUNT(*)` em `notas`.

O que essa string cobre:

- **Edição/exclusão/undo** — qualquer escrita que passa por
  `log_alteracoes` (`aplicar_edicoes`, `deletar_notas`,
  `reverter_ultima_alteracao`) muda `max_alt`/`qtd_alt`.
- **Criação de nota** — `service.criar_notas` não grava em
  `log_alteracoes` (é um INSERT puro via `salvar_em_massa`), então é
  pega pelo `COUNT(*)` de `notas` (`qtd_notas`), não pelos logs.
- **Importação de base** (upload manual em `POST /bases/{nome}` e a
  sincronização SAP noturna, `_rotina_sap_background` em
  `routes.py`) — ambas chamam `db.salvar_log_arquivo(...)`, o que muda
  `max_arq`. Antes desta versão, o scheduler noturno **não** chamava
  `salvar_log_arquivo` — a extração SAP atualizava as tabelas
  `base_iw28`/`base_iw38`/`base_iw66` mas não deixava rastro em
  `log_arquivos`, então essa versão (e o cache/ETag que depende dela)
  não mudava depois de uma sincronização automática. `routes.py` agora
  grava um `salvar_log_arquivo` por arquivo gerado (`Gerada_base_IW28.XLSX`,
  `Gerada_custo_ord_IW38.XLSX`, `Gerada_medidas_IW66.XLSX`) logo após
  `_processar_upload_base`, antes de `engine.invalidar_cache()`.

Limitação conhecida: uma escrita direta no `.db` (fora do CRUD deste
módulo — ex.: script manual tocando `notas`/`log_*` no arquivo SQLite)
não passa por nenhuma dessas funções e não é detectada por
`obter_versao_dataset()`. O cache do `engine.py` (TTL de 600s) segue
como rede de segurança para esse caso.

É consumida pelo cache do `engine.py` e, futuramente, pelo `ETag` de
`GET /notas` (ver tarefas seguintes do plano de performance).

## iw28.py — contrato de leitura

`input_module/iw28.py` isola o acesso de leitura à tabela `base_iw28`
por número de nota, para que outros módulos não dupliquem o SQL de
`engine.py` nem precisem conhecer o schema flutuante da extração SAP:

- `obter_por_nota(numero) -> dict | None` — busca a linha da
  `base_iw28` para a nota (`CAST(Nota AS INTEGER) = ?`), convertendo
  `NaN` para `None` (JSON-safe). Degrada para `None` (não levanta) se a
  tabela não existir ou a coluna `Nota` tiver sido renomeada pelo
  robô — mesma postura defensiva de `carregar_base_dataframe`.
- `extraida_em() -> str | None` — data da última importação da IW28,
  lida de `log_arquivos` (`Nome_Arquivo LIKE '%IW28%'`); `None` se não
  houver registro ou a tabela de log estiver ausente.

Quem consome hoje: a integração Coffee→Input (nota gerada pelo Coffee
é revisada contra o status real da IW28 antes de virar registro no
Input). O contrato foi desenhado para ser extensível a enriquecimentos
futuros que precisem de uma única linha da IW28 sem montar o
`enriquecer_dados()` completo.

## service.py — caminho canônico de escrita

`input_module/service.py` concentra o caminho de escrita que antes
vivia dentro de `routes.py`, para que outros módulos (ex.: a
integração Coffee→Input) possam reusar exatamente a mesma lógica sem
importar internals de rotas:

- `garantir_banco() -> str` — roda a migração da rede
  (`db.migrar_da_rede_se_preciso()`) e `db.inicializar_banco()` uma
  única vez por processo (protegido por `threading.Lock`); retorna
  `"ja-existe"`, `"migrado"` ou `"rede-indisponivel"`. `resetar_migracao()`
  zera esse estado (usado por `POST /migrar`).
- `NovaNota` (Pydantic) — schema de uma nota nova, mesmos campos/defaults
  usados pelos endpoints `POST /notas` e `POST /notas/bulk`.
- `criar_notas(notas: list[NovaNota], usuario: str) -> int` — valida
  duplicatas (no lote e contra o banco), completa `Regional`
  (derivado de `Local_Instalacao[:3]` via `config.DE_PARA_REGIONAL`) e
  `ID_Cronologia`, grava via `db.salvar_em_massa()` e retorna a
  quantidade inserida. Levanta `NotasDuplicadasErro` em conflito.

`routes.py` apenas delega para essas funções e traduz
`NotasDuplicadasErro` em `HTTPException(409, ...)`.

## routes.py

Router `/api/input` (prefixo). Todo endpoint de leitura/escrita chama
`garantir_banco()` (`service.py`), que roda a migração da rede e
`db.inicializar_banco()` uma única vez por processo.

| Rota | O que faz |
|---|---|
| `GET /notas` | Lista o dataset enriquecido (`engine.get_dataset()`) + metadados (opções de status/prioridade, status das bases, última alteração, colunas do painel). |
| `GET /sync` | Retorna só `ultima_alteracao`, usado para polling leve. |
| `GET /logs`, `GET /logs/arquivos`, `GET /logs/nota/{numero}` | Log de alterações e de substituição de arquivos. |
| `PATCH /notas` | Edição parcial (`db.aplicar_edicoes`), com diff campo a campo e log; exige header `X-User`. |
| `POST /notas`, `POST /notas/bulk` | Criação de notas (unitária/lote), validando duplicatas contra o lote e contra o banco. |
| `DELETE /notas` | Exclusão em lote, com log de auditoria. |
| `POST /desfazer` | Reverte a última transação de edição (`db.reverter_ultima_alteracao`). |
| `POST /export` | Gera um `.xlsx` filtrado (linhas/colunas selecionadas) com nomes amigáveis. |
| `GET /responsaveis`, `PUT /responsaveis` | Mapa Regional → responsável (JSON local). |
| `GET /bases`, `GET /bases/{nome}/download`, `POST /bases/{nome}` | Lista/baixa/substitui as bases de apoio na rede (`config.BASES_APOIO`); todo upload dispara `_processar_upload_base` para gravar também no SQLite. |
| `POST /bases/sync-sap` | Dispara a extração SAP em background — é o que o botão **"Sincronizar SAP"** do frontend chama (`InputApi.syncSap()`, ver [`03-frontend-input.md`](03-frontend-input.md)). Roda `Sap_Robot.py` num subprocesso, depois importa os três Excel gerados (IW28/IW38/IW66) para o SQLite via `_processar_upload_base` e invalida o cache do engine. |
| `GET /backups`, `GET /backups/{nome}/download` | Lista/baixa backups rotativos do banco de notas. |
| `GET /ramal`, `POST /ramal/bulk`, `DELETE /ramal` | CRUD da tabela `notas_ramal` (obras de ramal, schema paralelo ao de `notas`). |
| `POST /hierarquia`, `GET /hierarquia/{numero_nota}` | Vínculo nota-mãe/nota-filha (`Nota_Mae`). |
| `POST /migrar` | Força nova tentativa de migração do banco a partir da rede. |

Toda escrita bem-sucedida chama `_pos_escrita()` (`routes.py:83`), que
invalida o cache do engine e agenda `engine.gerar_copia_excel_rede()`
em background para manter o Excel espelhado na rede atualizado.

## Pontos de atenção

- `input_module/routes.py:247-271` (`_rotina_sap_background`) — chama
  `Sap_Robot.py` via `subprocess.run` com caminho relativo construído a
  partir de `config.data_dir().parent.parent.parent`; qualquer mudança
  na estrutura de diretórios do backend quebra silenciosamente essa
  rota sem erro em tempo de import, só na primeira sincronização.
- `input_module/engine.py:449-450` e blocos irmãos — praticamente todo
  bloco de cruzamento em `enriquecer_dados()` usa `except Exception:
  print(...)`, sem re-lançar; uma base corrompida ou com coluna
  renomeada é silenciosamente ignorada (o dataset segue com valores
  padrão) e o único sinal é uma linha de log no console do processo.
- `input_module/db.py:722-742` — `salvar_base_dataframe`/
  `carregar_base_dataframe` não têm schema fixo nem validação de
  colunas; um Excel de origem com cabeçalho alterado grava sem erro e
  só quebra mais adiante, dentro de `engine.py`, quando a coluna
  esperada não é encontrada.
- `input_module/routes.py:268` — `from fastapi import Body` está no
  meio do arquivo (não no bloco de imports do topo), import solto
  antes de `sync_sap`.
- `input_module/engine.py:617-619` — `_CACHE_TTL_SEGUNDOS = 600` é um
  cache global em memória do processo (não por usuário/request); em
  múltiplos workers cada processo mantém sua própria cópia, podendo
  divergir por até 10 minutos entre eles.
- `input_module/db.py:298-302` (`proximo_id_cronologia`) —
  `pd.to_numeric(df["ID_Cronologia"], errors="coerce").max()` ignora em
  silêncio qualquer valor não numérico na coluna (vira `NaN`, excluído
  do `max()`); se essa linha ignorada tiver, na verdade, o maior
  `ID_Cronologia` do banco, o próximo ID calculado fica menor do que
  deveria e pode colidir com um `ID_Cronologia` já em uso.
