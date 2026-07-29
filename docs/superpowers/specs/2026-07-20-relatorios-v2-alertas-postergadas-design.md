# Relatórios v2 — Alertas de carteira e Postergadas

Data: 2026-07-20. Aprovado em brainstorm com o usuário nesta data.

Extensão da seção **Relatórios** (home), especificada em
[2026-07-17-relatorios-home-design.md](./2026-07-17-relatorios-home-design.md).
Duas evoluções registradas como "fora de escopo" naquela spec agora entram:
**alertas de carteira** (%Disp < 100 como lista de ação) e a aba
**Postergadas** da planilha de controle.

## Contexto

O dashboard do Plano de Recomposição já mostra, por plano, `meta`,
`carteira`, `saldo` e `%Disp` (carteira/meta). Duas informações úteis ainda
não aparecem:

1. **Alertas de carteira** — quando `%Disp < 100%`, a carteira planejada não
   cobre a meta: falta obra planejada para bater o objetivo. Hoje o gestor
   precisa varrer a tabela anual à procura desses planos. Queremos destacá-los
   como uma **lista de ação** no topo do dashboard.
2. **Postergadas** — a planilha `Controle Plano de Recomposição 2026.xlsx`
   tem uma aba `Postergadas` (uma linha por nota que foi planejada para um mês
   e empurrada para um mês posterior — *slippage*). A v1 não a usava. Queremos
   trazer a quantidade postergada para o dashboard.

## Decisões de produto (fechadas com o usuário)

1. **Alertas — escopo**: apenas **planos** (visão anual), `%Disp` anual
   `< 100%`. Regionais ficam como evolução futura. Cada linha é clicável e
   leva ao **Input filtrado por Conjunto** (reusa o handoff existente).
2. **Alertas — origem dos dados**: 100% derivado de `visao_anual` que o
   payload já entrega. **Sem mudança no backend.**
3. **Postergadas — exibição**: **coluna "Postergado" na tabela da visão
   anual** (total do ano por plano) **+ KPI no hero** ("Postergadas" do mês
   corrente).
4. **Postergadas — semântica**: o arquivo real **não guarda o mês de origem**
   (from-month não existe como coluna). A nota conta no **mês de destino**
   (`Mês de Execução Planejado - DDPM`, para onde foi replanejada). O KPI do
   hero soma as postergadas cujo mês destino é o `mes_corrente` (leitura:
   "notas replanejadas PARA este mês"); a coluna da tabela soma o ano inteiro
   por plano.
5. **Postergado é quantidade** (soma de DDPM/qtd das notas postergadas),
   consistente com `meta`/`carteira` que também são quantidades — não uma
   contagem de linhas.
6. **Fonte Postergadas**: a mesma planilha e o mesmo canal (pasta OneDrive
   sincronizada localmente). Sem editor no app — o Excel é a fonte da verdade.
7. **Nomes exatos das colunas da aba `Postergadas`**: verificados contra o
   arquivo real — `Regional`, `Projeto\nConstrução`, `Mês de Execução
   Planejado - DDPM` e `Planejado-DDPM` (quantidade). `_postergadas` resolve
   por nome **normalizado** (colapsa espaço duplo, quebra de linha e caixa),
   porque os cabeçalhos reais têm essas variações. O `try/except` do sync
   garante que um nome de coluna/aba errado degrada com aviso no estado, sem
   derrubar o dashboard.

## Arquitetura

Reusa as fronteiras da v1. Nada de módulo novo.

- **Alertas**: componente frontend puro em `features/relatorios/`, derivado do
  payload existente. Backend intocado.
- **Postergadas**: estende o sync de metas (`input_module/metas.py`) e a
  engine de agregação (`input_module/relatorios.py`); nova tabela em
  `input_module/db.py`. O payload do dashboard ganha dois campos.

## Dados

Nova tabela em `notas_departamento.db` (criada em `inicializar_banco`,
populada pelo sync — nunca editada à mão), espelhando a grão de `metas_plano`:

```sql
CREATE TABLE IF NOT EXISTS metas_postergadas (
    Ano       INTEGER NOT NULL,
    Mes       INTEGER NOT NULL,          -- from-month (mês de onde a nota saiu)
    Regional  TEXT    NOT NULL,
    Plano     TEXT    NOT NULL,          -- nome longo, ex. "POSTES - CAPEX"
    Qtd       REAL    NOT NULL DEFAULT 0,
    PRIMARY KEY (Ano, Mes, Regional, Plano)
);
```

Helpers em `db.py`:
- `substituir_postergacoes(df: pd.DataFrame) -> None` — replace transacional
  (o sync sempre traz o conjunto completo). Pode ser chamado dentro do mesmo
  `substituir_metas` ou como função irmã; a implementação decide, desde que a
  substituição de metas + de-para + postergadas seja atômica (uma falha no
  meio não deixa o banco em estado misto).
- `carregar_postergacoes(ano: int) -> pd.DataFrame` — colunas Ano, Mes,
  Regional, Plano, Qtd.

## Backend

### `input_module/metas.py` — sync estende a leitura

`_importar` passa a ler também a aba `Postergadas` do mesmo xlsx já copiado
para temp. Parse defensivo: linhas sem plano/mês são descartadas; a
quantidade vem da coluna de DDPM/quantidade da aba (nome exato verificado na
implementação), agregada por `(Ano, Mes-from, Regional, Plano)`. Grava via
`substituir_postergacoes` na mesma transação das metas.

Se a aba `Postergadas` não existir ou estiver com colunas renomeadas, o sync
falha para dentro do `try/except` existente e preserva a última importação
boa — o comportamento de resiliência da v1 não muda.

### `input_module/relatorios.py` — agregação

`montar_dashboard` ganha o parâmetro `df_postergacoes` e emite:
- `visao_anual[].postergado` — `float`, soma de `Qtd` do ano por plano
  (respeita o filtro de regional, como `carteira`/`meta`).
- `hero.postergadas` — `float`, soma de `Qtd` cujo `Mes == mes_corrente`
  (respeita o filtro de regional).

Planos que aparecem só em postergadas (sem carteira nem meta) seguem a mesma
regra da v1: entram na visão anual, caindo no balde `"Outros"` se não tiverem
de-para. Nada some silenciosamente.

### Rota

`GET /api/input/relatorios/dashboard` passa `db.carregar_postergacoes(ano)` a
`montar_dashboard`. Sem rota nova. O ETag continua sendo a versão do dataset —
como o sync de postergadas grava em `log_arquivos` junto com as metas, uma
mudança na aba invalida o cache automaticamente, igual às metas.

## Frontend

### Alertas de carteira (novo, `alertas-carteira.tsx`)

Componente puro que recebe `linhas: LinhaAnual[]` e `aoClicarPlano: (plano) =>
void`. Filtra `pct_disp !== null && pct_disp < 1`, ordena por `pct_disp`
crescente (pior primeiro). Cada linha: `nome_curto`, `%` com cor do farol
(reusa `farol`/`FAROL_COR` de `fmt.ts`), texto "faltam ~N und"
(`N = -saldo`, via `fmtQtd`), clique → `aoClicarPlano(plano)`. Linha
teclável (`tabIndex`, Enter/Space), como a tabela anual.

Montado em `relatorios-section.tsx` logo abaixo do hero. Quando não há nenhum
plano abaixo de 100%, o bloco não renderiza (ou exibe uma linha discreta
"carteira cobre a meta em todos os planos" — decisão de UI na implementação).

### Postergadas (coluna + KPI)

- `types.ts`: `+postergado: number` em `LinhaAnual`; `+postergadas: number`
  em `HeroMes`.
- `tabela-anual.tsx`: nova coluna "Postergado" (`fmtQtd`), à direita de
  Carteira/Saldo.
- `hero-mes.tsx`: novo `StatTile` "Postergadas" com `fmtQtd(hero.postergadas)`.

Sem query nova nem dependência nova.

## Testes

- **Backend**:
  - Estender o fixture sintético do sync (`_xlsx_controle`) com uma aba
    `Postergadas`; assertir que `carregar_postergacoes` traz as linhas
    agregadas por from-month e que o replace substitui (não acumula).
  - Estender o fixture da engine (`_fx_relatorios`) com `df_postergacoes`;
    assertir `hero.postergadas` (soma do mês corrente) e
    `visao_anual[].postergado` (soma do ano por plano), incluindo o respeito
    ao filtro de regional.
  - Ausência da aba `Postergadas` preserva o estado anterior (não quebra o
    sync).
- **Frontend**: `npm run build`.

## Documentação

- `docs/dev/06-backend-input-module.md`: nova tabela `metas_postergadas`,
  extensão do sync, campos novos do payload.
- Contrato do payload no plano de implementação atualizado com `postergado`
  e `postergadas`.

## Fora de escopo / evoluções registradas

- Alertas de carteira por **regional** (além de planos).
- Alertas do **mês corrente** (hoje o alerta é anual).
- Drill-down detalhado das postergadas (lista nota-a-nota de→para) — a v2
  guarda só o agregado; a tabela `metas_postergadas` pode ser trocada por
  linhas cruas quando/se o drill for pedido.
- As demais evoluções da spec v1 seguem fora: notas suspeitas, aba de
  alertas dedicada, persistência IndexedDB, leitura via SharePoint/Graph API.
