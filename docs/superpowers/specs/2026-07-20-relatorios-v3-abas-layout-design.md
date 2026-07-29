# Relatórios v3 — Resumo fixo + abas

## Contexto e problema

A seção Relatórios é a **home** do app e os engenheiros a consultam com
frequência. Hoje tudo vive numa única página empilhada (`relatorios-section.tsx`):
hero + alertas + tabela anual + um grid 2-colunas com mensalização e regionais.

Problemas levantados:

- Indicadores críticos competem numa "hero section" só — sem hierarquia de leitura.
- Textos pequenos demais (11–12px) em legendas e captions.
- Gráfico de mensalização mal formatado: legenda minúscula, sem valores nas
  barras/eixo, sem tabela de apoio com os números exatos.
- Cards regionais mal posicionados (espremidos no grid 2-col) e com borda
  `Card` desnecessária.

O restante do app (INPUT, COFFEE) organiza módulos em **sub-abas** via `SegTabs`.
Relatórios deve seguir o mesmo padrão, mas mantendo o "on-track" do mês sempre
visível.

## Objetivo

Reestruturar a seção Relatórios em **faixa de resumo fixa + 3 abas**, sem mudar
o backend nem o contrato do payload. Toda a informação já vem de
`GET /api/input/relatorios/dashboard` (`DashboardRelatorios`).

## Decisões (aprovadas no brainstorming)

1. **Navegação**: faixa de resumo fixa (sempre visível) + `SegTabs` para os
   aprofundamentos. O crítico ("estamos no alvo este mês?") nunca fica escondido
   atrás de um clique.
2. **3 abas**: `Mês`, `Planos`, `Mensalização` (nessa ordem; `Mês` é a default).
   Regionais tem só 6 cards do mês no payload — vira aba magra sozinha, então
   entra na aba `Mês`.
3. **Alvo do retrabalho "meta/carteira/executado"**: o gráfico de mensalização.
4. **Sem mudança de backend**: mesma query, mesmo payload, mesma `use-dashboard.ts`.

## Estrutura

`relatorios-section.tsx` passa a ser o orquestrador: header + resumo fixo +
`SegTabs` + render condicional da aba ativa. Estado da aba é `useState` local
(não há deep-linking; o handoff "ver plano / ver notas" continua saindo **para**
o módulo Input, não navegando dentro de Relatórios).

```
┌ PageHeader: "Plano de Recomposição 2026"        [Regional ▾] ┐
│ ResumoFixo: RESUMO · julho  %Disp 70%  Exec 0%  Gap R$  ⚠ 3  │  ← sempre visível
├──────────────────────────────────────────────────────────────┤
│ SegTabs:  [ Mês ]  [ Planos ]  [ Mensalização ]              │
├──────────────────────────────────────────────────────────────┤
│ (aba ativa)                                                   │
└──────────────────────────────────────────────────────────────┘
```

O aviso de `metas_info.erro` e os estados loading/error continuam onde estão
(acima das abas), inalterados.

## Componentes

### `resumo-fixo.tsx` (novo)

Faixa horizontal compacta, sempre visível abaixo do `PageHeader`.

- Props: `hero: HeroMes`, `financeiroAno`, `totalAlertas: number`,
  `aoVerAlertas: () => void`.
- Conteúdo (uma linha, quebra em telas estreitas):
  - `RESUMO · {hero.mes_nome}` (eyebrow)
  - **% Disp** `{fmtPct(hero.pct_disp)}` colorido pelo farol
  - **Exec** `{fmtPct(execPct)}` onde `execPct = executado/meta`
  - **Gap R$ (ano)** `{fmtRS(financeiroAno.gap_rs)}`
  - `⚠ {totalAlertas} abaixo` — botão que chama `aoVerAlertas` (troca para a aba
    `Mês`, onde a lista de alertas vive). Só aparece quando `totalAlertas > 0`.

### `aba-mes.tsx` (novo) — panorama do mês corrente

Compõe, em coluna:

1. **KpisMes** (refatoração do atual `hero-mes.tsx`): painel featured com
   `% Disponibilização` como manchete (número grande, cor farol) + `Carteira X
   de Meta Y`; ao lado a `Execução` (% + barra); abaixo os tiles
   `Meta · Carteira · Executado · [Postergadas quando > 0] · R$ carteira/meta`.
   Botão "Ver notas do mês". **A linha "Financeiro do ano" sai daqui** e vai
   para a aba `Planos`.
2. **AlertasCarteira** (componente atual, inalterado) — lista de planos abaixo
   da meta.
3. **RegionaisCards** (reformulado) — 6 tiles do mês.

### `aba-planos.tsx` (novo) — visão anual

Compõe:

1. **TabelaAnual** (componente atual, já com subtotais por área + total geral) —
   agora em largura total, fora do grid 2-col.
2. Linha **Financeiro do ano** — `Carteira R$ · Meta R$ · Gap R$` (movida do hero).

### `aba-mensalizacao.tsx` (novo)

Compõe:

1. **MensalizacaoChart** (reformulado) — maior, legenda legível (13px), rótulos
   de valor no topo das barras (ou linha de base rotulada), mês corrente marcado.
2. **TabelaMensal** (novo) — `Mês | Meta | Carteira | Executado | %Exec` para os
   12 meses, com os números exatos que o gráfico não expressa. Meses futuros
   (> `mes_corrente`) mostram Executado em branco.

### `tabela-mensal.tsx` (novo)

Tabela pura sobre `mensalizacao: MesMensalizacao[]` + `mes_corrente`. Usa o
`Table` do shadcn e os formatadores de `fmt.ts`. `%Exec = executado/meta`
(`—` quando meta 0), colorido pelo farol.

### Componentes reaproveitados (presentacionais, viram filhos)

- `alertas-carteira.tsx` — sem mudança (já tem contagem no eyebrow).
- `tabela-anual.tsx` — sem mudança (subtotais/total geral já existem).
- `regionais-cards.tsx` — **remover a borda `Card`**: tiles limpos (fundo
  `--surface`, sem `border`), respiro maior, `%Disp` farol como número
  principal. Some do grid 2-col apertado.
- `mensalizacao-chart.tsx` — aumentar altura, legenda 13px, rótulos de valor.

## Correções transversais

- **Tamanhos de texto**: captions/legendas de conteúdo sobem de 11–12px para
  13px. Eyebrows continuam 10px (são rótulos, hierarquia intencional).
- **Boldness num lugar só** (frontend-design): o `% Disp` grande da aba `Mês` é
  a manchete; resto quieto, monocromático, dentro dos tokens EDP.
- **Sem novos tokens de cor**: usa `--accent`, `--green-2`, farol
  (`--green/--amber/--red`) já existentes.

## Fora de escopo (YAGNI)

- Nenhuma quebra regional × plano (payload não tem; exigiria backend).
- Sem deep-linking de aba por URL/estado global.
- Sem drill-down nota-a-nota dentro de Relatórios (o handoff para Input já cobre).
- Sem exportação/impressão do dashboard.

## Testes e verificação

- **Sem backend afetado**: contrato (`types.ts`) inalterado; a suíte
  `test_input_module.py` (dashboard) segue válida sem edição.
- **Front**: `npm run build` (`tsc -b && vite build`) precisa passar limpo.
- **Runtime**: com o backend real, cada aba renderiza sem erro; a faixa de
  resumo reflete `%Disp`, `Exec`, `Gap`, contagem de alertas; `Postergadas`
  some quando 0; aba `Mensalização` mostra gráfico + tabela coerentes.
- **Acessibilidade**: `SegTabs` preserva a semântica Radix (roving tabindex,
  setas); botão de alerta no resumo tem label; barra de progresso mantém
  `role="progressbar"` e `aria-*`.

## Documentação a atualizar

- `docs/dev/04-frontend-shared.md` — descreve a home Relatórios; atualizar para
  a estrutura de abas + resumo fixo e listar os componentes novos.
