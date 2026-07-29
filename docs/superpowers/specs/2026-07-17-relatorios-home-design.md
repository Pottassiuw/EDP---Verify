# Relatórios — Dashboard do Plano de Recomposição como home

Data: 2026-07-17. Aprovado em brainstorm com o usuário nesta data.

## Contexto

O acompanhamento do Plano de Recomposição vive hoje no Excel
`Controle Plano de Recomposição 2026.xlsx` (OneDrive/SharePoint do time),
que puxa via Power Query os mesmos dados de notas que o app já possui em
SQLite (`notas` + `notas_ramal`) e cruza com metas mantidas manualmente na
aba `base`. Esta feature traz esse dashboard para dentro do EDP Verify como
uma nova seção **Relatórios**, que passa a ser a **home** do app.

Insight central: de tudo que a planilha mostra, a única informação que o
app não possui são as **metas** (Regional × Mês × Plano) e o de-para de
planos (unidade, área, custo modular). Carteira é derivável do banco local;
Executado é derivável do cruzamento IW28 que o engine já faz. O dashboard
é, portanto, 100% vivo — a planilha entra só como fonte das metas.

## Decisões de produto (fechadas com o usuário)

1. **Metas**: espelhadas da planilha para tabelas SQLite, com **sincronização
   automática** a partir do arquivo OneDrive local. A planilha continua sendo
   a fonte da verdade das metas (o time segue editando lá); **não há editor de
   metas no app** (morreu no brainstorm — seria redundância/conflito).
2. **Executado (regra)**: nota conta como executada quando
   `Status_Nota = 99` **ou** `Export_status = "ENCE EXEC"` (IW28), atribuída
   ao mês de `Encerram.por data`. Notas com `Ordem_Executada = "SIM"` que NÃO
   estejam em 99/ENCE EXEC são **suspeitas** → alimentam um relatório de
   inconsistências **futuro** (fora desta entrega; registrado aqui como
   evolução).
3. **Home**: mês corrente em destaque (hero), visão anual abaixo.
4. **Blocos**: hero do mês; tabela anual por plano agrupada Construção/CSD;
   mensalização (gráfico 12 meses); saldo por regional; visão financeira R$.
   Alertas de carteira ficaram fora da v1.
5. **Filtro global**: seletor de Regional no topo (default: SP — todas);
   troca todos os blocos.
6. **Fluxos**: linha de plano → Input filtrado por Conjunto+Regional; hero →
   Input filtrado pelo mês corrente; card "corrigidas fora do plano" →
   COFFEE · Corrigidas.
7. **SharePoint via URL/Graph API**: não. O canal é a pasta OneDrive
   sincronizada localmente.

## Arquitetura (abordagem A aprovada)

Agregação **no backend**, reusando fronteiras existentes:

- Dados e agregação de Relatórios moram no `input_module` (o domínio é 95%
  dele). Nenhum módulo backend novo.
- O único dado cruzado com o COFFEE (contador de corrigidas fora do plano)
  fica no `integracao_module`, que já é o compositor autorizado
  coffee+input.
- Frontend: feature nova `frontend/src/features/relatorios/`.

## Dados

Novas tabelas em `notas_departamento.db` (criadas em `inicializar_banco`,
populadas pela sincronização — nunca editadas à mão):

```sql
CREATE TABLE IF NOT EXISTS metas_plano (
    Ano       INTEGER NOT NULL,
    Mes       INTEGER NOT NULL,          -- 1..12
    Regional  TEXT    NOT NULL,
    Plano     TEXT    NOT NULL,          -- nome longo, ex. "POSTES - CAPEX"
    Meta      REAL    NOT NULL DEFAULT 0,
    PRIMARY KEY (Ano, Mes, Regional, Plano)
);

CREATE TABLE IF NOT EXISTS planos_depara (
    Plano          TEXT PRIMARY KEY,     -- nome longo (== Conjunto das notas)
    Nome_Curto     TEXT NOT NULL,        -- ex. "POSTE"
    Unidade        TEXT NOT NULL,        -- "Und." | "km" | "Ponto"
    Area           TEXT NOT NULL,        -- "Construção" | "CSD"
    Modular_RS     REAL NOT NULL DEFAULT 0,
    Ordem_Exibicao INTEGER NOT NULL DEFAULT 999
);
```

Origem na planilha:
- `metas_plano` ← aba `base` (colunas Regionais, Mês, Plano, Meta). Replace
  completo por Ano a cada sync.
- `planos_depara` ← aba `base` (Plano→Conjunto=nome curto, Unidade, Área) +
  aba `dexpara` (Modular R$). Área "Projeto" da planilha mapeia para
  "Construção" na exibição. Replace completo a cada sync.

RAMAL é um Plano como os outros (linha em `metas_plano`); sua carteira vem
de `notas_ramal`.

## Sincronização de metas (automática)

- `input_module/config.py`: `CAMINHO_CONTROLE_RECOMPOSICAO`, default
  `C:\Users\e713611\EDP\O365_Planejamento_Manutencao_EDP_Brasil - Documentos\PLANO RECOMPOSIÇÃO\SP\2026\Controle Plano de Recomposição 2026.xlsx`,
  sobrescritível por env `CONTROLE_RECOMPOSICAO_PATH` (o default é
  específico do perfil do usuário que hospeda o servidor hoje).
- Módulo novo `input_module/metas.py`:
  - `sincronizar_se_preciso() -> dict`: `os.stat` no arquivo (barato). Se o
    mtime for mais novo que o da última importação registrada, reimporta:
    **copia para temp** (contorna lock do Excel/OneDrive — problema real
    observado), lê `base`/`dexpara` com pandas, replace nas duas tabelas,
    registra em `log_arquivos` (nome do arquivo, usuário "metas-sync") — o
    que bumpa `obter_versao_dataset()` e invalida ETag do dashboard de graça.
  - Estado da última sync (mtime importado, timestamp, erro se houver) em
    tabela `metas_sync_estado` (1 linha, no mesmo notas_departamento.db) —
    sobrevive a restart e viaja junto no backup do banco.
  - Falha (arquivo ausente, lockado até na cópia, aba renomeada): mantém as
    metas da última importação bem-sucedida e devolve o erro no estado; o
    dashboard mostra "metas de DD/MM HH:mm" + aviso discreto. Nunca quebra a
    home.
- Gatilhos: chamada de `sincronizar_se_preciso()` no início do request do
  dashboard (mtime igual = no-op de microssegundos) + botão "Sincronizar
  agora" no card de status em Configurações.

## Backend

### `input_module/relatorios.py` (engine de agregação, funções puras)

Entradas: DataFrames que o módulo já produz (`engine.get_dataset()` para
notas enriquecidas, `db.carregar_dados_ramal()`), metas e de-para lidos das
tabelas. Saídas (todas por Regional-filtro opcional):

- **Carteira** por Plano×Mês: soma de `Planejado_DDPM` das notas cujo
  `Conjunto == Plano` e `Mes_Execucao_Planejado` no ano corrente; ramal soma
  em RAMAL. Nota com Conjunto sem correspondência em `planos_depara` cai no
  balde visível **"Outros"** (nunca somem silenciosamente).
- **Executado** por Plano×Mês: regra da decisão 2, mês de
  `Encerram.por data`.
- **Derivados**: Saldo = Carteira − Meta; %Disp = Carteira/Meta (null quando
  Meta = 0 — exibido como "—"); R$ = valor × `Modular_RS`.
- Estruturas prontas para os blocos: `hero_mes`, `visao_anual` (linhas por
  Plano com Área p/ agrupamento), `mensalizacao` (12×{meta, carteira,
  executado}), `regionais` (6×{meta, carteira, saldo, pct}).

### Endpoints

- `GET /api/input/relatorios/dashboard?regional=<opcional>` →
  `{hero_mes, visao_anual, mensalizacao, regionais, financeiro,
  metas_info: {atualizadas_em, arquivo_mtime, erro}}` com
  `ETag: W/"<versao_dataset>"` e 304 via `If-None-Match` (o sync de metas
  bumpa a versão, então edição na planilha invalida o cache
  automaticamente).
- `POST /api/input/metas/sincronizar` → força `sincronizar_se_preciso`
  (ignora mtime), retorna o estado. Usado pelo botão de Configurações.
- `GET /api/integracao/resumo-fora-do-plano` →
  `{corrigidas_fora_do_plano: N}`: notas do coffee.db com SAP real, não
  arquivadas localmente, cujo `id_sap` não existe em `notas`.

## Frontend

Feature nova `frontend/src/features/relatorios/` (React Query,
`['relatorios-dashboard', regional]`, staleTime 60s — o ETag barateia o
refetch). Layout aprovado:

```
┌─ Plano de Recomposição 2026 ── [Regional: SP (todas) ▾] ─────────────┐
│ HERO · MÊS CORRENTE                                                   │
│ [Meta mês] [Carteira mês] [Executado mês] [%Disp mês] [R$ carteira/   │
│                                                        R$ meta]      │
│ barra de progresso executado vs meta · "ver notas do mês" → Input    │
│ card: "N corrigidas no COFFEE fora do plano" → COFFEE·Corrigidas     │
├──────────────────────────────────────────────────────────────────────┤
│ VISÃO GERAL DO ANO (tabela)                                          │
│ grupo Construção ▸ linhas por plano · grupo CSD ▸ linhas por plano   │
│ colunas: U.M · Meta · Carteira · Saldo · %Disp (farol) · R$ gap      │
│ clique na linha → Input filtrado por Conjunto+Regional               │
├───────────────────────────────┬──────────────────────────────────────┤
│ MENSALIZAÇÃO — barras 12 meses│ SALDO POR REGIONAL — 6 cards com     │
│ Meta vs Carteira; Executado   │ %Disp + saldo, farol                 │
│ sobreposto nos meses passados │ verde/âmbar/vermelho                 │
└───────────────────────────────┴──────────────────────────────────────┘
```

- Farol de %Disp: verde ≥ 100%, âmbar 85–99%, vermelho < 85% (tokens
  `--green`/`--amber`/`--red` existentes).
- Gráfico de mensalização: SVG próprio com tokens do design system (sem lib
  de chart nova — regra de dependências do CLAUDE.md).
- Seletor de Regional: valores do banco (os 6 atuais) + "SP (todas)".
- Números: `toLocaleString('pt-BR')`; km com 1–2 casas, R$ compacto
  (ex. "R$ 1,2 mi").

## Navegação / App

- `AppSection` ganha `"relatorios"`; **default do App muda de "coffee" para
  "relatorios"** (home).
- Sidebar: item "Relatórios" no topo (sem sub-abas na v1).
- Fluxos: callbacks injetados pelo `AppContent` (mesmo padrão do
  `onIrParaInput` existente) levando filtros pré-aplicados; o
  `FiltersState` do Overview do Input já suporta Conjunto/Regional/Mês —
  o handoff define o estado inicial dos filtros ao navegar.
- `reports.tsx` atual (Auditoria de Prazos) permanece intocado como sub-aba
  do Input.

## Erros e degradação

- Planilha ausente/lockada/aba renomeada → última sync válida + aviso
  discreto com timestamp; home nunca quebra.
- Plano sem meta → Meta 0, %Disp "—".
- Conjunto de nota fora do de-para → balde "Outros" visível na tabela anual.
- Backend indisponível → mesmo padrão de erro das outras seções.

## Testes

- `relatorios.py` puro com fixtures (carteira por plano/mês, executado
  99/ENCE EXEC + mês do encerramento, km vs unidade, R$, balde Outros,
  meta 0).
- Import de metas com xlsx sintético (abas base/dexpara mínimas); replace
  correto; falha de leitura preserva estado anterior.
- ETag do dashboard muda após sync de metas e após escrita em notas.
- Endpoints via TestClient (dashboard com/sem regional, 304, sincronizar,
  resumo-fora-do-plano).
- Frontend: `npm run build`; verificação manual guiada (skill verify).

## Fora de escopo / evoluções registradas

- Relatório de notas suspeitas (ordem executada sem 99/ENCE EXEC) — decisão
  2; próxima entrega natural da seção Relatórios.
- Alertas de carteira (%Disp < 100 destacado como lista de ação).
- Postergadas (aba existe na planilha; sem uso na v1).
- Persistência IndexedDB do React Query (adiada desde a spec da
  integração).
- Leitura via SharePoint/Graph API.
