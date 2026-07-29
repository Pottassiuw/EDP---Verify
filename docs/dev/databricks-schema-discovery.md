# Descoberta de Schema — Base COFFEE (Databricks)

Data: 2026-07-22 · Gerado na Fase 0 da Carteira de Notas.
Fonte: `sandbox_uc` (catálogo confirmado com o usuário).

> Este documento contém **apenas** esquema (colunas/tipos) e agregados
> (contagens, distribuições). **Nenhuma amostra de linha** é versionada,
> porque a base tem colunas de PII (`matriculaSAP`, `nomeColaborador`,
> `colaborador`, `Solicitante`). Para inspeção ad-hoc use
> `backend/discover_databricks.py` (não commitar a saída com PII).

## Decisão de arquitetura

**Tabela-base da Carteira: `sandbox_uc.ddpm.coffee_onr_es_sp`** (a espinha).
É a "base COFFEE" literal (export do app COFFEE de campo). A Fase 1
sincroniza só ela, **filtrando `CSD` para as regionais de SP**.
Enriquecimento via `notas_sp` (join por `ID_ONR`) fica para fase posterior.

## Tabelas relevantes em `sandbox_uc.ddpm`

| Tabela | Linhas | Colunas | Papel |
|---|---|---|---|
| `coffee_onr_es_sp` | 280.834 | 52 | **base da carteira** (app COFFEE; ES+SP) |
| `notas_sp` | 235.611 | 76 | extração SAP mestre (só SP) — enriquecimento futuro via `ID_ONR` |
| `notas_es` | 270.387 | 77 | idem para ES — fora de escopo (app é SP) |
| `hierarquia_sp`, `indicadores_full_sp`, `disp_dados_gerais_sp`, `localizacoes_falta_sp` | — | — | candidatas a enriquecimento futuro |

## `coffee_onr_es_sp` — distribuições (agregados)

**Por CSD (regional).** Subset SP ≈ **98.051** linhas:

| Regional (CSD) | Linhas | Estado |
|---|---|---|
| GUARATINGUETÁ | 27.516 | SP |
| SÃO JOSÉ DOS CAMPOS | 21.226 | SP |
| GUARULHOS | 15.926 | SP |
| SUZANO | 15.068 | SP |
| MOGI DAS CRUZES | 10.255 | SP |
| LITORAL | 8.060 | SP |
| CENTRO / CACHOEIRO / ITARANA / GUARAPARI / LINHARES / NOVA VENÉCIA | 182.267 | ES (fora de escopo) |
| (nulo) | 516 | — |

**Por `Status_SAP`:** `NaN` 142.205 · Encerrado 72.691 · Pendente 60.056 ·
Cancelado 5.882. (Status é esparso — a maioria sem valor.)

**Por `id_sap`:** real 249.840 · **pendente `10000000` 30.206** · vazio 788.

## `coffee_onr_es_sp` — colunas (52) e mapa para o domínio

Ação: **incorporar** (vira coluna de `nota_carteira`) · **ignorar** ·
**enriquecer** (levar também a Input/COFFEE/Relatórios) · **PII** (tratar
com cuidado / não expor por padrão). A decisão final é **revisada com a
engenharia** — este é o gate da Fase 1.

| Coluna | Tipo | Significado provável | Ação proposta |
|---|---|---|---|
| `id_sap` | string | nº SAP da nota (sentinela `10000000` = pendente) | **incorporar** — chave natural (string!) |
| `id_onr` | bigint | id do app COFFEE (ONR) | **incorporar** — chave alternativa p/ nota sem SAP real; join com `notas_sp.ID_ONR` |
| `conjunto` | string | rubrica/plano (pedido da engenharia) | **incorporar + enriquecer** (Input não tem) |
| `descrição_conjunto` | string | nome do conjunto | **incorporar** |
| `CSD` | string | regional | **incorporar** — filtro SP + de-para de nome (ver abaixo) |
| `REGIAO` | string | região | avaliar (redundante com CSD?) |
| `quantidade` | bigint | quantidade (DDPM?) | **incorporar** — confirmar unidade com engenharia |
| `prioridade` / `Prioridade_SAP` | string / bigint | prioridade | **incorporar** |
| `Status_SAP` | string | status SAP (esparso) | **incorporar** — base da situação |
| `Data_encerramento_exec` | date | data de execução/encerramento | **incorporar** — situação `executada` + evolução mensal |
| `Atualizacao` | string | última atualização | **incorporar** — watermark p/ sync incremental (validar formato) |
| `local_instalacao` | string | local de instalação | **incorporar** |
| `alimentador` | string | alimentador/circuito | **incorporar** |
| `CJ_SIGLA`/`CJ_NOME`/`CJ_SIT` | string | conjunto (sigla/nome/situação) | avaliar vs `conjunto` |
| `SE_SIGLA`/`SE_NOME` | string | subestação | avaliar (enriquecer?) |
| `SUPERVISAO` | string | supervisão | avaliar |
| `EMPRESA` | string | empresa (EDP SP/ES) | **incorporar** (filtro) |
| `latitude`/`longitude`/`precisao` | string/double | coordenadas | **incorporar** (mapa futuro) |
| `sintoma` | string | sintoma da nota | incorporar |
| `componente_novo`/`kit`/`n_trafo`/`dispositivo_protecao`/`postes`/`data_fabricacao_poste` | string | equipamento (espalhado) | **avaliar** — dimensão "equipamento" mais limpa em `notas_sp` (`GRUPO_COMPONENTE`/`COMPONENTE`) |
| `Priorizacao`/`Cluster_Priorizacao`/`CONJUNTO_VIOLADO`/`CONJUNTO_ACC`/`CIRCUITO_VIOLADO`/`DEC_FEC_Conjunto`/`DEC_FEC_Circuito`/`Tronco` | int/string | priorização e indicadores de continuidade | avaliar (dashboards avançados) |
| `executor` | string | executor | incorporar |
| `referencia_eletrica`/`referencia_fisica` | string | referências | avaliar |
| `NUMERO` | int | número (sequencial?) | avaliar |
| `clientesbloco` | double | clientes no bloco | avaliar |
| `recebido`/`data`/`observacoes`/`sintoma`/`pagina_croqui` | string | metadados operacionais | avaliar |
| `colaborador` / `matriculaSAP` / `nomeColaborador` / `Solicitante` | string | **PII** (identifica pessoas) | **PII** — não expor por padrão; avaliar necessidade real |

### De-para de regional (CSD) — base → app

A base usa nomes que diferem dos do app/Relatórios. Necessário um de-para na
normalização (`mapping.py`):

| CSD na base | Regional no app |
|---|---|
| LITORAL | Litoral Norte |
| SUZANO | Poá-Suzano |
| GUARATINGUETÁ / GUARULHOS / MOGI DAS CRUZES / SÃO JOSÉ DOS CAMPOS | (iguais) |

## Achados que moldam a Fase 1

1. **Volume:** subset SP ≈ 98k linhas — projeção SQLite tranquila.
2. **Chave natural:** `id_sap` é **string** (o plano assumia numérico) e tem
   sentinela `10000000` (pendente, 30.206 notas) + 788 vazios → usar `id_onr`
   como chave alternativa para nota sem SAP real (não-movível ao plano).
3. **Incremental por-linha NÃO é viável em `coffee_onr_es_sp`:** `Atualizacao`
   tem **valor único para todas as linhas** (`22-07-2026 07:33`, formato
   `dd-MM-yyyy HH:mm`) — é o carimbo de refresh do ETL da tabela inteira, não
   um timestamp por-nota. Estratégia: **sync sempre completo** (reconcilia todo
   o subset SP), usando `Atualizacao` como **sinal de skip** (1 query de 1
   célula: se não mudou desde o último sync, pula). `notas_sp.DATE_LOAD` pode
   ser por-linha — verificar quando/se o enriquecimento entrar.
4. **Situação:** `Status_SAP` é esparso (142k nulos) → derivar situação
   combinando `Status_SAP` + `Data_encerramento_exec` + presença no plano.
   `Data_encerramento_exec` preenchida em ~28% (só executadas; 2024→2026).
   `quantidade`: 0–9999 (9999 provável sentinela "sem valor"), média ~22.
5. **PII:** colaborador/matrícula/solicitante — a projeção deve isolar/omitir
   por padrão; nunca versionar amostras.
6. **Encoding:** dados UTF-8 íntegros no Python; o mojibake visto no console é
   só limitação de terminal Windows (usar `PYTHONIOENCODING=utf-8` para exibir).
7. **De-para de regional** obrigatório (LITORAL→Litoral Norte, SUZANO→Poá-Suzano).
